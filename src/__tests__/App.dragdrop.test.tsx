// ADR: see Docs/specs/dicionario-ponta-a-ponta.adr.md

/**
 * Testes do arrastar-e-soltar na tela de importação (item 13 do TODO).
 *
 * O dropzone é um <label> estilizado com input escondido: o drop nativo do
 * navegador se perdeu quando o input deixou de ser visível (redesign ac2000c).
 * Estes testes garantem que soltar arquivos no dropzone roteia pelo mesmo
 * fluxo do input (CSV/TXT → pipeline de parse; .xlsx → detecção de dicionário).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { App } from '../App'
import { useAppStore } from '../ui/store/appStore'

// ---------------------------------------------------------------------------
// Mocks de componentes pesados (mesmo padrão de App.dicionarioUnificado)
// ---------------------------------------------------------------------------

vi.mock('../ui/components/ReviewGrid', () => ({
  ReviewGrid: () => React.createElement('div', { 'data-testid': 'review-grid' }),
  TEMA_ERRO: { bgCell: '#f9e2d6' },
  TEMA_TRANSFERENCIA: { bgCell: '#d5e4f2' },
  TEMA_INVESTIMENTO: { bgCell: '#dcedd3' },
  calcularTemaLinha: vi.fn(),
  calcularSomaSelecionados: vi.fn(() => null),
}))

vi.mock('../ui/components/SplitModal', () => ({
  SplitModal: () => React.createElement('div', { 'data-testid': 'split-modal' }),
}))

vi.mock('../ui/components/AvisoList', () => ({
  AvisoList: () => React.createElement('div', { 'data-testid': 'aviso-list' }),
}))

vi.mock('../ui/PipelineState', () => ({
  produzirLancamentos: vi.fn(() => ({ lancamentos: [], dicEntries: [], avisos: [] })),
  gerarAPartirDosRevisados: vi.fn(() => new Uint8Array([1, 2, 3])),
  computarNomeArquivo: vi.fn(() => 'extrato.xlsx'),
}))

vi.mock('../excel/reader/leitor', () => ({
  lerNaturezas: vi.fn(() => []),
  lerDicionario: vi.fn(() => []),
  ehDicionario: vi.fn(() => false),
  lerIniciais: vi.fn(() => null),
}))

vi.mock('../dominio/mes', async (importOriginal) => {
  const original = await importOriginal<typeof import('../dominio/mes')>()
  return {
    ...original,
    detectarMesSugerido: vi.fn(() => null),
  }
})

// ---------------------------------------------------------------------------
// Imports após mocks
// ---------------------------------------------------------------------------

import { ehDicionario, lerDicionario } from '../excel/reader/leitor'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetarStore(): void {
  useAppStore.setState({
    lancamentos: [],
    iniciais: 'ES',
    nomeUsuario: '',
    naturezasValidas: [],
    dicEntries: [],
    avisos: [],
    historico: [],
    futuro: [],
    csvArquivo: null,
    sujo: false,
  })
}

/** Cria um File sintético com arrayBuffer() e text() funcionais. */
function criarFile(nome: string, conteudo: string | Uint8Array, tipo = 'application/octet-stream'): File {
  const bytes = typeof conteudo === 'string' ? new TextEncoder().encode(conteudo) : conteudo
  const file = new File([bytes], nome, { type: tipo })
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(bytes.buffer),
    writable: true,
  })
  Object.defineProperty(file, 'text', {
    value: () => Promise.resolve(typeof conteudo === 'string' ? conteudo : ''),
    writable: true,
  })
  return file
}

/** Localiza o dropzone (label que envolve o input escondido). */
function acharDropzone(): HTMLElement {
  return screen.getByText('Arraste extratos e faturas aqui').closest('label') as HTMLElement
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('App — arrastar-e-soltar na importação (item 13)', () => {
  beforeEach(() => {
    resetarStore()
    vi.clearAllMocks()
  })

  it('TL13-1: soltar um .csv no dropzone adiciona o arquivo à lista de selecionados', async () => {
    render(<App />)

    const arquivo = criarFile('extrato.csv', 'Data,Valor,Identificador,Descrição\n', 'text/csv')
    await act(async () => {
      fireEvent.drop(acharDropzone(), { dataTransfer: { files: [arquivo] } })
    })

    await waitFor(() => {
      expect(screen.getByText('extrato.csv')).toBeDefined()
    })
  })

  it('TL13-2: soltar um .xlsx no dropzone roteia pela detecção de dicionário', async () => {
    vi.mocked(ehDicionario).mockResolvedValue(true as never)
    vi.mocked(lerDicionario).mockReturnValue([
      { chave: 'Mercado', fonte: 'extrato_nubank', natureza: 'SM', descricao: '', iniciais: 'ES', vezes: 1, ambiguo: false },
    ] as never)

    render(<App />)

    const arquivo = criarFile('dicionario.xlsx', new Uint8Array([0x50, 0x4b]))
    await act(async () => {
      fireEvent.drop(acharDropzone(), { dataTransfer: { files: [arquivo] } })
    })

    await waitFor(() => {
      expect(ehDicionario).toHaveBeenCalled()
      expect(useAppStore.getState().dicEntries).toHaveLength(1)
    })
  })

  it('TL13-3: dragOver no dropzone tem preventDefault (necessário para o drop disparar no navegador)', () => {
    render(<App />)

    const evento = new Event('dragover', { bubbles: true, cancelable: true })
    acharDropzone().dispatchEvent(evento)

    expect(evento.defaultPrevented).toBe(true)
  })
})
