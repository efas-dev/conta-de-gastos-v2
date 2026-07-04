// ADR: see Docs/specs/grid-revisao.adr.md

import { useState, useCallback } from 'react'
import {
  DataEditor,
  GridCellKind,
  CompactSelection,
  type GridColumn,
  type GridSelection,
  type Item,
  type EditableGridCell,
  type GetRowThemeCallback,
} from '@glideapps/glide-data-grid'
import '@glideapps/glide-data-grid/dist/index.css'
import { useAppStore } from '../store/appStore'
import { validarLinha } from '../../dominio/validacao'
import type { Lancamento } from '../../types'

// ---------------------------------------------------------------------------
// Índices de colunas
// ---------------------------------------------------------------------------

const COL_FONTE = 0
const COL_DATA = 1
const COL_TRANSCRICAO = 2
const COL_INICIAIS = 3
const COL_NATUREZA = 4
const COL_DESCRICAO = 5
const COL_VALOR = 6

/** Conjunto de índices de colunas somente leitura (D7 do ADR). */
const COLUNAS_SOMENTE_LEITURA = new Set([COL_FONTE, COL_DATA, COL_TRANSCRICAO])

/** Definição das 7 colunas da grid. */
const COLUNAS: GridColumn[] = [
  { title: 'Fonte', width: 120 },
  { title: 'Data', width: 100 },
  { title: 'Transcrição', width: 240 },
  { title: 'Iniciais', width: 80 },
  { title: 'Natureza', width: 130 },
  { title: 'Descrição', width: 220 },
  { title: 'Valor', width: 110 },
]

// ---------------------------------------------------------------------------
// Temas visuais de realce (D2 do ADR — getRowThemeOverride)
// Cores são funcionais; estética refinada fica fora do escopo desta spec (D6 do ADR).
// ---------------------------------------------------------------------------

/** Linha requer atenção — natureza inválida ou ausente. */
export const TEMA_ERRO = { bgCell: '#ffe0e0' }

/** Lançamento identificado como transferência entre contas próprias. */
export const TEMA_TRANSFERENCIA = { bgCell: '#dce8ff' }

/** Lançamento identificado como aplicação ou resgate de investimento. */
export const TEMA_INVESTIMENTO = { bgCell: '#d8f5e1' }

// ---------------------------------------------------------------------------
// Funções puras auxiliares — exportadas para testabilidade futura (T10)
// ---------------------------------------------------------------------------

/**
 * Determina o tema visual de realce de uma linha da grid.
 *
 * Precedência: erro de validação > transferência interna > investimento.
 * Retorna `undefined` para linhas sem realce especial.
 */
export function calcularTemaLinha(
  l: Lancamento,
  naturezasValidas: string[],
): typeof TEMA_ERRO | typeof TEMA_TRANSFERENCIA | typeof TEMA_INVESTIMENTO | undefined {
  if (validarLinha(l, naturezasValidas)) return TEMA_ERRO
  if (l.transferenciaInterna === true) return TEMA_TRANSFERENCIA
  if (l.investimento != null) return TEMA_INVESTIMENTO
  return undefined
}

/**
 * Calcula a soma dos valores dos lançamentos nos índices informados.
 *
 * Índices fora dos limites do array são ignorados (valor zero contribuído).
 */
export function calcularSomaSelecionados(
  lancamentos: Lancamento[],
  indicesSelecionados: number[],
): number {
  return indicesSelecionados.reduce((acc, i) => acc + (lancamentos[i]?.valor ?? 0), 0)
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

/** Props do componente ReviewGrid. */
export interface ReviewGridProps {
  /**
   * Callback invocado quando o usuário digita `'/'` nas Iniciais de uma linha.
   * A fiação para o SplitModal é responsabilidade do pai (T9 — App.tsx).
   */
  onSplitDetectado?: (indice: number) => void
}

/**
 * Grid de revisão de lançamentos usando Glide Data Grid v6.
 *
 * Exibe 7 colunas:
 * - Somente leitura: Fonte, Data, Transcrição
 * - Editáveis: Iniciais, Natureza, Descrição, Valor (D7 do ADR)
 *
 * Realces visuais via `getRowThemeOverride`:
 * - Vermelho (`TEMA_ERRO`): linhas onde `validarLinha` retorna `true`.
 * - Azul (`TEMA_TRANSFERENCIA`): lançamentos com `transferenciaInterna === true`.
 * - Verde (`TEMA_INVESTIMENTO`): lançamentos com `investimento != null`.
 *
 * Seleção múltipla: exibe a soma dos valores das linhas selecionadas abaixo da grid.
 *
 * Detecção de split: ao editar Iniciais com `'/'`, chama `onSplitDetectado(indice)`.
 */
export function ReviewGrid({ onSplitDetectado }: ReviewGridProps) {
  const lancamentos = useAppStore((s) => s.lancamentos)
  const naturezasValidas = useAppStore((s) => s.naturezasValidas)
  const editarCelula = useAppStore((s) => s.editarCelula)

  // Estado local de seleção da grid
  const [gridSelection, setGridSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
    current: undefined,
  })

  // Soma dos valores das linhas atualmente selecionadas (null = nenhuma seleção relevante)
  const [somaSelecao, setSomaSelecao] = useState<number | null>(null)

  // -----------------------------------------------------------------
  // getCellContent: mapeamento [col, row] → célula do Glide Data Grid
  // -----------------------------------------------------------------

  const getCellContent = useCallback(
    ([col, row]: Item) => {
      const l = lancamentos[row]

      if (!l) {
        return {
          kind: GridCellKind.Text,
          data: '',
          displayData: '',
          allowOverlay: false,
          readonly: true,
        } as const
      }

      const somenteLeitura = COLUNAS_SOMENTE_LEITURA.has(col)

      switch (col) {
        case COL_FONTE:
          return {
            kind: GridCellKind.Text,
            data: l.fonte,
            displayData: l.fonte,
            allowOverlay: false,
            readonly: true,
          } as const

        case COL_DATA:
          return {
            kind: GridCellKind.Text,
            data: l.data,
            displayData: l.data,
            allowOverlay: false,
            readonly: true,
          } as const

        case COL_TRANSCRICAO:
          return {
            kind: GridCellKind.Text,
            data: l.transcricao,
            displayData: l.transcricao,
            allowOverlay: false,
            readonly: true,
          } as const

        case COL_INICIAIS:
          return {
            kind: GridCellKind.Text,
            data: l.iniciais,
            displayData: l.iniciais,
            allowOverlay: !somenteLeitura,
            readonly: somenteLeitura,
          } as const

        case COL_NATUREZA:
          return {
            kind: GridCellKind.Text,
            data: l.natureza,
            displayData: l.natureza,
            allowOverlay: !somenteLeitura,
            readonly: somenteLeitura,
          } as const

        case COL_DESCRICAO:
          return {
            kind: GridCellKind.Text,
            data: l.descricao,
            displayData: l.descricao,
            allowOverlay: !somenteLeitura,
            readonly: somenteLeitura,
          } as const

        case COL_VALOR:
          return {
            kind: GridCellKind.Number,
            data: l.valor,
            displayData: l.valor.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            }),
            allowOverlay: !somenteLeitura,
            readonly: somenteLeitura,
          } as const

        default:
          return {
            kind: GridCellKind.Text,
            data: '',
            displayData: '',
            allowOverlay: false,
            readonly: true,
          } as const
      }
    },
    [lancamentos],
  )

  // -----------------------------------------------------------------
  // onCellEdited: despacha editarCelula para o store
  // -----------------------------------------------------------------

  const onCellEdited = useCallback(
    ([col, row]: Item, novoValor: EditableGridCell) => {
      // Colunas somente leitura nunca chegam aqui, mas a guarda é defensiva
      if (COLUNAS_SOMENTE_LEITURA.has(col)) return

      switch (col) {
        case COL_INICIAIS: {
          const val = novoValor.kind === GridCellKind.Text ? novoValor.data : ''
          if (val.includes('/') && onSplitDetectado) {
            onSplitDetectado(row)
          }
          editarCelula(row, 'iniciais', val)
          break
        }
        case COL_NATUREZA: {
          const val = novoValor.kind === GridCellKind.Text ? novoValor.data : ''
          editarCelula(row, 'natureza', val)
          break
        }
        case COL_DESCRICAO: {
          const val = novoValor.kind === GridCellKind.Text ? novoValor.data : ''
          editarCelula(row, 'descricao', val)
          break
        }
        case COL_VALOR: {
          const val = novoValor.kind === GridCellKind.Number ? (novoValor.data ?? 0) : 0
          editarCelula(row, 'valor', val)
          break
        }
      }
    },
    [editarCelula, onSplitDetectado],
  )

  // -----------------------------------------------------------------
  // getRowThemeOverride: realce visual por linha (D2 do ADR)
  // -----------------------------------------------------------------

  const getRowThemeOverride: GetRowThemeCallback = useCallback(
    (row) => {
      const l = lancamentos[row]
      if (!l) return undefined
      return calcularTemaLinha(l, naturezasValidas)
    },
    [lancamentos, naturezasValidas],
  )

  // -----------------------------------------------------------------
  // onGridSelectionChange: atualiza seleção e recalcula soma
  // -----------------------------------------------------------------

  const onGridSelectionChange = useCallback(
    (sel: GridSelection) => {
      setGridSelection(sel)

      // Coleta índices de linhas selecionadas via row markers (CompactSelection)
      const indices: number[] = [...sel.rows]

      // Inclui linhas cobertas pela seleção de célula atual (range)
      if (sel.current?.range) {
        const { y, height } = sel.current.range
        for (let r = y; r < y + height; r++) {
          if (!indices.includes(r)) indices.push(r)
        }
      }

      setSomaSelecao(indices.length > 0 ? calcularSomaSelecionados(lancamentos, indices) : null)
    },
    [lancamentos],
  )

  // -----------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DataEditor
          columns={COLUNAS}
          rows={lancamentos.length}
          getCellContent={getCellContent}
          onCellEdited={onCellEdited}
          getRowThemeOverride={getRowThemeOverride}
          gridSelection={gridSelection}
          onGridSelectionChange={onGridSelectionChange}
          rowMarkers="number"
          smoothScrollX
          smoothScrollY
          width="100%"
          height="100%"
          /* Copiar (Ctrl/Cmd+C) usa getCellsForSelection; colar (Ctrl/Cmd+V) via onPaste. */
          getCellsForSelection={true}
          onPaste={true}
          /* Atalhos estilo Sheets: selecionar linha/coluna/tudo pelo teclado. */
          keybindings={{
            selectAll: true,
            selectRow: true,
            selectColumn: true,
            copy: true,
            paste: true,
          }}
        />
      </div>

      {somaSelecao !== null && (
        <div
          style={{
            padding: '0.4rem 0.8rem',
            borderTop: '1px solid #d0d0d0',
            fontWeight: 'bold',
            fontSize: '0.9rem',
            background: '#f5f5f5',
          }}
        >
          Soma da seleção:{' '}
          {somaSelecao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </div>
      )}
    </div>
  )
}
