// ADR: see Docs/specs/conciliacao-robusta.adr.md

/**
 * Prova E2E — Task 10 do ADR `conciliacao-robusta`: a fatura NUNCA some em
 * silêncio da central de avisos, ponta a ponta, contra a fiação REAL de
 * produção (upload real → "Produzir revisão" → `TelaRevisao` montada → central
 * de avisos populada pelo registry, T6, e pelo cross-check de desalinhamento,
 * T2/T8).
 *
 * Dois cenários com a MESMA fatura+extrato Nubank de junho, variando apenas o
 * mês de referência escolhido pelo usuário (`defaultMes()`, fixado no mount de
 * `App.tsx`):
 *
 *  1. Mês-ref ALINHADO ('2026-07', posterior às datas de junho da fatura): a
 *     heurística por data (`classificarFonte`) concorda com o prefixo
 *     autoritativo (`classificarFontePorPrefixo`, T1) — ambos dizem 'fatura'.
 *     A conciliação (total exato) produz 1 `Aviso` `tipo:'proposta'`,
 *     `origem:'conciliacao'`. Nenhum aviso de desalinhamento (T2/T8) dispara —
 *     sanidade de que o cenário alinhado não gera ruído extra.
 *
 *  2. Mês-ref DESALINHADO ('2026-06', igual ao próprio mês da fatura, não
 *     anterior — bug motivador F1): a heurística por data classificaria essa
 *     mesma fonte `fatura_nubank_cc` como 'extrato' (nenhuma data anterior ao
 *     mês escolhido), o que, ANTES desta spec (quando a heurística decidia a
 *     classificação), fazia a conciliação silenciar por completo
 *     (`fontesFatura.length === 0`). Com a classificação autoritativa por
 *     prefixo (T1/T6), a fonte permanece 'fatura' independente da data — a
 *     conciliação roda normalmente e o mesmo `Aviso` `tipo:'proposta'` de
 *     conciliação aparece. Adicionalmente, o cross-check de desalinhamento
 *     (T2/T8) detecta a divergência heurística×prefixo e soma um segundo
 *     `Aviso` `tipo:'informativo'`, `origem:'desalinhamento-mes'` — dois
 *     sinais independentes confirmando que a fatura nunca some em silêncio.
 *
 * Em ambos os cenários a asserção central (DoD da Task 10) é a mesma: existe
 * ≥1 `Aviso` referente à fatura carregada — nunca zero.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { App } from '../../App'
import { useAppStore } from '../../ui/store/appStore'
import { classificarFonte } from '../../dominio/mes'
import { reiniciarContadorIds } from '../../parsers/idSerial'

vi.mock('../../ui/components/ReviewGrid', () => ({
  ReviewGrid: () => React.createElement('div', { 'data-testid': 'review-grid' }),
  TEMA_ERRO: { bgCell: '#f9e2d6' },
  TEMA_TRANSFERENCIA: { bgCell: '#d5e4f2' },
  TEMA_INVESTIMENTO: { bgCell: '#dcedd3' },
  calcularTemaLinha: vi.fn(),
  calcularSomaSelecionados: vi.fn(() => null),
}))

vi.mock('../../ui/components/SplitModal', () => ({
  SplitModal: () => React.createElement('div', { 'data-testid': 'split-modal' }),
}))

vi.mock('../../ui/components/AvisoList', () => ({
  AvisoList: () => React.createElement('div', { 'data-testid': 'aviso-list' }),
}))

// Mês de referência controlado por cenário (mutável, lido dinamicamente pelo mock — cada
// `it()` ajusta esta variável ANTES de `render(<App />)`, já que `App.tsx` fixa
// `mesEscolhido` uma única vez no mount via `useState(defaultMes())`).
let mesRefDoCenario = '2026-07'

vi.mock('../../dominio/mes', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../dominio/mes')>()
  return {
    ...original,
    detectarMesSugerido: vi.fn(() => null),
    defaultMes: vi.fn(() => mesRefDoCenario),
  }
})

// ---------------------------------------------------------------------------
// Fixtures inline (Área tocada da Task 10 é literalmente este arquivo — não
// reaproveita `./fixtures/*.csv` de outras tasks). Fatura+extrato Nubank de
// junho/2026, mesmo padrão de cabeçalho real dos parsers (`fatura_nubank_cc`/
// `extrato_nubank`, ver `src/parsers/fatura_nubank.ts`/`extrato_nubank.ts`).
// Total da fatura (58,90 + 41,00 = 99,90) casa exatamente com o pagamento do
// extrato — dispara a proposta normal de conciliação (não o ramo de
// candidatos/ambiguidade, fora do escopo desta prova).
// ---------------------------------------------------------------------------

const FATURA_CSV = [
  'date,title,amount',
  '2026-06-05,Livraria Fictícia,58.90',
  '2026-06-12,Farmácia Fictícia,41.00',
].join('\n')

const EXTRATO_CSV = [
  'Data,Valor,Identificador,Descrição',
  '20/06/2026,-99.90,pag001,Pagamento de fatura',
].join('\n')

const CAMINHO_MODELO = resolve(__dirname, '../../../public/Modelo.xlsx')

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
    avisosAcionaveis: { avisos: [], removidos: {}, avisoEmInspecao: null },
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

describe('E2E — Task 10: fatura nunca some em silêncio (F1)', () => {
  let modeloBytes: Uint8Array

  beforeEach(() => {
    resetarStore()
    vi.clearAllMocks()
    reiniciarContadorIds()

    modeloBytes = new Uint8Array(readFileSync(CAMINHO_MODELO))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ arrayBuffer: async () => modeloBytes.buffer }) as Response),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function uploadEProduzir(): Promise<void> {
    render(<App />)

    const fatura = criarFileTexto('fatura-sintetica-t10.csv', FATURA_CSV)
    const extrato = criarFileTexto('extrato-sintetico-t10.csv', EXTRATO_CSV)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [fatura, extrato] } })
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Produzir revisão'))
    })

    await waitFor(() => {
      expect(useAppStore.getState().lancamentos).toHaveLength(3)
    })

    // `TelaRevisao` só monta (e roda o cross-check de desalinhamento, T2/T8)
    // depois que `lancamentos.length > 0` derruba `TelaImportacao` — espera a
    // tela de revisão renderizar antes de inspecionar `avisosAcionaveis`.
    await waitFor(() => {
      expect(screen.getByTestId('review-grid')).toBeInTheDocument()
    })
  }

  it('cenário 1 — mês-ref ALINHADO (2026-07): conciliação produz proposta referente à fatura, sem ruído de desalinhamento', async () => {
    mesRefDoCenario = '2026-07' // posterior a todas as datas de junho da fatura → heurística concorda com o prefixo ('fatura')

    // Sanidade prévia: confirma que o cenário é de fato ALINHADO — a heurística
    // por data concorda com o prefixo autoritativo antes mesmo de rodar a UI.
    const lancamentosFaturaSimulados = [
      { fonte: 'fatura_nubank_cc', data: '2026-06-05' },
      { fonte: 'fatura_nubank_cc', data: '2026-06-12' },
    ] as Parameters<typeof classificarFonte>[1]
    expect(classificarFonte('fatura_nubank_cc', lancamentosFaturaSimulados, mesRefDoCenario)).toBe(
      'fatura',
    )

    await uploadEProduzir()

    const avisos = useAppStore.getState().avisosAcionaveis.avisos
    const avisosReferentesAFatura = avisos.filter(
      (a) => a.origem === 'conciliacao' || a.id === 'desalinhamento-mes-fatura_nubank_cc',
    )

    // DoD da Task 10: nunca zero avisos relacionados à fatura carregada.
    expect(avisosReferentesAFatura.length).toBeGreaterThanOrEqual(1)

    const propostaConciliacao = avisos.find((a) => a.origem === 'conciliacao')
    expect(propostaConciliacao).toBeDefined()
    expect(propostaConciliacao?.tipo).toBe('proposta')
    expect(propostaConciliacao?.estado).toBe('pendente')

    // Sanidade do alinhamento: nenhum aviso de desalinhamento referente à
    // FATURA dispara quando heurística e prefixo concordam para essa fonte
    // (o extrato, cuja própria data de junho cai antes de '2026-07', diverge
    // pela heurística por sua própria conta — fora do escopo desta prova,
    // que é sobre a fatura nunca sumir em silêncio).
    expect(
      avisos.some((a) => a.origem === 'desalinhamento-mes' && a.id === 'desalinhamento-mes-fatura_nubank_cc'),
    ).toBe(false)
  })

  it('cenário 2 — mês-ref DESALINHADO (2026-06, bug motivador F1): fatura ainda gera aviso, nunca silêncio', async () => {
    mesRefDoCenario = '2026-06' // igual ao próprio mês da fatura, não anterior → heurística diverge do prefixo

    // Reproduz a premissa exata do bug motivador F1: sob a heurística por data
    // (rebaixada a cross-check pela Decisão 1 do ADR), esta mesma fonte
    // fatura_nubank_cc seria classificada 'extrato' neste mês de referência —
    // antes da Task 6, isso zerava `fontesFatura` e silenciava a conciliação
    // por completo.
    const lancamentosFaturaSimulados = [
      { fonte: 'fatura_nubank_cc', data: '2026-06-05' },
      { fonte: 'fatura_nubank_cc', data: '2026-06-12' },
    ] as Parameters<typeof classificarFonte>[1]
    expect(classificarFonte('fatura_nubank_cc', lancamentosFaturaSimulados, mesRefDoCenario)).toBe(
      'extrato',
    )

    await uploadEProduzir()

    const avisos = useAppStore.getState().avisosAcionaveis.avisos
    const avisosReferentesAFatura = avisos.filter(
      (a) => a.origem === 'conciliacao' || a.id === 'desalinhamento-mes-fatura_nubank_cc',
    )

    // DoD da Task 10 — o núcleo desta prova: mesmo desalinhado, NUNCA zero
    // avisos relacionados à fatura (fecha F1 ponta a ponta).
    expect(avisosReferentesAFatura.length).toBeGreaterThanOrEqual(1)

    // Sinal 1 (T6): a conciliação continua reconhecendo a fatura via prefixo
    // autoritativo e produz a mesma proposta normal do cenário alinhado —
    // prova que o mês desalinhado não silencia mais a conciliação.
    const propostaConciliacao = avisos.find((a) => a.origem === 'conciliacao')
    expect(propostaConciliacao).toBeDefined()
    expect(propostaConciliacao?.tipo).toBe('proposta')
    expect(propostaConciliacao?.estado).toBe('pendente')

    // Sinal 2 (T2/T8): o cross-check de desalinhamento detecta a divergência
    // heurística×prefixo e soma um segundo aviso informativo — reforço
    // independente de que a fatura nunca some em silêncio.
    const avisoDesalinhamento = avisos.find((a) => a.id === 'desalinhamento-mes-fatura_nubank_cc')
    expect(avisoDesalinhamento).toBeDefined()
    expect(avisoDesalinhamento?.tipo).toBe('informativo')
    expect(avisoDesalinhamento?.mensagem).toContain('fatura_nubank_cc')
  })
})
