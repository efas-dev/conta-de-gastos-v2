// ADR: see spec/fundacao-operacoes.adr.md

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { TelaImportacao } from '../TelaImportacao'
import * as leitor from '../../../excel/reader/leitor'
import type { Aviso, DicEntry, Lancamento, NaturezaRica } from '../../../types'

// ---------------------------------------------------------------------------
// Task T12-bis (spec fundacao-operacoes) — extração comportamento-preservante
// de App.tsx. Prova isolada de TelaImportacao: mocka o store (mesmo padrão de
// ToolbarRevisao.test.tsx/PainelLateral.test.tsx) e as dependências pesadas de
// domínio/pipeline, mantendo reais só os componentes já triviais e testados
// isoladamente (SeletorMesReferencia, Icones).
// ---------------------------------------------------------------------------

interface EstadoMock {
  iniciais: string
  nomeUsuario: string
  dicEntries: DicEntry[]
  naturezasRicas: NaturezaRica[]
  avisosAcionaveis: { avisos: Aviso[]; removidos: Record<string, unknown>; avisoEmInspecao: string | null }
}

let estado: EstadoMock

const {
  setIniciais,
  setNomeUsuario,
  setLancamentos,
  setDic,
  setNaturezasRicas,
  setSaldoAnterior,
  addAviso,
  adicionarAvisos,
  clearAvisos,
  limparAvisos,
  mockSetState,
  mockHandleProduzirPipeline,
} = vi.hoisted(() => ({
  setIniciais: vi.fn(),
  setNomeUsuario: vi.fn(),
  setLancamentos: vi.fn(),
  setDic: vi.fn(),
  setNaturezasRicas: vi.fn(),
  setSaldoAnterior: vi.fn(),
  addAviso: vi.fn(),
  adicionarAvisos: vi.fn(),
  clearAvisos: vi.fn(),
  limparAvisos: vi.fn(),
  mockSetState: vi.fn(),
  mockHandleProduzirPipeline: vi.fn(async () => {}),
}))

function acoes() {
  return {
    setIniciais,
    setNomeUsuario,
    setLancamentos,
    setDic,
    setNaturezasRicas,
    setSaldoAnterior,
    addAviso,
    adicionarAvisos,
    clearAvisos,
    limparAvisos,
  }
}

vi.mock('../../store/appStore', () => {
  const useAppStore = (selector: (s: EstadoMock & ReturnType<typeof acoes>) => unknown) =>
    selector({ ...estado, ...acoes() })
  useAppStore.getState = () => ({ ...estado, ...acoes() })
  useAppStore.setState = mockSetState
  return { useAppStore }
})

vi.mock('../../store/avisosSlice', () => ({
  selecionarContagemPendentes: (s: EstadoMock) =>
    s.avisosAcionaveis.avisos.filter((a) => a.tipo === 'proposta' && a.estado === 'pendente').length,
}))

vi.mock('../../handlersPipeline', () => ({
  lerTextoArquivo: vi.fn(async () => 'conteudo-csv'),
  criarAvisoInformativo: (id: string, origem: string, mensagem: string) => ({
    id,
    tipo: 'informativo',
    origem,
    mensagem,
    alvo: [],
    permanece: [],
    estado: 'pendente',
  }),
  handleProduzir: (...args: unknown[]) => mockHandleProduzirPipeline(...args),
}))

vi.mock('../../../excel/reader/leitor', () => ({
  lerDicionario: vi.fn(() => []),
  ehDicionario: vi.fn(async () => false),
  lerIniciais: vi.fn(async () => null),
  lerSaldoAnterior: vi.fn(() => null),
}))

vi.mock('../../../dominio/mes', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../dominio/mes')>()
  return { ...original, detectarMesSugerido: vi.fn(() => null) }
})

const { mockParsear } = vi.hoisted(() => ({
  mockParsear: vi.fn(() => ({ lancamentos: [] as Lancamento[] })),
}))
vi.mock('../../../parsers/index', () => ({
  detectar: vi.fn(() => ({ parsear: mockParsear })),
}))

// Task T8 (spec fatura-itau-xlsx): registry binário mockado — os testes de
// roteamento controlam o veredito de `aceita` de cada parser binário sem
// depender de nenhum parser binário concreto real (fatura_itau_cc só ganha
// `aceita` na Task T3, já integrada; `parsersBinarios` em si segue vazio até
// uma task futura popular com um parser completo — T4).
const { mockBinarioAceita, mockParsearBinario } = vi.hoisted(() => ({
  mockBinarioAceita: vi.fn(() => false),
  mockParsearBinario: vi.fn((_bytes: Uint8Array, _mesRef?: string) => ({ lancamentos: [] as Lancamento[] })),
}))
vi.mock('../../../parsers/binario', () => ({
  parsersBinarios: [
    {
      aceita: (bytes: Uint8Array) => mockBinarioAceita(bytes),
      parsear: (bytes: Uint8Array, mesRef?: string) => mockParsearBinario(bytes, mesRef),
    },
  ],
}))

vi.mock('../FonteRotulo', () => ({
  FonteRotulo: ({ fonte, tipo }: { fonte: string; tipo: string }) =>
    React.createElement('span', { 'data-testid': 'fonte-rotulo', 'data-fonte': fonte, 'data-tipo': tipo }),
}))
vi.mock('../Cabecalho', () => ({
  Cabecalho: ({ etapa }: { etapa: number }) =>
    React.createElement('div', { 'data-testid': 'cabecalho', 'data-etapa': etapa }),
}))
vi.mock('../PainelLateral', () => ({
  PainelLateral: ({ aba, mesRef }: { aba: string | null; mesRef?: string }) =>
    React.createElement('div', { 'data-testid': 'painel-lateral', 'data-aba': aba, 'data-mesref': mesRef }),
}))
vi.mock('../CartaoDicionario', () => ({
  CartaoDicionario: () => React.createElement('div', { 'data-testid': 'cartao-dicionario' }),
}))
vi.mock('../CartaoBancosSuportados', () => ({
  CartaoBancosSuportados: () => React.createElement('div', { 'data-testid': 'cartao-bancos' }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function props(overrides: Partial<React.ComponentProps<typeof TelaImportacao>> = {}) {
  return {
    mesEscolhido: '2024-03',
    usuarioEditouMes: false,
    onMudarMes: vi.fn(),
    setModeloBytes: vi.fn(),
    painel: null,
    setPainel: vi.fn(),
    ...overrides,
  }
}

function csvFile(nome = 'extrato.csv'): File {
  return new File(['col1,col2'], nome, { type: 'text/csv' })
}

/** Cria um File sintético de .xlsx com arrayBuffer() funcional (jsdom não implementa). */
function xlsxFile(nome = 'dicionario.xlsx', bytes: Uint8Array = new Uint8Array([1, 2, 3])): File {
  const file = new File([bytes], nome, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(bytes.buffer),
    writable: true,
  })
  return file
}

beforeEach(() => {
  estado = {
    iniciais: '',
    nomeUsuario: '',
    dicEntries: [],
    naturezasRicas: [],
    avisosAcionaveis: { avisos: [], removidos: {}, avisoEmInspecao: null },
  }
  vi.clearAllMocks()
  mockParsear.mockReturnValue({ lancamentos: [] })
  mockParsearBinario.mockReturnValue({ lancamentos: [] })
})

describe('TelaImportacao', () => {
  it('renderiza o container tela-importacao e o Cabecalho na etapa 0', () => {
    render(<TelaImportacao {...props()} />)

    expect(screen.getByTestId('tela-importacao')).toBeInTheDocument()
    expect(screen.getByTestId('cabecalho')).toHaveAttribute('data-etapa', '0')
  })

  // Task B13a (spec patches-ui-ux, F2): copy do dropzone declara a liberdade do
  // drag-and-drop em qualquer lugar da tela e a aceitação de .xlsx do mês anterior.
  it('dropzone exibe a copy "ou solte em qualquer lugar da tela · CSV, TXT ou .xlsx do mês anterior · vários de uma vez" (Task B13a)', () => {
    render(<TelaImportacao {...props()} />)

    expect(
      screen.getByText('ou solte em qualquer lugar da tela · CSV, TXT ou .xlsx do mês anterior · vários de uma vez'),
    ).toBeInTheDocument()
  })

  it('CTA "Produzir revisão" fica desabilitado sem iniciais e sem arquivos', () => {
    render(<TelaImportacao {...props()} />)

    expect(screen.getByText('Produzir revisão').closest('button')).toBeDisabled()
  })

  it('digitar em "Suas iniciais" chama setIniciais com o valor em maiúsculas/sem espaços', () => {
    render(<TelaImportacao {...props()} />)

    fireEvent.change(screen.getByPlaceholderText('Ex.: ES'), { target: { value: ' es ' } })

    expect(setIniciais).toHaveBeenCalledWith('ES')
  })

  it('digitar em "Seu nome" chama setNomeUsuario com o valor bruto', () => {
    render(<TelaImportacao {...props()} />)

    fireEvent.change(screen.getByPlaceholderText('Ex.: Eduardo'), { target: { value: 'Eduardo' } })

    expect(setNomeUsuario).toHaveBeenCalledWith('Eduardo')
  })

  it('selecionar um .csv exibe o arquivo na lista e habilita o CTA quando há iniciais', async () => {
    estado.iniciais = 'ES'
    const { container } = render(<TelaImportacao {...props()} />)

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [csvFile('nubank.csv')] } })
    })

    await waitFor(() => expect(screen.getByText('nubank.csv')).toBeInTheDocument())
    expect(screen.getByText('Produzir revisão').closest('button')).not.toBeDisabled()
  })

  it('clicar em "Remover" tira o arquivo da lista', async () => {
    estado.iniciais = 'ES'
    const { container } = render(<TelaImportacao {...props()} />)

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [csvFile('nubank.csv')] } })
    })
    await waitFor(() => expect(screen.getByText('nubank.csv')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Remover'))

    expect(screen.queryByText('nubank.csv')).not.toBeInTheDocument()
  })

  it('arrastar arquivo sobre a tela exibe o overlay de drop e soltar o esconde', () => {
    render(<TelaImportacao {...props()} />)

    const tela = screen.getByTestId('tela-importacao')
    expect(tela).toHaveAttribute('data-arrastando', 'false')

    fireEvent.dragEnter(tela)
    expect(tela).toHaveAttribute('data-arrastando', 'true')
    expect(screen.getByText('Solte os arquivos aqui')).toBeInTheDocument()

    fireEvent.dragLeave(tela)
    expect(tela).toHaveAttribute('data-arrastando', 'false')
  })

  it('botão "Sugestões" não aparece quando avisosAcionaveis.avisos está vazio', () => {
    render(<TelaImportacao {...props()} />)

    expect(screen.queryByText('Sugestões')).not.toBeInTheDocument()
  })

  it('botão "Sugestões" aparece com badge de pendentes e alterna o painel ao clicar', () => {
    estado.avisosAcionaveis = {
      avisos: [
        {
          id: 'a1',
          tipo: 'proposta',
          origem: 'valor-pendente',
          mensagem: 'msg',
          alvo: ['0'],
          permanece: [],
          estado: 'pendente',
        },
      ],
      removidos: {},
      avisoEmInspecao: null,
    }
    const setPainel = vi.fn()
    render(<TelaImportacao {...props({ setPainel })} />)

    const botao = screen.getByText('Sugestões').closest('button')!
    expect(botao.textContent).toContain('1')

    fireEvent.click(botao)
    expect(setPainel).toHaveBeenCalledTimes(1)
    // Confirma que o updater alterna 'avisos' <-> null, aplicado sobre o valor atual (null)
    const updater = setPainel.mock.calls[0][0] as (atual: string | null) => string | null
    expect(updater(null)).toBe('avisos')
    expect(updater('avisos')).toBe(null)
  })

  it('PainelLateral só é renderizado quando painel !== null', () => {
    const { rerender } = render(<TelaImportacao {...props({ painel: null })} />)
    expect(screen.queryByTestId('painel-lateral')).not.toBeInTheDocument()

    rerender(<TelaImportacao {...props({ painel: 'naturezas' })} />)
    expect(screen.getByTestId('painel-lateral')).toBeInTheDocument()
  })

  // Task B13b (spec patches-ui-ux, F14): PainelLateral passa a receber o mês de
  // referência escolhido na tela de importação.
  it('PainelLateral recebe mesRef igual a mesEscolhido (Task B13b)', () => {
    render(<TelaImportacao {...props({ painel: 'naturezas', mesEscolhido: '2024-05' })} />)

    expect(screen.getByTestId('painel-lateral')).toHaveAttribute('data-mesref', '2024-05')
  })

  // Task B13b (spec patches-ui-ux, F14): o overlay fixo do PainelLateral passa a
  // ficar abaixo do cabeçalho (top: 61, em vez de top: 0) com box-shadow, em vez
  // de encostar no topo da tela.
  it('overlay fixo do PainelLateral fica abaixo do cabeçalho com box-shadow (Task B13b)', () => {
    render(<TelaImportacao {...props({ painel: 'naturezas' })} />)

    const overlay = screen.getByTestId('painel-lateral').parentElement as HTMLElement
    expect(overlay.style.position).toBe('fixed')
    expect(overlay.style.top).toBe('61px')
    expect(overlay.style.boxShadow).toBe('-14px 0 34px -20px rgba(44,42,38,.4)')
  })

  // Task T14 (spec fundacao-operacoes): cutover do registry — o wrapper local
  // handleProduzir passa a repassar `limparAvisos` (ação do avisosSlice, política D8)
  // como dependência de `handleProduzirPipeline`, junto das demais já cobertas.
  it('clicar em "Produzir revisão" chama handleProduzirPipeline com limparAvisos do store (T14)', async () => {
    estado.iniciais = 'ES'
    const { container } = render(<TelaImportacao {...props()} />)

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [csvFile('nubank.csv')] } })
    })
    await waitFor(() => expect(screen.getByText('nubank.csv')).toBeInTheDocument())

    await act(async () => {
      fireEvent.click(screen.getByText('Produzir revisão'))
    })

    expect(mockHandleProduzirPipeline).toHaveBeenCalledTimes(1)
    const deps = mockHandleProduzirPipeline.mock.calls[0][0] as { limparAvisos: unknown }
    expect(deps.limparAvisos).toBe(limparAvisos)
  })

  // Task 7 (spec conciliacao-robusta, D1 do ADR): FonteRotulo passa a refletir a
  // classificação autoritativa por prefixo (classificarFontePorPrefixo), não mais a
  // heurística por data (classificarFonte) — o rótulo fica correto independente de
  // mesEscolhido.
  it('rótulo de fonte "fatura_*" mostra "fatura" mesmo com mesEscolhido desalinhado (Task 7)', async () => {
    estado.iniciais = 'ES'
    mockParsear.mockReturnValue({
      lancamentos: [
        { id: '1', data: '2024-03-10', fonte: 'fatura_nubank_cc' } as Lancamento,
      ],
    })
    // mesEscolhido igual ao mês da própria fatura (não anterior) — sob a heurística antiga
    // (classificarFonte) essa fonte seria classificada 'extrato' por falta de data anterior.
    const { container } = render(<TelaImportacao {...props({ mesEscolhido: '2024-03' })} />)

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [csvFile('fatura.csv')] } })
    })

    await waitFor(() => expect(screen.getByTestId('fonte-rotulo')).toBeInTheDocument())
    expect(screen.getByTestId('fonte-rotulo')).toHaveAttribute('data-tipo', 'fatura')
  })

  it('rótulo de fonte "extrato_*" mostra "extrato" independente de mesEscolhido (Task 7)', async () => {
    estado.iniciais = 'ES'
    mockParsear.mockReturnValue({
      lancamentos: [
        { id: '1', data: '2024-01-05', fonte: 'extrato_itau' } as Lancamento,
      ],
    })
    // mesEscolhido posterior a qualquer data da fonte — heurística antiga também classificaria
    // 'extrato' aqui, então o cenário relevante da Task 7 é o da fatura acima; este confirma
    // que a fonte extrato_* não regride com a troca de classificador.
    const { container } = render(<TelaImportacao {...props({ mesEscolhido: '2024-03' })} />)

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [csvFile('extrato.csv')] } })
    })

    await waitFor(() => expect(screen.getByTestId('fonte-rotulo')).toBeInTheDocument())
    expect(screen.getByTestId('fonte-rotulo')).toHaveAttribute('data-tipo', 'extrato')
  })

  // Task 4 (spec rendimentos), item 1: wiring do upload chama lerSaldoAnterior/setSaldoAnterior,
  // mesmo padrão já usado para lerIniciais/setIniciais no mesmo handler.
  it('TL4-WIRE-01: upload de .xlsx reconhecido como dicionário com B5 lida chama setSaldoAnterior com o valor', async () => {
    vi.mocked(leitor.ehDicionario).mockResolvedValueOnce(true)
    vi.mocked(leitor.lerSaldoAnterior).mockReturnValueOnce(1234.56)
    const { container } = render(<TelaImportacao {...props()} />)

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [xlsxFile()] } })
    })

    await waitFor(() => expect(setSaldoAnterior).toHaveBeenCalledWith(1234.56))
  })

  it('TL4-WIRE-02: upload de .xlsx reconhecido como dicionário sem B5 (lerSaldoAnterior retorna null) não chama setSaldoAnterior', async () => {
    vi.mocked(leitor.ehDicionario).mockResolvedValueOnce(true)
    vi.mocked(leitor.lerSaldoAnterior).mockReturnValueOnce(null)
    const { container } = render(<TelaImportacao {...props()} />)

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [xlsxFile()] } })
    })

    await waitFor(() => expect(setDic).toHaveBeenCalled())
    expect(setSaldoAnterior).not.toHaveBeenCalled()
  })

  it('TL4-WIRE-03: upload de .xlsx NÃO reconhecido como dicionário não chama lerSaldoAnterior nem setSaldoAnterior', async () => {
    vi.mocked(leitor.ehDicionario).mockResolvedValueOnce(false)
    const { container } = render(<TelaImportacao {...props()} />)

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [xlsxFile()] } })
    })

    await waitFor(() => expect(addAviso).toHaveBeenCalled())
    expect(leitor.lerSaldoAnterior).not.toHaveBeenCalled()
    expect(setSaldoAnterior).not.toHaveBeenCalled()
  })

  // Task T8 (spec fatura-itau-xlsx): roteamento no upload — dicionário → registry
  // binário → não reconhecido. Três desfechos exigidos pela Definition of done.
  describe('roteamento de .xlsx (Task T8)', () => {
    it('dicionário aceita: segue o fluxo de dicionário existente e não consulta o registry binário para emitir o aviso de não reconhecido', async () => {
      vi.mocked(leitor.ehDicionario).mockResolvedValueOnce(true)
      const { container } = render(<TelaImportacao {...props()} />)

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      await act(async () => {
        fireEvent.change(input, { target: { files: [xlsxFile()] } })
      })

      await waitFor(() => expect(setDic).toHaveBeenCalled())
      expect(addAviso).not.toHaveBeenCalledWith(expect.stringContaining('não reconhecido'))
    })

    it('registry binário aceita: não emite o aviso xlsx-nao-reconhecido', async () => {
      vi.mocked(leitor.ehDicionario).mockResolvedValueOnce(false)
      mockBinarioAceita.mockReturnValueOnce(true)
      const { container } = render(<TelaImportacao {...props()} />)

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      await act(async () => {
        fireEvent.change(input, { target: { files: [xlsxFile('fatura_itau.xlsx')] } })
      })

      await waitFor(() => expect(mockBinarioAceita).toHaveBeenCalled())
      expect(adicionarAvisos).not.toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ origem: 'xlsx-nao-reconhecido' })]),
      )
    })

    it('registry binário aceita: não aciona o caminho de dicionário (setDic/lerIniciais/lerSaldoAnterior não chamados)', async () => {
      vi.mocked(leitor.ehDicionario).mockResolvedValueOnce(false)
      mockBinarioAceita.mockReturnValueOnce(true)
      const { container } = render(<TelaImportacao {...props()} />)

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      await act(async () => {
        fireEvent.change(input, { target: { files: [xlsxFile('fatura_itau.xlsx')] } })
      })

      await waitFor(() => expect(mockBinarioAceita).toHaveBeenCalled())
      expect(setDic).not.toHaveBeenCalled()
      expect(leitor.lerIniciais).not.toHaveBeenCalled()
      expect(leitor.lerSaldoAnterior).not.toHaveBeenCalled()
    })

    it('nenhum aceita: mantém o aviso xlsx-nao-reconhecido já existente, mesmo consultando o registry binário', async () => {
      vi.mocked(leitor.ehDicionario).mockResolvedValueOnce(false)
      mockBinarioAceita.mockReturnValueOnce(false)
      const { container } = render(<TelaImportacao {...props()} />)

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      await act(async () => {
        fireEvent.change(input, { target: { files: [xlsxFile('desconhecido.xlsx')] } })
      })

      await waitFor(() => expect(mockBinarioAceita).toHaveBeenCalled())
      expect(addAviso).toHaveBeenCalledWith(
        expect.stringContaining('desconhecido.xlsx: arquivo .xlsx não reconhecido como dicionário, ignorado'),
      )
      expect(adicionarAvisos).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ origem: 'xlsx-nao-reconhecido' })]),
      )
    })
  })

  // Task T9 (spec fatura-itau-xlsx): fatura .xlsx como arquivo de primeira classe — mesma lista
  // visual dos extratos (card + Remover), habilitando "Produzir revisão" sozinha (Decisão 6 do
  // ADR). Reaproveita o mock de `parsersBinarios` já estabelecido pela Task T8.
  describe('fatura .xlsx como arquivo de primeira classe (Task T9)', () => {
    it('fatura reconhecida pelo registry binário aparece na lista com nome do arquivo e botão Remover', async () => {
      estado.iniciais = 'ES'
      vi.mocked(leitor.ehDicionario).mockResolvedValue(false)
      mockBinarioAceita.mockReturnValue(true)
      const { container } = render(<TelaImportacao {...props()} />)

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      await act(async () => {
        fireEvent.change(input, { target: { files: [xlsxFile('fatura_itau.xlsx')] } })
      })

      await waitFor(() => expect(screen.getByText('fatura_itau.xlsx')).toBeInTheDocument())
      expect(screen.getByText('Remover')).toBeInTheDocument()
    })

    it('fatura sozinha (sem nenhum CSV/TXT) habilita "Produzir revisão" quando há iniciais', async () => {
      estado.iniciais = 'ES'
      vi.mocked(leitor.ehDicionario).mockResolvedValue(false)
      mockBinarioAceita.mockReturnValue(true)
      const { container } = render(<TelaImportacao {...props()} />)

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      await act(async () => {
        fireEvent.change(input, { target: { files: [xlsxFile('fatura_itau.xlsx')] } })
      })

      await waitFor(() => expect(screen.getByText('fatura_itau.xlsx')).toBeInTheDocument())
      expect(screen.getByText('Produzir revisão').closest('button')).not.toBeDisabled()
    })

    it('clicar em "Remover" no card da fatura tira-a da lista', async () => {
      estado.iniciais = 'ES'
      vi.mocked(leitor.ehDicionario).mockResolvedValue(false)
      mockBinarioAceita.mockReturnValue(true)
      const { container } = render(<TelaImportacao {...props()} />)

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      await act(async () => {
        fireEvent.change(input, { target: { files: [xlsxFile('fatura_itau.xlsx')] } })
      })
      await waitFor(() => expect(screen.getByText('fatura_itau.xlsx')).toBeInTheDocument())

      fireEvent.click(screen.getByText('Remover'))

      expect(screen.queryByText('fatura_itau.xlsx')).not.toBeInTheDocument()
    })

    it('chama parsear do parser binário aceito com mesEscolhido como segundo argumento (wiring do mês de referência)', async () => {
      estado.iniciais = 'ES'
      vi.mocked(leitor.ehDicionario).mockResolvedValue(false)
      mockBinarioAceita.mockReturnValue(true)
      const { container } = render(<TelaImportacao {...props({ mesEscolhido: '2026-07' })} />)

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      await act(async () => {
        fireEvent.change(input, { target: { files: [xlsxFile('fatura_itau.xlsx')] } })
      })

      await waitFor(() => expect(mockParsearBinario).toHaveBeenCalled())
      expect(mockParsearBinario).toHaveBeenCalledWith(expect.any(Uint8Array), '2026-07')
    })

    it('fatura sozinha, sem nenhum CSV/TXT, não aciona o caminho de dicionário nem emite aviso de não reconhecido', async () => {
      estado.iniciais = 'ES'
      vi.mocked(leitor.ehDicionario).mockResolvedValue(false)
      mockBinarioAceita.mockReturnValue(true)
      const { container } = render(<TelaImportacao {...props()} />)

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      await act(async () => {
        fireEvent.change(input, { target: { files: [xlsxFile('fatura_itau.xlsx')] } })
      })

      await waitFor(() => expect(screen.getByText('fatura_itau.xlsx')).toBeInTheDocument())
      expect(setDic).not.toHaveBeenCalled()
      expect(adicionarAvisos).not.toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ origem: 'xlsx-nao-reconhecido' })]),
      )
    })

    it('extrato CSV + fatura .xlsx no mesmo lote aparecem juntos na lista (regressão da composição existente)', async () => {
      estado.iniciais = 'ES'
      vi.mocked(leitor.ehDicionario).mockResolvedValue(false)
      mockBinarioAceita.mockReturnValue(true)
      const { container } = render(<TelaImportacao {...props()} />)

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      await act(async () => {
        fireEvent.change(input, {
          target: { files: [csvFile('extrato.csv'), xlsxFile('fatura_itau.xlsx')] },
        })
      })

      await waitFor(() => expect(screen.getByText('fatura_itau.xlsx')).toBeInTheDocument())
      expect(screen.getByText('extrato.csv')).toBeInTheDocument()
      expect(screen.getAllByText('Remover')).toHaveLength(2)
    })
  })
})
