// ADR: see spec/fatura-itau-xlsx.adr.md

/**
 * Task T9 (spec `fatura-itau-xlsx`) — `handlersPipeline.handleProduzir` deixa de retornar
 * cedo quando a lista de arquivos contém só uma fatura `.xlsx` binária, e lê bytes (não
 * texto) para arquivos `.xlsx`, repassando `mesEscolhido` a `produzirLancamentos` (Decisão 6
 * do ADR). Integração: `produzirLancamentos` real é mockado no nível do módulo para isolar só
 * o wiring desta task (roteamento binário × texto já é provado por `pipeline.faturaItauCc.test.ts`).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Lancamento } from '../../types'

const { mockProduzirLancamentos, mockReproduzirAvisos } = vi.hoisted(() => ({
  mockProduzirLancamentos: vi.fn(),
  mockReproduzirAvisos: vi.fn(),
}))

vi.mock('../PipelineState', async (importOriginal) => {
  const original = await importOriginal<typeof import('../PipelineState')>()
  return {
    ...original,
    produzirLancamentos: mockProduzirLancamentos,
    reproduzirAvisos: mockReproduzirAvisos,
  }
})

vi.mock('../../excel/reader/leitor', () => ({
  lerNaturezas: vi.fn(() => []),
}))

import { handleProduzir, type DepsHandleProduzir } from '../handlersPipeline'

/** Cria um File `.xlsx` sintético com `arrayBuffer()` funcional (jsdom não implementa). */
function xlsxFile(nome: string, bytes: Uint8Array = new Uint8Array([1, 2, 3])): File {
  const file = new File([bytes], nome, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(bytes.buffer),
    writable: true,
  })
  return file
}

function csvFile(nome: string, conteudo: string): File {
  const bytes = new TextEncoder().encode(conteudo)
  const file = new File([bytes], nome, { type: 'text/csv' })
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(bytes.buffer),
    writable: true,
  })
  return file
}

function criarDeps(overrides: Partial<DepsHandleProduzir> = {}): DepsHandleProduzir {
  return {
    csvArquivos: [],
    dicEntries: [],
    iniciais: 'ES',
    nomeUsuario: '',
    mesEscolhido: '2026-07',
    addAviso: vi.fn(),
    adicionarAvisosAcionaveis: vi.fn(),
    limparAvisos: vi.fn(),
    setLancamentos: vi.fn(),
    setNaturezasRicas: vi.fn(),
    setNaturezasValidas: vi.fn(),
    setModeloBytes: vi.fn(),
    ...overrides,
  }
}

const lancamentosFatura: Lancamento[] = [
  {
    fonte: 'fatura_itau_cc',
    data: '2026-07-10',
    transcricao: 'Livraria Fictícia',
    valor: -58.9,
    iniciais: '',
    natureza: '',
    descricao: '',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockProduzirLancamentos.mockReturnValue({ lancamentos: lancamentosFatura, dicEntries: [], avisos: [] })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ arrayBuffer: async () => new Uint8Array([0]).buffer }) as Response),
  )
})

describe('handlersPipeline.handleProduzir — fatura .xlsx de primeira classe (Task T9)', () => {
  it('não retorna cedo quando a lista contém só uma fatura .xlsx (sem nenhum CSV/TXT)', async () => {
    const deps = criarDeps({ csvArquivos: [xlsxFile('fatura_itau.xlsx')] })

    await handleProduzir(deps)

    expect(mockProduzirLancamentos).toHaveBeenCalledTimes(1)
    expect(deps.setLancamentos).toHaveBeenCalledWith(lancamentosFatura)
  })

  it('lê bytes (Uint8Array) para arquivo .xlsx, não texto', async () => {
    const bytes = new Uint8Array([9, 9, 9])
    const deps = criarDeps({ csvArquivos: [xlsxFile('fatura_itau.xlsx', bytes)] })

    await handleProduzir(deps)

    const [entrada] = mockProduzirLancamentos.mock.calls[0] as [unknown]
    expect(entrada).toBeInstanceOf(Uint8Array)
    expect(entrada).toEqual(bytes)
  })

  it('repassa mesEscolhido como 6º argumento de produzirLancamentos para arquivo .xlsx', async () => {
    const deps = criarDeps({
      csvArquivos: [xlsxFile('fatura_itau.xlsx')],
      mesEscolhido: '2026-08',
    })

    await handleProduzir(deps)

    const chamada = mockProduzirLancamentos.mock.calls[0]
    expect(chamada[5]).toBe('2026-08')
  })

  it('continua lendo texto (string) para arquivo .csv, sem regressão', async () => {
    const deps = criarDeps({ csvArquivos: [csvFile('extrato.csv', 'a,b\n1,2')] })

    await handleProduzir(deps)

    const [entrada] = mockProduzirLancamentos.mock.calls[0] as [unknown]
    expect(typeof entrada).toBe('string')
  })

  it('extrato CSV + fatura .xlsx no mesmo lote produzem lançamentos concatenados de ambas', async () => {
    mockProduzirLancamentos
      .mockReturnValueOnce({ lancamentos: [{ ...lancamentosFatura[0], fonte: 'Nubank' }], dicEntries: [], avisos: [] })
      .mockReturnValueOnce({ lancamentos: lancamentosFatura, dicEntries: [], avisos: [] })
    const deps = criarDeps({
      csvArquivos: [csvFile('extrato.csv', 'a,b\n1,2'), xlsxFile('fatura_itau.xlsx')],
    })

    await handleProduzir(deps)

    expect(mockProduzirLancamentos).toHaveBeenCalledTimes(2)
    const chamadaFinal = (deps.setLancamentos as ReturnType<typeof vi.fn>).mock.calls[0][0] as Lancamento[]
    expect(chamadaFinal).toHaveLength(2)
    expect(chamadaFinal.map((l) => l.fonte)).toEqual(['Nubank', 'fatura_itau_cc'])
  })
})
