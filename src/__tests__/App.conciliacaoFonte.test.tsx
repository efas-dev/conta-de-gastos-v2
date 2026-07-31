// ADR: see Docs/specs/avisos-acionaveis.adr.md

/**
 * Testes de integração para a Task 8 do spec `avisos-acionaveis` — correlação
 * fatura×extrato em `handleProduzir` (App.tsx) via campo `fonte`, alimentando
 * `detectarConciliacao` com os conjuntos corretos após o loop de processamento
 * por arquivo.
 *
 * Gap original (Task 7, `Docs/debt/tecnica/task-underspecified-7-spec-20260720-avisos-acionaveis.md`):
 * `handleProduzir` sempre passava `[]` como `lancamentosExtrato` para
 * `produzirLancamentos`, então `detectarConciliacao` nunca disparava no app
 * real mesmo com fatura+extrato carregados juntos.
 *
 * Como no E2E da Task 7, `PipelineState`, as detecções (`src/dominio/deteccoes.ts`)
 * e o `avisosSlice` real permanecem sem mock — só componentes pesados de UI e
 * infraestrutura de navegador (fetch do Modelo.xlsx) são stubados.
 *
 * Fixtures sintéticas inline (D6 do ADR avisos-acionaveis: valores e nomes
 * fictícios, zero dados de data_sample/). Datas escolhidas deliberadamente
 * para que `classificarFonte` (já usado no restante do App para rotular
 * fatura/extrato) classifique corretamente cada fonte contra `mesEscolhido`
 * (default = mês anterior ao corrente, `defaultMes()`): fatura em maio/2026,
 * extrato em junho/2026, com `mesEscolhido` default = '2026-06'.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { App } from '../App'
import { useAppStore } from '../ui/store/appStore'

// ---------------------------------------------------------------------------
// Mocks — apenas componentes pesados de UI. PipelineState, detecções,
// avisosSlice e classificarFonte permanecem reais (mesmo padrão do E2E T7).
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

vi.mock('../dominio/mes', async (importOriginal) => {
  const original = await importOriginal<typeof import('../dominio/mes')>()
  return {
    ...original,
    // Impede que a leitura antecipada sobrescreva mesEscolhido — mantém o
    // default '2026-06' (mês anterior a hoje) estável durante o teste.
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
    avisosAcionaveis: { avisos: [], removidos: {} },
  })
}

/** Cria um File sintético com `text()`/`arrayBuffer()` funcionais (jsdom não implementa). */
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

// Fatura sintética (maio/2026 — antes de mesEscolhido='2026-06'): soma = 99.90
const FATURA_CSV = [
  'date,title,amount',
  '2026-05-05,Livraria Fictícia,58.90',
  '2026-05-12,Farmácia Fictícia,41.00',
].join('\n')

// Extrato sintético (junho/2026 — não antes de mesEscolhido): pagamento de
// fatura de 99.90 casa com a soma da fatura acima (tolerância R$ 0,05).
const EXTRATO_CSV = [
  'Data,Valor,Identificador,Descrição',
  '05/06/2026,-99.90,pag001,Pagamento de fatura',
  '10/06/2026,-15.00,out002,Outro débito fictício',
].join('\n')

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

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('App — correlação fatura×extrato por fonte alimenta detectarConciliacao (Task 8)', () => {
  it('upload conjunto fatura+extrato → proposta de conciliação aparece na central', async () => {
    const fatura = criarFileTexto('fatura-sintetica.csv', FATURA_CSV)
    const extrato = criarFileTexto('extrato-sintetico.csv', EXTRATO_CSV)

    await produzirComArquivos([fatura, extrato])

    await waitFor(() => {
      const propostas = useAppStore
        .getState()
        .avisosAcionaveis.avisos.filter((a) => a.tipo === 'proposta' && a.origem === 'conciliacao')
      expect(propostas).toHaveLength(1)
    })
  })

  it('arquivo único (só fatura) — sem proposta de conciliação, sem regressão', async () => {
    const fatura = criarFileTexto('fatura-sintetica.csv', FATURA_CSV)

    await produzirComArquivos([fatura])

    const propostas = useAppStore
      .getState()
      .avisosAcionaveis.avisos.filter((a) => a.tipo === 'proposta' && a.origem === 'conciliacao')
    expect(propostas).toHaveLength(0)
  })

  it('arquivo único (só extrato) — sem proposta de conciliação, sem regressão', async () => {
    const extrato = criarFileTexto('extrato-sintetico.csv', EXTRATO_CSV)

    await produzirComArquivos([extrato])

    const propostas = useAppStore
      .getState()
      .avisosAcionaveis.avisos.filter((a) => a.tipo === 'proposta' && a.origem === 'conciliacao')
    expect(propostas).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Task T5 (spec inspecao-proposta-conciliacao) — remapeamento de `aviso.permanece`
// Dívida: Docs/debt/tecnica/remapeamento-permanece-ausente-app-tsx.md
// ---------------------------------------------------------------------------

describe('App — remapeamento de aviso.permanece quando a fatura NÃO é o primeiro arquivo (T5)', () => {
  it('extrato enviado antes da fatura no lote — permanece aponta para os índices reais dos itens da fatura', async () => {
    const extrato = criarFileTexto('extrato-sintetico.csv', EXTRATO_CSV)
    const fatura = criarFileTexto('fatura-sintetica.csv', FATURA_CSV)

    // Ordem deliberada: extrato ANTES da fatura — reproduz o cenário da dívida
    // (`todosLancamentos` = [extrato..., fatura...]; sem o remapeamento, `permanece`
    // continuaria com índices relativos a `lancamentosDestaFatura`, que aqui NÃO
    // coincidem com os índices reais em `state.lancamentos`).
    await produzirComArquivos([extrato, fatura])

    const lancamentos = useAppStore.getState().lancamentos
    const proposta = useAppStore
      .getState()
      .avisosAcionaveis.avisos.find((a) => a.tipo === 'proposta' && a.origem === 'conciliacao')
    expect(proposta).toBeDefined()

    // Os 2 lançamentos da fatura (Livraria/Farmácia) devem estar em `permanece`,
    // identificados pelos seus índices REAIS em `state.lancamentos` — não pelos
    // índices 0/1 relativos ao subconjunto da fatura isolado.
    const indicesPermanece = proposta!.permanece.map(Number)
    const transcricoesPermanece = indicesPermanece.map((i) => lancamentos[i]?.transcricao)
    expect(transcricoesPermanece).toContain('Livraria Fictícia')
    expect(transcricoesPermanece).toContain('Farmácia Fictícia')

    // Nenhum índice de `permanece` deve apontar para um lançamento do extrato.
    expect(transcricoesPermanece).not.toContain('Pagamento de fatura')
    expect(transcricoesPermanece).not.toContain('Outro débito fictício')

    // `alvo` continua correto (já coberto pela Task 8) — aponta para o item do extrato.
    const indicesAlvo = proposta!.alvo.map(Number)
    expect(indicesAlvo.map((i) => lancamentos[i]?.transcricao)).toEqual(['Pagamento de fatura'])
  })
})
