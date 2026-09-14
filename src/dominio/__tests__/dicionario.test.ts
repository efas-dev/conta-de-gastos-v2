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

    // Item 28: natureza aplicada do dicionário chega à grid em caixa alta
    expect(resultado.natureza).toBe('MORADIA')
    expect(resultado.descricao).toBe('Conta de luz')
    expect(resultado.iniciais).toBe('ES')
  })

  it('TL28-4: natureza minúscula herdada de dicionário antigo é aplicada em caixa alta', () => {
    const entradaMinuscula: DicEntry = { ...entradaNaoAmbigua, natureza: 'al' }
    const resultado = enriquecerLancamento(lancamentoBase, [entradaMinuscula], 'JD')

    expect(resultado.natureza).toBe('AL')
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

    expect(resultado.natureza).toBe('MORADIA')
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

// ---------------------------------------------------------------------------
// T04 (spec dicionario-chave-canonica): chave canônica + trava de valor
// ---------------------------------------------------------------------------

const parcelaBase: Lancamento = {
  fonte: 'fatura_nubank_cc',
  data: '2026-05-03',
  transcricao: 'Autohubservice - Parcela 3/4',
  valor: -275,
  iniciais: '',
  natureza: '',
  descricao: '',
}

const entradaParcela: DicEntry = {
  chave: 'Autohubservice - Parcela #/4',
  fonte: 'fatura_nubank_cc',
  natureza: 'VC',
  descricao: 'Conserto City',
  iniciais: 'ES',
  vezes: 2,
  ambiguo: false,
  valor: -275,
}

describe('enriquecerLancamento — chave canônica de parcela (T04)', () => {
  it('CV-01: parcela de outro mês casa com a entrada aprendida, via chave canônica', () => {
    const r = enriquecerLancamento(parcelaBase, [entradaParcela], 'JD')
    expect(r.natureza).toBe('VC')
    expect(r.descricao).toBe('Conserto City')
  })

  it('CV-02: valor divergente NÃO preenche — é outra compra do mesmo lojista', () => {
    // Caso real: `Mercadolivre*10produt - Parcela 2/4` é "Inceticidas" e
    // `Parcela 4/4` é "Fluido acendedor oratório". Mesma chave canônica,
    // compras diferentes. Sem esta trava, uma herdaria a classificação da outra.
    const outraCompra = { ...parcelaBase, valor: -27.12 }
    const r = enriquecerLancamento(outraCompra, [entradaParcela], 'JD')
    expect(r.natureza).toBe('')
    expect(r.descricao).toBe('')
    expect(r.iniciais).toBe('JD')
  })

  it('CV-03: entre duas entradas da mesma chave canônica, vence a do valor correspondente', () => {
    const inceticidas: DicEntry = {
      chave: 'Mercadolivre*10produt - Parcela #/4',
      fonte: 'fatura_nubank_cc',
      natureza: 'MT',
      descricao: 'Inceticidas',
      iniciais: 'ES',
      vezes: 1,
      ambiguo: false,
      valor: -55.4,
    }
    const fluido: DicEntry = { ...inceticidas, descricao: 'Fluido acendedor oratório', valor: -27.12 }
    const lancamento = {
      ...parcelaBase,
      transcricao: 'Mercadolivre*10produt - Parcela 3/4',
      valor: -27.12,
    }

    const r = enriquecerLancamento(lancamento, [inceticidas, fluido], 'JD')
    expect(r.descricao).toBe('Fluido acendedor oratório')
  })

  it('CV-04: tolerância absorve arredondamento de divisão (3 centavos)', () => {
    const comCentavo = { ...parcelaBase, valor: -275.03 }
    const r = enriquecerLancamento(comCentavo, [entradaParcela], 'JD')
    expect(r.descricao).toBe('Conserto City')
  })

  it('CV-05: diferença acima da tolerância não casa (10 centavos)', () => {
    const foraDaFolga = { ...parcelaBase, valor: -275.1 }
    const r = enriquecerLancamento(foraDaFolga, [entradaParcela], 'JD')
    expect(r.descricao).toBe('')
  })

  it('CV-06: D2 — em chave NÃO afrouxada o valor não participa do casamento', () => {
    // Mercado, posto e farmácia têm valor diferente toda vez e precisam continuar casando.
    const outroValor = { ...lancamentoBase, valor: -999.99 }
    const r = enriquecerLancamento(outroValor, [entradaNaoAmbigua], 'JD')
    expect(r.descricao).toBe('Conta de luz')
  })
})

describe('enriquecerLancamento — entrada herdada sem valor (T04, D5)', () => {
  const herdadaUnica: DicEntry = { ...entradaParcela, valor: undefined }

  it('CV-07: chave canônica única auto-preenche mesmo sem valor gravado', () => {
    const r = enriquecerLancamento(parcelaBase, [herdadaUnica], 'JD')
    expect(r.descricao).toBe('Conserto City')
  })

  it('CV-08: colisão de chave canônica sem valor NÃO preenche — espera o desempate', () => {
    const concorrente: DicEntry = { ...herdadaUnica, descricao: 'Outra compra', vezes: 1 }
    const r = enriquecerLancamento(parcelaBase, [herdadaUnica, concorrente], 'JD')
    expect(r.descricao).toBe('')
    expect(r.iniciais).toBe('JD')
  })

  it('CV-09: entrada ambígua continua sem auto-preencher', () => {
    const ambigua: DicEntry = { ...entradaParcela, ambiguo: true }
    const r = enriquecerLancamento(parcelaBase, [ambigua], 'JD')
    expect(r.descricao).toBe('')
  })
})
