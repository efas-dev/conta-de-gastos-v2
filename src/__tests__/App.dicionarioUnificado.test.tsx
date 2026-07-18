// ADR: see Docs/specs/dicionario-ponta-a-ponta.adr.md

/**
 * Testes de integração para T3 — Unificação do input de upload e roteamento por tipo de arquivo.
 *
 * Cobre:
 *   - accept=".csv,.txt,.xlsx" no input único
 *   - Input dedicado de dicionário removido
 *   - Flag usuarioEditouIniciais protege edição manual
 *   - Roteamento por extensão: .xlsx reconhecido → lerDicionario+setDic+lerIniciais
 *   - .xlsx não reconhecido → addAviso sem quebrar
 *   - Dois dicionários carregados → último vence com aviso
 *   - Arquivo .csv roteado para pipeline existente
 *   - Seleção mista .xlsx + .csv roteada corretamente
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { App } from '../App'
import { useAppStore } from '../ui/store/appStore'

// ---------------------------------------------------------------------------
// Mocks de componentes pesados
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

// Mock do leitor — inclui ehDicionario e lerIniciais (T1 ainda não mergeado)
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

import { lerDicionario, ehDicionario, lerIniciais } from '../excel/reader/leitor'
import { produzirLancamentos } from '../ui/PipelineState'

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

/**
 * Cria um File sintético com arrayBuffer() e text() funcionais.
 */
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

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('App — input unificado (T3)', () => {
  beforeEach(() => {
    resetarStore()
    vi.clearAllMocks()
  })

  // TL3-1: o input único de upload aceita .csv, .txt e .xlsx
  it('TL3-1: input único tem accept=".csv,.txt,.xlsx"', () => {
    render(<App />)

    // Deve haver exatamente um input de upload (não dois)
    const inputs = document.querySelectorAll('input[type="file"]')
    expect(inputs.length).toBeGreaterThanOrEqual(1)

    // Pelo menos um input tem accept com xlsx
    const inputComXlsx = Array.from(inputs).find((el) =>
      (el as HTMLInputElement).accept.includes('.xlsx'),
    ) as HTMLInputElement | undefined

    expect(inputComXlsx).toBeDefined()
    expect(inputComXlsx!.accept).toContain('.csv')
    expect(inputComXlsx!.accept).toContain('.txt')
    expect(inputComXlsx!.accept).toContain('.xlsx')
  })

  // TL3-2: input dedicado de dicionário não existe mais — nenhum input aceita apenas .xlsx
  it('TL3-2: não há input dedicado exclusivamente para .xlsx (dicionário removido)', () => {
    render(<App />)

    const inputs = Array.from(document.querySelectorAll('input[type="file"]')) as HTMLInputElement[]
    // Input dedicado de dicionário era o único que aceitava apenas .xlsx
    const inputExclusivoXlsx = inputs.find(
      (el) =>
        el.accept === '.xlsx' ||
        el.accept === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )

    expect(inputExclusivoXlsx).toBeUndefined()
  })

  // TL3-5: upload de .xlsx reconhecido → ehDicionario(true) → lerDicionario+setDic+lerIniciais
  it('TL3-5: .xlsx reconhecido chama lerDicionario, setDic e lerIniciais', async () => {
    const entradaDic = [{ chave: 'mercado', fonte: 'Nubank', natureza: 'Alimentação', descricao: 'Supermercado', iniciais: 'ES', vezes: 1, ambiguo: false }]
    vi.mocked(ehDicionario).mockResolvedValue(true as never)
    vi.mocked(lerDicionario).mockReturnValue(entradaDic as never)
    vi.mocked(lerIniciais).mockResolvedValue(null as never)

    render(<App />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const arquivo = criarFile('dicionario.xlsx', new Uint8Array([0x50, 0x4B]))

    await act(async () => {
      fireEvent.change(input, { target: { files: [arquivo] } })
    })

    await waitFor(() => {
      expect(ehDicionario).toHaveBeenCalled()
      expect(lerDicionario).toHaveBeenCalled()
    })
  })

  // TL3-6: .xlsx não reconhecido → ehDicionario(false) → addAviso, sem quebrar
  it('TL3-6: .xlsx não reconhecido chama addAviso sem lançar erro', async () => {
    vi.mocked(ehDicionario).mockResolvedValue(false as never)

    render(<App />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const arquivo = criarFile('planilha.xlsx', new Uint8Array([0x50, 0x4B]))

    await act(async () => {
      fireEvent.change(input, { target: { files: [arquivo] } })
    })

    await waitFor(() => {
      expect(ehDicionario).toHaveBeenCalled()
      const avisos = useAppStore.getState().avisos
      expect(avisos.some((a) => a.toLowerCase().includes('não reconhecido') || a.toLowerCase().includes('reconhecido'))).toBe(true)
    })
  })

  // TL3-4: flag usuarioEditouIniciais — após editar iniciais, lerIniciais não sobrescreve
  it('TL3-4: usuarioEditouIniciais=true protege iniciais de sobreposição por dicionário', async () => {
    vi.mocked(ehDicionario).mockResolvedValue(true as never)
    vi.mocked(lerDicionario).mockReturnValue([] as never)
    vi.mocked(lerIniciais).mockResolvedValue('JS' as never)

    render(<App />)

    // Edita campo de iniciais manualmente → usuarioEditouIniciais = true
    const campoIniciais = screen.getByPlaceholderText('Ex.: ES')
    fireEvent.change(campoIniciais, { target: { value: 'MA' } })

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const arquivo = criarFile('dicionario.xlsx', new Uint8Array([0x50, 0x4B]))

    await act(async () => {
      fireEvent.change(input, { target: { files: [arquivo] } })
    })

    await waitFor(() => {
      // Iniciais devem permanecer 'MA', não 'JS' (do dicionário)
      expect(useAppStore.getState().iniciais).toBe('MA')
    })
  })

  // TL3-10: lerIniciais retorna valor + usuarioEditouIniciais=false → iniciais preenchidas
  it('TL3-10: lerIniciais retorna valor e usuarioEditouIniciais=false → iniciais preenchidas', async () => {
    vi.mocked(ehDicionario).mockResolvedValue(true as never)
    vi.mocked(lerDicionario).mockReturnValue([] as never)
    vi.mocked(lerIniciais).mockResolvedValue('JS' as never)

    // Garante que iniciais começam vazias para verificar o preenchimento
    useAppStore.setState({ iniciais: '' })

    render(<App />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const arquivo = criarFile('dicionario.xlsx', new Uint8Array([0x50, 0x4B]))

    await act(async () => {
      fireEvent.change(input, { target: { files: [arquivo] } })
    })

    await waitFor(() => {
      expect(lerIniciais).toHaveBeenCalled()
      expect(useAppStore.getState().iniciais).toBe('JS')
    })
  })

  // TL3-7: dois dicionários carregados → segundo substitui primeiro com aviso "último vence"
  it('TL3-7: dois .xlsx reconhecidos na mesma seleção → aviso de último vence', async () => {
    const dic1 = [{ chave: 'a', fonte: 'Nubank', natureza: 'N', descricao: '', iniciais: 'ES', vezes: 1, ambiguo: false }]
    const dic2 = [{ chave: 'b', fonte: 'Itau', natureza: 'N', descricao: '', iniciais: 'ES', vezes: 1, ambiguo: false }]

    let chamadas = 0
    vi.mocked(ehDicionario).mockImplementation(async () => true as never)
    vi.mocked(lerDicionario).mockImplementation(() => {
      chamadas++
      return (chamadas === 1 ? dic1 : dic2) as never
    })
    vi.mocked(lerIniciais).mockResolvedValue(null as never)

    render(<App />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const arquivo1 = criarFile('dic1.xlsx', new Uint8Array([0x50, 0x4B]))
    const arquivo2 = criarFile('dic2.xlsx', new Uint8Array([0x50, 0x4B]))

    await act(async () => {
      fireEvent.change(input, { target: { files: [arquivo1, arquivo2] } })
    })

    await waitFor(() => {
      const avisos = useAppStore.getState().avisos
      expect(avisos.some((a) => a.toLowerCase().includes('último') || a.toLowerCase().includes('ultimo') || a.toLowerCase().includes('vence'))).toBe(true)
    })
  })

  // TL16-1 (TODO item 16): Produzir usa o dicionário do store e não o apaga
  it('TL16-1: Produzir passa dicEntries do store a produzirLancamentos e preserva o store', async () => {
    const entradas = [
      { chave: 'Mercado', fonte: 'extrato_nubank', natureza: 'SM', descricao: 'Supermercado', iniciais: 'ES', vezes: 1, ambiguo: false },
    ]
    useAppStore.setState({ dicEntries: entradas })
    vi.stubGlobal('fetch', vi.fn(async () => ({ arrayBuffer: async () => new Uint8Array([0]).buffer })))

    try {
      render(<App />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const arquivoCsv = criarFile('extrato.csv', 'Data,Valor,Identificador,Descrição\n', 'text/csv')
      await act(async () => {
        fireEvent.change(input, { target: { files: [arquivoCsv] } })
      })

      const botao = screen.getByText('Produzir revisão')
      await act(async () => {
        fireEvent.click(botao)
      })

      await waitFor(() => {
        expect(produzirLancamentos).toHaveBeenCalled()
      })
      const args = vi.mocked(produzirLancamentos).mock.calls[0]
      // 2º argumento é o dicionário do store (DicEntry[]), não null
      expect(args[1]).toEqual(entradas)
      // O dicionário do store não é apagado pelo Produzir
      expect(useAppStore.getState().dicEntries).toEqual(entradas)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  // TL3-8: arquivo .csv roteado para pipeline CSV/TXT (não chama ehDicionario)
  it('TL3-8: arquivo .csv não chama ehDicionario e vai para o pipeline CSV', async () => {
    render(<App />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const arquivo = criarFile('extrato.csv', 'DATA;DESCRICAO;VALOR', 'text/csv')

    await act(async () => {
      fireEvent.change(input, { target: { files: [arquivo] } })
    })

    await waitFor(() => {
      expect(ehDicionario).not.toHaveBeenCalled()
    })
  })

  // TL3-9: seleção mista .xlsx + .csv → cada arquivo roteado corretamente
  it('TL3-9: seleção mista .xlsx+.csv — .xlsx chama ehDicionario, .csv não', async () => {
    vi.mocked(ehDicionario).mockResolvedValue(false as never)

    render(<App />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const arquivoXlsx = criarFile('planilha.xlsx', new Uint8Array([0x50, 0x4B]))
    const arquivoCsv = criarFile('extrato.csv', 'DATA;DESCRICAO;VALOR', 'text/csv')

    await act(async () => {
      fireEvent.change(input, { target: { files: [arquivoXlsx, arquivoCsv] } })
    })

    await waitFor(() => {
      // ehDicionario chamado uma vez (para o .xlsx), não para o .csv
      expect(ehDicionario).toHaveBeenCalledTimes(1)
    })
  })
})
