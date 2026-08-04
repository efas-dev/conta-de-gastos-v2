/**
 * Testes da lógica pura de colagem na grid (Ctrl/Cmd+V preenche a seleção).
 * Bug: colar só afetava a célula âncora; deve preencher todas as selecionadas.
 */

import { describe, it, expect } from 'vitest'
import { montarColagem } from '../colagemGrid'

// Espelha ReviewGrid: 0=fonte,1=data,2=transcricao (RO), 3=iniciais,4=natureza,5=descricao,6=valor
const COLS = ['fonte', 'data', 'transcricao', 'iniciais', 'natureza', 'descricao', 'valor']
const RO = new Set([0, 1, 2])
// mapa identidade por padrão (sem filtro)
const ID = Array.from({ length: 50 }, (_, i) => i)

describe('montarColagem', () => {
  it('TL-COL-1: um valor + seleção de 1 coluna × 3 linhas → preenche as 3', () => {
    const sel = { x: 4, y: 2, width: 1, height: 3 } // Natureza, linhas 2..4
    const ed = montarColagem([4, 2], [['AL']], sel, ID, COLS, RO)
    expect(ed).toEqual([
      { indiceReal: 2, colId: 'natureza', valor: 'AL' },
      { indiceReal: 3, colId: 'natureza', valor: 'AL' },
      { indiceReal: 4, colId: 'natureza', valor: 'AL' },
    ])
  })

  it('TL-COL-2: bloco de 1×2 (Natureza+Descrição) replicado em 3 linhas selecionadas', () => {
    const sel = { x: 4, y: 0, width: 2, height: 3 }
    const ed = montarColagem([4, 0], [['AL', 'Almoço']], sel, ID, COLS, RO)
    expect(ed).toHaveLength(6)
    expect(ed[0]).toEqual({ indiceReal: 0, colId: 'natureza', valor: 'AL' })
    expect(ed[1]).toEqual({ indiceReal: 0, colId: 'descricao', valor: 'Almoço' })
    expect(ed[4]).toEqual({ indiceReal: 2, colId: 'natureza', valor: 'AL' })
    expect(ed[5]).toEqual({ indiceReal: 2, colId: 'descricao', valor: 'Almoço' })
  })

  it('TL-COL-3: colunas somente-leitura na seleção são puladas', () => {
    // seleção cobre transcricao(2, RO) e iniciais(3); só iniciais recebe
    const sel = { x: 2, y: 0, width: 2, height: 1 }
    const ed = montarColagem([2, 0], [['x', 'ES']], sel, ID, COLS, RO)
    expect(ed).toEqual([{ indiceReal: 0, colId: 'iniciais', valor: 'ES' }])
  })

  it('TL-COL-4: sem seleção multi-célula, cola o bloco a partir do alvo', () => {
    const sel = { x: 4, y: 5, width: 1, height: 1 }
    const ed = montarColagem([4, 5], [['AL']], sel, ID, COLS, RO)
    expect(ed).toEqual([{ indiceReal: 5, colId: 'natureza', valor: 'AL' }])
  })

  it('TL-COL-5: mapa visual→real traduz índices (grid filtrada)', () => {
    // visual 0→real 10, visual 1→real 20, visual 2→real 30
    const mapa = [10, 20, 30]
    const sel = { x: 4, y: 0, width: 1, height: 3 }
    const ed = montarColagem([4, 0], [['RR']], sel, mapa, COLS, RO)
    expect(ed.map((e) => e.indiceReal)).toEqual([10, 20, 30])
  })

  it('TL-COL-6: clipboard vazio não gera edições', () => {
    expect(montarColagem([4, 0], [], undefined, ID, COLS, RO)).toEqual([])
    expect(montarColagem([4, 0], [[]], undefined, ID, COLS, RO)).toEqual([])
  })
})
