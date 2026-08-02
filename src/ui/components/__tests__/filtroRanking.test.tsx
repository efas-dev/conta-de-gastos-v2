// ADR: see Docs/specs/grid-ux-filtros.adr.md

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
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

// ---------------------------------------------------------------------------
// FiltroBar — classes do design system (Task T3, spec redesign-frontend-claude-design)
// ---------------------------------------------------------------------------

describe('FiltroBar — classes do design system', () => {
  afterEach(() => {
    mockStore.lancamentos = []
    mockStore.filtroFontes = []
    mockStore.filtroNaturezas = []
    mockStore.filtroSoIncompletos = false
    vi.clearAllMocks()
  })

  it('TL-1: container do toolbar de filtros usa a classe "filtros"', () => {
    const { getByRole } = render(<FiltroBar />)
    const toolbar = getByRole('toolbar')
    expect(toolbar.className.split(' ')).toContain('filtros')
  })

  it('TL-2: grupo de chips de fonte usa a classe "filtro-grupo"', () => {
    mockStore.lancamentos = [
      lan({ fonte: 'Nubank' }),
      lan({ fonte: 'Itaú' }),
    ]
    const { getByRole } = render(<FiltroBar />)
    const grupo = getByRole('group', { name: /filtro por fonte/i })
    expect(grupo.className.split(' ')).toContain('filtro-grupo')
  })

  it('TL-3: chip de fonte inativo tem a classe "chip" sem o modificador "on"', () => {
    mockStore.lancamentos = [lan({ fonte: 'Nubank' })]
    const { getByRole } = render(<FiltroBar />)
    const chip = getByRole('button', { name: 'Nubank' })
    expect(chip.className.split(' ')).toContain('chip')
    expect(chip.className.split(' ')).not.toContain('on')
  })

  it('TL-4: chip de fonte ativo tem a classe "chip on"', () => {
    mockStore.lancamentos = [lan({ fonte: 'Nubank' })]
    mockStore.filtroFontes = ['Nubank']
    const { getByRole } = render(<FiltroBar />)
    const chip = getByRole('button', { name: 'Nubank' })
    expect(chip.className.split(' ')).toEqual(expect.arrayContaining(['chip', 'on']))
  })

  it('TL-5: divisor entre grupo de fonte e grupo de natureza usa a classe "divisor"', () => {
    mockStore.lancamentos = [lan({ fonte: 'Nubank', natureza: 'Alimentação' })]
    const { container } = render(<FiltroBar />)
    expect(container.querySelector('.divisor')).toBeTruthy()
  })

  it('TL-6: grupo de chips de natureza usa a classe "filtro-grupo"', () => {
    mockStore.lancamentos = [lan({ natureza: 'Alimentação' })]
    const { getByRole } = render(<FiltroBar />)
    const grupo = getByRole('group', { name: /filtro por natureza/i })
    expect(grupo.className.split(' ')).toContain('filtro-grupo')
  })

  it('TL-7: chip de natureza segue o mesmo padrão chip/chip on', () => {
    mockStore.lancamentos = [lan({ natureza: 'Alimentação' })]
    mockStore.filtroNaturezas = ['Alimentação']
    const { getByRole } = render(<FiltroBar />)
    const chip = getByRole('button', { name: 'Alimentação' })
    expect(chip.className.split(' ')).toEqual(expect.arrayContaining(['chip', 'on']))
  })

  it('TL-8: chip "só incompletos" usa a classe "chip-sujo"', () => {
    mockStore.lancamentos = [lan({ natureza: '' })]
    const { getByText } = render(<FiltroBar />)
    const chip = getByText(/só incompletos/).closest('button')
    expect(chip?.className.split(' ')).toContain('chip-sujo')
  })

  it('TL-9: nenhum botão de chip carrega estilo inline com cor hardcoded', () => {
    mockStore.lancamentos = [lan({ fonte: 'Nubank', natureza: '' })]
    const { getByRole } = render(<FiltroBar />)
    const chipFonte = getByRole('button', { name: 'Nubank' })
    expect(chipFonte.getAttribute('style')).toBeFalsy()
  })

  it('TL-10: clique simples num chip de fonte não selecionado ativa seleção única', () => {
    mockStore.lancamentos = [lan({ fonte: 'Nubank' }), lan({ fonte: 'Itaú' })]
    const { getByRole } = render(<FiltroBar />)
    fireEvent.click(getByRole('button', { name: 'Nubank' }))
    expect(mockStore.setFiltroFontes).toHaveBeenCalledWith(['Nubank'])
  })

  it('TL-11: clique simples num chip de fonte já selecionado sozinho desliga o filtro', () => {
    mockStore.lancamentos = [lan({ fonte: 'Nubank' })]
    mockStore.filtroFontes = ['Nubank']
    const { getByRole } = render(<FiltroBar />)
    fireEvent.click(getByRole('button', { name: 'Nubank' }))
    expect(mockStore.setFiltroFontes).toHaveBeenCalledWith([])
  })

  it('TL-12: ctrl+clique num chip de fonte acumula à seleção existente', () => {
    mockStore.lancamentos = [lan({ fonte: 'Nubank' }), lan({ fonte: 'Itaú' })]
    mockStore.filtroFontes = ['Itaú']
    const { getByRole } = render(<FiltroBar />)
    fireEvent.click(getByRole('button', { name: 'Nubank' }), { ctrlKey: true })
    expect(mockStore.setFiltroFontes).toHaveBeenCalledWith(['Itaú', 'Nubank'])
  })

  it('TL-13: cmd+clique (metaKey) num chip de natureza acumula à seleção existente', () => {
    mockStore.lancamentos = [
      lan({ natureza: 'Alimentação' }),
      lan({ natureza: 'Transporte' }),
    ]
    mockStore.filtroNaturezas = ['Transporte']
    const { getByRole } = render(<FiltroBar />)
    fireEvent.click(getByRole('button', { name: 'Alimentação' }), { metaKey: true })
    expect(mockStore.setFiltroNaturezas).toHaveBeenCalledWith(['Transporte', 'Alimentação'])
  })
})

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
