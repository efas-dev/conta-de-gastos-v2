// ADR: see Docs/specs/grid-revisao.adr.md

import { describe, it, expect } from 'vitest'
import { ratearSplit, type AlvoSplit } from '../split'
import type { Lancamento } from '../../types'

/** Lançamento base reutilizável nos testes */
const base: Lancamento = {
  fonte: 'Nubank',
  data: '2026-06-15',
  transcricao: 'Restaurante Xpto',
  valor: 10.0,
  iniciais: 'ES',
  natureza: 'Alimentação',
  descricao: 'Almoço',
  transferenciaInterna: false,
  investimento: null,
}

describe('ratearSplit', () => {
  it('N=1 — retorna lista unitária com iniciais do alvo e valor igual ao original', () => {
    const alvos: AlvoSplit[] = [{ iniciais: 'AB' }]
    const resultado = ratearSplit(base, alvos)

    expect(resultado).toHaveLength(1)
    expect(resultado[0].iniciais).toBe('AB')
    expect(resultado[0].valor).toBe(10.0)
  })

  it('N=2 divisão exata — cada parte recebe metade sem sobra', () => {
    const lancamento: Lancamento = { ...base, valor: 10.0 }
    const alvos: AlvoSplit[] = [{ iniciais: 'AA' }, { iniciais: 'BB' }]
    const resultado = ratearSplit(lancamento, alvos)

    expect(resultado).toHaveLength(2)
    expect(resultado[0].valor).toBe(5.0)
    expect(resultado[1].valor).toBe(5.0)
    const soma = resultado.reduce((acc, l) => acc + l.valor, 0)
    expect(soma).toBeCloseTo(10.0, 10)
    // soma em centavos deve ser exata
    expect(Math.round(soma * 100)).toBe(Math.round(10.0 * 100))
  })

  it('N=2 com sobra de centavo — última linha absorve o centavo extra', () => {
    const lancamento: Lancamento = { ...base, valor: 1.01 }
    const alvos: AlvoSplit[] = [{ iniciais: 'AA' }, { iniciais: 'BB' }]
    const resultado = ratearSplit(lancamento, alvos)

    expect(resultado).toHaveLength(2)
    expect(resultado[0].valor).toBe(0.5)
    expect(resultado[1].valor).toBe(0.51)
    const somaCentavos = Math.round(resultado[0].valor * 100) + Math.round(resultado[1].valor * 100)
    expect(somaCentavos).toBe(Math.round(1.01 * 100))
  })

  it('N=3 divisão exata — cada parte recebe um terço exato', () => {
    const lancamento: Lancamento = { ...base, valor: 3.0 }
    const alvos: AlvoSplit[] = [{ iniciais: 'AA' }, { iniciais: 'BB' }, { iniciais: 'CC' }]
    const resultado = ratearSplit(lancamento, alvos)

    expect(resultado).toHaveLength(3)
    expect(resultado[0].valor).toBe(1.0)
    expect(resultado[1].valor).toBe(1.0)
    expect(resultado[2].valor).toBe(1.0)
    const somaCentavos = resultado.reduce((acc, l) => acc + Math.round(l.valor * 100), 0)
    expect(somaCentavos).toBe(Math.round(3.0 * 100))
  })

  it('N=3 com sobra — última linha absorve o(s) centavo(s) extra(s)', () => {
    const lancamento: Lancamento = { ...base, valor: 1.0 }
    const alvos: AlvoSplit[] = [{ iniciais: 'AA' }, { iniciais: 'BB' }, { iniciais: 'CC' }]
    const resultado = ratearSplit(lancamento, alvos)

    expect(resultado).toHaveLength(3)
    expect(resultado[0].valor).toBe(0.33)
    expect(resultado[1].valor).toBe(0.33)
    expect(resultado[2].valor).toBe(0.34)
    const somaCentavos = resultado.reduce((acc, l) => acc + Math.round(l.valor * 100), 0)
    expect(somaCentavos).toBe(Math.round(1.0 * 100))
  })

  it('preserva todos os demais campos (fonte, data, transcricao, natureza, descricao) em cada cópia', () => {
    const alvos: AlvoSplit[] = [{ iniciais: 'AA' }, { iniciais: 'BB' }]
    const resultado = ratearSplit(base, alvos)

    for (const l of resultado) {
      expect(l.fonte).toBe(base.fonte)
      expect(l.data).toBe(base.data)
      expect(l.transcricao).toBe(base.transcricao)
      expect(l.natureza).toBe(base.natureza)
      expect(l.descricao).toBe(base.descricao)
    }
  })

  it('preserva campos opcionais (transferenciaInterna, investimento) em cada cópia', () => {
    const lancamento: Lancamento = { ...base, transferenciaInterna: true, investimento: 'aplicacao' }
    const alvos: AlvoSplit[] = [{ iniciais: 'AA' }, { iniciais: 'BB' }]
    const resultado = ratearSplit(lancamento, alvos)

    for (const l of resultado) {
      expect(l.transferenciaInterna).toBe(true)
      expect(l.investimento).toBe('aplicacao')
    }
  })

  it('valor negativo (débito) — rateio preserva sinal e a soma é exatamente igual ao original', () => {
    const lancamento: Lancamento = { ...base, valor: -10.01 }
    const alvos: AlvoSplit[] = [{ iniciais: 'AA' }, { iniciais: 'BB' }, { iniciais: 'CC' }]
    const resultado = ratearSplit(lancamento, alvos)

    expect(resultado).toHaveLength(3)
    const somaCentavos = resultado.reduce((acc, l) => acc + Math.round(l.valor * 100), 0)
    expect(somaCentavos).toBe(Math.round(-10.01 * 100))
    // todos negativos
    for (const l of resultado) {
      expect(l.valor).toBeLessThan(0)
    }
  })
})
