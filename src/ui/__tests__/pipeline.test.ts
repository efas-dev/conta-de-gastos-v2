// ADR: see Docs/specs/mvp-vertical-nubank.adr.md

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computarNomeArquivo, executarPipeline, produzirLancamentos, gerarAPartirDosRevisados } from '../PipelineState'
import type { Lancamento, DicEntry } from '../../types'

// ---------------------------------------------------------------------------
// Mocks — módulos pesados substituídos por stubs
// ---------------------------------------------------------------------------

const lancamentosMock: Lancamento[] = [
  {
    fonte: 'Nubank',
    data: '2025-03-15',
    transcricao: 'Mercado',
    valor: -150,
    iniciais: '',
    natureza: '',
    descricao: '',
  },
]

vi.mock('../../parsers/index', () => ({
  detectar: vi.fn(() => ({
    aceita: () => true,
    parsear: vi.fn(() => ({ lancamentos: lancamentosMock, linhasIgnoradas: 0 })),
  })),
}))

vi.mock('../../dominio/dicionario', () => ({
  enriquecerLancamento: vi.fn(
    (lancamento: Lancamento, _dic: unknown, iniciais: string) => ({
      ...lancamento,
      iniciais,
    }),
  ),
}))

vi.mock('../../excel/reader/leitor', () => ({
  lerDicionario: vi.fn(() => []),
}))

vi.mock('../../excel/writer/gerador', () => ({
  gerarXlsx: vi.fn(() => new Uint8Array([80, 75, 3, 4])),
}))

// Mock do aprenderDicionario — permite verificar 4º arg de gerarXlsx em gerarAPartirDosRevisados
vi.mock('../../dominio/aprendizado', () => ({
  aprenderDicionario: vi.fn((_lancamentos: Lancamento[], dicAnterior: DicEntry[]) => dicAnterior),
}))

// Importações tipadas das mocks (disponíveis após vi.mock ser processado)
import { detectar } from '../../parsers/index'
import { enriquecerLancamento } from '../../dominio/dicionario'
import { lerDicionario } from '../../excel/reader/leitor'
import { gerarXlsx } from '../../excel/writer/gerador'
import { aprenderDicionario } from '../../dominio/aprendizado'

// ---------------------------------------------------------------------------
// Nota: os testes dos grupos `estadoInicial` e `reduzir — *` foram removidos
// nesta migração (T10). A função `reduzir` e `estadoInicial` permanecem
// exportadas em PipelineState.ts mas são código morto a partir de T6/T9
// (o estado de UI migrou para o store Zustand). A limpeza do código morto
// fica fora do escopo de T10 (Áreas tocadas = apenas arquivos de teste).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 1–3. computarNomeArquivo
// ---------------------------------------------------------------------------

describe('computarNomeArquivo', () => {
  it('retorna AAAA-MM-INICIAIS.xlsx com base na data do primeiro lançamento', () => {
    const lancamentos: Lancamento[] = [
      {
        fonte: 'Nubank',
        data: '2025-03-15',
        transcricao: 'Teste',
        valor: -100,
        iniciais: 'ES',
        natureza: '',
        descricao: '',
      },
    ]
    expect(computarNomeArquivo(lancamentos, 'ES')).toBe('2025-03-ES.xlsx')
  })

  it('usa o mês/ano do primeiro lançamento para derivar o período', () => {
    const lancamentos: Lancamento[] = [
      { fonte: 'Nubank', data: '2024-12-01', transcricao: 'A', valor: -10, iniciais: '', natureza: '', descricao: '' },
      { fonte: 'Nubank', data: '2024-12-31', transcricao: 'B', valor: -20, iniciais: '', natureza: '', descricao: '' },
    ]
    expect(computarNomeArquivo(lancamentos, 'JD')).toBe('2024-12-JD.xlsx')
  })

  it('retorna nome genérico quando lista de lançamentos está vazia', () => {
    expect(computarNomeArquivo([], 'ES')).toBe('exportacao-ES.xlsx')
  })
})

// ---------------------------------------------------------------------------
// 4–6. produzirLancamentos — estrutura de retorno e avisos
// ---------------------------------------------------------------------------

describe('produzirLancamentos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(detectar).mockReturnValue({
      aceita: () => true,
      parsear: vi.fn(() => ({ lancamentos: lancamentosMock, linhasIgnoradas: 0 })),
    })
    vi.mocked(lerDicionario).mockReturnValue([])
  })

  it('retorna { lancamentos, dicEntries, avisos } com array de avisos vazio quando sem linhasIgnoradas', () => {
    const resultado = produzirLancamentos('csv', [], 'ES')
    expect(resultado).toHaveProperty('lancamentos')
    expect(resultado).toHaveProperty('dicEntries')
    expect(resultado).toHaveProperty('avisos')
    expect(resultado.avisos).toHaveLength(0)
  })

  it('retorna aviso quando há linhasIgnoradas no CSV', () => {
    vi.mocked(detectar).mockReturnValue({
      aceita: () => true,
      parsear: vi.fn(() => ({ lancamentos: lancamentosMock, linhasIgnoradas: 3 })),
    })
    const resultado = produzirLancamentos('csv', [], 'ES')
    expect(resultado.avisos).toHaveLength(1)
    expect(resultado.avisos[0]).toMatch(/3/)
  })

  it('retorna as dicEntries passadas (passthrough — item 16 do TODO)', () => {
    const entradas: DicEntry[] = [
      { chave: 'mercado', fonte: 'Nubank', natureza: 'Alimentação', descricao: '', iniciais: 'ES', vezes: 1, ambiguo: false },
    ]
    const resultado = produzirLancamentos('csv', entradas, 'ES')
    expect(resultado.dicEntries).toEqual(entradas)
  })

  it('repassa as dicEntries recebidas a enriquecerLancamento (item 16 do TODO)', () => {
    const entradas: DicEntry[] = [
      { chave: 'Mercado', fonte: 'Nubank', natureza: 'SM', descricao: 'Supermercado', iniciais: 'JS', vezes: 1, ambiguo: false },
    ]
    produzirLancamentos('csv', entradas, 'ES')
    expect(enriquecerLancamento).toHaveBeenCalledWith(expect.anything(), entradas, 'ES')
  })

  it('não chama lerDicionario — a leitura do dicionário acontece no upload, não no pipeline', () => {
    produzirLancamentos('csv', [], 'ES')
    expect(lerDicionario).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 7–12. produzirLancamentos — flags de detecção com precedência
// ---------------------------------------------------------------------------

describe('produzirLancamentos — flags de detecção', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(lerDicionario).mockReturnValue([])
  })

  function mockParsear(transcricao: string, valor = -100): void {
    vi.mocked(detectar).mockReturnValue({
      aceita: () => true,
      parsear: vi.fn(() => ({
        lancamentos: [
          {
            fonte: 'Nubank',
            data: '2025-01-01',
            transcricao,
            valor,
            iniciais: '',
            natureza: '',
            descricao: '',
          },
        ] satisfies Lancamento[],
        linhasIgnoradas: 0,
      })),
    })
  }

  it('lançamento comum recebe investimento=null', () => {
    mockParsear('Mercado')
    const { lancamentos } = produzirLancamentos('csv', [], 'ES')
    expect(lancamentos[0].investimento).toBe(null)
  })

  it('lançamento comum recebe transferenciaInterna=false', () => {
    mockParsear('Mercado')
    const { lancamentos } = produzirLancamentos('csv', [], 'ES')
    expect(lancamentos[0].transferenciaInterna).toBe(false)
  })

  it('transcrição com APLICACAO gera investimento="aplicacao"', () => {
    mockParsear('APLICACAO RDB', -1000)
    const { lancamentos } = produzirLancamentos('csv', [], 'ES')
    expect(lancamentos[0].investimento).toBe('aplicacao')
  })

  it('transcrição com RESGATE gera investimento="resgate"', () => {
    mockParsear('RESGATE CDB', 2000)
    const { lancamentos } = produzirLancamentos('csv', [], 'ES')
    expect(lancamentos[0].investimento).toBe('resgate')
  })

  it('transcrição com Open Banking gera transferenciaInterna=true e investimento=null', () => {
    mockParsear('Open Banking transferencia')
    const { lancamentos } = produzirLancamentos('csv', [], 'ES')
    expect(lancamentos[0].transferenciaInterna).toBe(true)
    expect(lancamentos[0].investimento).toBe(null)
  })

  it('regra de precedência: APLICACAO + Open Banking → investimento vence, transferenciaInterna=false', () => {
    mockParsear('APLICACAO Open Banking', -500)
    const { lancamentos } = produzirLancamentos('csv', [], 'ES')
    expect(lancamentos[0].investimento).toBe('aplicacao')
    expect(lancamentos[0].transferenciaInterna).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 13–15. gerarAPartirDosRevisados — aprenderDicionario + injeção no gerarXlsx
// ---------------------------------------------------------------------------

describe('gerarAPartirDosRevisados', () => {
  const modeloBytes = new Uint8Array([0])
  const lancamentosRevisados: Lancamento[] = [
    {
      fonte: 'Nubank',
      data: '2025-03-15',
      transcricao: 'Supermercado',
      valor: -150,
      iniciais: 'ES',
      natureza: 'Alimentação',
      descricao: '',
    },
  ]
  const dicAnterior: DicEntry[] = [
    { chave: 'supermercado', fonte: 'Nubank', natureza: 'Alimentação', descricao: '', iniciais: 'ES', vezes: 1, ambiguo: false },
  ]
  const dicEnriquecido: DicEntry[] = [
    { chave: 'supermercado', fonte: 'Nubank', natureza: 'Alimentação', descricao: '', iniciais: 'ES', vezes: 2, ambiguo: false },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(aprenderDicionario).mockReturnValue(dicEnriquecido)
  })

  it('chama aprenderDicionario com os lançamentos revisados e o dicionário anterior', () => {
    gerarAPartirDosRevisados(modeloBytes, 'ES', lancamentosRevisados, dicAnterior, '2025-03')
    expect(aprenderDicionario).toHaveBeenCalledOnce()
    expect(aprenderDicionario).toHaveBeenCalledWith(lancamentosRevisados, dicAnterior)
  })

  it('injeta o dicionário enriquecido (retorno de aprenderDicionario) no 4º arg de gerarXlsx', () => {
    gerarAPartirDosRevisados(modeloBytes, 'ES', lancamentosRevisados, dicAnterior, '2025-03')
    expect(gerarXlsx).toHaveBeenCalledOnce()
    const [, , , dicArg] = vi.mocked(gerarXlsx).mock.calls[0] as [unknown, unknown, unknown, DicEntry[]]
    expect(dicArg).toEqual(dicEnriquecido)
  })

  it('retorna os bytes gerados por gerarXlsx', () => {
    const resultado = gerarAPartirDosRevisados(modeloBytes, 'ES', lancamentosRevisados, dicAnterior, '2025-03')
    expect(resultado).toBeInstanceOf(Uint8Array)
  })
})

// ---------------------------------------------------------------------------
// 16–18. executarPipeline (fachada) — comportamento de orquestração
// ---------------------------------------------------------------------------

describe('executarPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(detectar).mockReturnValue({
      aceita: () => true,
      parsear: vi.fn(() => ({ lancamentos: lancamentosMock, linhasIgnoradas: 0 })),
    })
    vi.mocked(lerDicionario).mockReturnValue([])
    vi.mocked(aprenderDicionario).mockImplementation((_l, dic) => dic)
  })

  it('chama onDownload com Blob e nome AAAA-MM-INICIAIS.xlsx', async () => {
    const onDownload = vi.fn()
    const onAviso = vi.fn()

    await executarPipeline(
      'Data,Valor,Identificador,Descrição\n',
      null,
      new Uint8Array([0]),
      'ES',
      onDownload,
      onAviso,
    )

    expect(onDownload).toHaveBeenCalledOnce()
    const [blob, nome] = onDownload.mock.calls[0] as [Blob, string]
    expect(blob).toBeInstanceOf(Blob)
    expect(nome).toMatch(/^\d{4}-\d{2}-ES\.xlsx$/)
  })

  it('chama onAviso com contagem numérica quando há linhas ignoradas no CSV', async () => {
    vi.mocked(detectar).mockReturnValue({
      aceita: () => true,
      parsear: vi.fn(() => ({ lancamentos: lancamentosMock, linhasIgnoradas: 3 })),
    })

    const onDownload = vi.fn()
    const onAviso = vi.fn()

    await executarPipeline(
      'Data,Valor,Identificador,Descrição\n',
      null,
      new Uint8Array([0]),
      'ES',
      onDownload,
      onAviso,
    )

    expect(onAviso).toHaveBeenCalled()
    const msg: string = onAviso.mock.calls[0][0]
    expect(msg).toMatch(/3/)
  })

  it('chama onAviso quando dicionário inválido — pipeline continua e onDownload é chamado', async () => {
    vi.mocked(lerDicionario).mockImplementation((_bytes, onAvisoCb) => {
      onAvisoCb?.('arquivo .xlsx inválido')
      return []
    })

    const onDownload = vi.fn()
    const onAviso = vi.fn()

    await executarPipeline(
      'Data,Valor,Identificador,Descrição\n',
      new Uint8Array([0]),
      new Uint8Array([0]),
      'ES',
      onDownload,
      onAviso,
    )

    expect(onAviso).toHaveBeenCalled()
    expect(onDownload).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// 19–24. executarPipeline — flags de detecção (via fachada, para regressão)
// ---------------------------------------------------------------------------

describe('executarPipeline — flags de detecção', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(lerDicionario).mockReturnValue([])
    vi.mocked(aprenderDicionario).mockImplementation((_l, dic) => dic)
  })

  function mockParsear(transcricao: string, valor = -100): void {
    vi.mocked(detectar).mockReturnValue({
      aceita: () => true,
      parsear: vi.fn(() => ({
        lancamentos: [
          {
            fonte: 'Nubank',
            data: '2025-01-01',
            transcricao,
            valor,
            iniciais: '',
            natureza: '',
            descricao: '',
          },
        ] satisfies Lancamento[],
        linhasIgnoradas: 0,
      })),
    })
  }

  async function rodarPipeline(): Promise<Lancamento[]> {
    await executarPipeline('', null, new Uint8Array([0]), 'ES', vi.fn(), vi.fn())
    return vi.mocked(gerarXlsx).mock.calls[0][2] as Lancamento[]
  }

  it('lançamento comum recebe investimento=null (TL-1)', async () => {
    mockParsear('Mercado')
    const lancamentos = await rodarPipeline()
    expect(lancamentos[0].investimento).toBe(null)
  })

  it('lançamento comum recebe transferenciaInterna=false (TL-2)', async () => {
    mockParsear('Mercado')
    const lancamentos = await rodarPipeline()
    expect(lancamentos[0].transferenciaInterna).toBe(false)
  })

  it('transcrição com APLICACAO gera investimento="aplicacao" (TL-3)', async () => {
    mockParsear('APLICACAO RDB', -1000)
    const lancamentos = await rodarPipeline()
    expect(lancamentos[0].investimento).toBe('aplicacao')
  })

  it('transcrição com RESGATE gera investimento="resgate" (TL-4)', async () => {
    mockParsear('RESGATE CDB', 2000)
    const lancamentos = await rodarPipeline()
    expect(lancamentos[0].investimento).toBe('resgate')
  })

  it('transcrição com Open Banking gera transferenciaInterna=true e investimento=null (TL-5)', async () => {
    mockParsear('Open Banking transferencia')
    const lancamentos = await rodarPipeline()
    expect(lancamentos[0].transferenciaInterna).toBe(true)
    expect(lancamentos[0].investimento).toBe(null)
  })

  it('regra de precedência: APLICACAO + Open Banking → investimento vence, transferenciaInterna=false (TL-6)', async () => {
    mockParsear('APLICACAO Open Banking', -500)
    const lancamentos = await rodarPipeline()
    expect(lancamentos[0].investimento).toBe('aplicacao')
    expect(lancamentos[0].transferenciaInterna).toBe(false)
  })
})
