// ADR: see Docs/specs/grid-revisao.adr.md
// ADR: see Docs/specs/grid-ux-filtros.adr.md
// ADR: see spec/inspecao-proposta-conciliacao.adr.md

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
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
  type NumberCell,
  type FillPatternEventArgs,
  type DataEditorRef,
} from '@glideapps/glide-data-grid'
import '@glideapps/glide-data-grid/dist/index.css'
import { useAppStore } from '../store/appStore'
import { validarLinha } from '../../dominio/validacao'
import type { Lancamento, Aviso } from '../../types'
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

/**
 * IDs textuais das colunas, alinhados com os campos de Lancamento.
 * Usados por onFillPattern para detectar colunas somente leitura via colId (D15 do ADR).
 */
const COL_IDS = ['fonte', 'data', 'transcricao', 'iniciais', 'natureza', 'descricao', 'valor'] as const

/** Conjunto de colIds que são somente leitura (D15 do ADR grid-ux-filtros). */
const COL_IDS_SOMENTE_LEITURA = new Set(['fonte', 'data', 'transcricao'])

// ---------------------------------------------------------------------------
// Funções puras auxiliares de medição — D17 e D18 do ADR grid-ux-filtros
// Exportadas para testabilidade (TL-1 a TL-6 da T3).
// ---------------------------------------------------------------------------

/**
 * Teto máximo de largura de coluna em pixels (D16/D17 do ADR grid-ux-filtros).
 */
export const LARGURA_MAXIMA_PX = 320

/**
 * Largura mínima de coluna — garante legibilidade mesmo em colunas sem conteúdo.
 */
const LARGURA_MINIMA_PX = 60

/**
 * Aproximação de pixels por caractere usando heurística de string.
 * D17 do ADR: Canvas API proibida nos testes; heurística é suficiente.
 */
const PX_POR_CHAR = 8

/**
 * Padding horizontal da célula (esquerda + direita) em pixels.
 */
const PADDING_CELULA_PX = 28

/**
 * Determina se uma coluna (por colId textual) é somente leitura.
 *
 * Exportado para testabilidade (TL-6 da T3).
 * D15 do ADR: onFillPattern ignora colunas somente leitura por colId.
 */
export function ehColunaLeituraApenas(colId: string): boolean {
  return COL_IDS_SOMENTE_LEITURA.has(colId)
}

/**
 * Estima a largura em pixels de um texto usando heurística de string.
 *
 * Retorna no máximo `maxPx`. Exportado para testabilidade (TL-1/TL-2 da T3).
 * D17 do ADR: heurística de string em vez de Canvas API.
 */
export function medirLarguraHeuristica(texto: string, maxPx: number): number {
  const estimado = texto.length * PX_POR_CHAR + PADDING_CELULA_PX
  return Math.min(Math.max(estimado, LARGURA_MINIMA_PX), maxPx)
}

/**
 * Fator de ajuste da heurística para a fonte bold 14px do formato contábil
 * da coluna Valor (o drawCell usa `700 14px`, mais larga que a fonte regular
 * para a qual PX_POR_CHAR foi calibrado).
 */
const FATOR_BOLD_VALOR = 1.25

/**
 * Folga mínima entre o prefixo (ancorado à esquerda) e o número (alinhado à
 * direita) no formato contábil, para os dois blocos nunca colidirem.
 */
const FOLGA_CONTABIL_PX = 12

/**
 * Estima a largura da célula da coluna Valor no formato contábil renderizado
 * pelo drawCell: prefixo `R$`/`-R$` à esquerda + número pt-BR à direita.
 *
 * Mede a string efetivamente desenhada (não o número cru de `String(valor)`),
 * com fator para a fonte bold e folga entre os dois blocos. Exportado para
 * testabilidade (TL-7/TL-8 — dívida valor-truncado-auto-largura).
 */
/**
 * Calcula a célula de destino após Tab confirmar uma edição sem sugestão
 * pendente (navegação em zigue-zague do fluxo de revisão — decisão humana
 * de 2026-07-15): na Descrição, o destino é Iniciais da linha de baixo;
 * nas demais colunas, a célula à direita. Sem linha/coluna disponível,
 * permanece onde está. Exportado para testabilidade (TL-9).
 */
export function proximaCelulaAposTab(
  col: number,
  row: number,
  totalLinhas: number,
): [number, number] {
  const COL_INICIAIS_IDX = 3
  const COL_DESCRICAO_IDX = 5
  const ULTIMA_COLUNA = COL_IDS.length - 1
  if (col === COL_DESCRICAO_IDX) {
    return row + 1 < totalLinhas ? [COL_INICIAIS_IDX, row + 1] : [col, row]
  }
  return col < ULTIMA_COLUNA ? [col + 1, row] : [col, row]
}

export function medirLarguraValorContabil(valor: number, maxPx: number): number {
  const prefixo = valor < 0 ? '-R$' : 'R$'
  const numero = Math.abs(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const estimado =
    Math.ceil((prefixo.length + numero.length) * PX_POR_CHAR * FATOR_BOLD_VALOR) +
    FOLGA_CONTABIL_PX +
    PADDING_CELULA_PX
  return Math.min(Math.max(estimado, LARGURA_MINIMA_PX), maxPx)
}

/**
 * Calcula a largura ideal de cada coluna com base no conteúdo dos lançamentos.
 *
 * Itera sobre todos os lançamentos e todos os colIds; para cada célula, estima
 * a largura via `medirLarguraHeuristica` e mantém o máximo encontrado.
 * Inclui o título da coluna no cálculo para não truncar cabeçalhos.
 * Aplica teto de `LARGURA_MAXIMA_PX`. Exportado para testabilidade (TL-3 a TL-5 da T3).
 * D17 do ADR: heurística de string.
 */
export function calcularLargurasColunas(
  lancamentos: Lancamento[],
  colunasBase: GridColumn[],
): number[] {
  return colunasBase.map((col, i) => {
    const colId = COL_IDS[i]
    // Começa pela largura do título da coluna
    let largura = medirLarguraHeuristica(col.title, LARGURA_MAXIMA_PX)

    for (const l of lancamentos) {
      // Coluna Valor: mede o formato contábil desenhado pelo drawCell
      // (prefixo + número pt-BR em bold), não o número cru de String(valor).
      const w =
        colId === 'valor'
          ? medirLarguraValorContabil(l.valor, LARGURA_MAXIMA_PX)
          : medirLarguraHeuristica(String(l[colId as keyof Lancamento] ?? ''), LARGURA_MAXIMA_PX)
      if (w > largura) largura = w
    }

    return largura
  })
}

/** Definição das 7 colunas base da grid (larguras serão sobrescritas dinamicamente). */
const COLUNAS_BASE: (GridColumn & { width: number })[] = [
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
 * Linha "sai" durante inspeção de proposta de conciliação (D4/D5 do ADR
 * `inspecao-proposta-conciliacao`). Vermelho saturado — deliberadamente mais
 * saturado que `TEMA_ERRO` (pêssego pálido `#f9e2d6`) para não ser confundido
 * com o realce de atenção. Precedência sobre erro/transferência/investimento
 * enquanto a inspeção está ativa (D4). Validação de contraste no app real
 * fica registrada como checklist manual na Task T5 (D6 do ADR).
 */
export const TEMA_INSPECAO_SAI = { bgCell: '#e8555a' }

/**
 * Linha "fica" durante inspeção de proposta de conciliação (D4/D5 do ADR
 * `inspecao-proposta-conciliacao`). Verde-menta deliberadamente mais saturado
 * e mais azulado que `TEMA_INVESTIMENTO` (verde pálido/amarelado `#dcedd3`)
 * para evitar colisão visual entre os dois papéis. Validação de contraste no
 * app real fica registrada como checklist manual na Task T5 (D6 do ADR).
 */
export const TEMA_INSPECAO_FICA = { bgCell: '#4fd1a5' }

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

// ---------------------------------------------------------------------------
// Inspeção de proposta (Task T4, estendida por T8 — ADR `inspecao-proposta-conciliacao`)
// ---------------------------------------------------------------------------

/**
 * Origens de aviso que produzem efeito visual na grid durante a inspeção (Task T8, revisão de
 * D11/T4). `'conciliacao'` sempre teve efeito; `'valor-pendente'`/`'pagamento-recebido'` passaram
 * a ter linha real em `lancamentos` a partir de T6/T7 (D16/D17 do ADR) — a grid deixa de ser
 * 100% inalterada para essas origens. Só `'conciliacao'` tem o papel "fica" (verde-menta); as
 * outras duas têm `permanece` sempre `[]`, então só produzem o papel "sai".
 */
const ORIGENS_COM_EFEITO_GRID = new Set(['conciliacao', 'valor-pendente', 'pagamento-recebido'])

/** Conjuntos de identidade (índice real em `lancamentos`) para os papéis "sai"/"fica" da inspeção. */
export interface ContextoInspecaoConciliacao {
  alvoSet: Set<string>
  permaneceSet: Set<string>
}

/**
 * Deriva o contexto de inspeção a partir do aviso atualmente em inspeção.
 *
 * Retorna `undefined` quando não há aviso em inspeção OU quando a origem do aviso não produz
 * efeito na grid (`ORIGENS_COM_EFEITO_GRID`). Para `'conciliacao'`, `permaneceSet` carrega os
 * ids de `permanece` (papel "fica"); para `'valor-pendente'`/`'pagamento-recebido'`,
 * `permanece` é sempre `[]` — o resultado tem só o papel "sai" (D16/D17, revisão de D11 — T8).
 */
export function derivarContextoInspecao(
  aviso: Aviso | undefined,
): ContextoInspecaoConciliacao | undefined {
  if (!aviso || !ORIGENS_COM_EFEITO_GRID.has(aviso.origem)) return undefined
  return {
    alvoSet: new Set(aviso.alvo),
    permaneceSet: new Set(aviso.permanece),
  }
}

/**
 * Ids (índices reais em `lancamentos`) de todas as linhas envolvidas na inspeção ativa —
 * união de `alvo` (sai) e `permanece` (fica). Vazio quando não há inspeção com efeito de grid
 * ativa (origem fora de `ORIGENS_COM_EFEITO_GRID`).
 */
export function indicesEnvolvidos(aviso: Aviso | undefined): number[] {
  if (!aviso || !ORIGENS_COM_EFEITO_GRID.has(aviso.origem)) return []
  return [...aviso.alvo, ...aviso.permanece].map(Number)
}

/**
 * Tema visual de uma linha considerando o modo inspeção (D4/D7 do ADR
 * `inspecao-proposta-conciliacao`).
 *
 * Casa por identidade — o índice REAL do lançamento em `lancamentos`, nunca a posição
 * visual/ordenada — o que torna o destaque robusto a filtro/ordenação ativos (D7). Quando o
 * índice real está em `alvoSet`/`permaneceSet` do contexto, o tema de inspeção tem precedência
 * sobre erro/transferência/investimento (D4). Sem contexto (`undefined` — nenhuma inspeção de
 * conciliação ativa), delega integralmente para `calcularTemaLinha` (regressão preservada).
 */
export function calcularTemaLinhaComInspecao(
  l: Lancamento,
  indiceReal: number,
  naturezasValidas: string[],
  contextoInspecao: ContextoInspecaoConciliacao | undefined,
):
  | typeof TEMA_INSPECAO_SAI
  | typeof TEMA_INSPECAO_FICA
  | typeof TEMA_ERRO
  | typeof TEMA_TRANSFERENCIA
  | typeof TEMA_INVESTIMENTO
  | undefined {
  if (contextoInspecao) {
    const id = String(indiceReal)
    if (contextoInspecao.alvoSet.has(id)) return TEMA_INSPECAO_SAI
    if (contextoInspecao.permaneceSet.has(id)) return TEMA_INSPECAO_FICA
  }
  return calcularTemaLinha(l, naturezasValidas)
}

/**
 * Posição visual (índice em `lancamentosVisiveis`/`mapaIndiceVisualReal`) da linha-âncora
 * ("sai", `alvo[0]`) para o auto-scroll da inspeção (D3 do ADR). Busca por identidade em
 * `mapaIndiceVisualReal`, robusto a ordenação ativa (D7). Retorna `undefined` quando não há
 * aviso em inspeção com efeito de grid (`ORIGENS_COM_EFEITO_GRID`), quando `alvo` está vazio,
 * ou quando o índice-âncora não está (ainda) presente no mapa — o chamador é responsável por
 * revelar a linha antes de rolar (`aplicarRevelacaoInspecao`). Estendido a `'valor-pendente'`/
 * `'pagamento-recebido'` na Task T8 (revisão de D11 — essas origens agora têm linha real).
 */
export function calcularLinhaAncoraVisual(
  mapaIndiceVisualReal: number[],
  aviso: Aviso | undefined,
): number | undefined {
  if (!aviso || !ORIGENS_COM_EFEITO_GRID.has(aviso.origem) || aviso.alvo.length === 0) {
    return undefined
  }
  const indiceRealAncora = Number(aviso.alvo[0])
  const posicaoVisual = mapaIndiceVisualReal.indexOf(indiceRealAncora)
  return posicaoVisual >= 0 ? posicaoVisual : undefined
}

/**
 * Revela, durante a inspeção ativa, as linhas envolvidas que estão ocultas pelo filtro atual
 * (D8 do ADR). Recebe os índices reais envolvidos (`indicesEnvolvidos`); para cada um ausente
 * de `mapaIndiceVisualReal`, anexa a linha correspondente de `lancamentos` ao final da visão
 * exibida. Sem índices envolvidos (`[]` — inspeção inativa ou origem sem efeito de grid),
 * retorna a MESMA referência de `lancamentosVisiveis`/`mapaIndiceVisualReal` recebidos,
 * desfazendo qualquer revelação anterior (o chamador nunca preserva estado extra de revelação
 * entre chamadas — cada render recalcula a partir do estado de inspeção atual).
 */
export function aplicarRevelacaoInspecao(
  lancamentos: Lancamento[],
  lancamentosVisiveis: Lancamento[],
  mapaIndiceVisualReal: number[],
  indicesEnvolvidosReais: number[],
): { linhas: Lancamento[]; mapa: number[] } {
  if (indicesEnvolvidosReais.length === 0) {
    return { linhas: lancamentosVisiveis, mapa: mapaIndiceVisualReal }
  }

  const jaVisiveis = new Set(mapaIndiceVisualReal)
  const ocultos = indicesEnvolvidosReais.filter((i) => !jaVisiveis.has(i))
  if (ocultos.length === 0) {
    return { linhas: lancamentosVisiveis, mapa: mapaIndiceVisualReal }
  }

  const linhasOcultas = ocultos
    .map((i) => lancamentos[i])
    .filter((l): l is Lancamento => l !== undefined)
  const indicesOcultosValidos = ocultos.filter((i) => lancamentos[i] !== undefined)

  return {
    linhas: [...lancamentosVisiveis, ...linhasOcultas],
    mapa: [...mapaIndiceVisualReal, ...indicesOcultosValidos],
  }
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
 * - Vermelho/verde-menta (`TEMA_INSPECAO_SAI`/`TEMA_INSPECAO_FICA`): enquanto uma proposta de
 *   origem `'conciliacao'`, `'valor-pendente'` ou `'pagamento-recebido'` está em inspeção
 *   (`avisosAcionaveis.avisoEmInspecao`), com precedência sobre os três temas acima (Task T4/T8,
 *   D4/D16/D17 do ADR `inspecao-proposta-conciliacao`). Só `'conciliacao'` tem o papel "fica"
 *   (verde-menta); as outras duas têm sempre `permanece: []`, então só produzem "sai" (vermelho).
 *   Linhas envolvidas ocultas pelo filtro ativo são reveladas enquanto a inspeção dura (D8) e a
 *   grid rola até a linha "sai" (D3). Revisão de T4/D11 pela Task T8: `'valor-pendente'`/
 *   `'pagamento-recebido'` deixaram de ser não-efeito assim que T6/T7 passaram a dar a essas
 *   origens uma linha real em `lancamentos`.
 *
 * Seleção múltipla: exibe a soma dos valores das linhas selecionadas abaixo da grid.
 *
 * Detecção de split: ao editar Iniciais com `'/'`, chama `onSplitDetectado(indice)`.
 */
export function ReviewGrid({ onSplitDetectado }: ReviewGridProps) {
  const lancamentos = useAppStore((s) => s.lancamentos)
  const lancamentosVisiveis = useAppStore((s) => s.lancamentosVisiveis)
  const mapaIndiceVisualReal = useAppStore((s) => s.mapaIndiceVisualReal)
  const naturezasValidas = useAppStore((s) => s.naturezasValidas)
  const editarCelula = useAppStore((s) => s.editarCelula)
  const preencherIntervalo = useAppStore((s) => s.preencherIntervalo)
  const dicEntries = useAppStore((s) => s.dicEntries)
  const ordenacaoColuna = useAppStore((s) => s.ordenacaoColuna)
  const ordenacaoDirecao = useAppStore((s) => s.ordenacaoDirecao)
  const ciclarOrdenacao = useAppStore((s) => s.ciclarOrdenacao)
  const avisos = useAppStore((s) => s.avisosAcionaveis.avisos)
  const avisoEmInspecaoId = useAppStore((s) => s.avisosAcionaveis.avisoEmInspecao)

  // -----------------------------------------------------------------
  // Inspeção de proposta (Task T4, estendida por T8 — D3/D4/D7/D8/D16/D17 do ADR
  // `inspecao-proposta-conciliacao`). Deriva o aviso ativo, o contexto de
  // sai/fica e a visão revelada (linhas ocultas pelo filtro envolvidas na
  // proposta) a partir do estado do slice — puramente reativo, sem estado
  // local próprio (a revelação nunca sobrevive além do render corrente).
  // -----------------------------------------------------------------

  const avisoEmInspecao = useMemo(
    () => avisos.find((a) => a.id === avisoEmInspecaoId),
    [avisos, avisoEmInspecaoId],
  )
  const contextoInspecao = useMemo(
    () => derivarContextoInspecao(avisoEmInspecao),
    [avisoEmInspecao],
  )
  const envolvidosInspecao = useMemo(
    () => indicesEnvolvidos(avisoEmInspecao),
    [avisoEmInspecao],
  )
  const { linhas: lancamentosExibidos, mapa: mapaExibidoReal } = useMemo(
    () =>
      aplicarRevelacaoInspecao(
        lancamentos,
        lancamentosVisiveis,
        mapaIndiceVisualReal,
        envolvidosInspecao,
      ),
    [lancamentos, lancamentosVisiveis, mapaIndiceVisualReal, envolvidosInspecao],
  )

  // Auto-scroll até a linha-âncora ("sai") ao entrar em inspeção de conciliação (D3).
  const dataEditorRef = useRef<DataEditorRef | null>(null)
  useEffect(() => {
    const linhaAncora = calcularLinhaAncoraVisual(mapaExibidoReal, avisoEmInspecao)
    if (linhaAncora === undefined) return
    dataEditorRef.current?.scrollTo(0, linhaAncora, 'vertical')
  }, [mapaExibidoReal, avisoEmInspecao])

  // -----------------------------------------------------------------
  // Estado local de larguras de coluna — D16/D17/D18 do ADR grid-ux-filtros
  // Auto-medição vence manual: ao recalcular, descarta ajustes manuais.
  // -----------------------------------------------------------------

  const [largurasColunas, setLargurasColunas] = useState<number[]>(
    () => COLUNAS_BASE.map((c) => c.width ?? 120),
  )

  // Timer ref para debounce de 300 ms (D18 do ADR)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Agenda recálculo automático de larguras com debounce de 300 ms.
   * Ao disparar, substitui TODO o estado local (auto vence manual — D16).
   */
  const agendarRecalculoLarguras = useCallback(
    (lista: Lancamento[]) => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        setLargurasColunas(calcularLargurasColunas(lista, COLUNAS_BASE))
      }, 300)
    },
    [],
  )

  // Recalcula na carga dos dados visíveis (D18 — na carga dos dados)
  useEffect(() => {
    agendarRecalculoLarguras(lancamentosVisiveis)
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current)
    }
  }, [lancamentosVisiveis, agendarRecalculoLarguras])

  // Colunas com larguras dinâmicas aplicadas + indicador de ordenação no título
  // (ordenação por clique no cabeçalho — decisão humana de 2026-07-15).
  const colunas: GridColumn[] = useMemo(
    () =>
      COLUNAS_BASE.map((col, i) => {
        const ordenada = COL_IDS[i] === ordenacaoColuna
        const indicador = ordenada ? (ordenacaoDirecao === 'asc' ? ' ↑' : ' ↓') : ''
        return { ...col, title: col.title + indicador, width: largurasColunas[i] ?? col.width }
      }),
    [largurasColunas, ordenacaoColuna, ordenacaoDirecao],
  )

  // Clique no cabeçalho cicla a ordenação da coluna: sem → asc → desc → sem.
  const onHeaderClicked = useCallback(
    (colIndex: number) => {
      const colId = COL_IDS[colIndex]
      if (colId) ciclarOrdenacao(colId)
    },
    [ciclarOrdenacao],
  )

  // Ref compartilhada com o componente editor estável (atualizada via onCellActivated)
  const editorContextRef = useRef<{ col: number; row: number }>({ col: -1, row: -1 })

  // Refs de dados para o editor — permitem leituras sempre frescas sem re-criar o componente.
  // O GhostEditor usa lancamentosRef[row] onde row é índice VISUAL; usamos lancamentosExibidos
  // (visão com revelação de inspeção aplicada — Task T4).
  const lancamentosRef = useRef(lancamentosExibidos)
  lancamentosRef.current = lancamentosExibidos
  const dicEntriesRef = useRef(dicEntries)
  dicEntriesRef.current = dicEntries

  // onCellActivated: atualiza editorContextRef antes do provideEditor ser invocado
  const onCellActivated = useCallback((cell: Item) => {
    const [col, row] = cell
    editorContextRef.current = { col, row }
  }, [])

  // Ref estável para reposicionar a seleção após Tab confirmar uma edição.
  // O movement do Glide só expressa deltas de ±1; o salto Descrição→Iniciais
  // da linha de baixo (proximaCelulaAposTab) exige seleção programática.
  const navegarParaRef = useRef<(destino: [number, number]) => void>(() => {})

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
              const celulaEditada = {
                ...value,
                kind: GridCellKind.Text,
                data: texto,
                displayData: texto,
              } as GridCell
              // Tab-navegação ([1, 0]): o destino real vem de proximaCelulaAposTab
              // (zigue-zague Descrição→Iniciais+1) — confirma sem mover e
              // reposiciona a seleção programaticamente.
              if (movement[0] === 1 && movement[1] === 0) {
                const destino = proximaCelulaAposTab(col, row, lancamentosRef.current.length)
                onFinishedEditing(celulaEditada, [0, 0])
                navegarParaRef.current(destino)
              } else {
                onFinishedEditing(celulaEditada, movement)
              }
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

  // Reposiciona a seleção para `destino` após o overlay do editor fechar.
  // setTimeout(0): deixa o Glide aplicar o movement [0, 0] do commit antes
  // de sobrescrever a seleção com o destino do zigue-zague.
  navegarParaRef.current = (destino) => {
    setTimeout(() => {
      editorContextRef.current = { col: destino[0], row: destino[1] }
      setGridSelection({
        columns: CompactSelection.empty(),
        rows: CompactSelection.empty(),
        current: {
          cell: destino,
          range: { x: destino[0], y: destino[1], width: 1, height: 1 },
          rangeStack: [],
        },
      })
      // Seleção programática não dispara onGridSelectionChange — atualiza a
      // soma da seleção manualmente para não exibir o valor da célula anterior.
      setSomaSelecao(calcularSomaSelecionados(lancamentosRef.current, [destino[1]]))
    }, 0)
  }

  // Soma dos valores das linhas atualmente selecionadas (null = nenhuma seleção relevante)
  const [somaSelecao, setSomaSelecao] = useState<number | null>(null)

  // -----------------------------------------------------------------
  // getCellContent: mapeamento [col, row] → célula do Glide Data Grid
  // -----------------------------------------------------------------

  const getCellContent = useCallback(
    ([col, row]: Item) => {
      const l = lancamentosExibidos[row]

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
    [lancamentosExibidos],
  )

  // -----------------------------------------------------------------
  // onCellEdited: despacha editarCelula para o store
  // Traduz índice visual→índice real via mapaIndiceVisualReal (D14 do ADR).
  // -----------------------------------------------------------------

  const onCellEdited = useCallback(
    ([col, row]: Item, novoValor: EditableGridCell) => {
      // Colunas somente leitura nunca chegam aqui, mas a guarda é defensiva
      if (COLUNAS_SOMENTE_LEITURA.has(col)) return

      // Tradução índice visual → índice real (D14 do ADR grid-ux-filtros); usa o mapa exibido
      // (revelação de inspeção aplicada — Task T4) para permanecer correto em linhas reveladas.
      const indiceReal = mapaExibidoReal[row] ?? row

      switch (col) {
        case COL_INICIAIS: {
          const val = novoValor.kind === GridCellKind.Text ? novoValor.data : ''
          if (val.includes('/') && onSplitDetectado) {
            onSplitDetectado(indiceReal)
          }
          editarCelula(indiceReal, 'iniciais', val)
          break
        }
        case COL_NATUREZA: {
          const val = novoValor.kind === GridCellKind.Text ? novoValor.data : ''
          editarCelula(indiceReal, 'natureza', val)
          break
        }
        case COL_DESCRICAO: {
          const val = novoValor.kind === GridCellKind.Text ? novoValor.data : ''
          editarCelula(indiceReal, 'descricao', val)
          break
        }
        case COL_VALOR: {
          const val = novoValor.kind === GridCellKind.Number ? (novoValor.data ?? 0) : 0
          editarCelula(indiceReal, 'valor', val)
          break
        }
      }

      // Agenda recálculo de larguras após edição (D18 do ADR)
      agendarRecalculoLarguras(lancamentosVisiveis)
    },
    [editarCelula, onSplitDetectado, mapaExibidoReal, lancamentosVisiveis, agendarRecalculoLarguras],
  )

  // -----------------------------------------------------------------
  // getRowThemeOverride: realce visual por linha (D2 do ADR; D4/D7 — inspeção
  // de conciliação tem precedência, Task T4)
  // -----------------------------------------------------------------

  const getRowThemeOverride: GetRowThemeCallback = useCallback(
    (row) => {
      const l = lancamentosExibidos[row]
      if (!l) return undefined
      const indiceReal = mapaExibidoReal[row] ?? row
      return calcularTemaLinhaComInspecao(l, indiceReal, naturezasValidas, contextoInspecao)
    },
    [lancamentosExibidos, mapaExibidoReal, naturezasValidas, contextoInspecao],
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
      const l = lancamentosExibidos[args.row]
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
    [lancamentosExibidos],
  )

  // -----------------------------------------------------------------
  // onFillPattern: fill handle replica valor nas colunas editáveis (D14/D15 do ADR)
  // Ignora colunas somente leitura (Fonte, Data, Transcrição) por colId.
  // Traduz índices visuais → reais via mapaIndiceVisualReal (via preencherIntervalo).
  // -----------------------------------------------------------------

  const onFillPattern = useCallback(
    ({ patternSource, fillDestination }: FillPatternEventArgs) => {
      // Obtém o colId textual da coluna de destino (x do destino)
      const colIdx = fillDestination.x
      const colId = COL_IDS[colIdx]

      // D15: ignora colunas somente leitura
      if (!colId || ehColunaLeituraApenas(colId)) return

      // Lê o valor da célula de origem (primeira célula do pattern source)
      const celulaOrigem = getCellContent([patternSource.x, patternSource.y])

      let valorFill: string | number = ''
      if (celulaOrigem.kind === GridCellKind.Text) {
        valorFill = celulaOrigem.data
      } else if (celulaOrigem.kind === GridCellKind.Number) {
        valorFill = (celulaOrigem as NumberCell).data ?? 0
      }

      // D14: preencherIntervalo opera sobre lancamentosVisiveis e usa mapaIndiceVisualReal
      // internamente — os índices aqui são visuais (linhas visíveis)
      const startRow = fillDestination.y
      const endRow = fillDestination.y + fillDestination.height - 1
      preencherIntervalo(startRow, endRow, colId, valorFill)
    },
    [getCellContent, preencherIntervalo],
  )

  // -----------------------------------------------------------------
  // onColumnResize: estado local de larguras (D16 do ADR grid-ux-filtros)
  // Atualiza apenas a coluna alterada manualmente.
  // -----------------------------------------------------------------

  const onColumnResize = useCallback(
    (_col: GridColumn, newSize: number, colIndex: number) => {
      setLargurasColunas((prev) => {
        const nova = [...prev]
        nova[colIndex] = newSize
        return nova
      })
    },
    [],
  )

  // -----------------------------------------------------------------
  // onGridSelectionChange: atualiza seleção e recalcula soma
  // -----------------------------------------------------------------

  const onGridSelectionChange = useCallback(
    (sel: GridSelection) => {
      setGridSelection(sel)

      // Mantém o contexto do editor atualizado também quando a edição começa por
      // digitação direta (que abre o editor SEM disparar onCellActivated) — senão
      // o provideEditor lê col defasada e o GhostEditor não abre (bug latente
      // exposto na inspeção manual de 2026-07-15).
      if (sel.current?.cell) {
        const [col, row] = sel.current.cell
        editorContextRef.current = { col, row }
      }

      // Coleta índices de linhas selecionadas via row markers (CompactSelection)
      const indices: number[] = [...sel.rows]

      // Inclui linhas cobertas pela seleção de célula atual (range)
      if (sel.current?.range) {
        const { y, height } = sel.current.range
        for (let r = y; r < y + height; r++) {
          if (!indices.includes(r)) indices.push(r)
        }
      }

      setSomaSelecao(indices.length > 0 ? calcularSomaSelecionados(lancamentosExibidos, indices) : null)
    },
    [lancamentosExibidos],
  )

  // -----------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DataEditor
          ref={dataEditorRef}
          columns={colunas}
          rows={lancamentosExibidos.length}
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
          /* Fill handle conectado: onFillPattern replica valor nas colunas editáveis (D14/D15). */
          fillHandle={true}
          onFillPattern={onFillPattern}
          /* Redimensionamento manual de colunas com estado local (D16). */
          onColumnResize={onColumnResize}
          /* Custom editor inline com ghost-text (T2 — D1/D5/D8 do ADR). */
          provideEditor={provideEditor}
          onCellActivated={onCellActivated}
          onHeaderClicked={onHeaderClicked}
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
