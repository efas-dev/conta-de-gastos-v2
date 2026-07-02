// ADR: see Docs/specs/mvp-vertical-nubank.adr.md

import { describe, it, expect } from 'vitest'
import type { Lancamento, DicEntry } from '../../types'
import { enriquecerLancamento } from '../dicionario'

const lancamentoBase: Lancamento = {
  fonte: 'Nubank',
  data: '2025-03-12',
  transcricao: 'PAG BOLETO ENERGIA 12/03',
  valor: -150.0,
  iniciais: '',
  natureza: '',
  descricao: '',
}

const entradaNaoAmbigua: DicEntry = {
  chave: 'PAG BOLETO ENERGIA',
  fonte: 'Nubank',
  natureza: 'Moradia',
  descricao: 'Conta de luz',
  iniciais: 'ES',
  vezes: 3,
  ambiguo: false,
}

const entradaAmbigua: DicEntry = {
  chave: 'PAG BOLETO ENERGIA',
  fonte: 'Nubank',
  natureza: 'Moradia',
  descricao: 'Conta de luz',
  iniciais: 'ES',
  vezes: 2,
  ambiguo: true,
}

describe('enriquecerLancamento', () => {
  it('TL-06: chave não-ambígua no dicionário auto-preenche natureza, descricao e iniciais', () => {
    const resultado = enriquecerLancamento(lancamentoBase, [entradaNaoAmbigua], 'JD')

    expect(resultado.natureza).toBe('Moradia')
    expect(resultado.descricao).toBe('Conta de luz')
    expect(resultado.iniciais).toBe('ES')
  })

  it('TL-07: chave ambígua retorna natureza e descricao em branco e iniciais do usuário', () => {
    const resultado = enriquecerLancamento(lancamentoBase, [entradaAmbigua], 'JD')

    expect(resultado.natureza).toBe('')
    expect(resultado.descricao).toBe('')
    expect(resultado.iniciais).toBe('JD')
  })

  it('TL-08: chave ausente do dicionário retorna natureza e descricao em branco e iniciais do usuário', () => {
    const lancamentoSemEntrada: Lancamento = {
      ...lancamentoBase,
      transcricao: 'UBER VIAGEM',
    }

    const resultado = enriquecerLancamento(lancamentoSemEntrada, [entradaNaoAmbigua], 'JD')

    expect(resultado.natureza).toBe('')
    expect(resultado.descricao).toBe('')
    expect(resultado.iniciais).toBe('JD')
  })

  it('TL-09: transcrição com sufixo de data é normalizada antes da busca no dicionário', () => {
    // lancamentoBase.transcricao = 'PAG BOLETO ENERGIA 12/03' → chave normalizada = 'PAG BOLETO ENERGIA'
    const resultado = enriquecerLancamento(lancamentoBase, [entradaNaoAmbigua], 'JD')

    expect(resultado.natureza).toBe('Moradia')
    expect(resultado.descricao).toBe('Conta de luz')
    expect(resultado.iniciais).toBe('ES')
  })

  it('TL-10: entrada do dicionário de fonte diferente não contamina lançamento de outra fonte', () => {
    // Dicionário contém entrada para 'PAG BOLETO ENERGIA' indexada em 'Nubank'.
    // Lançamento é de 'Itau' — mesma chave normalizada, fonte diferente.
    // Resultado esperado: sem enriquecimento (natureza e descricao em branco, iniciais do usuário).
    const lancamentoItau: Lancamento = {
      ...lancamentoBase,
      fonte: 'Itau',
    }

    const resultado = enriquecerLancamento(lancamentoItau, [entradaNaoAmbigua], 'JD')

    expect(resultado.natureza).toBe('')
    expect(resultado.descricao).toBe('')
    expect(resultado.iniciais).toBe('JD')
  })
})
