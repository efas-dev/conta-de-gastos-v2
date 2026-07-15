// ADR: see spec/mes-referencia-ui.adr.md

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { defaultMes, detectarMesSugerido, classificarFonte } from '../mes'
import type { Lancamento } from '../../types'

function lancamento(overrides: Partial<Lancamento> = {}): Lancamento {
  return {
    fonte: 'TesteFonte',
    data: '2026-05-10',
    transcricao: 'Compra',
    valor: -100,
    iniciais: 'ES',
    natureza: '',
    descricao: '',
    ...overrides,
  }
}

describe('defaultMes', () => {
  it('TL-01: retorna mês anterior ao corrente em YYYY-MM (hoje=2026-07)', () => {
    // Data atual simulada: 2026-07-15
    vi.setSystemTime(new Date('2026-07-15'))
    expect(defaultMes()).toBe('2026-06')
  })

  it('TL-02: em janeiro retorna dezembro do ano anterior', () => {
    vi.setSystemTime(new Date('2026-01-10'))
    expect(defaultMes()).toBe('2025-12')
  })
})

describe('detectarMesSugerido', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-07-15'))
  })

  it('TL-03: retorna null com array vazio (F6)', () => {
    expect(detectarMesSugerido([])).toBeNull()
  })

  it('TL-04: retorna null quando nenhuma data é válida (F6)', () => {
    const lancamentos = [
      lancamento({ data: 'invalida' }),
      lancamento({ data: '' }),
      lancamento({ data: 'nao-e-data' }),
    ]
    expect(detectarMesSugerido(lancamentos)).toBeNull()
  })

  it('TL-05: retorna null quando todas as datas estão no mês corrente ou futuro (F6)', () => {
    const lancamentos = [
      lancamento({ data: '2026-07-01' }),
      lancamento({ data: '2026-07-14' }),
      lancamento({ data: '2026-08-01' }),
      lancamento({ data: '2027-01-01' }),
    ]
    expect(detectarMesSugerido(lancamentos)).toBeNull()
  })

  it('TL-06: retorna o mês mais recente anterior ao corrente', () => {
    const lancamentos = [
      lancamento({ data: '2026-05-10' }),
      lancamento({ data: '2026-06-15' }),
      lancamento({ data: '2026-04-01' }),
    ]
    expect(detectarMesSugerido(lancamentos)).toBe('2026-06')
  })

  it('TL-07: ignora datas futuras e retorna o mais recente válido', () => {
    const lancamentos = [
      lancamento({ data: '2026-05-10' }),
      lancamento({ data: '2027-03-01' }),
    ]
    expect(detectarMesSugerido(lancamentos)).toBe('2026-05')
  })

  it('TL-08: mistura de datas (passadas, corrente, futuras) retorna o mais recente anterior ao corrente', () => {
    const lancamentos = [
      lancamento({ data: '2026-03-20' }),
      lancamento({ data: '2026-06-30' }),
      lancamento({ data: '2026-07-01' }),  // mês corrente — excluído
      lancamento({ data: '2026-08-15' }),  // futuro — excluído
    ]
    expect(detectarMesSugerido(lancamentos)).toBe('2026-06')
  })
})

describe('classificarFonte', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-07-15'))
  })

  it('TL-09: retorna "fatura" quando a fonte tem transação com data anterior ao mesRef', () => {
    const lancamentos = [
      lancamento({ fonte: 'Nubank', data: '2026-05-10' }),
      lancamento({ fonte: 'Nubank', data: '2026-06-15' }),
    ]
    expect(classificarFonte('Nubank', lancamentos, '2026-06')).toBe('fatura')
  })

  it('TL-10: retorna "extrato" quando todas as transações da fonte estão no mesRef ou posterior', () => {
    const lancamentos = [
      lancamento({ fonte: 'Itau', data: '2026-06-01' }),
      lancamento({ fonte: 'Itau', data: '2026-06-20' }),
      lancamento({ fonte: 'Itau', data: '2026-07-01' }),
    ]
    expect(classificarFonte('Itau', lancamentos, '2026-06')).toBe('extrato')
  })

  it('TL-11: retorna "extrato" quando não há lançamentos da fonte em questão', () => {
    const lancamentos = [
      lancamento({ fonte: 'Outra', data: '2026-05-01' }),
    ]
    expect(classificarFonte('Nubank', lancamentos, '2026-06')).toBe('extrato')
  })

  it('TL-12: ignora lançamentos de outras fontes ao classificar', () => {
    const lancamentos = [
      lancamento({ fonte: 'Nubank', data: '2026-06-10' }),    // Nubank no mesRef — extrato
      lancamento({ fonte: 'Itau',   data: '2026-04-01' }),    // Itau anterior — não conta para Nubank
    ]
    expect(classificarFonte('Nubank', lancamentos, '2026-06')).toBe('extrato')
  })
})

afterEach(() => {
  vi.useRealTimers()
})
