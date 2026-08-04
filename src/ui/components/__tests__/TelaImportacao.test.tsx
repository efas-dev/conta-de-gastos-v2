// ADR: see spec/fundacao-operacoes.adr.md

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { TelaImportacao } from '../TelaImportacao'
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
  addAviso,
  adicionarAvisos,
  clearAvisos,
  mockSetState,
  mockHandleProduzirPipeline,
} = vi.hoisted(() => ({
  setIniciais: vi.fn(),
  setNomeUsuario: vi.fn(),
  setLancamentos: vi.fn(),
  setDic: vi.fn(),
  setNaturezasRicas: vi.fn(),
  addAviso: vi.fn(),
  adicionarAvisos: vi.fn(),
  clearAvisos: vi.fn(),
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
    addAviso,
    adicionarAvisos,
    clearAvisos,
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

vi.mock('../FonteRotulo', () => ({
  FonteRotulo: () => React.createElement('span', { 'data-testid': 'fonte-rotulo' }),
}))
vi.mock('../Cabecalho', () => ({
  Cabecalho: ({ etapa }: { etapa: number }) =>
    React.createElement('div', { 'data-testid': 'cabecalho', 'data-etapa': etapa }),
}))
vi.mock('../PainelLateral', () => ({
  PainelLateral: ({ aba }: { aba: string | null }) =>
    React.createElement('div', { 'data-testid': 'painel-lateral', 'data-aba': aba }),
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
})

describe('TelaImportacao', () => {
  it('renderiza o container tela-importacao e o Cabecalho na etapa 0', () => {
    render(<TelaImportacao {...props()} />)

    expect(screen.getByTestId('tela-importacao')).toBeInTheDocument()
    expect(screen.getByTestId('cabecalho')).toHaveAttribute('data-etapa', '0')
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

  it('botão "Avisos" não aparece quando avisosAcionaveis.avisos está vazio', () => {
    render(<TelaImportacao {...props()} />)

    expect(screen.queryByText('Avisos')).not.toBeInTheDocument()
  })

  it('botão "Avisos" aparece com badge de pendentes e alterna o painel ao clicar', () => {
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

    const botao = screen.getByText('Avisos').closest('button')!
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
})
