// ADR: see spec/inspecao-proposta-conciliacao.adr.md

/**
 * Teste de regressão para a Task T11 do spec `inspecao-proposta-conciliacao`.
 *
 * Bug achado na validação visual manual (2026-08-01): ao carregar ≥2 arquivos, o `alvo`
 * das propostas de valor-pendente/pagamento-recebido era um índice relativo à sublista
 * per-arquivo (`lancamentosComFlags` em `PipelineState.produzirLancamentos`), nunca
 * remapeado para o índice real em `todosLancamentos`/`state.lancamentos` — mesma classe
 * do bug de `aviso.permanece` já corrigido para conciliação em T5
 * (`App.conciliacaoFonte.test.tsx`, describe "remapeamento de aviso.permanece").
 *
 * Como no App.conciliacaoFonte.test.tsx, `PipelineState`, as detecções
 * (`src/dominio/deteccoes.ts`) e o `avisosSlice` real permanecem sem mock — só
 * componentes pesados de UI e infraestrutura de navegador (fetch do Modelo.xlsx) são
 * stubados.
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

// Primeira fatura sintética (2 lançamentos comuns) — ocupa os índices 0/1 do array
// total. A segunda fatura, com valor-pendente/pagamento-recebido, entra DEPOIS —
// cenário não-inicial que expõe o bug de offset.
const FATURA_INICIAL_CSV = [
  'date,title,amount',
  '2026-05-05,Livraria Fictícia,58.90',
  '2026-05-12,Farmácia Fictícia,41.00',
].join('\n')

// Segunda fatura sintética: pagamento-recebido (índice 0 na sublista, índice real 2),
// valor-pendente (índice 1 na sublista, índice real 3), seguidos de 2 lançamentos
// comuns — fixture reaproveitada de T2/T7 (`fatura_nubank_avisos_pendentes.csv`).
const FATURA_COM_PENDENTES_CSV = [
  'date,title,amount',
  '2024-06-01,Pagamento recebido,-500.00',
  '2024-06-02,Valor pendente do mês anterior,120.00',
  '2024-06-03,Multa por fatura atrasada,15.00',
  '2024-06-04,IOF por fatura atrasada,8.50',
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

describe('App — alvo de valor-pendente/pagamento-recebido no espaço de índice do array total (T11)', () => {
  it('arquivo com pendentes NÃO é o primeiro do lote — alvo aponta o índice real em state.lancamentos', async () => {
    const faturaInicial = criarFileTexto('fatura-inicial.csv', FATURA_INICIAL_CSV)
    const faturaComPendentes = criarFileTexto('fatura-pendentes.csv', FATURA_COM_PENDENTES_CSV)

    await produzirComArquivos([faturaInicial, faturaComPendentes])

    const lancamentos = useAppStore.getState().lancamentos

    const propostaValorPendente = useAppStore
      .getState()
      .avisosAcionaveis.avisos.find((a) => a.origem === 'valor-pendente')
    const propostaPagamentoRecebido = useAppStore
      .getState()
      .avisosAcionaveis.avisos.find((a) => a.origem === 'pagamento-recebido')

    expect(propostaValorPendente).toBeDefined()
    expect(propostaPagamentoRecebido).toBeDefined()

    // `alvo` precisa apontar para a linha REAL em `state.lancamentos` — não para a
    // linha deslocada pelo offset dos 2 lançamentos da primeira fatura.
    const indiceRealValorPendente = Number(propostaValorPendente!.alvo[0])
    expect(lancamentos[indiceRealValorPendente]?.transcricao).toBe('Valor pendente do mês anterior')

    const indiceRealPagamentoRecebido = Number(propostaPagamentoRecebido!.alvo[0])
    expect(lancamentos[indiceRealPagamentoRecebido]?.transcricao).toBe('Pagamento recebido')
  })

  it('arquivo único (offset 0) — alvo continua correto', async () => {
    const faturaComPendentes = criarFileTexto('fatura-pendentes.csv', FATURA_COM_PENDENTES_CSV)

    await produzirComArquivos([faturaComPendentes])

    const lancamentos = useAppStore.getState().lancamentos

    const propostaValorPendente = useAppStore
      .getState()
      .avisosAcionaveis.avisos.find((a) => a.origem === 'valor-pendente')
    expect(propostaValorPendente).toBeDefined()
    const indiceReal = Number(propostaValorPendente!.alvo[0])
    expect(lancamentos[indiceReal]?.transcricao).toBe('Valor pendente do mês anterior')
  })

  it('nenhuma duplicação: cada origem gera exatamente uma proposta por linha', async () => {
    const faturaInicial = criarFileTexto('fatura-inicial.csv', FATURA_INICIAL_CSV)
    const faturaComPendentes = criarFileTexto('fatura-pendentes.csv', FATURA_COM_PENDENTES_CSV)

    await produzirComArquivos([faturaInicial, faturaComPendentes])

    const avisos = useAppStore.getState().avisosAcionaveis.avisos
    expect(avisos.filter((a) => a.origem === 'valor-pendente')).toHaveLength(1)
    expect(avisos.filter((a) => a.origem === 'pagamento-recebido')).toHaveLength(1)
  })
})
