// ADR: see Docs/specs/mvp-vertical-nubank.adr.md

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computarNomeArquivo, executarPipeline, produzirLancamentos, gerarAPartirDosRevisados } from '../PipelineState'
import type { Lancamento, DicEntry, Aviso } from '../../types'

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

// Mocks das funções de detecção (T3) — Task 5 nunca depende da implementação real,
// apenas do contrato (Aviso[]). Garante o paralelismo T4‖T5 (T3 já mergeada, mas o
// mock isola a Task 5 de qualquer mudança futura em deteccoes.ts).
vi.mock('../../dominio/deteccoes', () => ({
  detectarValorPendente: vi.fn(() => []),
  detectarPagamentoRecebido: vi.fn(() => []),
  detectarConciliacao: vi.fn(() => []),
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
import { detectarValorPendente, detectarPagamentoRecebido, detectarConciliacao } from '../../dominio/deteccoes'

// ---------------------------------------------------------------------------
// Nota: os testes dos grupos `estadoInicial` e `reduzir — *` foram removidos
// numa migração anterior (spec mvp-vertical-nubank). O reducer paralelo
// (`reduzir`/`Estado`/`Acao`/`estadoInicial`) em si — código morto desde que
// o estado de UI migrou para o store Zustand — foi deletado de
// PipelineState.ts na Task T10 da spec fundacao-operacoes.
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

  // Regressão (2026-08-04): o nome saía com o mês do PRIMEIRO lançamento, não o
  // mês de referência. Numa fatura (compras do mês anterior) isso dava M-1:
  // ref 2026-07 gerava "2026-06-ES.xlsx". O mês de referência é a autoridade.
  it('TLNOME-1: usa o mês de REFERÊNCIA, não a data do primeiro lançamento', () => {
    const lancamentos: Lancamento[] = [
      // fatura: compras de junho, mas o mês de referência é julho
      { fonte: 'fatura_nubank_cc', data: '2026-06-15', transcricao: 'A', valor: -10, iniciais: '', natureza: '', descricao: '' },
      { fonte: 'fatura_nubank_cc', data: '2026-06-20', transcricao: 'B', valor: -20, iniciais: '', natureza: '', descricao: '' },
    ]
    expect(computarNomeArquivo(lancamentos, 'ES', '2026-07')).toBe('2026-07-ES.xlsx')
  })

  it('TLNOME-2: com mês de referência, nomeia mesmo sem lançamentos', () => {
    expect(computarNomeArquivo([], 'ES', '2026-07')).toBe('2026-07-ES.xlsx')
  })

  it('TLNOME-3: sem mês de referência, mantém o fallback pela data (compatibilidade)', () => {
    const lancamentos: Lancamento[] = [
      { fonte: 'Nubank', data: '2025-03-15', transcricao: 'A', valor: -10, iniciais: '', natureza: '', descricao: '' },
    ]
    expect(computarNomeArquivo(lancamentos, 'ES', '')).toBe('2025-03-ES.xlsx')
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


// ---------------------------------------------------------------------------
// T5 — produzirLancamentos converte excluidosPendentes em Aviso[] via detecções
// e despacha ao slice por callback injetado (mocks de T3 + T4, garantia do
// paralelismo T4‖T5 — ver Task 5 do spec avisos-acionaveis).
// ---------------------------------------------------------------------------

describe('produzirLancamentos — avisos acionáveis (T5)', () => {
  const excluidosPendentesMock: Lancamento[] = [
    {
      fonte: 'fatura_nubank_cc',
      data: '2025-01-01',
      transcricao: 'Valor pendente do mês anterior',
      valor: 120,
      iniciais: '',
      natureza: '',
      descricao: '',
    },
  ]

  const avisoConciliacaoMock: Aviso = {
    id: 'conciliacao-0',
    tipo: 'proposta',
    origem: 'conciliacao',
    mensagem: 'Fatura conciliada: mock',
    alvo: ['0'],
    permanece: [],
    estado: 'pendente',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(lerDicionario).mockReturnValue([])
    vi.mocked(detectar).mockReturnValue({
      aceita: () => true,
      parsear: vi.fn(() => ({
        lancamentos: lancamentosMock,
        linhasIgnoradas: 0,
        excluidosPendentes: excluidosPendentesMock,
      })),
    })
    vi.mocked(detectarValorPendente).mockReturnValue([])
    vi.mocked(detectarPagamentoRecebido).mockReturnValue([])
    vi.mocked(detectarConciliacao).mockReturnValue([])
  })

  // T11 (correção de bug multi-arquivo achado na validação visual): `detectarValorPendente`/
  // `detectarPagamentoRecebido` deixaram de rodar dentro de `produzirLancamentos` — esta
  // função processa a sublista per-arquivo, então o `alvo` gerado seria relativo a ela, nunca
  // ao array total (`todosLancamentos`/`state.lancamentos`); o call-site real
  // (`App.tsx`/`handleProduzir`) passou a chamá-las sobre o total já concatenado, onde
  // `alvo` já nasce como índice real. Ver `src/__tests__/App.valorPendenteOffset.test.tsx`
  // para a cobertura de regressão do bug de offset.
  it('NÃO chama detectarValorPendente/detectarPagamentoRecebido (rewire T11 — call-site real é App.tsx)', () => {
    produzirLancamentos('csv', [], 'ES')
    expect(detectarValorPendente).not.toHaveBeenCalled()
    expect(detectarPagamentoRecebido).not.toHaveBeenCalled()
  })

  it('chama detectarConciliacao com lancamentosComFlags e lancamentosExtrato quando lancamentosExtrato não está vazio', () => {
    const lancamentosExtrato: Lancamento[] = [
      { fonte: 'extrato', data: '2025-01-02', transcricao: 'Pagamento de fatura', valor: -150, iniciais: '', natureza: '', descricao: '' },
    ]
    produzirLancamentos('csv', [], 'ES', lancamentosExtrato)
    expect(detectarConciliacao).toHaveBeenCalledOnce()
    const [fatura, extrato] = vi.mocked(detectarConciliacao).mock.calls[0]
    expect(fatura).toHaveLength(lancamentosMock.length)
    expect(extrato).toEqual(lancamentosExtrato)
  })

  it('não chama detectarConciliacao quando lancamentosExtrato não é fornecido (default vazio)', () => {
    produzirLancamentos('csv', [], 'ES')
    expect(detectarConciliacao).not.toHaveBeenCalled()
  })

  // Rewire T11: só `detectarConciliacao` é despachada por `produzirLancamentos` agora
  // (valor-pendente/pagamento-recebido saíram — ver teste acima).
  it('despacha adicionarAvisos com o array de avisos de detectarConciliacao (T11)', () => {
    vi.mocked(detectarConciliacao).mockReturnValue([avisoConciliacaoMock])
    const adicionarAvisos = vi.fn()
    const lancamentosExtrato: Lancamento[] = [
      { fonte: 'extrato', data: '2025-01-02', transcricao: 'Pagamento de fatura', valor: -150, iniciais: '', natureza: '', descricao: '' },
    ]

    produzirLancamentos('csv', [], 'ES', lancamentosExtrato, adicionarAvisos)

    expect(adicionarAvisos).toHaveBeenCalledWith([avisoConciliacaoMock])
  })

  it('despacha adicionarAvisos com array vazio quando nenhuma detecção retorna avisos', () => {
    const adicionarAvisos = vi.fn()
    produzirLancamentos('csv', [], 'ES', [], adicionarAvisos)
    expect(adicionarAvisos).toHaveBeenCalledWith([])
  })

  it('inclui um Aviso informativo dispensável de "linhas ignoradas" no despacho quando há linhasIgnoradas (T9, D18)', () => {
    vi.mocked(detectar).mockReturnValue({
      aceita: () => true,
      parsear: vi.fn(() => ({
        lancamentos: lancamentosMock,
        linhasIgnoradas: 2,
        excluidosPendentes: [],
      })),
    })
    const adicionarAvisos = vi.fn()
    produzirLancamentos('csv', [], 'ES', [], adicionarAvisos)

    const avisosDespachados = vi.mocked(adicionarAvisos).mock.calls[0][0]
    const avisoLinhasIgnoradas = avisosDespachados.find((a) => a.origem === 'linhas-ignoradas')
    expect(avisoLinhasIgnoradas).toMatchObject({
      tipo: 'informativo',
      origem: 'linhas-ignoradas',
      estado: 'pendente',
    })
    expect(avisoLinhasIgnoradas?.mensagem).toMatch(/2 linhas ignoradas/i)
    expect(typeof avisoLinhasIgnoradas?.id).toBe('string')
    expect(avisoLinhasIgnoradas?.id.length).toBeGreaterThan(0)
  })

  it('não lança erro quando adicionarAvisos não é fornecido pelo chamador', () => {
    expect(() => produzirLancamentos('csv', [], 'ES')).not.toThrow()
  })

  it('o parser nunca recebe referência a adicionarAvisos nem ao store — parsear é chamado só com o conteúdo CSV', () => {
    const adicionarAvisos = vi.fn()
    produzirLancamentos('csv', [], 'ES', [], adicionarAvisos)
    const parserRetornado = vi.mocked(detectar).mock.results[0].value as { parsear: (c: string) => unknown }
    expect(parserRetornado.parsear).toHaveBeenCalledWith('csv')
    expect(parserRetornado.parsear).toHaveBeenCalledTimes(1)
  })

  it('continua retornando { lancamentos, dicEntries, avisos } — regressão do contrato existente', () => {
    const resultado = produzirLancamentos('csv', [], 'ES')
    expect(resultado).toHaveProperty('lancamentos')
    expect(resultado).toHaveProperty('dicEntries')
    expect(resultado).toHaveProperty('avisos')
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

