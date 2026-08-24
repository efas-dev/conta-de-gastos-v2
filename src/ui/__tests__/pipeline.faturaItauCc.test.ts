// ADR: see spec/fatura-itau-xlsx.adr.md

/**
 * Task T9 (spec `fatura-itau-xlsx`) — `PipelineState.produzirLancamentos` roteando entrada
 * binária (`Uint8Array`) para `parsersBinarios` em vez de `detectar` (pipeline de texto),
 * Decisão 6 do ADR. Testes de integração: exercitam `produzirLancamentos` real (não mockado),
 * só as dependências pesadas (`parsersBinarios`, `../parsers/index`, dicionário) são stubs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Lancamento } from '../../types'

const lancamentosBinarioMock: Lancamento[] = [
  {
    fonte: 'fatura_itau_cc',
    data: '2026-07-10',
    transcricao: 'Livraria Fictícia',
    valor: -58.9,
    iniciais: '',
    natureza: '',
    descricao: '',
  },
]

const lancamentosTextoMock: Lancamento[] = [
  {
    fonte: 'Nubank',
    data: '2026-07-05',
    transcricao: 'Mercado',
    valor: -100,
    iniciais: '',
    natureza: '',
    descricao: '',
  },
]

const { mockAceita, mockParsearBinario } = vi.hoisted(() => ({
  mockAceita: vi.fn(() => false),
  mockParsearBinario: vi.fn(),
}))

vi.mock('../../parsers/binario', () => ({
  parsersBinarios: [
    {
      aceita: (bytes: Uint8Array) => mockAceita(bytes),
      parsear: (bytes: Uint8Array, mesRef?: string) => mockParsearBinario(bytes, mesRef),
    },
  ],
}))

const { mockParsearTexto, mockDetectar } = vi.hoisted(() => ({
  mockParsearTexto: vi.fn(() => ({ lancamentos: lancamentosTextoMock, linhasIgnoradas: 0 })),
  mockDetectar: vi.fn(),
}))

vi.mock('../../parsers/index', () => ({
  detectar: (conteudo: string) => mockDetectar(conteudo),
}))

vi.mock('../../dominio/dicionario', () => ({
  enriquecerLancamento: vi.fn((lancamento: Lancamento) => lancamento),
}))

import { produzirLancamentos } from '../PipelineState'

beforeEach(() => {
  vi.clearAllMocks()
  mockAceita.mockReturnValue(false)
  mockParsearBinario.mockReturnValue({
    lancamentos: lancamentosBinarioMock,
    linhasIgnoradas: 0,
    excluidosPendentes: [],
  })
  mockDetectar.mockReturnValue({ parsear: mockParsearTexto })
})

describe('PipelineState.produzirLancamentos — roteamento binário × texto (Task T9)', () => {
  it('entrada Uint8Array com parser binário aceito é roteada para parsersBinarios, não para detectar', () => {
    mockAceita.mockReturnValue(true)
    const bytes = new Uint8Array([1, 2, 3])

    const resultado = produzirLancamentos(bytes, [], 'ES')

    expect(mockAceita).toHaveBeenCalledWith(bytes)
    expect(mockParsearBinario).toHaveBeenCalled()
    expect(mockDetectar).not.toHaveBeenCalled()
    expect(resultado.lancamentos).toHaveLength(1)
    expect(resultado.lancamentos[0].fonte).toBe('fatura_itau_cc')
  })

  it('repassa mesReferencia (6º argumento) como segundo argumento de parsear do parser binário', () => {
    mockAceita.mockReturnValue(true)
    const bytes = new Uint8Array([1, 2, 3])

    produzirLancamentos(bytes, [], 'ES', [], undefined, '2026-07')

    expect(mockParsearBinario).toHaveBeenCalledWith(bytes, '2026-07')
  })

  it('entrada string continua roteando para detectar (pipeline de texto), sem regressão', () => {
    const resultado = produzirLancamentos('conteudo-csv', [], 'ES')

    expect(mockDetectar).toHaveBeenCalledWith('conteudo-csv')
    expect(mockAceita).not.toHaveBeenCalled()
    expect(resultado.lancamentos).toHaveLength(1)
    expect(resultado.lancamentos[0].fonte).toBe('Nubank')
  })

  it('entrada Uint8Array sem nenhum parser binário aceito devolve lista vazia, sem lançar', () => {
    mockAceita.mockReturnValue(false)
    const bytes = new Uint8Array([9, 9, 9])

    const resultado = produzirLancamentos(bytes, [], 'ES')

    expect(mockParsearBinario).not.toHaveBeenCalled()
    expect(resultado.lancamentos).toHaveLength(0)
  })

  it('lançamentos vindos do parser binário passam pelo enriquecimento do dicionário (D3 do ADR — não pula o passo)', async () => {
    mockAceita.mockReturnValue(true)
    const { enriquecerLancamento } = await import('../../dominio/dicionario')
    const bytes = new Uint8Array([1, 2, 3])

    produzirLancamentos(bytes, [{ transcricao: 'x', iniciais: 'ES', natureza: 'n' }] as never, 'ES')

    expect(enriquecerLancamento).toHaveBeenCalledTimes(1)
  })
})
