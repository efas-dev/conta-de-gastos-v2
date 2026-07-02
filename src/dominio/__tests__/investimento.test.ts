// ADR: see Docs/specs/dominio-transferencia-investimento-iniciais.adr.md

import { describe, it, expect } from 'vitest'
import { detectarInvestimento } from '../investimento'
import type { Lancamento } from '../../types'

import aplicacaoExplicita from './fixtures/investimento/aplicacao-explicita.json'
import resgateExplicito from './fixtures/investimento/resgate-explicito.json'
import rdbSinalNegativo from './fixtures/investimento/rdb-sinal-negativo.json'
import cdbSinalPositivo from './fixtures/investimento/cdb-sinal-positivo.json'
import conflitoPalavraSinal from './fixtures/investimento/conflito-palavra-sinal.json'
import lancamentoComum from './fixtures/investimento/lancamento-comum.json'

describe('detectarInvestimento', () => {
  /**
   * TL-1, TL-2, TL-3 — Palavra explícita APLICACAO (case-insensitive)
   */
  it('retorna aplicacao quando transcricao contém APLICACAO em maiúsculas (TL-1)', () => {
    const lancamento: Lancamento = { ...(aplicacaoExplicita as Lancamento), transcricao: 'APLICACAO RDB AUTOMATICO' }
    expect(detectarInvestimento(lancamento)).toBe('aplicacao')
  })

  it('retorna aplicacao quando transcricao contém Aplicacao em caixa mista (TL-2)', () => {
    const lancamento: Lancamento = { ...(aplicacaoExplicita as Lancamento), transcricao: 'Aplicacao CDB 03/2024' }
    expect(detectarInvestimento(lancamento)).toBe('aplicacao')
  })

  it('retorna aplicacao quando transcricao contém aplicacao em minúsculas (TL-3)', () => {
    const lancamento: Lancamento = { ...(aplicacaoExplicita as Lancamento), transcricao: 'aplicacao automatica' }
    expect(detectarInvestimento(lancamento)).toBe('aplicacao')
  })

  /**
   * TL-4, TL-5 — Palavra explícita RESGATE (case-insensitive)
   */
  it('retorna resgate quando transcricao contém RESGATE em maiúsculas (TL-4)', () => {
    const lancamento: Lancamento = { ...(resgateExplicito as Lancamento), transcricao: 'RESGATE RDB AUTOMATICO' }
    expect(detectarInvestimento(lancamento)).toBe('resgate')
  })

  it('retorna resgate quando transcricao contém resgate em minúsculas (TL-5)', () => {
    const lancamento: Lancamento = { ...(resgateExplicito as Lancamento), transcricao: 'resgate automatico' }
    expect(detectarInvestimento(lancamento)).toBe('resgate')
  })

  /**
   * TL-6, TL-7 — RDB desambiguado pelo sinal
   */
  it('retorna aplicacao quando transcricao contém RDB e valor é negativo (TL-6)', () => {
    const lancamento: Lancamento = rdbSinalNegativo as Lancamento
    expect(detectarInvestimento(lancamento)).toBe('aplicacao')
  })

  it('retorna resgate quando transcricao contém RDB e valor é positivo (TL-7)', () => {
    const lancamento: Lancamento = { ...(rdbSinalNegativo as Lancamento), valor: 1000.00 }
    expect(detectarInvestimento(lancamento)).toBe('resgate')
  })

  /**
   * TL-8, TL-9 — CDB desambiguado pelo sinal
   */
  it('retorna aplicacao quando transcricao contém CDB e valor é negativo (TL-8)', () => {
    const lancamento: Lancamento = { ...(cdbSinalPositivo as Lancamento), valor: -1000.00 }
    expect(detectarInvestimento(lancamento)).toBe('aplicacao')
  })

  it('retorna resgate quando transcricao contém CDB e valor é positivo (TL-9)', () => {
    const lancamento: Lancamento = cdbSinalPositivo as Lancamento
    expect(detectarInvestimento(lancamento)).toBe('resgate')
  })

  /**
   * TL-10, TL-11 — Conflito palavra×sinal: palavra explícita vence
   */
  it('retorna aplicacao quando APLICACAO e valor positivo — palavra vence sinal (TL-10)', () => {
    const lancamento: Lancamento = conflitoPalavraSinal as Lancamento
    // fixture tem valor positivo (+200) e transcricao com APLICACAO → palavra vence
    expect(detectarInvestimento(lancamento)).toBe('aplicacao')
  })

  it('retorna resgate quando RESGATE e valor negativo — palavra vence sinal (TL-11)', () => {
    const lancamento: Lancamento = { ...(resgateExplicito as Lancamento), valor: -300.00 }
    expect(detectarInvestimento(lancamento)).toBe('resgate')
  })

  /**
   * TL-12, TL-13 — Lançamentos comuns retornam null
   */
  it('retorna null para lançamento sem palavras-chave de investimento (TL-12)', () => {
    const lancamento: Lancamento = lancamentoComum as Lancamento
    expect(detectarInvestimento(lancamento)).toBeNull()
  })

  it('retorna null quando transcricao contém MERCADO (palavra não é investimento) (TL-13)', () => {
    const lancamento: Lancamento = { ...(lancamentoComum as Lancamento), transcricao: 'COMPRA MERCADO LIVRE' }
    expect(detectarInvestimento(lancamento)).toBeNull()
  })
})
