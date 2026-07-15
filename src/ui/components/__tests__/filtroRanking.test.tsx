// ADR: see spec/grid-ux-filtros.adr.md

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { rankFontes, rankNaturezas, contarIncompletos } from '../../filtroRanking'
import { FiltroBar } from '../FiltroBar'
import type { Lancamento } from '../../../types'

// ---------------------------------------------------------------------------
// Mock do store Zustand para testes de componente
// ---------------------------------------------------------------------------

const mockStore = {
  lancamentos: [],
  lancamentosVisiveis: [],
  filtroFontes: [],
  filtroNaturezas: [],
  filtroSoIncompletos: false,
  ordenacaoColuna: null,
  ordenacaoDirecao: 'asc' as const,
  setFiltroFontes: vi.fn(),
  setFiltroNaturezas: vi.fn(),
  setFiltroSoIncompletos: vi.fn(),
  setOrdenacao: vi.fn(),
  limparFiltros: vi.fn(),
}

vi.mock('../../store/appStore', () => ({
  useAppStore: (selector: (state: typeof mockStore) => unknown) => selector(mockStore),
}))

// ---------------------------------------------------------------------------
// Helpers de fixture
// ---------------------------------------------------------------------------

function lan(overrides: Partial<Lancamento>): Lancamento {
  return {
    fonte: 'Nubank',
    data: '2024-01-01',
    transcricao: 'Compra',
    valor: -100,
    iniciais: 'ES',
    natureza: 'Alimentação',
    descricao: '',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// rankFontes
// ---------------------------------------------------------------------------

describe('rankFontes', () => {
  it('ordena fontes por número de operações descendente', () => {
    const lancamentos: Lancamento[] = [
      lan({ fonte: 'Nubank' }),
      lan({ fonte: 'Nubank' }),
      lan({ fonte: 'Itaú' }),
      lan({ fonte: 'Itaú' }),
      lan({ fonte: 'Itaú' }),
      lan({ fonte: 'Inter' }),
    ]
    const resultado = rankFontes(lancamentos)
    expect(resultado).toEqual(['Itaú', 'Nubank', 'Inter'])
  })

  it('exclui lançamentos com transferenciaInterna === true ao contar', () => {
    const lancamentos: Lancamento[] = [
      lan({ fonte: 'Nubank', transferenciaInterna: true }),
      lan({ fonte: 'Nubank', transferenciaInterna: true }),
      lan({ fonte: 'Nubank', transferenciaInterna: true }),
      lan({ fonte: 'Itaú' }),
      lan({ fonte: 'Itaú' }),
    ]
    // Nubank tem 3 ops, mas todas são transferências internas → 0 ops válidas
    // Itaú tem 2 ops válidas → vem primeiro
    const resultado = rankFontes(lancamentos)
    expect(resultado[0]).toBe('Itaú')
    // Nubank ainda aparece (tem lançamentos), mas depois
    expect(resultado).toContain('Nubank')
  })

  it('exclui lançamentos com investimento !== null ao contar', () => {
    const lancamentos: Lancamento[] = [
      lan({ fonte: 'Nubank', investimento: 'aplicacao' }),
      lan({ fonte: 'Nubank', investimento: 'aplicacao' }),
      lan({ fonte: 'Nubank', investimento: 'resgate' }),
      lan({ fonte: 'Itaú' }),
    ]
    // Nubank: 0 ops válidas; Itaú: 1 op válida
    const resultado = rankFontes(lancamentos)
    expect(resultado[0]).toBe('Itaú')
  })

  it('exclui lançamentos quando ambos transferenciaInterna e investimento estão setados', () => {
    const lancamentos: Lancamento[] = [
      lan({ fonte: 'Nubank', transferenciaInterna: true, investimento: 'aplicacao' }),
      lan({ fonte: 'Itaú' }),
    ]
    const resultado = rankFontes(lancamentos)
    expect(resultado[0]).toBe('Itaú')
  })

  it('retorna array vazio para lista vazia', () => {
    expect(rankFontes([])).toEqual([])
  })

  it('mantém fontes com zero ops válidas no resultado, após as fontes com ops', () => {
    const lancamentos: Lancamento[] = [
      lan({ fonte: 'Nubank', transferenciaInterna: true }),
      lan({ fonte: 'Itaú' }),
    ]
    const resultado = rankFontes(lancamentos)
    expect(resultado).toContain('Nubank')
    expect(resultado).toContain('Itaú')
    expect(resultado.indexOf('Itaú')).toBeLessThan(resultado.indexOf('Nubank'))
  })
})

// ---------------------------------------------------------------------------
// rankNaturezas
// ---------------------------------------------------------------------------

describe('rankNaturezas', () => {
  it('ordena naturezas por valor somado em módulo descendente', () => {
    const lancamentos: Lancamento[] = [
      lan({ natureza: 'Alimentação', valor: -50 }),
      lan({ natureza: 'Alimentação', valor: -30 }),
      lan({ natureza: 'Transporte', valor: -200 }),
      lan({ natureza: 'Saúde', valor: -10 }),
    ]
    const { top5 } = rankNaturezas(lancamentos)
    expect(top5[0]).toBe('Transporte') // 200
    expect(top5[1]).toBe('Alimentação') // 80
    expect(top5[2]).toBe('Saúde') // 10
  })

  it('retorna top-5 e resto para o chip "+N mais"', () => {
    const naturezas = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
    const lancamentos = naturezas.map((n) => lan({ natureza: n, valor: -10 }))
    const { top5, resto } = rankNaturezas(lancamentos)
    expect(top5).toHaveLength(5)
    expect(resto).toHaveLength(2)
  })

  it('quando há ≤5 naturezas distintas, resto é vazio', () => {
    const lancamentos: Lancamento[] = [
      lan({ natureza: 'A', valor: -10 }),
      lan({ natureza: 'B', valor: -20 }),
      lan({ natureza: 'C', valor: -30 }),
    ]
    const { top5, resto } = rankNaturezas(lancamentos)
    expect(top5).toHaveLength(3)
    expect(resto).toHaveLength(0)
  })

  it('lista vazia retorna top5 e resto vazios', () => {
    const { top5, resto } = rankNaturezas([])
    expect(top5).toEqual([])
    expect(resto).toEqual([])
  })

  it('usa valor em módulo — créditos e débitos contribuem igualmente para o ranking', () => {
    const lancamentos: Lancamento[] = [
      lan({ natureza: 'Salário', valor: 5000 }),
      lan({ natureza: 'Alimentação', valor: -100 }),
    ]
    const { top5 } = rankNaturezas(lancamentos)
    expect(top5[0]).toBe('Salário')
  })
})

// ---------------------------------------------------------------------------
// contarIncompletos
// ---------------------------------------------------------------------------

describe('contarIncompletos', () => {
  it('conta lançamentos com natureza vazia', () => {
    const lancamentos: Lancamento[] = [
      lan({ natureza: '', iniciais: 'ES' }),
      lan({ natureza: 'Alimentação', iniciais: 'ES' }),
    ]
    expect(contarIncompletos(lancamentos)).toBe(1)
  })

  it('conta lançamentos com iniciais vazias', () => {
    const lancamentos: Lancamento[] = [
      lan({ natureza: 'Alimentação', iniciais: '' }),
      lan({ natureza: 'Alimentação', iniciais: 'ES' }),
    ]
    expect(contarIncompletos(lancamentos)).toBe(1)
  })

  it('conta lançamentos com natureza nula', () => {
    const lancamentos = [
      lan({ natureza: undefined as unknown as string, iniciais: 'ES' }),
    ]
    expect(contarIncompletos(lancamentos)).toBe(1)
  })

  it('conta lançamentos com iniciais nulas', () => {
    const lancamentos = [
      lan({ natureza: 'Alimentação', iniciais: undefined as unknown as string }),
    ]
    expect(contarIncompletos(lancamentos)).toBe(1)
  })

  it('não conta lançamentos com natureza e iniciais preenchidas', () => {
    const lancamentos: Lancamento[] = [
      lan({ natureza: 'Alimentação', iniciais: 'ES' }),
      lan({ natureza: 'Transporte', iniciais: 'MR' }),
    ]
    expect(contarIncompletos(lancamentos)).toBe(0)
  })

  it('retorna 0 para lista vazia', () => {
    expect(contarIncompletos([])).toBe(0)
  })

  it('conta lançamento que tem ambos os campos vazios apenas uma vez', () => {
    const lancamentos: Lancamento[] = [
      lan({ natureza: '', iniciais: '' }),
    ]
    expect(contarIncompletos(lancamentos)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// FiltroBar — renderização com store zerado
// ---------------------------------------------------------------------------

describe('FiltroBar', () => {
  it('renderiza sem erro com store zerado (sem lançamentos)', () => {
    // Deve montar sem lançar exceção
    expect(() => render(<FiltroBar />)).not.toThrow()
  })

  it('exibe contador "0 de 0 visíveis" quando não há lançamentos', () => {
    const { getByText } = render(<FiltroBar />)
    expect(getByText(/0 de 0/)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// rankNaturezas — exclusão de naturezas vazias (chip vazio não faz sentido;
// achado da inspeção manual de 2026-07-15)
// ---------------------------------------------------------------------------

describe('rankNaturezas — naturezas vazias', () => {
  it('natureza vazia ("") não gera chip: fora de top5 e resto', () => {
    const lancamentos = [
      lan({ natureza: '', valor: -9999 }),
      lan({ natureza: 'RR', valor: -100 }),
    ]
    const { top5, resto } = rankNaturezas(lancamentos)
    expect(top5).not.toContain('')
    expect(resto).not.toContain('')
    expect(top5).toContain('RR')
  })

  it('natureza só com espaços não gera chip', () => {
    const lancamentos = [
      lan({ natureza: '   ', valor: -9999 }),
      lan({ natureza: 'GO', valor: -50 }),
    ]
    const { top5, resto } = rankNaturezas(lancamentos)
    expect([...top5, ...resto].some((n) => n.trim() === '')).toBe(false)
  })

  it('lista só com naturezas vazias retorna rankings vazios', () => {
    const lancamentos = [lan({ natureza: '' }), lan({ natureza: '' })]
    const { top5, resto } = rankNaturezas(lancamentos)
    expect(top5).toEqual([])
    expect(resto).toEqual([])
  })
})
