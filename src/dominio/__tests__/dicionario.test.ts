// ADR: see spec/mvp-vertical-nubank.adr.md

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
})
