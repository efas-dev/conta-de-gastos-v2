// ADR: see Docs/specs/colinha-naturezas.adr.md
// ADR: see Docs/specs/redesign-frontend-claude-design.adr.md

/**
 * Testes de integração para T5 (colinha-naturezas) — integração do PainelNaturezas
 * em App.tsx — e reconciliados na Task T11 (redesign-frontend-claude-design) para a
 * nova estrutura de componentes: o botão "Naturezas" (antes "Colinha") vive na barra
 * de ações da tela de revisão e abre a aba "naturezas" do `PainelLateral` (T5/T11).
 *
 * Cobre:
 *   [TL-T5-1][integration] lerNaturezas com Modelo.xlsx real retorna exatamente 15
 *                           entradas com descricao não-vazia.
 *   [TL-T5-2][unit] App.tsx renderiza o botão "Naturezas" quando naturezasRicas
 *                   filtrado é não-vazio.
 *   [TL-T5-3][unit] App.tsx NÃO renderiza o botão "Naturezas" quando naturezasRicas
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
import { estadoInicialAvisos } from '../ui/store/avisosSlice'

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
    sujo: false,
    avisosAcionaveis: estadoInicialAvisos,
  })
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('T5/T11 — integração PainelNaturezas + App.tsx (botão "Naturezas")', () => {
  beforeEach(() => {
    resetarStore()
    vi.clearAllMocks()
  })

  // [TL-T5-1][integration] Modelo.xlsx real
  it('lerNaturezas com Modelo.xlsx real retorna exatamente 16 entradas com descricao não-vazia', () => {
    const caminhoModelo = resolve(__dirname, '../../public/Modelo.xlsx')
    const bytes = new Uint8Array(readFileSync(caminhoModelo))

    const ricas = lerNaturezas(bytes)

    const comDescricao = ricas.filter((n) => n.descricao !== '')
    expect(comDescricao).toHaveLength(16)
  })

  // [TL-T5-2][unit] Botão "Naturezas" aparece quando naturezasRicas filtrado é não-vazio
  it('renderiza o botão "Naturezas" na barra de ações quando naturezasRicas filtrado é não-vazio', () => {
    // Pré-popula o store com uma natureza que tem descrição (simula pós-upload do Modelo)
    act(() => {
      useAppStore.setState({
        lancamentos: [
          {
            data: '2026-07-01',
            transcricao: 'Teste',
            descricao: '',
            valor: -100,
            natureza: 'ALM',
            fonte: 'NUBANK_CARTAO',
            iniciais: 'ES',
          },
        ],
        naturezasRicas: [
          { sigla: 'ALM', nome: 'Alimentação', descricao: 'Gastos com alimentação' },
        ],
      })
    })

    render(React.createElement(App))

    const botaoNaturezas = screen.queryByRole('button', { name: /naturezas/i })
    expect(botaoNaturezas).not.toBeNull()
  })

  // [TL-T5-3][unit] Botão "Naturezas" ausente quando naturezasRicas é vazio
  it('NÃO renderiza o botão "Naturezas" quando naturezasRicas está vazio', () => {
    // Store com lançamentos mas sem naturezas ricas (lista filtrada vazia)
    act(() => {
      useAppStore.setState({
        lancamentos: [
          {
            data: '2026-07-01',
            transcricao: 'Teste',
            descricao: '',
            valor: -100,
            natureza: 'ALM',
            fonte: 'NUBANK_CARTAO',
            iniciais: 'ES',
          },
        ],
        naturezasRicas: [],
      })
    })

    render(React.createElement(App))

    const botaoNaturezas = screen.queryByRole('button', { name: /naturezas/i })
    expect(botaoNaturezas).toBeNull()
  })
})
