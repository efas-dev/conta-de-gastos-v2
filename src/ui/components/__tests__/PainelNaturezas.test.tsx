// ADR: see Docs/specs/colinha-naturezas.adr.md

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { PainelNaturezas } from '../PainelNaturezas'
import { useAppStore } from '../../store/appStore'
import type { Lancamento, NaturezaRica } from '../../../types'

const naturezasFicticias: NaturezaRica[] = [
  { sigla: 'ALM', nome: 'Alimentação', descricao: 'Gastos com comida e restaurantes' },
  { sigla: 'TRN', nome: 'Transporte', descricao: 'Ônibus, metrô, táxi e afins' },
  { sigla: 'EDU', nome: 'Educação', descricao: 'Cursos, livros e mensalidades' },
]

let proximoId = 1
function lancamento(natureza: string, valor: number): Lancamento {
  return {
    id: proximoId++,
    fonte: 'extrato_nubank',
    data: '2026-06-05',
    transcricao: 'Teste',
    valor,
    iniciais: 'ES',
    natureza,
    descricao: 'x',
  }
}

beforeEach(() => {
  proximoId = 1
  useAppStore.setState({ lancamentos: [], filtroNaturezas: [] })
})

describe('PainelNaturezas — lista vazia (TL-01)', () => {
  it('com naturezas vazia, o componente renderiza null (sem toggle, sem aside)', () => {
    const { container } = render(<PainelNaturezas naturezas={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('PainelNaturezas — conteúdo puro (TL-02, TL-03)', () => {
  it('com naturezas não-vazia, renderiza os itens diretamente (cartões clicáveis de filtro)', () => {
    render(<PainelNaturezas naturezas={naturezasFicticias} />)
    // Os cartões são botões de filtro (ajuste 2026-08-02); não há botão de toggle do painel
    expect(screen.getAllByRole('button')).toHaveLength(3)
    expect(screen.getByText('ALM')).toBeInTheDocument()
  })

  it('renderiza sigla, nome e descrição de cada entrada, na ordem recebida', () => {
    render(<PainelNaturezas naturezas={naturezasFicticias} />)

    const siglas = screen.getAllByText(/^(ALM|TRN|EDU)$/)
    expect(siglas[0]).toHaveTextContent('ALM')
    expect(siglas[1]).toHaveTextContent('TRN')
    expect(siglas[2]).toHaveTextContent('EDU')

    expect(screen.getByText('Alimentação')).toBeInTheDocument()
    expect(screen.getByText('Transporte')).toBeInTheDocument()
    expect(screen.getByText('Educação')).toBeInTheDocument()

    expect(screen.getByText('Gastos com comida e restaurantes')).toBeInTheDocument()
    expect(screen.getByText('Ônibus, metrô, táxi e afins')).toBeInTheDocument()
    expect(screen.getByText('Cursos, livros e mensalidades')).toBeInTheDocument()
  })
})

describe('PainelNaturezas — classes do design system (TL-04)', () => {
  it('cada entrada usa a classe .nat-item e a sigla usa .nat-sigla', () => {
    const { container } = render(<PainelNaturezas naturezas={naturezasFicticias} />)
    expect(container.querySelectorAll('.nat-item')).toHaveLength(3)
    expect(container.querySelectorAll('.nat-sigla')).toHaveLength(3)
  })
})

describe('PainelNaturezas — compatibilidade de assinatura com App.tsx (T11 pendente)', () => {
  it('aceita onClose opcional sem quebrar a renderização (call site antigo em App.tsx)', () => {
    render(<PainelNaturezas naturezas={naturezasFicticias} onClose={() => {}} />)
    expect(screen.getByText('ALM')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Somatória por natureza nos cartões (ajuste 2026-08-02)
// ---------------------------------------------------------------------------

describe('PainelNaturezas — somatória por natureza', () => {
  const naturezasComRR: NaturezaRica[] = [
    { sigla: 'RR', nome: 'Residentes', descricao: 'Receitas e despesas do trabalho' },
    ...naturezasFicticias,
  ]

  it('TLSN-1: cartão exibe a soma dos lançamentos rotulados com a natureza', () => {
    useAppStore.setState({
      lancamentos: [lancamento('ALM', -45.9), lancamento('ALM', -120), lancamento('TRN', -30)],
    })
    render(<PainelNaturezas naturezas={naturezasComRR} />)

    expect(screen.getByText('-R$ 165,90')).toBeInTheDocument()
    expect(screen.getByText('-R$ 30,00')).toBeInTheDocument()
  })

  it('TLSN-2: natureza sem lançamento correspondente OMITE o número (não mostra 0)', () => {
    useAppStore.setState({ lancamentos: [lancamento('ALM', -45.9)] })
    const { container } = render(<PainelNaturezas naturezas={naturezasComRR} />)

    // Só o cartão de ALM tem valor — nenhum "R$ 0,00" em lugar algum
    expect(container.querySelectorAll('.nat-soma')).toHaveLength(1)
    expect(screen.queryByText(/R\$\s*0,00/)).toBeNull()
  })

  it('TLSN-3: RR vem primeiro mesmo sem lançamentos; demais por |soma| decrescente', () => {
    useAppStore.setState({
      lancamentos: [
        lancamento('ALM', -50),
        lancamento('TRN', -300),
        lancamento('EDU', 100),
      ],
    })
    const { container } = render(<PainelNaturezas naturezas={naturezasComRR} />)

    const siglas = [...container.querySelectorAll('.nat-sigla')].map((e) => e.textContent)
    // RR primeiro (sem soma); depois TRN (|−300|), EDU (|100|), ALM (|−50|)
    expect(siglas).toEqual(['RR', 'TRN', 'EDU', 'ALM'])
  })

  it('TLSN-4: soma atualiza automaticamente quando um lançamento muda no store', () => {
    useAppStore.setState({ lancamentos: [lancamento('ALM', -45.9)] })
    render(<PainelNaturezas naturezas={naturezasComRR} />)
    expect(screen.getByText('-R$ 45,90')).toBeInTheDocument()

    act(() => {
      useAppStore.setState({
        lancamentos: [lancamento('ALM', -45.9), lancamento('ALM', -4.1)],
      })
    })

    expect(screen.getByText('-R$ 50,00')).toBeInTheDocument()
    expect(screen.queryByText('-R$ 45,90')).toBeNull()
  })

  it('TLSN-5: sem nenhum lançamento, mantém a ordem recebida e nenhum cartão tem número', () => {
    const { container } = render(<PainelNaturezas naturezas={naturezasComRR} />)

    const siglas = [...container.querySelectorAll('.nat-sigla')].map((e) => e.textContent)
    expect(siglas).toEqual(['RR', 'ALM', 'TRN', 'EDU'])
    expect(container.querySelectorAll('.nat-soma')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Clique no cartão filtra a grid por natureza (ajuste 2026-08-02)
// ---------------------------------------------------------------------------

describe('PainelNaturezas — cartão como filtro de natureza', () => {
  function cartao(sigla: string): HTMLElement {
    return screen.getByText(sigla).closest('button') as HTMLElement
  }

  it('TLFN-1: clique simples num cartão filtra pela natureza dele', () => {
    render(<PainelNaturezas naturezas={naturezasFicticias} />)

    act(() => {
      cartao('ALM').click()
    })

    expect(useAppStore.getState().filtroNaturezas).toEqual(['ALM'])
  })

  it('TLFN-2: ctrl/cmd+clique acumula naturezas na seleção', () => {
    useAppStore.setState({ filtroNaturezas: ['ALM'] })
    render(<PainelNaturezas naturezas={naturezasFicticias} />)

    act(() => {
      cartao('TRN').dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true }))
    })

    expect(useAppStore.getState().filtroNaturezas).toEqual(['ALM', 'TRN'])
  })

  it('TLFN-3: clique simples em outro cartão troca a seleção (deseleciona o anterior)', () => {
    useAppStore.setState({ filtroNaturezas: ['ALM'] })
    render(<PainelNaturezas naturezas={naturezasFicticias} />)

    act(() => {
      cartao('TRN').click()
    })

    expect(useAppStore.getState().filtroNaturezas).toEqual(['TRN'])
  })

  it('TLFN-4: clique simples no único cartão ativo desliga o filtro', () => {
    useAppStore.setState({ filtroNaturezas: ['ALM'] })
    render(<PainelNaturezas naturezas={naturezasFicticias} />)

    act(() => {
      cartao('ALM').click()
    })

    expect(useAppStore.getState().filtroNaturezas).toEqual([])
  })

  it('TLFN-5: cartão com filtro ativo é marcado (aria-pressed)', () => {
    useAppStore.setState({ filtroNaturezas: ['TRN'] })
    render(<PainelNaturezas naturezas={naturezasFicticias} />)

    expect(cartao('TRN').getAttribute('aria-pressed')).toBe('true')
    expect(cartao('ALM').getAttribute('aria-pressed')).toBe('false')
  })
})
