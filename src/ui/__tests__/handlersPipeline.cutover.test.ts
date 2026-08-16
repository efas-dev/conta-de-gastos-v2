// ADR: see spec/fundacao-operacoes.adr.md

/**
 * Task T14 (spec `fundacao-operacoes`) — cutover do registry em produção.
 *
 * Prova a WIRING (não a política D8 em si — já provada exaustivamente pelos testes
 * de `reproduzirAvisos` de T09 em `pipeline.reproduzirAvisos.test.ts`, com o registry
 * REAL): que `handlersPipeline.handleProduzir` chama `reproduzirAvisos` (importado de
 * `./PipelineState`) exatamente uma vez, com os argumentos corretos, no lugar das
 * chamadas legadas diretas de detecção.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Lancamento } from '../../types'

const { mockReproduzirAvisos } = vi.hoisted(() => ({
  mockReproduzirAvisos: vi.fn(),
}))

vi.mock('../PipelineState', async (importOriginal) => {
  const original = await importOriginal<typeof import('../PipelineState')>()
  return {
    ...original,
    reproduzirAvisos: mockReproduzirAvisos,
  }
})

vi.mock('../../excel/reader/leitor', () => ({
  lerNaturezas: vi.fn(() => []),
}))

import { handleProduzir, type DepsHandleProduzir } from '../handlersPipeline'

function criarFile(nome: string, conteudo: string): File {
  const bytes = new TextEncoder().encode(conteudo)
  const file = new File([bytes], nome, { type: 'text/csv' })
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(bytes.buffer),
    writable: true,
  })
  return file
}

const FATURA_CSV = ['date,title,amount', '2026-05-05,Livraria Fictícia,58.90'].join('\n')

function criarDeps(overrides: Partial<DepsHandleProduzir> = {}): DepsHandleProduzir {
  return {
    csvArquivos: [criarFile('fatura.csv', FATURA_CSV)],
    dicEntries: [],
    iniciais: 'ES',
    nomeUsuario: '',
    mesEscolhido: '2026-06',
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

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ arrayBuffer: async () => new Uint8Array([0]).buffer }) as Response),
  )
})

describe('handlersPipeline.handleProduzir — cutover para reproduzirAvisos (T14)', () => {
  it('chama reproduzirAvisos exatamente uma vez, com todosLancamentos/nomeUsuario/mesEscolhido/limparAvisos/adicionarAvisosAcionaveis', async () => {
    const deps = criarDeps({ nomeUsuario: 'Eduardo', mesEscolhido: '2026-07' })

    await handleProduzir(deps)

    expect(mockReproduzirAvisos).toHaveBeenCalledTimes(1)
    const [todosLancamentos, nomeUsuario, mesRef, limparAvisos, adicionarAvisos] =
      mockReproduzirAvisos.mock.calls[0] as [Lancamento[], string | undefined, string | undefined, () => void, (a: unknown[]) => void]

    expect(Array.isArray(todosLancamentos)).toBe(true)
    expect(nomeUsuario).toBe('Eduardo')
    expect(mesRef).toBe('2026-07')
    expect(limparAvisos).toBe(deps.limparAvisos)
    expect(adicionarAvisos).toBe(deps.adicionarAvisosAcionaveis)
  })

  it('nomeUsuario vazio é repassado como undefined (mesmo padrão de produzirLancamentos)', async () => {
    const deps = criarDeps({ nomeUsuario: '' })

    await handleProduzir(deps)

    const [, nomeUsuario] = mockReproduzirAvisos.mock.calls[0] as [unknown, string | undefined]
    expect(nomeUsuario).toBeUndefined()
  })
})
