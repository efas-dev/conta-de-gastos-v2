// ADR: see Docs/specs/mvp-vertical-nubank.adr.md
import { describe, it, expect } from 'vitest'
import type { Lancamento, DicEntry } from '../types'

// TL-01 a TL-07: Lancamento possui todos os campos esperados com os tipos corretos
describe('Lancamento', () => {
  it('pode ser instanciado com todos os campos (TL-01 a TL-07, TL-15)', () => {
    const lancamento: Lancamento = {
      fonte: 'Nubank',
      data: '2024-01-15',
      transcricao: 'Mercado Extra',
      valor: -150.5,
      iniciais: 'ES',
      natureza: 'Alimentação',
      descricao: 'Compras do mês',
    }

    expect(lancamento.fonte).toBe('Nubank')
    expect(lancamento.data).toBe('2024-01-15')
    expect(lancamento.transcricao).toBe('Mercado Extra')
    expect(lancamento.valor).toBe(-150.5)
    expect(lancamento.iniciais).toBe('ES')
    expect(lancamento.natureza).toBe('Alimentação')
    expect(lancamento.descricao).toBe('Compras do mês')
  })

  it('campo fonte é string (TL-01)', () => {
    const l: Lancamento = {
      fonte: 'Nubank',
      data: '2024-01-15',
      transcricao: 'teste',
      valor: 0,
      iniciais: '',
      natureza: '',
      descricao: '',
    }
    expect(typeof l.fonte).toBe('string')
  })

  it('campo data é string ISO (TL-02)', () => {
    const l: Lancamento = {
      fonte: 'Nubank',
      data: '2024-03-20',
      transcricao: 'teste',
      valor: 0,
      iniciais: '',
      natureza: '',
      descricao: '',
    }
    expect(typeof l.data).toBe('string')
  })

  it('campo valor é number (TL-04)', () => {
    const l: Lancamento = {
      fonte: 'Nubank',
      data: '2024-01-01',
      transcricao: 'teste',
      valor: -99.99,
      iniciais: '',
      natureza: '',
      descricao: '',
    }
    expect(typeof l.valor).toBe('number')
  })
})

// TL-08 a TL-14: DicEntry possui todos os campos esperados com os tipos corretos
describe('DicEntry', () => {
  it('pode ser instanciado com todos os campos (TL-08 a TL-14, TL-16)', () => {
    const entry: DicEntry = {
      chave: 'Mercado Extra',
      fonte: 'Nubank',
      natureza: 'Alimentação',
      descricao: 'Compras do mês',
      iniciais: 'ES',
      vezes: 3,
      ambiguo: false,
    }

    expect(entry.chave).toBe('Mercado Extra')
    expect(entry.fonte).toBe('Nubank')
    expect(entry.natureza).toBe('Alimentação')
    expect(entry.descricao).toBe('Compras do mês')
    expect(entry.iniciais).toBe('ES')
    expect(entry.vezes).toBe(3)
    expect(entry.ambiguo).toBe(false)
  })

  it('campo vezes é number (TL-13)', () => {
    const e: DicEntry = {
      chave: 'teste',
      fonte: 'Nubank',
      natureza: '',
      descricao: '',
      iniciais: '',
      vezes: 7,
      ambiguo: false,
    }
    expect(typeof e.vezes).toBe('number')
  })

  it('campo ambiguo é boolean (TL-14)', () => {
    const e: DicEntry = {
      chave: 'teste',
      fonte: 'Nubank',
      natureza: '',
      descricao: '',
      iniciais: '',
      vezes: 1,
      ambiguo: true,
    }
    expect(typeof e.ambiguo).toBe('boolean')
  })
})
