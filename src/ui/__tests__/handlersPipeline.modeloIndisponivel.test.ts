/**
 * Modelo.xlsx indisponível por status HTTP de erro (TL-MODELO).
 *
 * `fetch` só rejeita em falha de REDE — um 404 resolve normalmente, com `ok: false` e o HTML da
 * página de erro no corpo. Sem checar `resp.ok`, o `try/catch` de `handleProduzir` nunca via nada:
 * `modeloBytes` ficava com o HTML, `lerNaturezas` engolia a exceção do zip inválido e devolvia
 * `[]` (`src/excel/reader/leitor.ts`), e o app seguia com a colinha de naturezas vazia e um Modelo
 * que só falharia lá na exportação — sem um único aviso ao usuário.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../PipelineState', async (importOriginal) => {
  const original = await importOriginal<typeof import('../PipelineState')>()
  return { ...original, reproduzirAvisos: vi.fn() }
})

vi.mock('../../excel/reader/leitor', () => ({
  lerNaturezas: vi.fn(() => []),
}))

import { handleProduzir, type DepsHandleProduzir } from '../handlersPipeline'

const FATURA_CSV = ['date,title,amount', '2026-05-05,Livraria Fictícia,58.90'].join('\n')

function criarFile(nome: string, conteudo: string): File {
  const bytes = new TextEncoder().encode(conteudo)
  const file = new File([bytes], nome, { type: 'text/csv' })
  Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.resolve(bytes.buffer), writable: true })
  return file
}

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

/** Resposta que o servidor devolve num 404: `ok: false` e o HTML da página de erro no corpo. */
function respostaDeErro(status: number): Response {
  const html = new TextEncoder().encode('<!doctype html><title>404</title>')
  return { ok: false, status, arrayBuffer: async () => html.buffer } as Response
}

const MENSAGEM = 'Erro ao carregar Modelo.xlsx: verifique o servidor'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('handleProduzir — Modelo.xlsx com status HTTP de erro (TL-MODELO)', () => {
  it('TL-MODELO-01: 404 aborta o pipeline e avisa, em vez de seguir com o HTML como Modelo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaDeErro(404)))
    const deps = criarDeps()

    await handleProduzir(deps)

    expect(deps.addAviso).toHaveBeenCalledWith(MENSAGEM)
    expect(deps.setModeloBytes).not.toHaveBeenCalled()
    expect(deps.setLancamentos).not.toHaveBeenCalled()
  })

  it('TL-MODELO-02: 500 usa o mesmo caminho de erro, com aviso acionável de origem erro-modelo-xlsx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaDeErro(500)))
    const deps = criarDeps()

    await handleProduzir(deps)

    expect(deps.adicionarAvisosAcionaveis).toHaveBeenCalledTimes(1)
    const [avisos] = vi.mocked(deps.adicionarAvisosAcionaveis).mock.calls[0] as [Array<{ origem: string }>]
    expect(avisos).toHaveLength(1)
    expect(avisos[0].origem).toBe('erro-modelo-xlsx')
  })

  it('TL-MODELO-03: resposta ok segue o fluxo normal e grava os bytes do Modelo', async () => {
    const bytes = new Uint8Array([80, 75, 3, 4])
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer }) as Response),
    )
    const deps = criarDeps()

    await handleProduzir(deps)

    expect(deps.addAviso).not.toHaveBeenCalledWith(MENSAGEM)
    expect(deps.setModeloBytes).toHaveBeenCalledTimes(1)
  })
})
