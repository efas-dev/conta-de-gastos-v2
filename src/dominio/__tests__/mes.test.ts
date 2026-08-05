// ADR: see Docs/specs/mes-referencia-ui.adr.md

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  defaultMes,
  detectarMesSugerido,
  classificarFonte,
  classificarFontePorPrefixo,
  detectarDesalinhamentoMes,
} from '../mes'
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

describe('classificarFontePorPrefixo', () => {
  it('TL-13: prefixo "fatura_nubank_cc" → "fatura"', () => {
    expect(classificarFontePorPrefixo('fatura_nubank_cc')).toBe('fatura')
  })

  it('TL-14: prefixo "extrato_nubank" → "extrato"', () => {
    expect(classificarFontePorPrefixo('extrato_nubank')).toBe('extrato')
  })

  it('TL-15: prefixo "extrato_inter" → "extrato"', () => {
    expect(classificarFontePorPrefixo('extrato_inter')).toBe('extrato')
  })

  it('TL-16: prefixo "extrato_bb" → "extrato"', () => {
    expect(classificarFontePorPrefixo('extrato_bb')).toBe('extrato')
  })

  it('TL-17: prefixo "extrato_itau" → "extrato"', () => {
    expect(classificarFontePorPrefixo('extrato_itau')).toBe('extrato')
  })

  it('TL-18: prefixo desconhecido lança Error explícito em vez de default silencioso', () => {
    expect(() => classificarFontePorPrefixo('xyz_desconhecido')).toThrow(
      /prefixo.*desconhecido|fatura_|extrato_/i,
    )
  })
})

describe('detectarDesalinhamentoMes', () => {
  it('TL-19: concordância fatura×fatura — prefixo e heurística concordam — retorna []', () => {
    const lancamentos = [
      lancamento({ fonte: 'fatura_nubank_cc', data: '2026-05-10' }),
      lancamento({ fonte: 'fatura_nubank_cc', data: '2026-06-01' }),
    ]
    expect(detectarDesalinhamentoMes('fatura_nubank_cc', lancamentos, '2026-06')).toEqual([])
  })

  it('TL-20: concordância extrato×extrato — prefixo e heurística concordam — retorna []', () => {
    const lancamentos = [
      lancamento({ fonte: 'extrato_bb', data: '2026-06-05' }),
      lancamento({ fonte: 'extrato_bb', data: '2026-06-20' }),
    ]
    expect(detectarDesalinhamentoMes('extrato_bb', lancamentos, '2026-06')).toEqual([])
  })

  it('TL-21: divergência (F1) — prefixo diz fatura mas heurística diz extrato — retorna aviso informativo', () => {
    // Cenário motivador: fatura de junho carregada com mesRef='2026-06' (o mês escolhido é o próprio
    // mês da fatura) — nenhuma data é anterior a mesRef, então classificarFonte (heurística) erra
    // "extrato", enquanto o prefixo autoritativo "fatura_nubank_cc" diz "fatura".
    const lancamentos = [
      lancamento({ fonte: 'fatura_nubank_cc', data: '2026-06-03' }),
      lancamento({ fonte: 'fatura_nubank_cc', data: '2026-06-18' }),
    ]
    const avisos = detectarDesalinhamentoMes('fatura_nubank_cc', lancamentos, '2026-06')
    expect(avisos).toHaveLength(1)
    expect(avisos[0].tipo).toBe('informativo')
  })

  it('TL-22: divergência — prefixo diz extrato mas heurística diz fatura — retorna aviso informativo', () => {
    const lancamentos = [
      lancamento({ fonte: 'extrato_itau', data: '2026-04-10' }),
    ]
    const avisos = detectarDesalinhamentoMes('extrato_itau', lancamentos, '2026-06')
    expect(avisos).toHaveLength(1)
    expect(avisos[0].tipo).toBe('informativo')
  })

  it('TL-23: shape do aviso divergente — origem, estado, mensagem referencia fonte e mesRef, sem mutacaoProposta', () => {
    const lancamentos = [
      lancamento({ fonte: 'fatura_nubank_cc', data: '2026-06-03' }),
    ]
    const [aviso] = detectarDesalinhamentoMes('fatura_nubank_cc', lancamentos, '2026-06')
    expect(aviso.origem).toBe('desalinhamento-mes')
    expect(aviso.estado).toBe('pendente')
    expect(aviso.mensagem).toContain('fatura_nubank_cc')
    expect(aviso.mensagem).toContain('2026-06')
    expect(aviso.mutacaoProposta).toBeUndefined()
  })

  it('TL-24: prefixo desconhecido propaga o Error de classificarFontePorPrefixo sem mascarar', () => {
    expect(() => detectarDesalinhamentoMes('xyz_desconhecido', [], '2026-06')).toThrow(
      /prefixo.*desconhecido/i,
    )
  })
})

afterEach(() => {
  vi.useRealTimers()
})
