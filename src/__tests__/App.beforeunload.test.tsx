// ADR: see Docs/specs/grid-revisao.adr.md

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, screen } from '@testing-library/react'
import React from 'react'
import { App } from '../App'
import { useAppStore } from '../ui/store/appStore'
import type { Lancamento } from '../types'

// ---------------------------------------------------------------------------
// Mocks de componentes com dependências pesadas (Glide não funciona em jsdom)
// ---------------------------------------------------------------------------

vi.mock('../ui/components/ReviewGrid', () => ({
  ReviewGrid: () => React.createElement('div', { 'data-testid': 'review-grid' }),
  TEMA_ERRO: { bgCell: '#f9e2d6' },
  TEMA_TRANSFERENCIA: { bgCell: '#d5e4f2' },
  TEMA_INVESTIMENTO: { bgCell: '#dcedd3' },
  calcularTemaLinha: vi.fn(),
  calcularSomaSelecionados: vi.fn(() => null),
}))

vi.mock('../ui/components/SplitModal', () => ({
  SplitModal: () => React.createElement('div', { 'data-testid': 'split-modal' }),
}))

vi.mock('../ui/components/AvisoList', () => ({
  AvisoList: () => React.createElement('div', { 'data-testid': 'aviso-list' }),
}))

vi.mock('../ui/PipelineState', () => ({
  produzirLancamentos: vi.fn(() => ({ lancamentos: [], dicEntries: [], avisos: [] })),
  gerarAPartirDosRevisados: vi.fn(() => new Uint8Array([1, 2, 3])),
  computarNomeArquivo: vi.fn(() => 'extrato.xlsx'),
}))

vi.mock('../excel/reader/leitor', () => ({
  lerNaturezas: vi.fn(() => []),
}))

// ---------------------------------------------------------------------------
// Fixture de lançamento
// ---------------------------------------------------------------------------

function lancamentoFixture(parcial: Partial<Lancamento> = {}): Lancamento {
  return {
    fonte: 'Nubank',
    data: '2025-03-15',
    transcricao: 'Mercado',
    valor: -150,
    iniciais: 'ES',
    natureza: 'Alimentação',
    descricao: 'Supermercado',
    transferenciaInterna: false,
    investimento: null,
    ...parcial,
  }
}

// ---------------------------------------------------------------------------
// Reset de store entre testes
// ---------------------------------------------------------------------------

function resetarStore(): void {
  useAppStore.setState({
    lancamentos: [],
    iniciais: 'ES',
    nomeUsuario: '',
    naturezasValidas: [],
    dicEntries: [],
    avisos: [],
    historico: [],
    futuro: [],
    csvArquivo: null,
    sujo: false,
  })
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('App — beforeunload listener', () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetarStore()
    addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
  })

  afterEach(() => {
    addEventListenerSpy.mockRestore()
    removeEventListenerSpy.mockRestore()
  })

  it('com sujo=true, registra listener beforeunload em window.addEventListener', () => {
    // Setar sujo=true e lancamentos para acionar emRevisao
    act(() => {
      useAppStore.setState({
        sujo: true,
        lancamentos: [lancamentoFixture()],
      })
    })

    render(<App />)

    const chamadas = addEventListenerSpy.mock.calls.filter(
      ([evento]) => evento === 'beforeunload',
    )
    expect(chamadas).toHaveLength(1)
  })

  it('com sujo=true, o handler registrado chama event.preventDefault()', () => {
    act(() => {
      useAppStore.setState({
        sujo: true,
        lancamentos: [lancamentoFixture()],
      })
    })

    render(<App />)

    // Captura o callback passado ao addEventListener('beforeunload', ...)
    const chamadaBeforeunload = addEventListenerSpy.mock.calls.find(
      ([evento]) => evento === 'beforeunload',
    )
    expect(chamadaBeforeunload).toBeDefined()

    const handler = chamadaBeforeunload![1] as EventListener
    const eventoMock = { preventDefault: vi.fn() } as unknown as Event
    handler(eventoMock)

    expect(eventoMock.preventDefault).toHaveBeenCalledOnce()
  })

  it('com sujo=false, NÃO registra listener beforeunload', () => {
    act(() => {
      useAppStore.setState({
        sujo: false,
        lancamentos: [lancamentoFixture()],
      })
    })

    render(<App />)

    const chamadas = addEventListenerSpy.mock.calls.filter(
      ([evento]) => evento === 'beforeunload',
    )
    expect(chamadas).toHaveLength(0)
  })

  it('ao mudar sujo de true para false, removeEventListener remove o listener beforeunload', () => {
    act(() => {
      useAppStore.setState({
        sujo: true,
        lancamentos: [lancamentoFixture()],
      })
    })

    render(<App />)

    // Muda sujo para false — deve disparar cleanup e re-execução do useEffect
    act(() => {
      useAppStore.getState().marcarLimpo()
    })

    const chamadasRemove = removeEventListenerSpy.mock.calls.filter(
      ([evento]) => evento === 'beforeunload',
    )
    expect(chamadasRemove).toHaveLength(1)
  })

  it('ao desmontar com sujo=true, removeEventListener é chamado (cleanup)', () => {
    act(() => {
      useAppStore.setState({
        sujo: true,
        lancamentos: [lancamentoFixture()],
      })
    })

    const { unmount } = render(<App />)

    removeEventListenerSpy.mockClear()
    unmount()

    const chamadasRemove = removeEventListenerSpy.mock.calls.filter(
      ([evento]) => evento === 'beforeunload',
    )
    expect(chamadasRemove).toHaveLength(1)
  })
})

describe('App — aviso textual na barra de revisão', () => {
  beforeEach(() => {
    resetarStore()
  })

  it('exibe texto de aviso "Os dados vivem apenas nesta aba" quando há lançamentos', () => {
    act(() => {
      useAppStore.setState({
        lancamentos: [lancamentoFixture()],
        sujo: true,
      })
    })

    render(<App />)

    expect(
      screen.getByText(/Os dados vivem apenas nesta aba — exporte antes de fechar ou recarregar/),
    ).toBeInTheDocument()
  })

  it('não exibe texto de aviso na etapa de upload (sem lançamentos)', () => {
    // Estado inicial sem lançamentos
    render(<App />)

    expect(
      screen.queryByText(/Os dados vivem apenas nesta aba/),
    ).not.toBeInTheDocument()
  })
})
