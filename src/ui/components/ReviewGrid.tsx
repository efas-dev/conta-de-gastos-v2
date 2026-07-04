// ADR: see Docs/specs/grid-revisao.adr.md

import { useState, useCallback, useRef, useMemo } from 'react'
import {
  DataEditor,
  GridCellKind,
  CompactSelection,
  type GridColumn,
  type GridSelection,
  type Item,
  type EditableGridCell,
  type GetRowThemeCallback,
  type DrawCellCallback,
  type ProvideEditorCallback,
  type GridCell,
} from '@glideapps/glide-data-grid'
import '@glideapps/glide-data-grid/dist/index.css'
import { useAppStore } from '../store/appStore'
import { validarLinha } from '../../dominio/validacao'
import type { Lancamento } from '../../types'
import { GhostEditorCore } from './GhostEditor'

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

/** Linha requer atenção — natureza inválida ou ausente. Pêssego/terracota. */
export const TEMA_ERRO = { bgCell: '#f9e2d6' }

/** Lançamento identificado como transferência entre contas próprias. Azul. */
export const TEMA_TRANSFERENCIA = { bgCell: '#d5e4f2' }

/** Lançamento identificado como aplicação ou resgate de investimento. Verde. */
export const TEMA_INVESTIMENTO = { bgCell: '#dcedd3' }

/**
 * Tema base da grid Glide — alinhado à direção visual do handoff de design
 * (paleta terrosa/serena, fonte Manrope, acento verde).
 */
const TEMA_GRID = {
  accentColor: '#5e7c63',
  accentLight: '#eff3ef',
  textDark: '#2c2a26',
  textMedium: '#6b675e',
  textLight: '#8a867c',
  textHeader: '#8a867c',
  textBubble: '#2c2a26',
  bgCell: '#faf8f3',
  bgCellMedium: '#f4f1ea',
  bgHeader: '#f4f1ea',
  bgHeaderHasFocus: '#eae5db',
  bgHeaderHovered: '#eef0e9',
  borderColor: '#eee9df',
  horizontalBorderColor: '#eee9df',
  drilldownBorder: '#dad4c8',
  fontFamily: "'Manrope', system-ui, sans-serif",
  baseFontStyle: '600 14px',
  headerFontStyle: '700 12px',
  editorFontSize: '14px',
  cellHorizontalPadding: 14,
  headerBottomBorderColor: '#e1dcd1',
}

// ---------------------------------------------------------------------------
// Funções puras auxiliares — exportadas para testabilidade futura (T10)
// ---------------------------------------------------------------------------

/**
 * Determina o tema visual de realce de uma linha da grid.
 *
 * Precedência: investimento > transferência interna > atenção (validação).
 * A classificação de domínio vence a atenção — assim o usuário VÊ que a linha é
 * uma transferência própria ou um investimento mesmo antes de preencher a Natureza
 * (essas linhas em geral nem precisam de classificação manual). O vermelho de
 * atenção fica reservado para linhas comuns com Natureza vazia ou inválida.
 * Retorna `undefined` para linhas sem realce especial.
 */
export function calcularTemaLinha(
  l: Lancamento,
  naturezasValidas: string[],
): typeof TEMA_ERRO | typeof TEMA_TRANSFERENCIA | typeof TEMA_INVESTIMENTO | undefined {
  if (l.investimento != null) return TEMA_INVESTIMENTO
  if (l.transferenciaInterna === true) return TEMA_TRANSFERENCIA
  if (validarLinha(l, naturezasValidas)) return TEMA_ERRO
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
  const dicEntries = useAppStore((s) => s.dicEntries)

  // Ref compartilhada com o componente editor estável (atualizada via onCellActivated)
  const editorContextRef = useRef<{ col: number; row: number }>({ col: -1, row: -1 })

  // Refs de dados para o editor — permitem leituras sempre frescas sem re-criar o componente
  const lancamentosRef = useRef(lancamentos)
  lancamentosRef.current = lancamentos
  const dicEntriesRef = useRef(dicEntries)
  dicEntriesRef.current = dicEntries

  // onCellActivated: atualiza editorContextRef antes do provideEditor ser invocado
  const onCellActivated = useCallback((cell: Item) => {
    const [col, row] = cell
    editorContextRef.current = { col, row }
  }, [])

  // Componente editor estável — criado uma vez, lê context e dados via refs.
  // O cast final é necessário porque o Glide exporta ProvideEditorCallbackResult como uma
  // união de tipos de função e objeto; React.FC satisfaz a variante de função.
  const GlideGhostEditor = useMemo(
    () =>
      function GhostEditorGlide({
        value,
        onFinishedEditing,
        initialValue,
      }: {
        value: GridCell
        onFinishedEditing: (cell?: GridCell, movement?: readonly [-1 | 0 | 1, -1 | 0 | 1]) => void
        initialValue?: string
        [key: string]: unknown
      }) {
        const { col, row } = editorContextRef.current
        const textoAtual = value.kind === GridCellKind.Text ? value.data : ''

        return (
          <GhostEditorCore
            col={col}
            row={row}
            valorAtual={textoAtual}
            valorInicial={initialValue}
            lancamentos={lancamentosRef.current}
            dicEntries={dicEntriesRef.current}
            onFinishedEditing={(texto, movement) => {
              onFinishedEditing(
                { ...value, kind: GridCellKind.Text, data: texto, displayData: texto } as GridCell,
                movement,
              )
            }}
          />
        )
      },
    [],
  ) // deps vazia — estabilidade garantida; dados frescos via refs

  // provideEditor: ativo somente em COL_INICIAIS, COL_NATUREZA, COL_DESCRICAO (D1 do ADR)
  const provideEditor: ProvideEditorCallback<GridCell> = useCallback(
    (_cell) => {
      const { col } = editorContextRef.current
      if (col !== COL_INICIAIS && col !== COL_NATUREZA && col !== COL_DESCRICAO) return undefined
      return GlideGhostEditor as ReturnType<ProvideEditorCallback<GridCell>>
    },
    [GlideGhostEditor],
  )

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
  // drawCell: formato contábil na coluna Valor — prefixo (R$/-R$) colado à
  // esquerda e o número alinhado à direita, para as casas decimais alinharem
  // entre as linhas. Só a pintura é customizada; a célula segue editável.
  // -----------------------------------------------------------------

  const drawCell: DrawCellCallback = useCallback(
    (args, draw) => {
      if (args.col !== COL_VALOR) {
        draw()
        return
      }
      const l = lancamentos[args.row]
      if (!l) {
        draw()
        return
      }
      const { ctx, rect, theme } = args
      const negativo = l.valor < 0
      const prefixo = negativo ? '-R$' : 'R$'
      const numero = Math.abs(l.valor).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      const pad = theme.cellHorizontalPadding
      const y = rect.y + rect.height / 2

      ctx.save()
      ctx.font = `700 14px ${theme.fontFamily}`
      ctx.fillStyle = negativo ? '#b4654a' : '#4e6a53'
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      ctx.fillText(prefixo, rect.x + pad, y)
      ctx.textAlign = 'right'
      ctx.fillText(numero, rect.x + rect.width - pad, y)
      ctx.restore()
    },
    [lancamentos],
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
          drawCell={drawCell}
          gridSelection={gridSelection}
          onGridSelectionChange={onGridSelectionChange}
          rowMarkers="number"
          smoothScrollX
          smoothScrollY
          width="100%"
          height="100%"
          theme={TEMA_GRID}
          headerHeight={38}
          rowHeight={40}
          /* Copiar (Ctrl/Cmd+C) usa getCellsForSelection; colar (Ctrl/Cmd+V) via onPaste.
             Preencher uma sequência: copie uma célula, selecione um range e cole — o
             valor é replicado nas células editáveis do range. */
          getCellsForSelection={true}
          onPaste={true}
          fillHandle={true}
          /* Custom editor inline com ghost-text (T2 — D1/D5/D8 do ADR). */
          provideEditor={provideEditor}
          onCellActivated={onCellActivated}
          rangeSelect="multi-rect"
          columnSelect="multi"
          rowSelect="multi"
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
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '13px 28px',
            borderTop: '1px solid #e1dcd1',
            background: '#f4f1ea',
            fontFamily: "'Manrope', system-ui, sans-serif",
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 800, color: '#2c2a26' }}>Soma da seleção</span>
          <span
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: somaSelecao < 0 ? '#b4654a' : '#4e6a53',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {somaSelecao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        </div>
      )}
    </div>
  )
}
