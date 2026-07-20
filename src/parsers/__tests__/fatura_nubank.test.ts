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

// --- TL-T4-12: pagamento recebido ignorado ---

describe('faturaNumbank.parsear() — pagamento recebido', () => {
  it('TL-T4-12: não conta como lançamento normal — "Pagamento recebido" sai do array lancamentos → 1 lançamento', () => {
    const { lancamentos } = faturaNumbank.parsear(csvPagamentoRecebido)
    expect(lancamentos).toHaveLength(1)
    expect(lancamentos[0].transcricao).toBe('Serviço Assinatura')
  })

  it('TL-9: "Pagamento recebido" não é descartado silenciosamente — sai em excluidosPendentes', () => {
    const { excluidosPendentes } = faturaNumbank.parsear(csvPagamentoRecebido)
    expect(excluidosPendentes).toHaveLength(1)
    expect(excluidosPendentes[0].transcricao).toBe('Pagamento recebido')
  })

  it('TL-1: item de excluidosPendentes não aparece em lancamentos', () => {
    const { lancamentos, excluidosPendentes } = faturaNumbank.parsear(csvPagamentoRecebido)
    expect(lancamentos.find((l) => l.transcricao === 'Pagamento recebido')).toBeUndefined()
    expect(excluidosPendentes).toHaveLength(1)
  })

  it('TL-2: "PAGAMENTO RECEBIDO" (uppercase) casa via NFD+lowercase → sai em excluidosPendentes', () => {
    const { lancamentos, excluidosPendentes } = faturaNumbank.parsear(csvPagamentoRecebidoUppercase)
    expect(lancamentos).toHaveLength(1)
    expect(lancamentos[0].transcricao).toBe('Serviço Assinatura')
    expect(excluidosPendentes).toHaveLength(1)
    expect(excluidosPendentes[0].transcricao).toBe('PAGAMENTO RECEBIDO')
  })

  it('TL-8: item de excluidosPendentes preserva formato de Lancamento (fonte, iniciais/natureza/descricao vazias)', () => {
    const { excluidosPendentes } = faturaNumbank.parsear(csvPagamentoRecebido)
    expect(excluidosPendentes[0].fonte).toBe('fatura_nubank_cc')
    expect(excluidosPendentes[0].iniciais).toBe('')
    expect(excluidosPendentes[0].natureza).toBe('')
    expect(excluidosPendentes[0].descricao).toBe('')
  })
})

// --- TL-3, TL-4: "valor pendente do mês anterior" ---

describe('faturaNumbank.parsear() — valor pendente do mês anterior', () => {
  it('TL-3: "Valor pendente do mês anterior" (caso exato, acentuado) sai em excluidosPendentes', () => {
    const { lancamentos, excluidosPendentes } = faturaNumbank.parsear(csvValorPendenteVariantes)
    expect(lancamentos.find((l) => l.transcricao.toLowerCase().includes('valor pendente'))).toBeUndefined()
    expect(excluidosPendentes.map((l) => l.transcricao)).toContain('Valor pendente do mês anterior')
  })

  it('TL-4: "VALOR PENDENTE DO MES ANTERIOR" (uppercase, sem acento) casa via NFD+lowercase → sai em excluidosPendentes', () => {
    const { excluidosPendentes } = faturaNumbank.parsear(csvValorPendenteVariantes)
    expect(excluidosPendentes.map((l) => l.transcricao)).toContain('VALOR PENDENTE DO MES ANTERIOR')
    expect(excluidosPendentes).toHaveLength(2)
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

  it('TL-7: fixture combinada — 3 lançamentos normais (multa, IOF, comum) + 2 excluidosPendentes (pagamento recebido, valor pendente); linhasIgnoradas === 0', () => {
    const { lancamentos, excluidosPendentes, linhasIgnoradas } = faturaNumbank.parsear(csvAvisosPendentes)
    expect(lancamentos).toHaveLength(3)
    expect(lancamentos.map((l) => l.transcricao).sort()).toEqual(
      ['IOF por fatura atrasada', 'Loja Exemplo', 'Multa por fatura atrasada'].sort(),
    )
    expect(excluidosPendentes).toHaveLength(2)
    expect(excluidosPendentes.map((l) => l.transcricao).sort()).toEqual(
      ['Pagamento recebido', 'Valor pendente do mês anterior'].sort(),
    )
    expect(linhasIgnoradas).toBe(0)
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
