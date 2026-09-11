// ADR: see Docs/specs/colinha-naturezas.adr.md

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { PainelNaturezas, somarPorNatureza } from '../PainelNaturezas'
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

describe('PainelNaturezas — lista vazia (TL-01, TL-05, TL-06)', () => {
  it('TL-01: com naturezas vazia, renderiza .painel-vazio em vez de nada (container.firstChild não é null)', () => {
    const { container } = render(<PainelNaturezas naturezas={[]} />)
    expect(container.firstChild).not.toBeNull()
    expect(container.querySelector('.painel-vazio')).not.toBeNull()
  })

  it('TL-05: .painel-vazio traz uma linha do que houve e uma linha do que fazer', () => {
    render(<PainelNaturezas naturezas={[]} />)
    expect(screen.getByText('Nenhuma natureza carregada ainda.')).toBeInTheDocument()
    expect(
      screen.getByText('Importe um extrato ou fatura para ver as naturezas aqui.'),
    ).toBeInTheDocument()
  })

  it('TL-06: com naturezas vazia, não renderiza nenhum cartão .nat-item', () => {
    const { container } = render(<PainelNaturezas naturezas={[]} />)
    expect(container.querySelectorAll('.nat-item')).toHaveLength(0)
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

// ---------------------------------------------------------------------------
// Item 41 do TODO — switch "somar só as minhas iniciais"
//
// Decisões já tomadas: default DESLIGADO; o filtro do cartão sobre a grid NÃO
// acompanha o recorte (o switch muda só a soma exibida).
// ---------------------------------------------------------------------------

/** Lançamento com iniciais explícitas — o `lancamento()` do topo fixa 'ES'. */
function lancamentoDe(natureza: string, valor: number, iniciais: string): Lancamento {
  return { ...lancamento(natureza, valor), iniciais }
}

describe('PainelNaturezas — somarPorNatureza com recorte por iniciais (item 41)', () => {
  it('TLSN-6: com iniciais informadas, soma só os lançamentos daquela pessoa', () => {
    const lancamentos = [
      lancamentoDe('ALM', -100, 'ES'),
      lancamentoDe('ALM', -40, 'RM'),
      lancamentoDe('TRN', -30, 'RM'),
    ]
    expect(somarPorNatureza(lancamentos, 'ES')).toEqual(new Map([['ALM', -100]]))
  })

  it('TLSN-7: a comparação de iniciais ignora caixa e espaços em volta', () => {
    const lancamentos = [lancamentoDe('ALM', -100, ' es '), lancamentoDe('ALM', -40, 'RM')]
    expect(somarPorNatureza(lancamentos, 'Es')).toEqual(new Map([['ALM', -100]]))
  })

  it('TLSN-8: sem iniciais (undefined/vazio), soma tudo — comportamento original', () => {
    const lancamentos = [lancamentoDe('ALM', -100, 'ES'), lancamentoDe('ALM', -40, 'RM')]
    expect(somarPorNatureza(lancamentos)).toEqual(new Map([['ALM', -140]]))
    expect(somarPorNatureza(lancamentos, '')).toEqual(new Map([['ALM', -140]]))
  })
})

describe('PainelNaturezas — switch de iniciais na UI (item 41)', () => {
  const naturezas: NaturezaRica[] = naturezasFicticias

  function ligarSwitch() {
    act(() => {
      screen.getByRole('switch').click()
    })
  }

  beforeEach(() => {
    useAppStore.setState({
      iniciais: 'ES',
      lancamentos: [
        lancamentoDe('ALM', -100, 'ES'),
        lancamentoDe('ALM', -40, 'RM'),
        lancamentoDe('TRN', -30, 'RM'),
      ],
    })
  })

  it('TLSN-9: nasce DESLIGADO e a soma exibida é a geral', () => {
    render(<PainelNaturezas naturezas={naturezas} />)

    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('-R$ 140,00')).toBeInTheDocument()
    expect(screen.getByText('-R$ 30,00')).toBeInTheDocument()
  })

  it('TLSN-10: ligado, soma só os lançamentos das iniciais da sessão', () => {
    render(<PainelNaturezas naturezas={naturezas} />)
    ligarSwitch()

    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('-R$ 100,00')).toBeInTheDocument()
    expect(screen.queryByText('-R$ 140,00')).toBeNull()
  })

  it('TLSN-11: ligado, natureza só com lançamentos de outra pessoa OMITE o número', () => {
    const { container } = render(<PainelNaturezas naturezas={naturezas} />)
    ligarSwitch()

    // TRN só tem lançamento de 'RM' — some o número, não vira "R$ 0,00"
    expect(container.querySelectorAll('.nat-soma')).toHaveLength(1)
    expect(screen.queryByText(/R\$\s*0,00/)).toBeNull()
  })

  it('TLSN-12: o switch tem rótulo acessível', () => {
    render(<PainelNaturezas naturezas={naturezas} />)

    expect(screen.getByRole('switch', { name: /iniciais/i })).toBeInTheDocument()
  })

  it('TLSN-13: com o switch ligado, o cartão continua filtrando a grid pela natureza INTEIRA', () => {
    render(<PainelNaturezas naturezas={naturezas} />)
    ligarSwitch()

    act(() => {
      ;(screen.getByText('ALM').closest('button') as HTMLElement).click()
    })

    expect(useAppStore.getState().filtroNaturezas).toEqual(['ALM'])
    // A visão da grid traz as DUAS linhas de ALM, inclusive a de 'RM'
    const visiveis = useAppStore.getState().lancamentosVisiveis
    expect(visiveis).toHaveLength(2)
    expect(visiveis.map((l) => l.iniciais).sort()).toEqual(['ES', 'RM'])
  })

  it('TLSN-14: sem iniciais na sessão não há recorte possível — o switch não aparece', () => {
    useAppStore.setState({ iniciais: '' })
    render(<PainelNaturezas naturezas={naturezas} />)

    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.getByText('-R$ 140,00')).toBeInTheDocument()
  })
})
