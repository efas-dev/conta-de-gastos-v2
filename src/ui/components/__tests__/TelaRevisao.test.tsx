// ADR: see spec/fundacao-operacoes.adr.md

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { TelaRevisao } from '../TelaRevisao'
import type { Aviso, Lancamento } from '../../../types'
import type { SugestaoReplicacao } from '../../../dominio/replicacao'

// ---------------------------------------------------------------------------
// Task T12-bis (spec fundacao-operacoes) — extração comportamento-preservante
// de App.tsx. Prova isolada de TelaRevisao: mocka o store (mesmo padrão de
// ToolbarRevisao.test.tsx/PainelLateral.test.tsx) e os componentes-filho
// pesados (ReviewGrid/FiltroBar/SplitModal/ExportModal/etc, já testados em
// arquivos próprios), mantendo reais os componentes triviais já cobertos
// isoladamente (SeletorMesReferencia, Icones).
// ---------------------------------------------------------------------------

interface EstadoMock {
  lancamentos: Lancamento[]
  iniciais: string
  dicEntries: unknown[]
  naturezasValidas: string[]
  naturezasRicas: unknown[]
  avisosAcionaveis: { avisos: Aviso[]; removidos: Record<string, unknown>; avisoEmInspecao: string | null }
  sujo: boolean
  /** Sugestão de replicação (item 36) — re-integrada na nova composição via `PopupReplicacao`. */
  sugestaoReplicacao: SugestaoReplicacao | null
}

let estado: EstadoMock

const {
  adicionarAvisos,
  aplicar,
  dispensar,
  sairInspecao,
  undo,
  redo,
  marcarLimpo,
  mockSetState,
  mockHandleGerarPipeline,
  aplicarReplicacao,
  dispensarReplicacao,
} = vi.hoisted(() => ({
  adicionarAvisos: vi.fn(),
  aplicar: vi.fn(),
  dispensar: vi.fn(),
  sairInspecao: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn(),
  marcarLimpo: vi.fn(),
  mockSetState: vi.fn(),
  mockHandleGerarPipeline: vi.fn(),
  aplicarReplicacao: vi.fn(),
  dispensarReplicacao: vi.fn(),
}))

function acoes() {
  return {
    adicionarAvisos,
    aplicar,
    dispensar,
    sairInspecao,
    undo,
    redo,
    marcarLimpo,
    aplicarReplicacao,
    dispensarReplicacao,
  }
}

vi.mock('../../store/appStore', () => {
  const useAppStore = (selector: (s: EstadoMock & ReturnType<typeof acoes>) => unknown) =>
    selector({ ...estado, ...acoes() })
  useAppStore.getState = () => ({ ...estado, ...acoes() })
  useAppStore.setState = mockSetState
  return { useAppStore }
})

vi.mock('../../store/avisosSlice', () => ({
  selecionarContagemPendentes: (s: EstadoMock) =>
    s.avisosAcionaveis.avisos.filter((a) => a.tipo === 'proposta' && a.estado === 'pendente').length,
}))

vi.mock('../../PipelineState', () => ({
  computarNomeArquivo: vi.fn(() => '2024-03-ES.xlsx'),
}))

vi.mock('../../handlersPipeline', () => ({
  handleGerar: (...args: unknown[]) => mockHandleGerarPipeline(...args),
  criarAvisoInformativo: (id: string, origem: string, mensagem: string) => ({
    id,
    tipo: 'informativo',
    origem,
    mensagem,
    alvo: [],
    permanece: [],
    estado: 'pendente',
  }),
}))

vi.mock('../ReviewGrid', () => ({
  ReviewGrid: ({ onSplitDetectado }: { onSplitDetectado?: (i: number) => void }) =>
    React.createElement('div', {
      'data-testid': 'review-grid',
      onClick: () => onSplitDetectado?.(0),
    }),
}))
vi.mock('../SplitModal', () => ({
  SplitModal: ({ indice }: { indice: number }) =>
    React.createElement('div', { 'data-testid': 'split-modal', 'data-indice': indice }),
}))
vi.mock('../ToolbarRevisao', () => ({
  ToolbarRevisao: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'toolbar-revisao' }, children),
}))
vi.mock('../PainelLateral', () => ({
  PainelLateral: ({ aba, mesRef }: { aba: string | null; mesRef?: string }) =>
    React.createElement('div', { 'data-testid': 'painel-lateral', 'data-aba': aba, 'data-mes-ref': mesRef }),
}))
vi.mock('../BannerInspecao', () => ({
  BannerInspecao: ({ aviso }: { aviso: Aviso | null }) =>
    React.createElement('div', { 'data-testid': 'banner-inspecao', 'data-aviso': aviso?.id ?? '' }),
}))
vi.mock('../ExportModal', () => ({
  ExportModal: ({
    fase,
    onConfirmar,
  }: {
    fase: string
    onConfirmar: () => void
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'export-modal', 'data-fase': fase },
      React.createElement('button', { onClick: onConfirmar }, 'confirmar-export'),
    ),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lan(overrides: Partial<Lancamento> = {}): Lancamento {
  return {
    fonte: 'extrato_nubank',
    data: '2024-03-01',
    transcricao: 'Compra',
    valor: -100,
    iniciais: 'ES',
    natureza: 'Alimentação',
    descricao: '',
    ...overrides,
  }
}

function props(overrides: Partial<React.ComponentProps<typeof TelaRevisao>> = {}) {
  return {
    mesEscolhido: '2024-03',
    usuarioEditouMes: false,
    onMudarMes: vi.fn(),
    modeloBytes: new Uint8Array([1, 2, 3]),
    anchorRef: { current: null },
    painel: null,
    setPainel: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  estado = {
    lancamentos: [lan()],
    iniciais: 'ES',
    dicEntries: [],
    naturezasValidas: ['Alimentação'],
    naturezasRicas: [],
    avisosAcionaveis: { avisos: [], removidos: {}, avisoEmInspecao: null },
    sujo: false,
    sugestaoReplicacao: null,
  }
  vi.clearAllMocks()
})

describe('TelaRevisao', () => {
  it('renderiza a composição principal (toolbar, banner de inspeção e grid) — sem linha de filterchips', () => {
    render(<TelaRevisao {...props()} />)

    expect(screen.getByTestId('toolbar-revisao')).toBeInTheDocument()
    expect(screen.getByTestId('banner-inspecao')).toBeInTheDocument()
    expect(screen.getByTestId('review-grid')).toBeInTheDocument()
    // A linha de filterchips foi removida (hotfix 2026-08-02): o filtro por
    // natureza vive nos cartões da colinha do PainelLateral.
    expect(document.querySelector('.filtros')).toBeNull()
  })

  it('botão "Exportar .xlsx" fica desabilitado quando não há lançamentos', () => {
    estado.lancamentos = []
    render(<TelaRevisao {...props()} />)

    expect(screen.getByText('Exportar .xlsx').closest('button')).toBeDisabled()
  })

  it('botão "Exportar .xlsx" fica desabilitado quando modeloBytes é null', () => {
    render(<TelaRevisao {...props({ modeloBytes: null })} />)

    expect(screen.getByText('Exportar .xlsx').closest('button')).toBeDisabled()
  })

  it('clicar em "Exportar .xlsx" abre o ExportModal na fase "confirmar"', () => {
    render(<TelaRevisao {...props()} />)

    fireEvent.click(screen.getByText('Exportar .xlsx').closest('button')!)

    expect(screen.getByTestId('export-modal')).toHaveAttribute('data-fase', 'confirmar')
  })

  it('confirmar a exportação chama handleGerar e avança para a fase "feito"', () => {
    render(<TelaRevisao {...props()} />)

    fireEvent.click(screen.getByText('Exportar .xlsx').closest('button')!)
    fireEvent.click(screen.getByText('confirmar-export'))

    expect(mockHandleGerarPipeline).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('export-modal')).toHaveAttribute('data-fase', 'feito')
  })

  it('PainelLateral é SEMPRE renderizado — painel null abre na aba "avisos" (hotfix 2026-08-02)', () => {
    const { rerender } = render(<TelaRevisao {...props({ painel: null })} />)
    expect(screen.getByTestId('painel-lateral')).toBeInTheDocument()
    expect(screen.getByTestId('painel-lateral').getAttribute('data-aba')).toBe('avisos')

    rerender(<TelaRevisao {...props({ painel: 'naturezas' })} />)
    expect(screen.getByTestId('painel-lateral').getAttribute('data-aba')).toBe('naturezas')
  })

  it('TL-91 (Task 7-bis): repassa mesEscolhido como mesRef para PainelLateral', () => {
    render(<TelaRevisao {...props({ mesEscolhido: '2026-03' })} />)

    expect(screen.getByTestId('painel-lateral').getAttribute('data-mes-ref')).toBe('2026-03')
  })

  it('toolbar não tem mais botões de toggle "Avisos"/"Naturezas" — o painel tem abas próprias', () => {
    render(<TelaRevisao {...props({ painel: null })} />)

    // O PainelLateral está mockado sem botões: qualquer botão Avisos/Naturezas
    // encontrado seria o toggle antigo da toolbar, que não deve mais existir.
    expect(screen.queryByRole('button', { name: /^avisos/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^naturezas/i })).toBeNull()
  })

  it('SplitModal abre quando onSplitDetectado é disparado pela grid', () => {
    render(<TelaRevisao {...props()} />)

    expect(screen.queryByTestId('split-modal')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('review-grid'))

    expect(screen.getByTestId('split-modal')).toHaveAttribute('data-indice', '0')
  })

  it('Ctrl+Z fora de um campo de texto dispara undo()', () => {
    render(<TelaRevisao {...props()} />)

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    expect(undo).toHaveBeenCalledTimes(1)
    expect(redo).not.toHaveBeenCalled()
  })

  it('Ctrl+Shift+Z dispara redo(), não undo()', () => {
    render(<TelaRevisao {...props()} />)

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })

    expect(redo).toHaveBeenCalledTimes(1)
    expect(undo).not.toHaveBeenCalled()
  })

  it('Ctrl+Z com foco num <input> não dispara undo (não sequestra o desfazer nativo)', () => {
    render(
      <>
        <input data-testid="campo-externo" />
        <TelaRevisao {...props()} />
      </>,
    )

    const input = screen.getByTestId('campo-externo')
    input.focus()
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true })

    expect(undo).not.toHaveBeenCalled()
  })

  it('botão "Desfazer" fica desabilitado quando não há lançamentos', () => {
    estado.lancamentos = []
    render(<TelaRevisao {...props()} />)

    expect(screen.getByTitle('Desfazer (Ctrl+Z)')).toBeDisabled()
  })

  it('quando sujo=true, o beforeunload é interceptado (preventDefault chamado)', () => {
    estado.sujo = true
    render(<TelaRevisao {...props()} />)

    const evento = new Event('beforeunload', { cancelable: true })
    const preventDefaultSpy = vi.spyOn(evento, 'preventDefault')
    window.dispatchEvent(evento)

    expect(preventDefaultSpy).toHaveBeenCalled()
  })

  it('quando sujo=false, o beforeunload não é interceptado', () => {
    estado.sujo = false
    render(<TelaRevisao {...props()} />)

    const evento = new Event('beforeunload', { cancelable: true })
    const preventDefaultSpy = vi.spyOn(evento, 'preventDefault')
    window.dispatchEvent(evento)

    expect(preventDefaultSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Re-integração do PopupReplicacao (item 36, dev) na nova composição —
// Task T18-bis (spec fundacao-operacoes): o popup vivia solto em App.tsx
// (monolito) e a extração para TelaRevisao precisa preservar a feature.
// ---------------------------------------------------------------------------

describe('PopupReplicacao na composição de TelaRevisao (item 36)', () => {
  it('não aparece quando não há sugestão de replicação ativa', () => {
    render(<TelaRevisao {...props()} />)

    expect(screen.queryByRole('dialog', { name: 'Sugestão de replicar classificação' })).not.toBeInTheDocument()
  })

  it('aparece com a sugestão quando sugestaoReplicacao está ativa no store', () => {
    estado.sugestaoReplicacao = {
      chave: 'pix recebido joao',
      exemplo: 'PIX RECEBIDO JOÃO',
      natureza: 'RE',
      descricao: 'Reembolso',
      alvos: [1, 2],
    }
    render(<TelaRevisao {...props()} />)

    expect(screen.getByRole('dialog', { name: 'Sugestão de replicar classificação' })).toBeInTheDocument()
    expect(screen.getByText('Aplicar a 2')).toBeInTheDocument()
  })

  it('"Aplicar" chama aplicarReplicacao() do store', () => {
    estado.sugestaoReplicacao = {
      chave: 'pix recebido joao',
      exemplo: 'PIX RECEBIDO JOÃO',
      natureza: 'RE',
      descricao: '',
      alvos: [1],
    }
    render(<TelaRevisao {...props()} />)

    fireEvent.click(screen.getByText('Aplicar a 1'))

    expect(aplicarReplicacao).toHaveBeenCalledTimes(1)
  })

  it('"Dispensar" chama dispensarReplicacao() do store', () => {
    estado.sugestaoReplicacao = {
      chave: 'pix recebido joao',
      exemplo: 'PIX RECEBIDO JOÃO',
      natureza: 'RE',
      descricao: '',
      alvos: [1],
    }
    render(<TelaRevisao {...props()} />)

    fireEvent.click(screen.getByText('Dispensar'))

    expect(dispensarReplicacao).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Task 8 (spec conciliacao-robusta): aviso de desalinhamento de mês passa a
// vir do cross-check `detectarDesalinhamentoMes` (T2) — só aparece quando a
// heurística por data diverge da classificação autoritativa por prefixo (T1).
// ---------------------------------------------------------------------------

describe('Aviso de desalinhamento de mês (Task 8, cross-check T2)', () => {
  it('mês-ref ALINHADO — heurística e prefixo concordam (fatura com data anterior ao mês) → sem aviso', () => {
    estado.lancamentos = [lan({ fonte: 'fatura_nubank_cc', data: '2024-02-15' })]

    render(<TelaRevisao {...props({ mesEscolhido: '2024-03' })} />)

    const chamadasDesalinhamento = adicionarAvisos.mock.calls.filter(([avisos]) =>
      (avisos as Aviso[]).some((a) => a.origem === 'desalinhamento-mes'),
    )
    expect(chamadasDesalinhamento).toHaveLength(0)
  })

  it('mês-ref DESALINHADO (bug motivador F1) — fatura sem data anterior ao mês escolhido → aviso via T2', () => {
    estado.lancamentos = [lan({ fonte: 'fatura_nubank_cc', data: '2024-03-15' })]

    render(<TelaRevisao {...props({ mesEscolhido: '2024-03' })} />)

    const avisosDesalinhamento = adicionarAvisos.mock.calls
      .flatMap(([avisos]) => avisos as Aviso[])
      .filter((a) => a.origem === 'desalinhamento-mes')
    expect(avisosDesalinhamento).toHaveLength(1)
    expect(avisosDesalinhamento[0]).toMatchObject({ tipo: 'informativo' })
  })

  it('fonte com prefixo desconhecido (fora da convenção fatura_*/extrato_*) não derruba o render', () => {
    estado.lancamentos = [lan({ fonte: 'Nubank', data: '2024-03-15' })]

    expect(() => render(<TelaRevisao {...props({ mesEscolhido: '2024-03' })} />)).not.toThrow()

    const avisosDesalinhamento = adicionarAvisos.mock.calls
      .flatMap(([avisos]) => avisos as Aviso[])
      .filter((a) => a.origem === 'desalinhamento-mes')
    expect(avisosDesalinhamento).toHaveLength(0)
  })
})
