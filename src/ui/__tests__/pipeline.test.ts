// ADR: see spec/mvp-vertical-nubank.adr.md

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { estadoInicial, reduzir, computarNomeArquivo, executarPipeline } from '../PipelineState'
import type { Lancamento } from '../../types'

// ---------------------------------------------------------------------------
// Mocks para executarPipeline (módulos pesados substituídos por stubs)
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

// Importações tipadas das mocks (disponíveis após vi.mock ser processado)
import { detectar } from '../../parsers/index'
import { lerDicionario } from '../../excel/reader/leitor'

// ---------------------------------------------------------------------------
// 1–4. estadoInicial
// ---------------------------------------------------------------------------

describe('estadoInicial', () => {
  it('tem iniciais vazia', () => {
    expect(estadoInicial.iniciais).toBe('')
  })

  it('não tem arquivo CSV (csvPronto=false, csvArquivo=null)', () => {
    expect(estadoInicial.csvPronto).toBe(false)
    expect(estadoInicial.csvArquivo).toBeNull()
  })

  it('não tem dicionário (dicPronto=false, dicArquivo=null)', () => {
    expect(estadoInicial.dicPronto).toBe(false)
    expect(estadoInicial.dicArquivo).toBeNull()
  })

  it('não tem avisos', () => {
    expect(estadoInicial.avisos).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 5–6. SET_INICIAIS
// ---------------------------------------------------------------------------

describe('reduzir — SET_INICIAIS', () => {
  it('atualiza iniciais com valor válido', () => {
    const novo = reduzir(estadoInicial, { tipo: 'SET_INICIAIS', valor: 'ES' })
    expect(novo.iniciais).toBe('ES')
  })

  it('rejeita string vazia — iniciais não muda', () => {
    const comIniciais = { ...estadoInicial, iniciais: 'ES' }
    const novo = reduzir(comIniciais, { tipo: 'SET_INICIAIS', valor: '' })
    expect(novo.iniciais).toBe('ES')
  })
})

// ---------------------------------------------------------------------------
// 7. SET_CSV
// ---------------------------------------------------------------------------

describe('reduzir — SET_CSV', () => {
  it('marca csvPronto=true e armazena o arquivo', () => {
    const file = new File(['Data,Valor,Identificador,Descrição\n'], 'extrato.csv', {
      type: 'text/csv',
    })
    const novo = reduzir(estadoInicial, { tipo: 'SET_CSV', arquivo: file })
    expect(novo.csvPronto).toBe(true)
    expect(novo.csvArquivo).toBe(file)
  })

  it('nome do arquivo visível no estado', () => {
    const file = new File([''], 'meu_extrato_nubank.csv')
    const novo = reduzir(estadoInicial, { tipo: 'SET_CSV', arquivo: file })
    expect(novo.csvArquivo?.name).toBe('meu_extrato_nubank.csv')
  })
})

// ---------------------------------------------------------------------------
// 8. SET_DIC
// ---------------------------------------------------------------------------

describe('reduzir — SET_DIC', () => {
  it('marca dicPronto=true e armazena o arquivo', () => {
    const file = new File([''], 'dicionario.xlsx')
    const novo = reduzir(estadoInicial, { tipo: 'SET_DIC', arquivo: file })
    expect(novo.dicPronto).toBe(true)
    expect(novo.dicArquivo).toBe(file)
  })
})

// ---------------------------------------------------------------------------
// 9–11. computarNomeArquivo
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
// 12–14. ADICIONAR_AVISO / LIMPAR_AVISOS
// ---------------------------------------------------------------------------

describe('reduzir — ADICIONAR_AVISO', () => {
  it('adiciona aviso com contagem numérica ao estado', () => {
    const novo = reduzir(estadoInicial, {
      tipo: 'ADICIONAR_AVISO',
      mensagem: '3 linhas ignoradas no CSV',
    })
    expect(novo.avisos).toHaveLength(1)
    expect(novo.avisos[0]).toMatch(/3/)
  })

  it('acumula múltiplos avisos', () => {
    let estado = reduzir(estadoInicial, { tipo: 'ADICIONAR_AVISO', mensagem: '3 linhas ignoradas' })
    estado = reduzir(estado, { tipo: 'ADICIONAR_AVISO', mensagem: 'Dicionário inválido' })
    expect(estado.avisos).toHaveLength(2)
  })
})

describe('reduzir — LIMPAR_AVISOS', () => {
  it('zera os avisos do estado', () => {
    let estado = reduzir(estadoInicial, { tipo: 'ADICIONAR_AVISO', mensagem: 'aviso qualquer' })
    estado = reduzir(estado, { tipo: 'LIMPAR_AVISOS' })
    expect(estado.avisos).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 15–17. executarPipeline
// ---------------------------------------------------------------------------

describe('executarPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(detectar).mockReturnValue({
      aceita: () => true,
      parsear: vi.fn(() => ({ lancamentos: lancamentosMock, linhasIgnoradas: 0 })),
    })
    vi.mocked(lerDicionario).mockReturnValue([])
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
