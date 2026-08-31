// ADR: see Docs/specs/fundacao-operacoes.adr.md

/**
 * Prova E2E — Task T16 do ADR `fundacao-operacoes`: o export gerado a partir do
 * MESMO conjunto final de lançamentos é idêntico independentemente de QUAIS
 * propostas foram aplicadas/dispensadas para chegar nesse conjunto final.
 *
 * Cenário: a partir do MESMO estado inicial pós-produção (upload real de
 * fatura+extrato sintéticos, mesmas fixtures de `avisos-acionaveis.e2e.test.tsx`,
 * Task 7 do spec `avisos-acionaveis`), duas jornadas divergentes que convergem ao
 * mesmo conjunto final de `lancamentos`:
 *
 *  - Jornada 1 ("via proposta"): usuário APROVA a proposta de conciliação real
 *    (`useAppStore.getState().aplicar(idAviso)`) — `avisosSlice.aplicar` remove o
 *    lançamento do extrato via `mutacaoProposta` (casamento por id).
 *  - Jornada 2 ("via ação manual"): usuário DISPENSA a mesma proposta
 *    (`useAppStore.getState().dispensar(idAviso)` — a decisão "não aplicar essa
 *    proposta" fica registrada no histórico de avisos) e em vez disso exclui
 *    manualmente a mesma linha via ação de grid (`excluirLinha`, caminho de código
 *    inteiramente diferente, sem qualquer relação com o `avisosSlice`).
 *
 * As duas jornadas partem do MESMO estado pós-produção (um único upload/parse —
 * evita que o contador serial de `id`, T01, produza ids diferentes entre as duas
 * jornadas) e terminam no MESMO conjunto final de `lancamentos` (mesmos ids,
 * mesmos valores). O teste prova que `gerarAPartirDosRevisados` chamado a partir
 * de cada conjunto final produz `.xlsx` com bytes idênticos (sob relógio
 * controlado — ver nota sobre `fflate`/mtime no teste irmão em
 * `src/excel/writer/__tests__/gerador.invarianteAoHistorico.test.ts`) — a decisão
 * de aplicar vs. dispensar a proposta não vaza para o artefato exportado.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { App } from '../../App'
import { useAppStore } from '../../ui/store/appStore'
import { gerarAPartirDosRevisados } from '../../ui/PipelineState'
import type { Lancamento } from '../../types'

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

vi.mock('../../dominio/mes', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../dominio/mes')>()
  return {
    ...original,
    detectarMesSugerido: vi.fn(() => null),
    defaultMes: vi.fn(() => '2026-06'),
  }
})

function hashSha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

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

const CAMINHO_FATURA = resolve(__dirname, './fixtures/fatura-sintetica-avisos.csv')
const CAMINHO_EXTRATO = resolve(__dirname, './fixtures/extrato-sintetico-avisos.csv')
const CAMINHO_MODELO = resolve(__dirname, '../../../public/Modelo.xlsx')

const MES_ESCOLHIDO = '2026-06' // igual ao mock de defaultMes() acima

describe('E2E — Task T16: export invariante a aplicar vs. dispensar propostas', () => {
  let modeloBytes: Uint8Array

  beforeEach(() => {
    resetarStore()
    vi.clearAllMocks()

    modeloBytes = new Uint8Array(readFileSync(CAMINHO_MODELO))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ arrayBuffer: async () => modeloBytes.buffer }) as Response),
    )
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Upload real de fatura+extrato sintéticos → produção real (parse+detecção). */
  async function produzirFaturaEExtrato(): Promise<void> {
    render(<App />)

    const fatura = criarFileTexto(
      'fatura-sintetica-avisos.csv',
      readFileSync(CAMINHO_FATURA, 'utf-8'),
    )
    const extrato = criarFileTexto(
      'extrato-sintetico-avisos.csv',
      readFileSync(CAMINHO_EXTRATO, 'utf-8'),
    )

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [fatura, extrato] } })
    })

    const botaoProduzir = screen.getByText('Produzir revisão')
    await act(async () => {
      fireEvent.click(botaoProduzir)
    })

    await waitFor(() => {
      expect(useAppStore.getState().lancamentos.length).toBeGreaterThan(0)
    })

    await waitFor(() => {
      const propostas = useAppStore
        .getState()
        .avisosAcionaveis.avisos.filter((a) => a.tipo === 'proposta' && a.origem === 'conciliacao')
      expect(propostas).toHaveLength(1)
    })
  }

  /** Ordena por id — comparação de "mesmo conjunto final" não deve depender de qual jornada rodou primeiro. */
  function porId(lancamentos: Lancamento[]): Lancamento[] {
    return [...lancamentos].sort((a, b) => a.id - b.id)
  }

  it('jornada via proposta (aplicar) e jornada via ação manual (dispensar + excluir linha) convergem ao mesmo conjunto final de lançamentos', async () => {
    await produzirFaturaEExtrato()

    const idAviso = useAppStore
      .getState()
      .avisosAcionaveis.avisos.find((a) => a.origem === 'conciliacao')!.id

    // Snapshot do estado pós-produção (única fonte, único parse — mesmos ids em
    // ambas as jornadas).
    const estadoPosProducao = {
      lancamentos: useAppStore.getState().lancamentos,
      avisosAcionaveis: useAppStore.getState().avisosAcionaveis,
    }

    // Jornada 1: aprovar (aplicar) a proposta de conciliação.
    act(() => {
      useAppStore.getState().aplicar(idAviso)
    })
    expect(
      useAppStore.getState().avisosAcionaveis.avisos.find((a) => a.id === idAviso)?.estado,
    ).toBe('aplicado')
    const lancamentosJornada1 = useAppStore.getState().lancamentos

    // Restaura o estado pós-produção (mesmos ids, mesmo parse) para a jornada 2.
    act(() => {
      useAppStore.setState({
        lancamentos: estadoPosProducao.lancamentos,
        avisosAcionaveis: estadoPosProducao.avisosAcionaveis,
      })
    })

    // Jornada 2: dispensar a mesma proposta + excluir a mesma linha manualmente
    // (caminho de código totalmente alheio ao avisosSlice).
    act(() => {
      useAppStore.getState().dispensar(idAviso)
    })
    expect(
      useAppStore.getState().avisosAcionaveis.avisos.find((a) => a.id === idAviso)?.estado,
    ).toBe('dispensado')
    // A proposta foi DISPENSADA — `lancamentos` não foi tocado por ela.
    expect(useAppStore.getState().lancamentos).toEqual(estadoPosProducao.lancamentos)

    const indiceExtrato = useAppStore
      .getState()
      .lancamentos.findIndex((l) => /pagamento de fatura/i.test(l.transcricao))
    expect(indiceExtrato).toBeGreaterThanOrEqual(0)
    act(() => {
      useAppStore.getState().excluirLinha(indiceExtrato)
    })
    const lancamentosJornada2 = useAppStore.getState().lancamentos

    // Mesmo conjunto final (mesmos ids/valores), independente de qual jornada rodou.
    expect(porId(lancamentosJornada2)).toEqual(porId(lancamentosJornada1))
    expect(lancamentosJornada2.some((l) => /pagamento de fatura/i.test(l.transcricao))).toBe(false)
  })

  it('export gerado a partir de cada jornada é byte-idêntico quando o conjunto final de lançamentos converge (sob relógio controlado)', async () => {
    await produzirFaturaEExtrato()

    const idAviso = useAppStore
      .getState()
      .avisosAcionaveis.avisos.find((a) => a.origem === 'conciliacao')!.id
    const estadoPosProducao = {
      lancamentos: useAppStore.getState().lancamentos,
      avisosAcionaveis: useAppStore.getState().avisosAcionaveis,
    }
    const iniciais = useAppStore.getState().iniciais
    const dicEntries = useAppStore.getState().dicEntries

    // Jornada 1: aprovar.
    act(() => {
      useAppStore.getState().aplicar(idAviso)
    })
    const lancamentosJornada1 = useAppStore.getState().lancamentos

    // Jornada 2: dispensar + excluir manualmente, a partir do mesmo snapshot pós-produção.
    act(() => {
      useAppStore.setState({
        lancamentos: estadoPosProducao.lancamentos,
        avisosAcionaveis: estadoPosProducao.avisosAcionaveis,
      })
    })
    act(() => {
      useAppStore.getState().dispensar(idAviso)
    })
    const indiceExtrato = useAppStore
      .getState()
      .lancamentos.findIndex((l) => /pagamento de fatura/i.test(l.transcricao))
    act(() => {
      useAppStore.getState().excluirLinha(indiceExtrato)
    })
    const lancamentosJornada2 = useAppStore.getState().lancamentos

    // A geração em si não depende de UI/timers assíncronos — controla o relógio
    // só aqui, fora de qualquer `waitFor`/render, para não travar RTL com fake timers.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-06-15T08:00:00Z'))
      const exportJornada1 = gerarAPartirDosRevisados(
        modeloBytes,
        iniciais,
        lancamentosJornada1,
        dicEntries,
        MES_ESCOLHIDO,
      )
      const exportJornada2 = gerarAPartirDosRevisados(
        modeloBytes,
        iniciais,
        lancamentosJornada2,
        dicEntries,
        MES_ESCOLHIDO,
      )

      expect(hashSha256(exportJornada1)).toBe(hashSha256(exportJornada2))
      expect(Buffer.from(exportJornada1).equals(Buffer.from(exportJornada2))).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
