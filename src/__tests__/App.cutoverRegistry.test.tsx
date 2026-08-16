// ADR: see spec/fundacao-operacoes.adr.md

/**
 * Task T14 (spec `fundacao-operacoes`) — cutover do registry em produção.
 *
 * Prova, via App real (sem mock de `PipelineState`/`dominio/*` — mesmo padrão de
 * `App.conciliacaoFonte.test.tsx`/`App.valorPendenteOffset.test.tsx`), que o clique real
 * em "Produzir revisão" liga os 5 detectores do registry: além de valor-pendente/
 * pagamento-recebido/conciliação (já cobertos pelos testes de paridade existentes),
 * investimento e transferência interna passam a produzir `Aviso`s de proposta — o
 * call-site legado (pré-T14) nunca fazia isso.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { App } from '../App'
import { useAppStore } from '../ui/store/appStore'

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

vi.mock('../dominio/mes', async (importOriginal) => {
  const original = await importOriginal<typeof import('../dominio/mes')>()
  return {
    ...original,
    detectarMesSugerido: vi.fn(() => null),
  }
})

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
    avisosAcionaveis: { avisos: [], removidos: {} },
  })
}

function criarFileTexto(nome: string, conteudo: string, tipo = 'text/csv'): File {
  const bytes = new TextEncoder().encode(conteudo)
  const file = new File([bytes], nome, { type: tipo })
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(conteudo), writable: true })
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(bytes.buffer),
    writable: true,
  })
  return file
}

const CAMINHO_MODELO = resolve(__dirname, '../../public/Modelo.xlsx')

// Fatura sintética com 1 lançamento de investimento e 1 de transferência interna —
// nenhum dos dois casa com valor-pendente/pagamento-recebido/conciliação (não conflitam).
const FATURA_CUTOVER_CSV = [
  'date,title,amount',
  '2026-06-03,APLICACAO RDB fictícia,120.00',
  '2026-06-04,Open Banking transferencia fictícia,45.00',
].join('\n')

async function produzirComArquivos(arquivos: File[]): Promise<void> {
  render(<App />)

  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  await act(async () => {
    fireEvent.change(input, { target: { files: arquivos } })
  })

  const botaoProduzir = screen.getByText('Produzir revisão')
  await act(async () => {
    fireEvent.click(botaoProduzir)
  })

  await waitFor(() => {
    expect(useAppStore.getState().lancamentos.length).toBeGreaterThan(0)
  })
}

beforeEach(() => {
  resetarStore()
  vi.clearAllMocks()

  const modeloBytes = new Uint8Array(readFileSync(CAMINHO_MODELO))
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ arrayBuffer: async () => modeloBytes.buffer }) as Response),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App — cutover do registry em produção (T14): 5 detectores ligados ao fluxo real', () => {
  it('Produzir real gera proposta de investimento (origem "investimento")', async () => {
    const fatura = criarFileTexto('fatura-cutover.csv', FATURA_CUTOVER_CSV)

    await produzirComArquivos([fatura])

    await waitFor(() => {
      const proposta = useAppStore
        .getState()
        .avisosAcionaveis.avisos.find((a) => a.tipo === 'proposta' && a.origem === 'investimento')
      expect(proposta).toBeDefined()
      expect(proposta?.mutacaoProposta).toMatchObject({ verbo: 'remover' })
    })
  })

  it('Produzir real gera proposta de transferência interna (origem "transferencia-interna")', async () => {
    const fatura = criarFileTexto('fatura-cutover.csv', FATURA_CUTOVER_CSV)

    await produzirComArquivos([fatura])

    await waitFor(() => {
      const proposta = useAppStore
        .getState()
        .avisosAcionaveis.avisos.find(
          (a) => a.tipo === 'proposta' && a.origem === 'transferencia-interna',
        )
      expect(proposta).toBeDefined()
      expect(proposta?.mutacaoProposta).toMatchObject({ verbo: 'remover' })
    })
  })
})
