// ADR: see Docs/specs/redesign-frontend-claude-design.adr.md

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PainelLateral } from '../PainelLateral'
import { CentralDeAvisos } from '../CentralDeAvisos'
import type { Aviso } from '../../../types'
import type { NaturezaRica } from '../../../types'

// TL-92 (Task 7-bis): envolve a implementação real de `CentralDeAvisos` num `vi.fn` — preserva o
// comportamento/conteúdo real (os demais testes deste arquivo continuam vendo o conteúdo
// renderizado de verdade) e permite inspecionar com qual `mesRef` o componente foi chamado.
vi.mock('../CentralDeAvisos', async (importOriginal) => {
  const real = await importOriginal<typeof import('../CentralDeAvisos')>()
  return { ...real, CentralDeAvisos: vi.fn(real.CentralDeAvisos) }
})

const mockAplicar = vi.fn()
const mockDesfazer = vi.fn()
const mockDispensar = vi.fn()
const mockEntrarInspecao = vi.fn()
const mockSairInspecao = vi.fn()

let avisosMock: Aviso[] = []

vi.mock('../../store/appStore', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      lancamentos: [],
      filtroNaturezas: [],
      setFiltroNaturezas: () => {},
      avisosAcionaveis: { avisos: avisosMock, removidos: {}, avisoEmInspecao: null },
      aplicar: mockAplicar,
      desfazer: mockDesfazer,
      dispensar: mockDispensar,
      entrarInspecao: mockEntrarInspecao,
      sairInspecao: mockSairInspecao,
    }),
}))

function proposta(parcial: Partial<Aviso> = {}): Aviso {
  return {
    id: 'prop-1',
    tipo: 'proposta',
    origem: 'conciliacao',
    mensagem: 'Fatura conciliável com pagamento do extrato.',
    alvo: ['0'],
    permanece: [],
    estado: 'pendente',
    ...parcial,
  }
}

const naturezasFicticias: NaturezaRica[] = [
  { sigla: 'ALM', nome: 'Alimentação', descricao: 'Gastos com comida e restaurantes' },
]

beforeEach(() => {
  avisosMock = []
  mockAplicar.mockReset()
  mockDesfazer.mockReset()
  mockDispensar.mockReset()
  mockEntrarInspecao.mockReset()
  mockSairInspecao.mockReset()
  vi.mocked(CentralDeAvisos).mockClear()
})

describe('PainelLateral — estrutura (TL-13)', () => {
  it('renderiza <aside class="painel"> com .painel-abas e .painel-corpo, sem position:fixed', () => {
    const setAba = vi.fn()
    const { container } = render(
      <PainelLateral aba="avisos" setAba={setAba} naturezas={naturezasFicticias} />,
    )

    const aside = container.querySelector('aside.painel')
    expect(aside).not.toBeNull()
    expect(aside).toHaveStyle({ position: '' })
    expect(container.querySelector('.painel-abas')).not.toBeNull()
    expect(container.querySelector('.painel-corpo')).not.toBeNull()
  })

  it('renderiza as abas "Sugestões" e "Naturezas" — sem botão de fechar por padrão (painel fixo)', () => {
    const setAba = vi.fn()
    render(<PainelLateral aba="avisos" setAba={setAba} naturezas={naturezasFicticias} />)

    expect(screen.getByRole('button', { name: /sugestões/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /naturezas/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /fechar/i })).toBeNull()
  })

  it('com fechavel=true (overlay da importação) exibe o botão de fechar', () => {
    render(<PainelLateral aba="avisos" setAba={vi.fn()} naturezas={naturezasFicticias} fechavel />)

    expect(screen.getByRole('button', { name: /fechar/i })).toBeInTheDocument()
  })
})

describe('PainelLateral — alternância de abas (TL-14 a TL-18, TL-21)', () => {
  it('aba="avisos" exibe o conteúdo de avisos no painel-corpo', () => {
    avisosMock = [proposta()]
    render(<PainelLateral aba="avisos" setAba={vi.fn()} naturezas={naturezasFicticias} />)

    expect(screen.getByText('Fatura conciliável com pagamento do extrato.')).toBeInTheDocument()
    expect(screen.queryByText('ALM')).toBeNull()
  })

  it('aba="naturezas" exibe a lista de naturezas no painel-corpo', () => {
    render(<PainelLateral aba="naturezas" setAba={vi.fn()} naturezas={naturezasFicticias} />)

    expect(screen.getByText('ALM')).toBeInTheDocument()
    expect(screen.getByText('Alimentação')).toBeInTheDocument()
  })

  it('clicar na aba "Naturezas" chama setAba("naturezas")', () => {
    const setAba = vi.fn()
    render(<PainelLateral aba="avisos" setAba={setAba} naturezas={naturezasFicticias} />)

    screen.getByRole('button', { name: /naturezas/i }).click()
    expect(setAba).toHaveBeenCalledWith('naturezas')
  })

  it('clicar na aba "Sugestões" chama setAba("avisos")', () => {
    const setAba = vi.fn()
    render(<PainelLateral aba="naturezas" setAba={setAba} naturezas={naturezasFicticias} />)

    screen.getByRole('button', { name: /^sugestões/i }).click()
    expect(setAba).toHaveBeenCalledWith('avisos')
  })

  it('clicar no botão de fechar (fechavel=true) chama setAba(null)', () => {
    const setAba = vi.fn()
    render(<PainelLateral aba="avisos" setAba={setAba} naturezas={naturezasFicticias} fechavel />)

    screen.getByRole('button', { name: /fechar/i }).click()
    expect(setAba).toHaveBeenCalledWith(null)
  })

  it('aba ativa recebe a classe "on"', () => {
    render(<PainelLateral aba="naturezas" setAba={vi.fn()} naturezas={naturezasFicticias} />)

    expect(screen.getByRole('button', { name: /naturezas/i })).toHaveClass('on')
    expect(screen.getByRole('button', { name: /^sugestões/i })).not.toHaveClass('on')
  })
})

describe('PainelLateral — badge de propostas pendentes (TL-19, TL-20)', () => {
  it('exibe o badge com a contagem correta de propostas pendentes na aba Avisos', () => {
    avisosMock = [
      proposta({ id: 'prop-a', estado: 'pendente' }),
      proposta({ id: 'prop-b', estado: 'pendente' }),
      proposta({ id: 'prop-c', estado: 'aplicado' }),
    ]
    render(<PainelLateral aba="avisos" setAba={vi.fn()} naturezas={naturezasFicticias} />)

    expect(screen.getByRole('button', { name: /^sugestões/i })).toHaveTextContent('2')
  })

  it('não exibe badge quando não há propostas pendentes', () => {
    avisosMock = []
    render(<PainelLateral aba="avisos" setAba={vi.fn()} naturezas={naturezasFicticias} />)

    const botaoAvisos = screen.getByRole('button', { name: /^sugestões/i })
    expect(botaoAvisos.querySelector('.badge')).toBeNull()
  })
})

describe('PainelLateral — repassa mesRef para CentralDeAvisos (TL-92, Task 7-bis)', () => {
  it('mesRef recebido chega intacto até CentralDeAvisos', () => {
    render(
      <PainelLateral aba="avisos" setAba={vi.fn()} naturezas={naturezasFicticias} mesRef="2026-03" />,
    )

    const [propsRecebidas] = vi.mocked(CentralDeAvisos).mock.calls[0]!
    expect(propsRecebidas).toEqual(expect.objectContaining({ mesRef: '2026-03' }))
  })

  it('sem mesRef fornecido, CentralDeAvisos é chamado sem essa prop (compatibilidade retroativa)', () => {
    render(<PainelLateral aba="avisos" setAba={vi.fn()} naturezas={naturezasFicticias} />)

    const [propsRecebidas] = vi.mocked(CentralDeAvisos).mock.calls[0]!
    expect(propsRecebidas).not.toEqual(expect.objectContaining({ mesRef: expect.anything() }))
  })
})
