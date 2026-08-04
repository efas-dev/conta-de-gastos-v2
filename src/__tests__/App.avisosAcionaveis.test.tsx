// ADR: see Docs/specs/avisos-acionaveis.adr.md
// ADR: see spec/inspecao-proposta-conciliacao.adr.md

/**
 * Testes de integração para T6 (CentralDeAvisos conectada ao slice em App.tsx) e
 * T9 (canal único de avisos — D18 do ADR `inspecao-proposta-conciliacao`).
 *
 * Cobre:
 *   [integration] ciclo completo via store real: aviso aparece → aplicar → some dos pendentes
 *   [integration] handleProduzir liga o callback adicionarAvisos real ao pipeline (6º argumento)
 *   [integration] CentralDeAvisos (sheet) renderizado também na tela de importação (T9)
 *   [integration] footer AvisoList aposentado — ausente das duas telas (T9)
 *   [integration] os 5 avisos legados migram para o slice como informativos dispensáveis (T9)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import React from 'react'
import { App } from '../App'
import { useAppStore } from '../ui/store/appStore'
import type { Aviso } from '../types'

// ---------------------------------------------------------------------------
// Mocks de componentes pesados (mesmo padrão de App.dicionarioUnificado.test.tsx)
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

vi.mock('../ui/PipelineState', () => ({
  produzirLancamentos: vi.fn(() => ({ lancamentos: [], dicEntries: [], avisos: [] })),
  gerarAPartirDosRevisados: vi.fn(() => new Uint8Array([1, 2, 3])),
  computarNomeArquivo: vi.fn(() => 'extrato.xlsx'),
  // Task T14 (cutover): handlersPipeline.handleProduzir agora importa reproduzirAvisos
  // de PipelineState — mock no-op preserva o comportamento anterior destes testes (que
  // exercitam o canal avisosAcionaveis via o 6º argumento de produzirLancamentos, não
  // via reproduzirAvisos/registry).
  reproduzirAvisos: vi.fn(),
}))

// Mock do leitor — controla ehDicionario/lerDicionario/lerIniciais nos testes de
// migração dos avisos legados (dic-ultimo-vence, xlsx-nao-reconhecido, T9).
vi.mock('../excel/reader/leitor', () => ({
  lerNaturezas: vi.fn(() => []),
  lerDicionario: vi.fn(() => []),
  ehDicionario: vi.fn(async () => false),
  lerIniciais: vi.fn(async () => null),
}))

vi.mock('../dominio/mes', async (importOriginal) => {
  const original = await importOriginal<typeof import('../dominio/mes')>()
  return {
    ...original,
    detectarMesSugerido: vi.fn(() => null),
  }
})

import { produzirLancamentos } from '../ui/PipelineState'
import { ehDicionario, lerDicionario } from '../excel/reader/leitor'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetarStore(): void {
  useAppStore.setState({
    // Dois lançamentos: propostaFicticia.alvo=['0'] remove só o primeiro ao
    // aplicar — o segundo mantém emRevisao=true (evita a tela voltar para
    // upload quando o único lançamento é removido pelo aplicar da proposta).
    lancamentos: [
      {
        fonte: 'Nubank',
        data: '2026-06-15',
        transcricao: 'Mercado',
        valor: -50,
        iniciais: 'ES',
        natureza: 'ALM',
        descricao: 'Supermercado',
      },
      {
        fonte: 'Nubank',
        data: '2026-06-16',
        transcricao: 'Farmácia',
        valor: -30,
        iniciais: 'ES',
        natureza: 'SAU',
        descricao: 'Remédio',
      },
    ],
    iniciais: 'ES',
    nomeUsuario: '',
    naturezasValidas: [],
    naturezasRicas: [],
    dicEntries: [],
    avisos: [],
    historico: [],
    futuro: [],
    csvArquivo: null,
    sujo: false,
    avisosAcionaveis: { avisos: [], removidos: {} },
  })
}

function criarFile(nome: string, conteudo: string, tipo = 'text/csv'): File {
  const bytes = new TextEncoder().encode(conteudo)
  const file = new File([bytes], nome, { type: tipo })
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(bytes.buffer),
    writable: true,
  })
  Object.defineProperty(file, 'text', {
    value: () => Promise.resolve(conteudo),
    writable: true,
  })
  return file
}

const propostaFicticia: Aviso = {
  id: 'prop-conciliacao-1',
  tipo: 'proposta',
  origem: 'conciliacao',
  mensagem: 'Fatura conciliável com pagamento do extrato.',
  alvo: ['0'],
  permanece: [],
  estado: 'pendente',
}

beforeEach(() => {
  resetarStore()
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Canal único (T9, D18): sheet nas 2 telas, footer aposentado
// ---------------------------------------------------------------------------

describe('App — canal único de avisos: sheet nas 2 telas, footer aposentado (T9, D18)', () => {
  it('CentralDeAvisos (sheet) é renderizado também na tela de importação (Etapa 1)', () => {
    useAppStore.setState({
      lancamentos: [], // emRevisao=false → tela de importação
      avisosAcionaveis: { avisos: [propostaFicticia], removidos: {} },
    })

    render(<App />)

    expect(screen.getByTestId('tela-importacao')).toBeInTheDocument()
    // Sheet colapsado por padrão (D15) — o botão de abrir prova a presença do
    // componente CentralDeAvisos nesta tela.
    expect(screen.getByRole('button', { name: /^avisos/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^avisos/i }))
    expect(screen.getByText('Fatura conciliável com pagamento do extrato.')).toBeInTheDocument()
  })

  it('footer AvisoList não existe mais em nenhuma das duas telas', () => {
    // Tela de importação (emRevisao=false)
    useAppStore.setState({
      lancamentos: [],
      avisos: ['1 linha ignorada no CSV'],
    })
    const { unmount } = render(<App />)
    expect(screen.queryByRole('alert')).toBeNull()
    unmount()

    // Tela de revisão (emRevisao=true)
    resetarStore()
    useAppStore.setState({ avisos: ['1 linha ignorada no CSV'] })
    render(<App />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Migração dos 5 avisos legados para o slice como informativos dispensáveis (T9)
// ---------------------------------------------------------------------------

describe('App — avisos legados migram para o slice como informativos dispensáveis (T9, D18)', () => {
  beforeEach(() => {
    useAppStore.setState({ lancamentos: [] })
  })

  it('aviso "reconhecido-como-fatura" aparece no slice como informativo e é dispensável, sem duplicar em re-renders', async () => {
    // Data bem no passado — sempre "fatura" frente a qualquer mesEscolhido default.
    const lancamentos = [
      {
        fonte: 'Nubank',
        data: '2020-01-15',
        transcricao: 'Item de fatura',
        valor: -10,
        iniciais: '',
        natureza: '',
        descricao: '',
      },
    ]
    useAppStore.setState({ lancamentos })

    const { rerender } = render(<App />)

    await waitFor(() => {
      const informativos = useAppStore
        .getState()
        .avisosAcionaveis.avisos.filter((a) => a.origem === 'fatura-aviso')
      expect(informativos).toHaveLength(1)
    })
    expect(useAppStore.getState().avisosAcionaveis.avisos[0]).toMatchObject({
      tipo: 'informativo',
      estado: 'pendente',
    })

    // Re-render (efeito roda de novo) não duplica o aviso.
    rerender(<App />)
    await waitFor(() => {
      const informativos = useAppStore
        .getState()
        .avisosAcionaveis.avisos.filter((a) => a.origem === 'fatura-aviso')
      expect(informativos).toHaveLength(1)
    })

    // Dispensar via UI — sheet ainda na tela de revisão (emRevisao=true por padrão do resetarStore).
    fireEvent.click(screen.getByRole('button', { name: /^avisos/i }))
    const idAviso = useAppStore.getState().avisosAcionaveis.avisos[0].id
    fireEvent.click(screen.getByRole('button', { name: /dispensar/i }))

    await waitFor(() => {
      const aviso = useAppStore.getState().avisosAcionaveis.avisos.find((a) => a.id === idAviso)
      expect(aviso?.estado).toBe('dispensado')
    })

    // Re-render de novo (mais uma passada do efeito) não recria o aviso dispensado (D18).
    rerender(<App />)
    await waitFor(() => {
      const informativos = useAppStore
        .getState()
        .avisosAcionaveis.avisos.filter((a) => a.origem === 'fatura-aviso')
      expect(informativos).toHaveLength(1)
      expect(informativos[0].estado).toBe('dispensado')
    })
  })

  it('aviso "dicionário substituído — último vence" aparece no slice como informativo dispensável', async () => {
    vi.mocked(ehDicionario).mockResolvedValue(true as never)
    vi.mocked(lerDicionario).mockReturnValue([] as never)

    // Simula dicionário já carregado no store antes do novo upload.
    useAppStore.setState({
      dicEntries: [{ chave: 'x', fonte: 'Nubank', natureza: 'ALM', descricao: '', iniciais: 'ES', vezes: 1, ambiguo: false }],
    })

    render(<App />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const arquivoXlsx = criarFile(
      'dicionario2.xlsx',
      new Uint8Array([0x50, 0x4b]),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )

    await act(async () => {
      fireEvent.change(input, { target: { files: [arquivoXlsx] } })
    })

    await waitFor(() => {
      const informativo = useAppStore
        .getState()
        .avisosAcionaveis.avisos.find((a) => a.origem === 'dic-ultimo-vence')
      expect(informativo).toBeDefined()
      expect(informativo).toMatchObject({ tipo: 'informativo', estado: 'pendente' })
    })
  })

  it('aviso "xlsx não reconhecido" aparece no slice como informativo dispensável', async () => {
    vi.mocked(ehDicionario).mockResolvedValue(false as never)

    render(<App />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const arquivoXlsx = criarFile(
      'planilha.xlsx',
      new Uint8Array([0x50, 0x4b]),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )

    await act(async () => {
      fireEvent.change(input, { target: { files: [arquivoXlsx] } })
    })

    await waitFor(() => {
      const informativo = useAppStore
        .getState()
        .avisosAcionaveis.avisos.find((a) => a.origem === 'xlsx-nao-reconhecido')
      expect(informativo).toBeDefined()
      expect(informativo).toMatchObject({ tipo: 'informativo', estado: 'pendente' })
    })
  })

  it('aviso "erro ao carregar Modelo.xlsx" aparece no slice como informativo dispensável', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('rede indisponível')
    }))

    useAppStore.setState({
      lancamentos: [],
      iniciais: 'ES',
    })
    render(<App />)

    // Precisa de ao menos um CSV selecionado para o botão "Produzir revisão" habilitar.
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const arquivoCsv = criarFile('extrato.csv', 'DATA;DESCRICAO;VALOR')
    await act(async () => {
      fireEvent.change(input, { target: { files: [arquivoCsv] } })
    })

    const botao = screen.getByText('Produzir revisão')
    await act(async () => {
      fireEvent.click(botao)
    })

    await waitFor(() => {
      const informativo = useAppStore
        .getState()
        .avisosAcionaveis.avisos.find((a) => a.origem === 'erro-modelo-xlsx')
      expect(informativo).toBeDefined()
      expect(informativo).toMatchObject({ tipo: 'informativo', estado: 'pendente' })
    })

    vi.unstubAllGlobals()
  })
})

// ---------------------------------------------------------------------------
// Ciclo completo via store real
// ---------------------------------------------------------------------------

describe('App — ciclo completo aviso → aplicar via store real (T6)', () => {
  it('aviso proposta pendente aparece, aplicar remove da lista de pendentes', async () => {
    act(() => {
      useAppStore.setState({
        avisosAcionaveis: { avisos: [propostaFicticia], removidos: {} },
      })
    })

    render(<App />)

    // Sheet colapsado por padrão (D15) — abre manualmente antes de agir sobre
    // a proposta.
    fireEvent.click(screen.getByRole('button', { name: /^avisos/i }))

    // Escopo restrito à seção "Propostas" — o topo da tela de revisão já tem
    // botões "Desfazer"/"Refazer" de undo/redo do grid, com o mesmo nome acessível.
    const secaoPropostas = screen.getByRole('region', { name: 'Propostas' })
    expect(within(secaoPropostas).getByRole('button', { name: /aprovar/i })).toBeInTheDocument()

    fireEvent.click(within(secaoPropostas).getByRole('button', { name: /aprovar/i }))

    await waitFor(() => {
      expect(useAppStore.getState().avisosAcionaveis.avisos[0].estado).toBe('aplicado')
    })
    // Não há mais botão "Aprovar" pendente para esse aviso — vira "Desfazer"
    expect(within(secaoPropostas).queryByRole('button', { name: /aprovar/i })).toBeNull()
    expect(within(secaoPropostas).getByRole('button', { name: /desfazer/i })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Wiring do callback adicionarAvisos real no call-site de handleProduzir
// ---------------------------------------------------------------------------

describe('App — handleProduzir liga adicionarAvisos real ao pipeline (T6)', () => {
  beforeEach(() => {
    // emRevisao precisa ser false para o input de upload ficar visível — zera lancamentos.
    useAppStore.setState({ lancamentos: [] })
    vi.stubGlobal('fetch', vi.fn(async () => ({ arrayBuffer: async () => new Uint8Array([0]).buffer })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('produzirLancamentos recebe uma função como 6º argumento (adicionarAvisos)', async () => {
    render(<App />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const arquivoCsv = criarFile('extrato.csv', 'DATA;DESCRICAO;VALOR')

    await act(async () => {
      fireEvent.change(input, { target: { files: [arquivoCsv] } })
    })

    const botao = screen.getByText('Produzir revisão')
    await act(async () => {
      fireEvent.click(botao)
    })

    await waitFor(() => {
      expect(produzirLancamentos).toHaveBeenCalled()
    })

    const args = vi.mocked(produzirLancamentos).mock.calls[0]
    expect(typeof args[5]).toBe('function')
  })

  it('avisos emitidos pelo callback injetado populam avisosAcionaveis.avisos do store real', async () => {
    vi.mocked(produzirLancamentos).mockImplementation(
      (_csv, _dic, _iniciais, _nome, _extrato, adicionarAvisos) => {
        adicionarAvisos?.([propostaFicticia])
        return { lancamentos: [], dicEntries: [], avisos: [] }
      },
    )

    render(<App />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const arquivoCsv = criarFile('extrato.csv', 'DATA;DESCRICAO;VALOR')

    await act(async () => {
      fireEvent.change(input, { target: { files: [arquivoCsv] } })
    })

    const botao = screen.getByText('Produzir revisão')
    await act(async () => {
      fireEvent.click(botao)
    })

    await waitFor(() => {
      expect(useAppStore.getState().avisosAcionaveis.avisos).toHaveLength(1)
    })
    expect(useAppStore.getState().avisosAcionaveis.avisos[0].id).toBe('prop-conciliacao-1')
  })
})
