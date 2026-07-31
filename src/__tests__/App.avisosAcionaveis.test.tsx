// ADR: see Docs/specs/avisos-acionaveis.adr.md

/**
 * Testes de integração para T6 — CentralDeAvisos conectada ao slice em App.tsx,
 * convivência com o canal legado `avisos: string[]` (AvisoList.tsx).
 *
 * Cobre:
 *   [integration] CentralDeAvisos + AvisoList legado coexistem no DOM
 *   [integration] ciclo completo via store real: aviso aparece → aplicar → some dos pendentes
 *   [integration] handleProduzir liga o callback adicionarAvisos real ao pipeline (6º argumento)
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
}))

vi.mock('../dominio/mes', async (importOriginal) => {
  const original = await importOriginal<typeof import('../dominio/mes')>()
  return {
    ...original,
    detectarMesSugerido: vi.fn(() => null),
  }
})

import { produzirLancamentos } from '../ui/PipelineState'

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
  estado: 'pendente',
}

beforeEach(() => {
  resetarStore()
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Coexistência CentralDeAvisos + AvisoList legado
// ---------------------------------------------------------------------------

describe('App — CentralDeAvisos coexiste com AvisoList legado (T6)', () => {
  it('renderiza CentralDeAvisos (proposta) e AvisoList legado (string[]) simultaneamente', () => {
    act(() => {
      useAppStore.setState({
        // Mensagem sem o prefixo '[fatura-aviso]' — não é removida pelo useEffect
        // de recálculo do aviso de fatura (App.tsx), que só filtra por esse prefixo.
        avisos: ['1 linha ignorada no CSV'],
        avisosAcionaveis: { avisos: [propostaFicticia], removidos: {} },
      })
    })

    render(<App />)

    // Canal legado (AvisoList) — role="alert"
    expect(screen.getByRole('alert')).toHaveTextContent('1 linha ignorada no CSV')

    // Canal novo (CentralDeAvisos) — sheet colapsado por padrão (D15); abre
    // manualmente antes de checar a mensagem da proposta.
    fireEvent.click(screen.getByRole('button', { name: /abrir central de avisos/i }))
    expect(screen.getByText('Fatura conciliável com pagamento do extrato.')).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: /abrir central de avisos/i }))

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
