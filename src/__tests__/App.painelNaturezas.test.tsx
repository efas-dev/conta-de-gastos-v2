// ADR: see Docs/specs/colinha-naturezas.adr.md

/**
 * Testes de integração e unidade para T5 — integração do PainelNaturezas em App.tsx.
 *
 * Cobre:
 *   [TL-T5-1][integration] lerNaturezas com Modelo.xlsx real retorna exatamente 15
 *                           entradas com descricao não-vazia.
 *   [TL-T5-2][unit] App.tsx renderiza o botão "Colinha" quando naturezasRicas
 *                   filtrado é não-vazio.
 *   [TL-T5-3][unit] App.tsx NÃO renderiza o botão "Colinha" quando naturezasRicas
 *                   está vazio.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { App } from '../App'
import { useAppStore } from '../ui/store/appStore'
import { lerNaturezas } from '../excel/reader/leitor'

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

vi.mock('../ui/components/AvisoList', () => ({
  AvisoList: () => React.createElement('div', { 'data-testid': 'aviso-list' }),
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetarStore(): void {
  useAppStore.setState({
    lancamentos: [],
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
  })
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('T5 — integração PainelNaturezas + App.tsx', () => {
  beforeEach(() => {
    resetarStore()
    vi.clearAllMocks()
  })

  // [TL-T5-1][integration] Modelo.xlsx real
  it('lerNaturezas com Modelo.xlsx real retorna exatamente 15 entradas com descricao não-vazia', () => {
    const caminhoModelo = resolve(__dirname, '../../public/Modelo.xlsx')
    const bytes = new Uint8Array(readFileSync(caminhoModelo))

    const ricas = lerNaturezas(bytes)

    const comDescricao = ricas.filter((n) => n.descricao !== '')
    expect(comDescricao).toHaveLength(15)
  })

  // [TL-T5-2][unit] Botão "Colinha" aparece quando naturezasRicas filtrado é não-vazio
  it('renderiza o botão "Colinha" na barra de ações quando naturezasRicas filtrado é não-vazio', async () => {
    // Pré-popula o store com uma natureza que tem descrição (simula pós-upload do Modelo)
    act(() => {
      useAppStore.setState({
        lancamentos: [
          {
            data: '2026-07-01',
            descricao: 'Teste',
            valor: -100,
            natureza: 'ALM',
            fonte: 'NUBANK_CARTAO',
            iniciais: 'ES',
            nomeArquivo: 'test.csv',
          },
        ],
        naturezasRicas: [
          { sigla: 'ALM', nome: 'Alimentação', descricao: 'Gastos com alimentação' },
        ],
      })
    })

    render(React.createElement(App))

    const botaoColinha = screen.queryByRole('button', { name: /colinha/i })
    expect(botaoColinha).not.toBeNull()
  })

  // [TL-T5-3][unit] Botão "Colinha" ausente quando naturezasRicas é vazio
  it('NÃO renderiza o botão "Colinha" quando naturezasRicas está vazio', async () => {
    // Store com lançamentos mas sem naturezas ricas (lista filtrada vazia)
    act(() => {
      useAppStore.setState({
        lancamentos: [
          {
            data: '2026-07-01',
            descricao: 'Teste',
            valor: -100,
            natureza: 'ALM',
            fonte: 'NUBANK_CARTAO',
            iniciais: 'ES',
            nomeArquivo: 'test.csv',
          },
        ],
        naturezasRicas: [],
      })
    })

    render(React.createElement(App))

    const botaoColinha = screen.queryByRole('button', { name: /colinha/i })
    expect(botaoColinha).toBeNull()
  })
})
