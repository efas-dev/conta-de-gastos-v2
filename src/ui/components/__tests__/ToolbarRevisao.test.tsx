// ADR: see Docs/specs/redesign-frontend-claude-design.adr.md

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { ToolbarRevisao } from '../ToolbarRevisao'
import type { Lancamento } from '../../../types'

// ---------------------------------------------------------------------------
// Mock do store Zustand — mesmo padrão de FiltroBar.test (filtroRanking.test.tsx)
// ---------------------------------------------------------------------------

const mockStore: {
  lancamentos: Lancamento[]
  naturezasValidas: string[]
  sujo: boolean
  saldoAnterior: number | null
} = {
  lancamentos: [],
  naturezasValidas: [],
  sujo: false,
  saldoAnterior: null,
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

describe('ToolbarRevisao', () => {
  it('sem lançamentos: exibe "0 de 0 classificados" e barra em 0%', () => {
    mockStore.lancamentos = []
    mockStore.naturezasValidas = []
    mockStore.sujo = false

    const { container } = render(<ToolbarRevisao />)

    expect(container.textContent).toContain('0 de 0 classificados')
    const fill = container.querySelector('.prog-fill') as HTMLElement
    expect(fill.style.width).toBe('0%')
  })

  it('todos os lançamentos com natureza válida: X=Y=total, barra em 100%', () => {
    mockStore.lancamentos = [
      lan({ natureza: 'Alimentação' }),
      lan({ natureza: 'Transporte' }),
    ]
    mockStore.naturezasValidas = ['Alimentação', 'Transporte']
    mockStore.sujo = false

    const { container } = render(<ToolbarRevisao />)

    expect(container.textContent).toContain('2 de 2 classificados')
    const fill = container.querySelector('.prog-fill') as HTMLElement
    expect(fill.style.width).toBe('100%')
  })

  it('mistura de naturezas válida/vazia/inválida: X conta apenas as consideradas OK por validarLinha', () => {
    mockStore.lancamentos = [
      lan({ natureza: 'Alimentação' }), // válida
      lan({ natureza: '', transcricao: 'Compra sem natureza', valor: -50 }), // vazia com dados: pendente
      lan({ natureza: 'NaturezaInexistente' }), // inválida: pendente
      lan({ natureza: '', transcricao: '', valor: 0 }), // linha vazia sem dados: OK
    ]
    mockStore.naturezasValidas = ['Alimentação']
    mockStore.sujo = false

    const { container } = render(<ToolbarRevisao />)

    // 2 OK (Alimentação válida + linha vazia sem dados) de 4 total
    expect(container.textContent).toContain('2 de 4 classificados')
  })

  it('exibe o chip "não exportado" quando sujo === true', () => {
    mockStore.lancamentos = []
    mockStore.naturezasValidas = []
    mockStore.sujo = true

    const { container } = render(<ToolbarRevisao />)

    expect(container.querySelector('.chip-sujo')).toBeTruthy()
    expect(container.textContent).toContain('não exportado')
  })

  it('não exibe o chip "não exportado" quando sujo === false', () => {
    mockStore.lancamentos = []
    mockStore.naturezasValidas = []
    mockStore.sujo = false

    const { container } = render(<ToolbarRevisao />)

    expect(container.querySelector('.chip-sujo')).toBeFalsy()
  })

  it('chip-sujo exibe um texto visível curto do aviso de zero-retenção', () => {
    mockStore.lancamentos = []
    mockStore.naturezasValidas = []
    mockStore.sujo = true

    const { container } = render(<ToolbarRevisao />)

    const chip = container.querySelector('.chip-sujo') as HTMLElement
    expect(chip.textContent).toContain('só nesta aba')
  })

  it('chip-sujo carrega o title com o texto completo do aviso de zero-retenção', () => {
    mockStore.lancamentos = []
    mockStore.naturezasValidas = []
    mockStore.sujo = true

    const { container } = render(<ToolbarRevisao />)

    const chip = container.querySelector('.chip-sujo') as HTMLElement
    expect(chip.getAttribute('title')).toBe(
      'Os dados vivem apenas nesta aba. Exporte antes de fechar ou recarregar.'
    )
  })

  it('renderiza a estrutura .toolbar.compacta / .progresso / .prog-barra / .prog-fill', () => {
    mockStore.lancamentos = []
    mockStore.naturezasValidas = []
    mockStore.sujo = false

    const { container } = render(<ToolbarRevisao />)

    expect(container.querySelector('.toolbar.compacta')).toBeTruthy()
    expect(container.querySelector('.progresso')).toBeTruthy()
    expect(container.querySelector('.prog-barra')).toBeTruthy()
    expect(container.querySelector('.prog-fill')).toBeTruthy()
  })

  it('grupo de saldos: usa a classe .saldos e exibe os rótulos "Saldo ant." e "Calculado"', () => {
    mockStore.lancamentos = []
    mockStore.naturezasValidas = []
    mockStore.sujo = false
    mockStore.saldoAnterior = 1000

    const { container } = render(<ToolbarRevisao />)

    const grupo = container.querySelector('.saldos')
    expect(grupo).toBeTruthy()
    expect(grupo!.textContent).toContain('Saldo ant.')
    expect(grupo!.textContent).toContain('Calculado')
  })

  it('grupo de saldos: saldoAnterior === null omite o grupo inteiro (nem rótulo, nem "R$ —")', () => {
    mockStore.lancamentos = [lan({ valor: 100 })]
    mockStore.naturezasValidas = []
    mockStore.sujo = false
    mockStore.saldoAnterior = null

    const { container } = render(<ToolbarRevisao />)

    expect(container.querySelector('.saldos')).toBeFalsy()
    expect(container.textContent).not.toContain('Saldo ant.')
    expect(container.textContent).not.toContain('Calculado')
  })

  it('grupo de saldos: sem lançamentos, "Calculado" exibe o mesmo valor de "Saldo ant."', () => {
    mockStore.lancamentos = []
    mockStore.naturezasValidas = []
    mockStore.sujo = false
    mockStore.saldoAnterior = 543.21

    const { container } = render(<ToolbarRevisao />)

    const grupo = container.querySelector('.saldos') as HTMLElement
    const anteriorFmt = (543.21).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    // "Calculado" deve conter o mesmo valor formatado do "Saldo ant." quando não há lançamentos.
    const ocorrencias = grupo.textContent!.split(anteriorFmt).length - 1
    expect(ocorrencias).toBe(2)
  })

  it('grupo de saldos: calculado negativo pinta o valor de var(--terracota)', () => {
    mockStore.lancamentos = [lan({ valor: -2000 })]
    mockStore.naturezasValidas = []
    mockStore.sujo = false
    mockStore.saldoAnterior = 100

    const { container } = render(<ToolbarRevisao />)

    const spans = container.querySelectorAll('.saldos span')
    const calculadoSpan = spans[1] as HTMLElement
    expect(calculadoSpan.style.color).toBe('var(--terracota)')
  })

  it('grupo de saldos: calculado positivo NÃO pinta o valor de var(--terracota)', () => {
    mockStore.lancamentos = [lan({ valor: 2000 })]
    mockStore.naturezasValidas = []
    mockStore.sujo = false
    mockStore.saldoAnterior = 100

    const { container } = render(<ToolbarRevisao />)

    const spans = container.querySelectorAll('.saldos span')
    const calculadoSpan = spans[1] as HTMLElement
    expect(calculadoSpan.style.color).not.toBe('var(--terracota)')
  })

  it('grupo de saldos: valores formatados em pt-BR/BRL', () => {
    mockStore.lancamentos = []
    mockStore.naturezasValidas = []
    mockStore.sujo = false
    mockStore.saldoAnterior = 1234.5

    const { container } = render(<ToolbarRevisao />)

    const grupo = container.querySelector('.saldos') as HTMLElement
    expect(grupo.textContent).toContain('R$')
    expect(grupo.textContent).toContain('1.234,50')
  })

  it('grupo de saldos: carrega title (tooltip) explicando a origem dos números', () => {
    mockStore.lancamentos = []
    mockStore.naturezasValidas = []
    mockStore.sujo = false
    mockStore.saldoAnterior = 100

    const { container } = render(<ToolbarRevisao />)

    const grupo = container.querySelector('.saldos') as HTMLElement
    expect(grupo.getAttribute('title')).toBeTruthy()
    expect((grupo.getAttribute('title') as string).length).toBeGreaterThan(10)
  })
})
