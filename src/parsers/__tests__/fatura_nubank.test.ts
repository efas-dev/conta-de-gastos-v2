// ADR: see Docs/specs/parsers-fatura-nubank-extrato-itau.adr.md

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { faturaNumbank } from '../fatura_nubank'

const FIXTURES = join(__dirname, 'fixtures')

function lerFixture(nome: string): string {
  return readFileSync(join(FIXTURES, nome), 'utf-8')
}

const csvNormal = lerFixture('fatura_nubank_normal.csv')
const csvQuotedVirgula = lerFixture('fatura_nubank_quoted_virgula.csv')
const csvMinusEspaco = lerFixture('fatura_nubank_minus_espaco.csv')
const csvEstorno = lerFixture('fatura_nubank_estorno.csv')
const csvPagamentoRecebido = lerFixture('fatura_nubank_pagamento_recebido.csv')
const csvPagamentoRecebidoUppercase = lerFixture('fatura_nubank_pagamento_recebido_uppercase.csv')
const csvValorPendenteVariantes = lerFixture('fatura_nubank_valor_pendente_variantes.csv')
const csvAvisosPendentes = lerFixture('fatura_nubank_avisos_pendentes.csv')
const csvMalformada = lerFixture('fatura_nubank_malformada.csv')

// --- TL-T4-01, TL-T4-02: aceita() ---

describe('faturaNumbank.aceita()', () => {
  it('TL-T4-01: retorna true para CSV com cabeçalho date,title,amount', () => {
    expect(faturaNumbank.aceita('date,title,amount\n2024-01-05,Supermercado,10.00')).toBe(true)
  })

  it('TL-T4-02: retorna false para cabeçalho diferente (ex: extrato_nubank)', () => {
    expect(faturaNumbank.aceita('Data,Valor,Identificador,Descrição\n01/03/2026,-150.00,abc,Desc')).toBe(false)
  })
})

// --- TL-T4-03 a TL-T4-08: parsear() fixture normal ---

describe('faturaNumbank.parsear() — fixture normal', () => {
  it('TL-T4-03: 3 lançamentos com valor negativo (inversão de sinal)', () => {
    const { lancamentos } = faturaNumbank.parsear(csvNormal)
    expect(lancamentos).toHaveLength(3)
    for (const l of lancamentos) {
      expect(l.valor).toBeLessThan(0)
    }
  })

  it('TL-T4-04: data preservada em formato ISO YYYY-MM-DD', () => {
    const { lancamentos } = faturaNumbank.parsear(csvNormal)
    expect(lancamentos[0].data).toBe('2024-01-05')
    expect(lancamentos[1].data).toBe('2024-01-10')
    expect(lancamentos[2].data).toBe('2024-01-15')
  })

  it('TL-T4-05: transcricao preserva o título original', () => {
    const { lancamentos } = faturaNumbank.parsear(csvNormal)
    expect(lancamentos[0].transcricao).toBe('Supermercado Sintético')
    expect(lancamentos[1].transcricao).toBe('Farmácia Exemplo')
    expect(lancamentos[2].transcricao).toBe('Restaurante Teste')
  })

  it('TL-T4-06: fonte === "fatura_nubank_cc" em todos os lançamentos', () => {
    const { lancamentos } = faturaNumbank.parsear(csvNormal)
    for (const l of lancamentos) {
      expect(l.fonte).toBe('fatura_nubank_cc')
    }
  })

  it('TL-T4-07: linhasIgnoradas === 0', () => {
    const { linhasIgnoradas } = faturaNumbank.parsear(csvNormal)
    expect(linhasIgnoradas).toBe(0)
  })

  it('TL-T4-08: iniciais, natureza e descricao são strings vazias', () => {
    const { lancamentos } = faturaNumbank.parsear(csvNormal)
    for (const l of lancamentos) {
      expect(l.iniciais).toBe('')
      expect(l.natureza).toBe('')
      expect(l.descricao).toBe('')
    }
  })
})

// --- TL-T4-09: quoted vírgula decimal ---

describe('faturaNumbank.parsear() — quoted vírgula decimal', () => {
  it('TL-T4-09: "1.234,56" → valor === -1234.56', () => {
    const { lancamentos } = faturaNumbank.parsear(csvQuotedVirgula)
    expect(lancamentos).toHaveLength(1)
    expect(lancamentos[0].valor).toBe(-1234.56)
  })
})

// --- TL-T4-10: minus-com-espaço ---

describe('faturaNumbank.parsear() — minus-com-espaço', () => {
  it('TL-T4-10: "- 18,44" (estorno) → valor === 18.44 (crédito após inversão)', () => {
    const { lancamentos } = faturaNumbank.parsear(csvMinusEspaco)
    expect(lancamentos).toHaveLength(1)
    expect(lancamentos[0].valor).toBeCloseTo(18.44, 2)
  })
})

// --- TL-T4-11: estorno ---

describe('faturaNumbank.parsear() — estorno', () => {
  it('TL-T4-11: "-50.00" (estorno) → valor === 50.00 (crédito após inversão)', () => {
    const { lancamentos } = faturaNumbank.parsear(csvEstorno)
    expect(lancamentos).toHaveLength(1)
    expect(lancamentos[0].valor).toBe(50)
  })
})

// --- TL-T6-01 a TL-T6-05: "Pagamento recebido" entra em lancamentos (T6, D16/D17) ---

describe('faturaNumbank.parsear() — pagamento recebido entra em lancamentos (T6, D16/D17)', () => {
  it('TL-T6-01: "Pagamento recebido" entra em lancamentos como lançamento normal → 2 lançamentos', () => {
    const { lancamentos } = faturaNumbank.parsear(csvPagamentoRecebido)
    expect(lancamentos).toHaveLength(2)
    expect(lancamentos.map((l) => l.transcricao).sort()).toEqual(
      ['Pagamento recebido', 'Serviço Assinatura'].sort(),
    )
  })

  it('TL-T6-02: excluidosPendentes fica vazio — "Pagamento recebido" não é mais excluído do parser', () => {
    const { excluidosPendentes } = faturaNumbank.parsear(csvPagamentoRecebido)
    expect(excluidosPendentes).toHaveLength(0)
  })

  it('TL-T6-03: lançamento de "Pagamento recebido" carrega origemEspecial === \'pagamento-recebido\'', () => {
    const { lancamentos } = faturaNumbank.parsear(csvPagamentoRecebido)
    const linha = lancamentos.find((l) => l.transcricao === 'Pagamento recebido')
    expect(linha?.origemEspecial).toBe('pagamento-recebido')
  })

  it('TL-T6-04: "PAGAMENTO RECEBIDO" (uppercase) casa via NFD+lowercase → entra em lancamentos com origemEspecial', () => {
    const { lancamentos, excluidosPendentes } = faturaNumbank.parsear(csvPagamentoRecebidoUppercase)
    expect(lancamentos).toHaveLength(2)
    const linha = lancamentos.find((l) => l.transcricao === 'PAGAMENTO RECEBIDO')
    expect(linha?.origemEspecial).toBe('pagamento-recebido')
    expect(excluidosPendentes).toHaveLength(0)
  })

  it('TL-T6-05: lançamento de "Pagamento recebido" preserva formato de Lancamento (fonte, iniciais/natureza/descricao vazias)', () => {
    const { lancamentos } = faturaNumbank.parsear(csvPagamentoRecebido)
    const linha = lancamentos.find((l) => l.transcricao === 'Pagamento recebido')
    expect(linha?.fonte).toBe('fatura_nubank_cc')
    expect(linha?.iniciais).toBe('')
    expect(linha?.natureza).toBe('')
    expect(linha?.descricao).toBe('')
  })

  it('TL-T6-06 (regressão do dedup): duas linhas "Pagamento recebido" idênticas em texto e valor entram como 2 lançamentos distintos (sem dedup indevido de linhas legítimas repetidas)', () => {
    const csvDuplicado = 'date,title,amount\n2024-05-01,Pagamento recebido,-200.00\n2024-05-01,Pagamento recebido,-200.00\n'
    const { lancamentos } = faturaNumbank.parsear(csvDuplicado)
    expect(lancamentos).toHaveLength(2)
    expect(lancamentos.every((l) => l.origemEspecial === 'pagamento-recebido')).toBe(true)
  })
})

// --- TL-T6-07 a TL-T6-09: "valor pendente do mês anterior" entra em lancamentos (T6, D16/D17) ---

describe('faturaNumbank.parsear() — valor pendente do mês anterior entra em lancamentos (T6, D16/D17)', () => {
  it('TL-T6-07: "Valor pendente do mês anterior" (caso exato, acentuado) entra em lancamentos, não mais em excluidosPendentes', () => {
    const { lancamentos, excluidosPendentes } = faturaNumbank.parsear(csvValorPendenteVariantes)
    expect(lancamentos.map((l) => l.transcricao)).toContain('Valor pendente do mês anterior')
    expect(excluidosPendentes).toHaveLength(0)
  })

  it('TL-T6-08: "VALOR PENDENTE DO MES ANTERIOR" (uppercase, sem acento) casa via NFD+lowercase → entra em lancamentos', () => {
    const { lancamentos, excluidosPendentes } = faturaNumbank.parsear(csvValorPendenteVariantes)
    expect(lancamentos.map((l) => l.transcricao)).toContain('VALOR PENDENTE DO MES ANTERIOR')
    expect(lancamentos).toHaveLength(3)
    expect(excluidosPendentes).toHaveLength(0)
  })

  it('TL-T6-09: ambas as linhas de valor-pendente carregam origemEspecial === \'valor-pendente\'', () => {
    const { lancamentos } = faturaNumbank.parsear(csvValorPendenteVariantes)
    const linhas = lancamentos.filter((l) => l.transcricao.toLowerCase().includes('valor pendente'))
    expect(linhas).toHaveLength(2)
    expect(linhas.every((l) => l.origemEspecial === 'valor-pendente')).toBe(true)
  })
})

// --- TL-5, TL-6, TL-7: multa/IOF permanecem; fixture combinada ---

describe('faturaNumbank.parsear() — multa e IOF por fatura atrasada permanecem em lancamentos', () => {
  it('TL-5: "Multa por fatura atrasada" permanece em lancamentos', () => {
    const { lancamentos } = faturaNumbank.parsear(csvAvisosPendentes)
    expect(lancamentos.find((l) => l.transcricao === 'Multa por fatura atrasada')).toBeDefined()
  })

  it('TL-6: "IOF por fatura atrasada" permanece em lancamentos', () => {
    const { lancamentos } = faturaNumbank.parsear(csvAvisosPendentes)
    expect(lancamentos.find((l) => l.transcricao === 'IOF por fatura atrasada')).toBeDefined()
  })

  it('TL-7 (T6): fixture combinada — 5 lançamentos (multa, IOF, comum, pagamento recebido, valor pendente), excluidosPendentes vazio; linhasIgnoradas === 0', () => {
    const { lancamentos, excluidosPendentes, linhasIgnoradas } = faturaNumbank.parsear(csvAvisosPendentes)
    expect(lancamentos).toHaveLength(5)
    expect(lancamentos.map((l) => l.transcricao).sort()).toEqual(
      [
        'IOF por fatura atrasada',
        'Loja Exemplo',
        'Multa por fatura atrasada',
        'Pagamento recebido',
        'Valor pendente do mês anterior',
      ].sort(),
    )
    expect(excluidosPendentes).toHaveLength(0)
    expect(linhasIgnoradas).toBe(0)
  })

  it('TL-T6-10 (origemEspecial ausente nos demais): "Multa por fatura atrasada"/"IOF por fatura atrasada"/comum têm origemEspecial === undefined', () => {
    const { lancamentos } = faturaNumbank.parsear(csvAvisosPendentes)
    const naoEspeciais = lancamentos.filter(
      (l) => l.transcricao !== 'Pagamento recebido' && l.transcricao !== 'Valor pendente do mês anterior',
    )
    expect(naoEspeciais).toHaveLength(3)
    expect(naoEspeciais.every((l) => l.origemEspecial === undefined)).toBe(true)
  })
})

// --- TL-T4-13: linha malformada ---

describe('faturaNumbank.parsear() — linha malformada', () => {
  it('TL-T4-13: linha com menos de 3 colunas → linhasIgnoradas === 1, lançamento válido presente', () => {
    const { lancamentos, linhasIgnoradas } = faturaNumbank.parsear(csvMalformada)
    expect(linhasIgnoradas).toBe(1)
    expect(lancamentos).toHaveLength(1)
    expect(lancamentos[0].transcricao).toBe('Lançamento Válido')
    expect(lancamentos[0].valor).toBe(-45)
  })
})
