// ADR: see spec/grid-ux-filtros.adr.md

import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../appStore'
import type { Lancamento } from '../../../types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function lancamento(parcial: Partial<Lancamento> = {}): Lancamento {
  return {
    fonte: 'Nubank',
    data: '2025-03-15',
    transcricao: 'Mercado',
    valor: -150,
    iniciais: 'ES',
    natureza: 'Alimentação',
    descricao: 'Supermercado',
    transferenciaInterna: false,
    investimento: null,
    ...parcial,
  }
}

function resetarStore(): void {
  useAppStore.setState({
    lancamentos: [],
    iniciais: '',
    nomeUsuario: '',
    naturezasValidas: [],
    dicEntries: [],
    avisos: [],
    historico: [],
    futuro: [],
    csvArquivo: null,
    sujo: false,
    filtroFontes: [],
    filtroNaturezas: [],
    filtroSoIncompletos: false,
    ordenacaoColuna: null,
    ordenacaoDirecao: 'asc',
  })
}

// ---------------------------------------------------------------------------
// mapaIndiceVisualReal — TL-T1-12 a TL-T1-14
// ---------------------------------------------------------------------------

describe('mapaIndiceVisualReal', () => {
  beforeEach(resetarStore)

  // TL-T1-12: sem filtro mapeia posições 1:1
  it('sem filtro mapeia cada índice visual para o mesmo índice real', () => {
    useAppStore.getState().setLancamentos([
      lancamento({ transcricao: 'A' }),
      lancamento({ transcricao: 'B' }),
      lancamento({ transcricao: 'C' }),
    ])
    const mapa = useAppStore.getState().mapaIndiceVisualReal
    expect(mapa).toEqual([0, 1, 2])
  })

  // TL-T1-13: com filtro ativo mapeia índice visual para índice real correto
  it('com filtro por fonte mapeia índice visual para o índice real correto', () => {
    useAppStore.getState().setLancamentos([
      lancamento({ transcricao: 'A', fonte: 'Nubank' }),
      lancamento({ transcricao: 'B', fonte: 'Itaú' }),
      lancamento({ transcricao: 'C', fonte: 'Nubank' }),
    ])
    useAppStore.getState().setFiltroFontes(['Nubank'])
    const mapa = useAppStore.getState().mapaIndiceVisualReal
    // Visível[0] = A (real 0), Visível[1] = C (real 2)
    expect(mapa).toEqual([0, 2])
  })

  // TL-T1-14: consistente após troca de filtro
  it('mapa é recalculado corretamente após troca de filtro', () => {
    useAppStore.getState().setLancamentos([
      lancamento({ transcricao: 'A', fonte: 'Nubank' }),
      lancamento({ transcricao: 'B', fonte: 'Itaú' }),
      lancamento({ transcricao: 'C', fonte: 'Nubank' }),
    ])
    useAppStore.getState().setFiltroFontes(['Nubank'])
    expect(useAppStore.getState().mapaIndiceVisualReal).toEqual([0, 2])

    // Troca para filtrar Itaú
    useAppStore.getState().setFiltroFontes(['Itaú'])
    expect(useAppStore.getState().mapaIndiceVisualReal).toEqual([1])

    // Remove filtro
    useAppStore.getState().setFiltroFontes([])
    expect(useAppStore.getState().mapaIndiceVisualReal).toEqual([0, 1, 2])
  })
})

// ---------------------------------------------------------------------------
// Undo em célula filtrada — TL-T1-15
// ---------------------------------------------------------------------------

describe('undo em célula filtrada', () => {
  beforeEach(resetarStore)

  // TL-T1-15: undo reverte o lançamento correto via índice real
  it('undo após editarCelula com filtro ativo reverte o lançamento correto', () => {
    useAppStore.getState().setLancamentos([
      lancamento({ transcricao: 'A', fonte: 'Nubank', natureza: 'Alimentação' }),
      lancamento({ transcricao: 'B', fonte: 'Itaú', natureza: 'Moradia' }),
      lancamento({ transcricao: 'C', fonte: 'Nubank', natureza: 'Alimentação' }),
    ])
    // Ativa filtro — visíveis: A (real 0) e C (real 2)
    useAppStore.getState().setFiltroFontes(['Nubank'])

    // Edita usando índice real 2 (C) — como faria o ReviewGrid após traduzir visual→real
    useAppStore.getState().editarCelula(2, 'natureza', 'Lazer')
    expect(useAppStore.getState().lancamentos[2].natureza).toBe('Lazer')

    // Undo reverte apenas C (real 2), A e B permanecem intactos
    useAppStore.getState().undo()
    expect(useAppStore.getState().lancamentos[2].natureza).toBe('Alimentação')
    expect(useAppStore.getState().lancamentos[0].natureza).toBe('Alimentação')
    expect(useAppStore.getState().lancamentos[1].natureza).toBe('Moradia')
  })

  it('mapaIndiceVisualReal aponta para o índice real correto para tradução visual→real', () => {
    useAppStore.getState().setLancamentos([
      lancamento({ transcricao: 'A', fonte: 'Nubank' }),
      lancamento({ transcricao: 'B', fonte: 'Itaú' }),
      lancamento({ transcricao: 'C', fonte: 'Nubank' }),
    ])
    useAppStore.getState().setFiltroFontes(['Nubank'])
    const mapa = useAppStore.getState().mapaIndiceVisualReal
    // Índice visual 1 aponta para real 2 (C)
    const indiceReal = mapa[1]
    expect(indiceReal).toBe(2)

    // Editar via índice real e desfazer
    useAppStore.getState().editarCelula(indiceReal, 'descricao', 'Novo valor')
    expect(useAppStore.getState().lancamentos[2].descricao).toBe('Novo valor')
    useAppStore.getState().undo()
    expect(useAppStore.getState().lancamentos[2].descricao).toBe('Supermercado')
  })
})
