/**
 * Testes do upload incremental (item 22 do TODO).
 *
 * Carregar um arquivo e depois outro deve ACUMULAR na lista (append), não
 * substituir. Dedup por nome (último vence), mês sugerido recalculado sobre o
 * conjunto acumulado, .xlsx não mexe na lista de CSVs, "Remover" individual.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { App } from '../App'
import { useAppStore } from '../ui/store/appStore'

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

import { detectarMesSugerido } from '../dominio/mes'

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

const CSV_JUNHO = 'Data,Valor,Identificador,Descrição\n05/06/2026,-45.90,id-a,IFOOD\n'
const CSV_JULHO = 'Data,Valor,Identificador,Descrição\n05/07/2026,-120.00,id-b,MERCADO\n'

function criarFile(nome: string, conteudo: string | Uint8Array): File {
  const bytes = typeof conteudo === 'string' ? new TextEncoder().encode(conteudo) : conteudo
  const file = new File([bytes], nome)
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

function acharDropzone(): HTMLElement {
  return screen.getByText('Arraste extratos e faturas aqui').closest('label') as HTMLElement
}

async function soltar(arquivos: File[]): Promise<void> {
  await act(async () => {
    fireEvent.drop(acharDropzone(), { dataTransfer: { files: arquivos } })
  })
}

describe('App — upload incremental (item 22)', () => {
  beforeEach(() => {
    resetarStore()
    vi.clearAllMocks()
  })

  it('TL22-1: dois uploads sequenciais acumulam — ambos os arquivos ficam listados', async () => {
    render(<App />)

    await soltar([criarFile('junho.csv', CSV_JUNHO)])
    await soltar([criarFile('julho.csv', CSV_JULHO)])

    await waitFor(() => {
      expect(screen.getByText('junho.csv')).toBeDefined()
      expect(screen.getByText('julho.csv')).toBeDefined()
    })
  })

  it('TL22-2: re-selecionar o mesmo nome não duplica — último vence', async () => {
    render(<App />)

    await soltar([criarFile('extrato.csv', CSV_JUNHO)])
    await soltar([criarFile('extrato.csv', CSV_JULHO)])

    await waitFor(() => {
      expect(screen.getAllByText('extrato.csv')).toHaveLength(1)
    })
  })

  it('TL22-3: upload de .xlsx depois de um CSV não apaga a lista de CSVs', async () => {
    render(<App />)

    await soltar([criarFile('junho.csv', CSV_JUNHO)])
    await soltar([criarFile('dicionario.xlsx', new Uint8Array([0x50, 0x4b]))])

    await waitFor(() => {
      expect(screen.getByText('junho.csv')).toBeDefined()
    })
  })

  it('TL22-4: mês sugerido é recalculado sobre o conjunto ACUMULADO de lançamentos', async () => {
    render(<App />)

    await soltar([criarFile('junho.csv', CSV_JUNHO)])
    await soltar([criarFile('julho.csv', CSV_JULHO)])

    const ultimaChamada = vi.mocked(detectarMesSugerido).mock.calls.at(-1)![0]
    const datas = ultimaChamada.map((l) => l.data).sort()
    expect(datas).toEqual(['2026-06-05', '2026-07-05'])
  })

  it('TL-44-6: a sugestão do 1º upload não trava o mês — o 2º upload ainda reajusta (item 44)', async () => {
    // A autodetecção passava pelo MESMO handler da edição manual, que marca "usuário editou".
    // Do segundo arquivo em diante a condição `!usuarioEditouMes` era falsa e o mês congelava
    // no que o primeiro arquivo sugeriu.
    vi.mocked(detectarMesSugerido).mockReturnValueOnce('2026-06').mockReturnValueOnce('2026-07')

    render(<App />)

    await soltar([criarFile('junho.csv', CSV_JUNHO)])
    await soltar([criarFile('julho.csv', CSV_JULHO)])

    await waitFor(() => {
      const selectMes = screen.getByTestId('select-mes') as HTMLSelectElement
      expect(selectMes.value).toBe('07')
    })
  })

  it('TL-44-7: escolha manual do usuário continua imune à autodetecção (D7)', async () => {
    vi.mocked(detectarMesSugerido).mockReturnValue('2026-06')

    render(<App />)

    const selectMes = screen.getByTestId('select-mes') as HTMLSelectElement
    await act(async () => {
      fireEvent.change(selectMes, { target: { value: '03' } })
    })

    await soltar([criarFile('junho.csv', CSV_JUNHO)])

    await waitFor(() => {
      expect((screen.getByTestId('select-mes') as HTMLSelectElement).value).toBe('03')
    })
  })

  it('TL22-5: Remover individual tira só o arquivo clicado, o outro permanece', async () => {
    render(<App />)

    await soltar([criarFile('junho.csv', CSV_JUNHO)])
    await soltar([criarFile('julho.csv', CSV_JULHO)])
    await waitFor(() => expect(screen.getByText('julho.csv')).toBeDefined())

    // Sobe pelos ancestrais até o cartão do arquivo (o que contém o botão Remover)
    let cartaoJunho: HTMLElement | null = screen.getByText('junho.csv')
    while (cartaoJunho && !cartaoJunho.querySelector('button')) {
      cartaoJunho = cartaoJunho.parentElement
    }
    const botaoRemover = [...cartaoJunho!.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Remover'),
    )!
    await act(async () => {
      fireEvent.click(botaoRemover)
    })

    expect(screen.queryByText('junho.csv')).toBeNull()
    expect(screen.getByText('julho.csv')).toBeDefined()
  })
})
