// ADR: see spec/rendimentos.adr.md

import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import type { Lancamento } from '../../types'
import { lerSaldoAnterior } from '../../excel/reader/leitor'
import { classificarFontePorPrefixo, detectarDesalinhamentoMes } from '../mes'
import { detectores, orquestrarDeteccao } from '../registry'
import {
  avaliarSanityCheck,
  calcularSaldoCalculado,
  detectarRendimentos,
  gerarLancamentoRendimento,
  parsearSomaInline,
} from '../rendimentos'

function lancamento(valor: number): Lancamento {
  return {
    id: 1,
    fonte: 'extrato',
    data: '2026-08-01',
    transcricao: 'lançamento de teste',
    valor,
    iniciais: '',
    natureza: '',
    descricao: '',
  }
}

describe('calcularSaldoCalculado', () => {
  it('T5-CSC-01: soma o saldo anterior com lançamentos de sinais mistos (soma algébrica)', () => {
    const lancamentos = [lancamento(100), lancamento(-30), lancamento(50)]

    expect(calcularSaldoCalculado(1000, lancamentos)).toBe(1120)
  })

  it('T5-CSC-02: array de lançamentos vazio retorna exatamente o saldo anterior', () => {
    expect(calcularSaldoCalculado(2500.75, [])).toBe(2500.75)
  })

  it('T5-CSC-03: soma valores decimais que quebrariam em ponto flutuante puro sem drift', () => {
    const lancamentos = [
      lancamento(0.1),
      lancamento(0.2),
      lancamento(0.3),
      lancamento(10.01),
      lancamento(-5.02),
    ]

    // 0.1 + 0.2 já não é exatamente 0.3 em ponto flutuante binário — soma direta em reais
    // acumularia esse drift; centavos inteiros evitam o problema.
    expect(calcularSaldoCalculado(0, lancamentos)).toBeCloseTo(5.59, 10)
    expect(calcularSaldoCalculado(0, lancamentos)).toBe(5.59)
  })

  it('T5-CSC-04: saldo anterior negativo combinado com lançamentos positivos soma algebricamente', () => {
    const lancamentos = [lancamento(200), lancamento(50)]

    expect(calcularSaldoCalculado(-100, lancamentos)).toBe(150)
  })
})

describe('parsearSomaInline', () => {
  it('T6-PSI-01: soma dois termos inteiros separados por "+"', () => {
    expect(parsearSomaInline('100+50')).toEqual({ valor: 150, valido: true })
  })

  it('T6-PSI-02: soma três ou mais termos', () => {
    expect(parsearSomaInline('1000+500+200')).toEqual({ valor: 1700, valido: true })
  })

  it('T6-PSI-03: tolera espaços em branco em torno de cada termo e do "+"', () => {
    expect(parsearSomaInline(' 1000 + 500 ')).toEqual({ valor: 1500, valido: true })
  })

  it('T6-PSI-04: reconhece vírgula como separador decimal em cada termo (convenção BR)', () => {
    expect(parsearSomaInline('100,50+50')).toEqual({ valor: 150.5, valido: true })
  })

  it('T6-PSI-05: um único valor sem "+" é uma soma válida de 1 termo', () => {
    expect(parsearSomaInline('1500')).toEqual({ valor: 1500, valido: true })
  })

  it('T6-PSI-06: termo vazio por "+" sobrando no fim retorna valido:false sem lançar', () => {
    expect(() => parsearSomaInline('100+')).not.toThrow()
    expect(parsearSomaInline('100+')).toEqual({ valor: null, valido: false })
  })

  it('T6-PSI-07: termo não-numérico em qualquer posição retorna valido:false sem lançar', () => {
    expect(parsearSomaInline('abc')).toEqual({ valor: null, valido: false })
    expect(parsearSomaInline('100+abc')).toEqual({ valor: null, valido: false })
  })

  it('T6-PSI-08: string vazia retorna valido:false', () => {
    expect(parsearSomaInline('')).toEqual({ valor: null, valido: false })
  })

  it('T6-PSI-09: string só com espaços em branco retorna valido:false', () => {
    expect(parsearSomaInline('   ')).toEqual({ valor: null, valido: false })
  })

  it('T6-PSI-10: precisão em centavos evita drift de ponto flutuante', () => {
    expect(parsearSomaInline('0,1+0,2')).toEqual({ valor: 0.3, valido: true })
  })
})

describe('avaliarSanityCheck', () => {
  it('T7-SC-01: diferença acima de 5% do saldo informado retorna over:true', () => {
    expect(avaliarSanityCheck(51, 1000)).toEqual({ over: true })
  })

  it('T7-SC-02: diferença abaixo de 5% do saldo informado retorna over:false', () => {
    expect(avaliarSanityCheck(49, 1000)).toEqual({ over: false })
  })

  it('T7-SC-03: diferença exatamente igual a 5% do saldo informado (borda) retorna over:false', () => {
    expect(avaliarSanityCheck(50, 1000)).toEqual({ over: false })
  })

  it('T7-SC-04: saldo informado zero com diferença zero retorna over:false, sem divisão por zero', () => {
    expect(avaliarSanityCheck(0, 0)).toEqual({ over: false })
  })

  it('T7-SC-05: saldo informado zero com diferença positiva retorna over:true', () => {
    expect(avaliarSanityCheck(10, 0)).toEqual({ over: true })
  })

  it('T7-SC-06: saldo informado negativo inverte o sinal do limiar, conforme a fórmula declarada', () => {
    // saldoInformado=-1000 → limiar = -1000*0.05 = -50
    expect(avaliarSanityCheck(-10, -1000)).toEqual({ over: true }) // -10 > -50
    expect(avaliarSanityCheck(-60, -1000)).toEqual({ over: false }) // -60 não é > -50
  })

  it('T7-SC-07: diferença negativa nunca é over:true para saldo informado positivo', () => {
    expect(avaliarSanityCheck(-500, 1000)).toEqual({ over: false })
  })
})

describe('gerarLancamentoRendimento', () => {
  it('T8-GLR-01: saldoInformado > saldoCalculado retorna lançamento com valor = diferença', () => {
    const resultado = gerarLancamentoRendimento(1000, 1150, '2026-08')

    expect(resultado.tipo).toBe('lancamento')
    if (resultado.tipo === 'lancamento') {
      expect(resultado.lancamento.valor).toBe(150)
    }
  })

  it('T8-GLR-02: diferença zero (saldoInformado === saldoCalculado) também retorna lançamento, valor 0', () => {
    const resultado = gerarLancamentoRendimento(1000, 1000, '2026-08')

    expect(resultado.tipo).toBe('lancamento')
    if (resultado.tipo === 'lancamento') {
      expect(resultado.lancamento.valor).toBe(0)
    }
  })

  it('T8-GLR-03: saldoCalculado > saldoInformado (diferença negativa) sinaliza sem lançamento', () => {
    const resultado = gerarLancamentoRendimento(1150, 1000, '2026-08')

    expect(resultado).toEqual({ tipo: 'diferenca-negativa' })
  })

  it('T8-GLR-04: campos fixos do lançamento gerado: natureza RR, fonte form_rendimentos, data = último dia do mês', () => {
    const resultado = gerarLancamentoRendimento(1000, 1150, '2026-08')

    expect(resultado.tipo).toBe('lancamento')
    if (resultado.tipo === 'lancamento') {
      expect(resultado.lancamento.natureza).toBe('RR')
      expect(resultado.lancamento.fonte).toBe('form_rendimentos')
      expect(resultado.lancamento.data).toBe('2026-08-31')
    }
  })

  it('T8-GLR-05: o lançamento gerado não tem propriedade id', () => {
    const resultado = gerarLancamentoRendimento(1000, 1150, '2026-08')

    expect(resultado.tipo).toBe('lancamento')
    if (resultado.tipo === 'lancamento') {
      expect('id' in resultado.lancamento).toBe(false)
    }
  })

  it('T8-GLR-06: precisão em centavos evita drift de ponto flutuante na diferença', () => {
    const resultado = gerarLancamentoRendimento(0.2, 0.3, '2026-08')

    expect(resultado.tipo).toBe('lancamento')
    if (resultado.tipo === 'lancamento') {
      expect(resultado.lancamento.valor).toBe(0.1)
    }
  })

  it('T8-GLR-07: último dia do mês correto em fevereiro bissexto e não-bissexto', () => {
    const bissexto = gerarLancamentoRendimento(1000, 1150, '2028-02')
    const naoBissexto = gerarLancamentoRendimento(1000, 1150, '2026-02')

    expect(bissexto.tipo === 'lancamento' && bissexto.lancamento.data).toBe('2028-02-29')
    expect(naoBissexto.tipo === 'lancamento' && naoBissexto.lancamento.data).toBe('2026-02-28')
  })
})

describe('detectarRendimentos', () => {
  it('T9-RD-01: lancamentos vazio ([]) retorna exatamente 1 Aviso origem rendimentos, proposta, pendente, sem mutacaoProposta', () => {
    const avisos = detectarRendimentos([])

    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toMatchObject({
      origem: 'rendimentos',
      tipo: 'proposta',
      estado: 'pendente',
    })
    expect(avisos[0].mutacaoProposta).toBeUndefined()
  })

  it('T9-RD-02: lancamentos não vazio também retorna exatamente 1 Aviso, com os mesmos campos', () => {
    const avisos = detectarRendimentos([lancamento(100), lancamento(-50)])

    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toMatchObject({
      origem: 'rendimentos',
      tipo: 'proposta',
      estado: 'pendente',
    })
    expect(avisos[0].mutacaoProposta).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Task 12 — Integração: B5, conciliação/desalinhamento, saldo_calculado, RR
// ---------------------------------------------------------------------------
//
// Testes que exercitam funções REAIS de módulos diferentes juntos (leitor OOXML real,
// classificação de fonte real, o array `detectores`/`orquestrarDeteccao` real de
// `registry.ts`), sem mocks de fronteira interna — camada `integration` declarada pela
// Task 12 (ver ADR `rendimentos`, F8).

let proximoId = 1000

/** Constrói um `Lancamento` com fonte/data/valor controlados, para cenários de integração. */
function lancamentoDe(fonte: string, data: string, valor: number): Lancamento {
  proximoId += 1
  return {
    id: proximoId,
    fonte,
    data,
    transcricao: `lançamento ${fonte}`,
    valor,
    iniciais: '',
    natureza: '',
    descricao: '',
  }
}

/**
 * Constrói um `.xlsx` sintético mínimo com aba "Extrato" cuja linha 5 contém (ou não) a
 * célula B5 numérica — duplicado localmente a partir do mesmo padrão já usado em
 * `criarXlsxComExtratoB5` (`src/excel/reader/__tests__/leitor.test.ts`, função privada não
 * exportada, fora das `Áreas tocadas` desta task); mesma disciplina institucional já
 * aplicada a `paraCentavos`/`ultimoDiaDoMes` no código de produção desta spec.
 */
function criarXlsxComB5(valorB5: number | null): Uint8Array {
  const b5Cell = valorB5 === null ? '' : `<c r="B5"><v>${valorB5}</v></c>`

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>Mês</t></is></c></row>
    <row r="5">${b5Cell}</row>
  </sheetData>
</worksheet>`

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Extrato" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"
    Target="worksheets/sheet1.xml"/>
</Relationships>`

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="xl/workbook.xml"/>
</Relationships>`

  return zipSync({
    '[Content_Types].xml': strToU8(contentTypesXml),
    '_rels/.rels': strToU8(rootRelsXml),
    'xl/workbook.xml': strToU8(workbookXml),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRelsXml),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml),
  })
}

describe('Task 12 — integração: lerSaldoAnterior sobre xlsx real', () => {
  it('T12-INT-01: extrai o número de B5 de um .xlsx fixture real (aba Extrato)', () => {
    const bytes = criarXlsxComB5(3456.78)

    expect(lerSaldoAnterior(bytes)).toBe(3456.78)
  })
})

describe('Task 12 — integração: form_rendimentos não quebra o registry real de detectores', () => {
  it('T12-INT-02: orquestrarDeteccao com o array `detectores` completo não lança exceção e nenhum aviso de conciliação referencia lançamentos form_rendimentos', () => {
    const lancFatura = lancamentoDe('fatura_x', '2026-08-10', -100)
    const lancExtrato = lancamentoDe('extrato_y', '2026-08-10', -100)
    const lancRendimentos = lancamentoDe('form_rendimentos', '2026-08-31', 42.5)

    const lancamentos = [lancFatura, lancExtrato, lancRendimentos]

    expect(() => orquestrarDeteccao(lancamentos, detectores, undefined, '2026-08')).not.toThrow()

    const avisos = orquestrarDeteccao(lancamentos, detectores, undefined, '2026-08')
    const avisosConciliacao = avisos.filter((a) => a.origem === 'conciliacao')

    // índice 2 é o lançamento form_rendimentos — nenhum aviso de conciliação pode referenciá-lo,
    // pois a fonte nunca entra em fontesFatura/fontesExtrato (classificarFontePorPrefixo).
    for (const aviso of avisosConciliacao) {
      expect(aviso.alvo).not.toContain('2')
      expect(aviso.permanece).not.toContain('2')
    }

    // confirma, via classificação direta, que form_rendimentos nunca é fatura nem extrato.
    expect(classificarFontePorPrefixo('form_rendimentos')).toBe('form_rendimentos')
  })

  it('T12-INT-03: detectarDesalinhamentoMes retorna [] para form_rendimentos mesmo quando a heurística por data divergiria', () => {
    // data de janeiro com mesRef de agosto: se fosse tratado como fatura/extrato, a heurística
    // por data (classificarFonte) provavelmente divergiria do prefixo — mas a exclusão de
    // form_rendimentos ocorre ANTES de qualquer comparação por data.
    const lancamentos = [lancamentoDe('form_rendimentos', '2026-01-31', 42.5)]

    expect(detectarDesalinhamentoMes('form_rendimentos', lancamentos, '2026-08')).toEqual([])
  })
})

describe('Task 12 — integração: saldo_calculado bate e RR zera a diferença (prova central)', () => {
  it('T12-INT-04: calcularSaldoCalculado bate para saldo anterior lido de B5 (leitor real) + lançamentos de mix de fontes', () => {
    const bytes = criarXlsxComB5(1000)
    const saldoAnterior = lerSaldoAnterior(bytes)
    expect(saldoAnterior).toBe(1000)

    const lancamentos = [
      lancamentoDe('extrato_y', '2026-08-05', 500), // salário
      lancamentoDe('fatura_x', '2026-08-10', -120), // fatura
      lancamentoDe('form_rendimentos', '2026-07-31', 15), // RR de um mês anterior, já no grid
    ]

    // saldoAnterior (1000) + 500 - 120 + 15 = 1395, soma algébrica pura sem filtro de fonte (F3).
    expect(calcularSaldoCalculado(saldoAnterior as number, lancamentos)).toBe(1395)
  })

  it('T12-INT-05: o lançamento RR gerado, somado ao saldo_calculado, zera a diferença contra o saldo_informado', () => {
    const bytes = criarXlsxComB5(1000)
    const saldoAnterior = lerSaldoAnterior(bytes) as number

    const lancamentos = [
      lancamentoDe('extrato_y', '2026-08-05', 500),
      lancamentoDe('fatura_x', '2026-08-10', -120),
    ]

    const saldoCalculado = calcularSaldoCalculado(saldoAnterior, lancamentos)
    expect(saldoCalculado).toBe(1380)

    const saldoInformado = 1450 // usuário informa conta corrente + aplicações
    const resultado = gerarLancamentoRendimento(saldoCalculado, saldoInformado, '2026-08')

    expect(resultado.tipo).toBe('lancamento')
    if (resultado.tipo !== 'lancamento') throw new Error('esperado tipo lancamento')

    expect(resultado.lancamento.valor).toBe(70) // 1450 - 1380

    // anexa o RR gerado à lista e recalcula: saldo_calculado passa a igualar saldo_informado.
    const rrComId: Lancamento = { ...resultado.lancamento, id: proximoId + 1 }
    const saldoCalculadoComRR = calcularSaldoCalculado(saldoAnterior, [...lancamentos, rrComId])

    expect(saldoCalculadoComRR).toBe(saldoInformado)
  })
})
