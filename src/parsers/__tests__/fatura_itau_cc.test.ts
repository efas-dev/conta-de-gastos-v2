// ADR: see spec/fatura-itau-xlsx.adr.md

import { describe, it, expect, beforeEach } from 'vitest'
import { zipSync, strToU8, unzipSync } from 'fflate'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { aceita, parsear } from '../fatura_itau_cc'
import { reiniciarContadorIds } from '../idSerial'

// ---------------------------------------------------------------------------
// Helper: constrói um .xlsx OOXML mínimo com uma única aba nomeável e um
// conjunto arbitrário de linhas (mesmo padrão de
// src/excel/celulas/__tests__/leitorCelulas.test.ts), permitindo controlar
// livremente em que linha/coluna cai o cabeçalho — usado para provar que
// `aceita` não depende de posição fixa nem de nome de aba (Decisão 7 do ADR).
// ---------------------------------------------------------------------------

function celulaTexto(ref: string, texto: string): string {
  return `<c r="${ref}" t="inlineStr"><is><t>${texto}</t></is></c>`
}

function celulaNumero(ref: string, valor: number): string {
  return `<c r="${ref}"><v>${valor}</v></c>`
}

function construirXlsx(nomeAba: string, linhas: { numero: number; celulasXml: string }[]): Uint8Array {
  const sheetData = linhas
    .map(({ numero, celulasXml }) => `<row r="${numero}">${celulasXml}</row>`)
    .join('')

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetData}</sheetData>
</worksheet>`

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${nomeAba}" sheetId="1" r:id="rId1"/>
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
  <Override PartName="/xl/workbook.xml"
    ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml"
    ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
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

/** Cabeçalho da tabela da fatura (Data/Lançamento/Parcelamento/Valor), fora de qualquer posição fixa. */
function construirLinhaCabecalho(numero: number, colBase = 'B'): { numero: number; celulasXml: string } {
  const cols = ['B', 'C', 'D', 'E'].map((_, i) => String.fromCharCode(colBase.charCodeAt(0) + i))
  return {
    numero,
    celulasXml:
      celulaTexto(`${cols[0]}${numero}`, 'Data') +
      celulaTexto(`${cols[1]}${numero}`, 'Lançamento') +
      celulaTexto(`${cols[2]}${numero}`, 'Parcelamento') +
      celulaTexto(`${cols[3]}${numero}`, 'Valor'),
  }
}

function construirLinhaDado(numero: number, data: string, lancamento: string, valor: number, colBase = 'B'): {
  numero: number
  celulasXml: string
} {
  const cols = ['B', 'C', 'D', 'E'].map((_, i) => String.fromCharCode(colBase.charCodeAt(0) + i))
  return {
    numero,
    celulasXml:
      celulaTexto(`${cols[0]}${numero}`, data) +
      celulaTexto(`${cols[1]}${numero}`, lancamento) +
      celulaNumero(`${cols[3]}${numero}`, valor),
  }
}

function lerFixtureBytes(...segmentos: string[]): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.resolve(__dirname, ...segmentos)))
}

describe('fatura_itau_cc — aceita()', () => {
  it('retorna true para a fixture paga da fatura Itaú (cabeçalho na linha 14)', () => {
    const bytes = lerFixtureBytes('./fixtures/fatura_itau_cc_sintetica.xlsx')
    expect(aceita(bytes)).toBe(true)
  })

  it('retorna true para uma variante "em aberto" — sem bloco de pagamento no topo e com o cabeçalho fora da linha 14', () => {
    const bytes = construirXlsx('Fatura 09-26', [
      construirLinhaCabecalho(5),
      construirLinhaDado(6, '05/09/2026', 'Compra Loja Alfa', 120.5),
      construirLinhaDado(7, '10/09/2026', 'Compra Loja Beta', 89.9),
    ])
    expect(aceita(bytes)).toBe(true)
  })

  it('não depende do nome da aba: mesma tabela sob um nome de aba diferente ainda é aceita', () => {
    const bytes = construirXlsx('Fatura 12-26', [
      construirLinhaCabecalho(14),
      construirLinhaDado(15, '01/12/2026', 'Pagamento Debito Automatico', -500),
      construirLinhaDado(16, '02/12/2026', 'Compra Loja Gama', 200),
    ])
    expect(aceita(bytes)).toBe(true)
  })

  it.each([
    ['extrato_nubank_ponto.csv'],
    ['fatura_nubank_normal.csv'],
    ['extrato_itau_crlf.txt'],
    ['extrato_inter_normal.csv'],
    ['extrato_bb_conta_corrente.csv'],
  ])('retorna false para a fixture de texto %s (não é .xlsx)', (nomeArquivo) => {
    const bytes = lerFixtureBytes('./fixtures', nomeArquivo)
    expect(aceita(bytes)).toBe(false)
  })

  it('retorna false para a fixture de dicionário (Modelo.xlsx real, sem a tabela da fatura)', () => {
    const bytes = lerFixtureBytes('..', '..', '..', 'public', 'Modelo.xlsx')
    expect(aceita(bytes)).toBe(false)
  })

  it('retorna false sem lançar exceção para bytes vazios', () => {
    expect(() => aceita(new Uint8Array(0))).not.toThrow()
    expect(aceita(new Uint8Array(0))).toBe(false)
  })

  it('retorna false sem lançar exceção para bytes arbitrários que não formam um ZIP válido', () => {
    const bytesInvalidos = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    expect(() => aceita(bytesInvalidos)).not.toThrow()
    expect(aceita(bytesInvalidos)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// parsear() — Task T4: mapeamento linha→lançamento (fonte, sinal, data serial,
// Parcelamento→Descrição). A fixture `fatura_itau_cc_sintetica.xlsx` (T11) traz
// 10 linhas de dados (linhas 15 a 24 da planilha original): a linha 15 é o
// pagamento ("Pagamento Debito Automatico"), as demais são compras/estornos.
// ---------------------------------------------------------------------------

/** Constrói um cabeçalho com as 8 colunas reais do banco (B..J), incluindo as 4 que não devem ser lidas. */
function construirLinhaCabecalhoCompleto(numero: number): { numero: number; celulasXml: string } {
  return {
    numero,
    celulasXml:
      celulaTexto(`B${numero}`, 'Data') +
      celulaTexto(`C${numero}`, 'Lançamento') +
      celulaTexto(`D${numero}`, 'Parcelamento') +
      celulaTexto(`E${numero}`, 'Valor') +
      celulaTexto(`G${numero}`, 'Titularidade') +
      celulaTexto(`H${numero}`, 'Nome') +
      celulaTexto(`I${numero}`, 'Tipo do cartão') +
      celulaTexto(`J${numero}`, 'Número do cartão'),
  }
}

/** Linha de dado com as 4 colunas de portador preenchidas — usada só para provar que não são lidas. */
function construirLinhaDadoComPortador(
  numero: number,
  data: string,
  lancamento: string,
  valor: number,
): { numero: number; celulasXml: string } {
  return {
    numero,
    celulasXml:
      celulaNumero(`B${numero}`, Number(data)) +
      celulaTexto(`C${numero}`, lancamento) +
      celulaNumero(`E${numero}`, valor) +
      celulaTexto(`G${numero}`, 'Titular') +
      celulaTexto(`H${numero}`, 'Fulano da Silva') +
      celulaTexto(`I${numero}`, 'Físico') +
      celulaTexto(`J${numero}`, '**** **** **** 1234'),
  }
}

describe('fatura_itau_cc — parsear()', () => {
  beforeEach(() => reiniciarContadorIds())

  function lancamentosDaFixture() {
    const bytes = lerFixtureBytes('./fixtures/fatura_itau_cc_sintetica.xlsx')
    return parsear(bytes).lancamentos
  }

  it('mapeia cada linha de dado para um Lancamento com fonte fatura_itau_cc', () => {
    const lancamentos = lancamentosDaFixture()
    expect(lancamentos).toHaveLength(10)
    lancamentos.forEach((l) => expect(l.fonte).toBe('fatura_itau_cc'))
  })

  it('inverte o sinal: compra positiva no xlsx vira valor negativo no app', () => {
    const compra = lancamentosDaFixture().find((l) => l.transcricao === 'Compra Supermercado Alfa')
    expect(compra?.valor).toBeCloseTo(-245.67)
  })

  it('inverte o sinal: estorno negativo no xlsx vira valor positivo no app', () => {
    const estorno = lancamentosDaFixture().find((l) => l.transcricao === 'Estorno Compra Loja Epsilon')
    expect(estorno?.valor).toBeCloseTo(178.89)
  })

  it('TL-T13-04: com o rótulo Vencimento presente na fixture compartilhada, uma compra de mês anterior ao vencimento (parcela antiga, T5) recebe a data de vencimento, não a data de compra crua', () => {
    // Vencimento na fixture: 2026-07-10 (bloco "Vencimento"/serial em I9/I10).
    // Compra 'Compra Supermercado Alfa': serial 46177 = 2026-06-04, mês anterior ao vencimento.
    const compra = lancamentosDaFixture().find((l) => l.transcricao === 'Compra Supermercado Alfa')
    expect(compra?.data).toBe('2026-07-10')
  })

  it('preenche Descricao com o texto de Parcelamento quando presente', () => {
    const parcela = lancamentosDaFixture().find((l) => l.transcricao === 'Compra Farmacia Gama')
    expect(parcela?.descricao).toBe('Parcela 1 de 2')
    expect(parcela?.transcricao).toBe('Compra Farmacia Gama')
  })

  it('deixa Descricao vazia quando a coluna Parcelamento está ausente na linha', () => {
    const semParcela = lancamentosDaFixture().find((l) => l.transcricao === 'Compra Restaurante Delta')
    expect(semParcela?.descricao).toBe('')
  })

  it('atribui ids sequenciais via atribuirIds, um por lançamento, sem repetição', () => {
    const ids = lancamentosDaFixture().map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).toBe(ids[i - 1] + 1)
    }
  })

  it('não lê Titularidade/Nome/Tipo do cartão/Número do cartão em nenhum campo do Lancamento', () => {
    const bytes = construirXlsx('Fatura 09-26', [
      construirLinhaCabecalhoCompleto(5),
      construirLinhaDadoComPortador(6, '46177', 'Compra Loja Alfa', 120.5),
    ])
    const [lancamento] = parsear(bytes).lancamentos
    const textoCompleto = JSON.stringify(lancamento)
    expect(textoCompleto).not.toContain('Titular')
    expect(textoCompleto).not.toContain('Fulano da Silva')
    expect(textoCompleto).not.toContain('Físico')
    expect(textoCompleto).not.toContain('1234')
  })

  it('marca a linha de pagamento com origemEspecial=pagamento-recebido (T6); linhasIgnoradas=0, excluidosPendentes=[]', () => {
    const resultado = parsear(lerFixtureBytes('./fixtures/fatura_itau_cc_sintetica.xlsx'))
    expect(resultado.linhasIgnoradas).toBe(0)
    expect(resultado.excluidosPendentes).toEqual([])
    const pagamento = resultado.lancamentos.find((l) => l.transcricao === 'Pagamento Debito Automatico')
    expect(pagamento?.origemEspecial).toBe('pagamento-recebido')
    expect(pagamento?.valor).toBeCloseTo(1723.92)
  })

  it('não marca origemEspecial em nenhuma outra linha de dado além da linha de pagamento (T6)', () => {
    const outras = lancamentosDaFixture().filter((l) => l.transcricao !== 'Pagamento Debito Automatico')
    expect(outras.length).toBeGreaterThan(0)
    outras.forEach((l) => expect(l.origemEspecial).toBeUndefined())
  })

  it('marca origemEspecial mesmo com variação de acentuação/caixa no texto da linha (T6, comparação normalizada)', () => {
    const bytes = construirXlsx('Fatura 09-26', [
      construirLinhaCabecalho(5),
      construirLinhaDado(6, '46177', 'Pagamento Débito Automático', -1723.92),
    ])
    const [lancamento] = parsear(bytes).lancamentos
    expect(lancamento.origemEspecial).toBe('pagamento-recebido')
  })

  it('para de ler antes da linha de Subtotal — número de lançamentos bate com as linhas de dados da tabela', () => {
    expect(lancamentosDaFixture()).toHaveLength(10)
  })

  it('TL-T13-03: a fixture compartilhada traz o rótulo "Vencimento" na linha imediatamente anterior ao serial de vencimento, mesma coluna (fidelidade ao layout real)', () => {
    const bytes = lerFixtureBytes('./fixtures/fatura_itau_cc_sintetica.xlsx')
    const zip = unzipSync(bytes) as Record<string, Uint8Array>
    const sheetXml = new TextDecoder().decode(zip['xl/worksheets/sheet1.xml'])
    expect(sheetXml).toContain('<c r="I9" t="inlineStr"><is><t>Vencimento</t></is></c>')
    expect(sheetXml).toContain('<c r="I10"><v>46213</v></c>')
  })
})

// ---------------------------------------------------------------------------
// parsear() — Task T5: regra de data para parcelas antigas (Decisão 1 do ADR).
// A fixture compartilhada `fatura_itau_cc_sintetica.xlsx` não traz o rótulo
// "Vencimento" em nenhuma célula (só o serial cru em I10, sem rótulo em I9),
// então ela não serve para os casos com vencimento presente — os três casos
// abaixo usam `.xlsx` sintéticos construídos aqui mesmo, incluindo o bloco de
// rótulo+valor quando o caso exige vencimento. Ver decisão registrada no log
// de iteração.
// ---------------------------------------------------------------------------

/** Bloco de metadados "Vencimento": rótulo numa linha, serial na linha seguinte, mesma coluna. */
function construirBlocoVencimento(
  numeroRotulo: number,
  coluna: string,
  serialVencimento: number,
): { numero: number; celulasXml: string }[] {
  return [
    { numero: numeroRotulo, celulasXml: celulaTexto(`${coluna}${numeroRotulo}`, 'Vencimento') },
    { numero: numeroRotulo + 1, celulasXml: celulaNumero(`${coluna}${numeroRotulo + 1}`, serialVencimento) },
  ]
}

/** Linha de dado mínima (Data serial + Lançamento), suficiente para os testes de data de T5. */
function construirLinhaDadoSerial(
  numero: number,
  serialData: number,
  lancamento: string,
): { numero: number; celulasXml: string } {
  return {
    numero,
    celulasXml: celulaNumero(`B${numero}`, serialData) + celulaTexto(`C${numero}`, lancamento),
  }
}

describe('fatura_itau_cc — parsear() — regra de data para parcelas antigas (T5)', () => {
  beforeEach(() => reiniciarContadorIds())

  // Vencimento = 20/08/2026 (serial 46254) → mês da fatura = 2026-08.
  const SERIAL_VENCIMENTO_AGOSTO = 46254

  it('compra no mesmo mês da fatura mantém a data de compra, mesmo com vencimento informado', () => {
    // Compra em 05/08/2026 (serial 46239) — mesmo mês do vencimento (2026-08).
    // Linhas em ordem ascendente (2,3,5,6): a ordem física na planilha importa
    // para `lerCelulas`, que preserva a ordem de documento dos elementos <row>.
    const bytes = construirXlsx('Fatura 08-26', [
      ...construirBlocoVencimento(2, 'I', SERIAL_VENCIMENTO_AGOSTO),
      construirLinhaCabecalho(5),
      construirLinhaDadoSerial(6, 46239, 'Compra Loja Alfa'),
    ])
    const [lancamento] = parsear(bytes).lancamentos
    expect(lancamento.data).toBe('2026-08-05')
  })

  it('parcela antiga com vencimento informado no arquivo recebe a data de vencimento, não a data de compra', () => {
    // Compra em 15/07/2026 (serial 46218) — mês anterior ao vencimento (2026-08).
    const bytes = construirXlsx('Fatura 08-26', [
      ...construirBlocoVencimento(2, 'I', SERIAL_VENCIMENTO_AGOSTO),
      construirLinhaCabecalho(5),
      construirLinhaDadoSerial(6, 46218, 'Compra Loja Beta'),
    ])
    const [lancamento] = parsear(bytes).lancamentos
    expect(lancamento.data).toBe('2026-08-20')
  })

  it('parcela antiga sem vencimento no arquivo cai no mês de referência escolhido na tela', () => {
    // Sem bloco de Vencimento no arquivo. Compra em 15/07/2026 (serial 46218);
    // mesReferencia='2026-08' é passado como segundo argumento de parsear().
    const bytes = construirXlsx('Fatura 08-26', [
      construirLinhaCabecalho(5),
      construirLinhaDadoSerial(6, 46218, 'Compra Loja Gama'),
    ])
    const [lancamento] = parsear(bytes, '2026-08').lancamentos
    expect(lancamento.data).toBe('2026-08-01')
  })
})
