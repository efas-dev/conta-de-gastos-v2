// ADR: see Docs/specs/grid-revisao.adr.md
// ADR: see Docs/specs/grid-ux-filtros.adr.md
// ADR: see Docs/specs/inspecao-proposta-conciliacao.adr.md

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
  type Highlight,
  type GridKeyEventArgs,
} from '@glideapps/glide-data-grid'
import '@glideapps/glide-data-grid/dist/index.css'
import { useAppStore, type CampoEditavel } from '../store/appStore'
import type { Lancamento, Aviso } from '../../types'
import { GhostEditorCore } from './GhostEditor'
import { montarColagem } from './colagemGrid'

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

/** Prefixo (`R$`/`-R$`) e número pt-BR — os dois blocos que o `drawCell` da coluna Valor pinta. */
export function partesValorContabil(valor: number): { prefixo: string; numero: string } {
  return {
    prefixo: valor < 0 ? '-R$' : 'R$',
    numero: Math.abs(valor).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  }
}

/** O texto completo da coluna Valor como o usuário o lê: `-R$ 10.595,06`. */
export function formatarValorContabil(valor: number): string {
  const { prefixo, numero } = partesValorContabil(valor)
  return `${prefixo} ${numero}`
}

/**
 * Escolhe o layout da coluna Valor conforme o espaço disponível (item 14.c + dívida
 * `bug-visualizacao-valor-grande-coluna-valor`).
 *
 * `'contabil'` é o formato desejado — prefixo ancorado à esquerda, número à direita, o padrão de
 * planilha financeira. Ele só se sustenta enquanto sobra folga entre os dois blocos; numa coluna
 * estreita eles se sobrepõem e o começo do número desaparece sob o prefixo (o valor lido vira
 * outro, que é o pior defeito possível numa grid de dinheiro). Nesse caso, `'compacto'`: uma
 * string só, alinhada à direita, que o clipe do `drawCell` corta pela esquerda de forma visível.
 */
export function escolherLayoutValor(
  larguraPrefixo: number,
  larguraNumero: number,
  larguraDisponivel: number,
): 'contabil' | 'compacto' {
  return larguraPrefixo + larguraNumero + FOLGA_CONTABIL_PX <= larguraDisponivel
    ? 'contabil'
    : 'compacto'
}

export function medirLarguraValorContabil(valor: number, maxPx: number): number {
  const { prefixo, numero } = partesValorContabil(valor)
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
//
// Task T2 (re-tematização): o Glide Data Grid pinta em canvas — não resolve
// var(--x) do CSS nativamente. As cores abaixo são lidas da CSSOM real
// (`:root`, definido em T1) via `lerVarCSS`, por getter, a cada acesso a
// `.bgCell` — nunca no escopo do módulo (import time). Motivo: `main.tsx`
// importa `./App` (que resolve todo o grafo de módulos, incluindo este
// arquivo) ANTES de `import './index.css'` — uma leitura no topo do módulo
// ocorreria antes do CSS ser injetado no DOM. Ler sob demanda garante que a
// leitura só acontece quando o Glide efetivamente desenha (bem depois do
// React montar, e portanto depois do CSS já aplicado), independentemente da
// ordem de import. Em jsdom (testes que não montam o componente — Glide
// depende de Canvas), sem `index.css` carregado, a leitura retorna string
// vazia — contrato documentado (TL-22), nunca lança e nunca cai para um hex
// hardcoded como substituto.
// ---------------------------------------------------------------------------

/** Lê uma variável CSS de `:root` (via `document.documentElement`) em runtime. */
export function lerVarCSS(nomeVar: string): string {
  if (typeof document === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(nomeVar).trim()
}

/** Cria um tema de linha cujo `bgCell` é derivado, por getter, da variável CSS informada. */
function criarTemaLinha(nomeVar: string): { readonly bgCell: string } {
  return {
    get bgCell() {
      return lerVarCSS(nomeVar)
    },
  }
}

/**
 * Linha "sai" durante inspeção de proposta de conciliação (D4/D5 do ADR
 * `inspecao-proposta-conciliacao`). Lê `--insp-sai-bg` (rosa pálido) como FUNDO
 * da célula — legível para o texto escuro e para a coluna Valor (que tem cor
 * própria). A cor saturada `--insp-sai` (#c94f46) é reservada para acentos/bordas;
 * usá-la como fundo deixava o texto vermelho-sobre-vermelho, ilegível (fix de
 * contraste 2026-08-04). Distinta de `TEMA_ERRO` (pêssego). Precedência sobre
 * erro/transferência/investimento enquanto a inspeção está ativa (D4).
 */
export const TEMA_INSPECAO_SAI = criarTemaLinha('--insp-sai-bg')

/**
 * Linha "fica" durante inspeção de proposta de conciliação (D4/D5 do ADR
 * `inspecao-proposta-conciliacao`). Lê `--insp-fica-bg` (menta pálido) como FUNDO
 * — legível, ao contrário do `--insp-fica` (#3e9c78) saturado, que deixava o
 * texto verde-sobre-verde ilegível (fix de contraste 2026-08-04). Distinta de
 * `TEMA_INVESTIMENTO` (verde/amarelado) para não colidir os dois papéis.
 */
export const TEMA_INSPECAO_FICA = criarTemaLinha('--insp-fica-bg')

/**
 * Monta o tema base da grid Glide lendo as variáveis CSS de `:root` (T1).
 * Chamada uma vez, dentro do componente (via `useMemo`), garantidamente após
 * o React montar — ponto em que `index.css` já foi injetado, independente
 * da ordem de import em `main.tsx` (mesmo raciocínio de `criarTemaLinha`
 * acima). `bgHeaderHovered` não tem uma variável 1:1 exata no design system
 * portado por T1 (não previu um tom de hover do cabeçalho distinto);
 * reaproveita `--verde-suave`, o tom mais próximo da paleta (mesma família
 * de superfície clara com viés de acento) — decisão local registrada no
 * log de iteração da Task T2.
 */
/**
 * Altura da linha e do cabeçalho da grid, em px (item 45 do TODO).
 *
 * Alvo: a densidade de uma planilha (Google Sheets usa ~21-30px), não a de um formulário. As
 * duas altura vêm juntas porque o tema de fonte/padding em `criarTemaGrid` foi calibrado para
 * elas — mexer numa sem a outra descasa o respiro vertical do texto.
 */
const ALTURA_LINHA = 30
const ALTURA_CABECALHO = 30

function criarTemaGrid() {
  return {
    accentColor: lerVarCSS('--verde'),
    accentLight: lerVarCSS('--verde-suave'),
    textDark: lerVarCSS('--texto'),
    textMedium: lerVarCSS('--texto-3'),
    textLight: lerVarCSS('--muted'),
    textHeader: lerVarCSS('--muted'),
    textBubble: lerVarCSS('--texto'),
    bgCell: lerVarCSS('--superficie'),
    bgCellMedium: lerVarCSS('--barra'),
    bgHeader: lerVarCSS('--barra'),
    bgHeaderHasFocus: lerVarCSS('--borda-2'),
    bgHeaderHovered: lerVarCSS('--verde-suave'),
    borderColor: lerVarCSS('--borda-linha'),
    horizontalBorderColor: lerVarCSS('--borda-linha'),
    drilldownBorder: lerVarCSS('--borda-3'),
    fontFamily: "'Manrope', system-ui, sans-serif",
    /* Densidade estilo Google Sheets (item 45): fonte e respiro menores acompanham a linha mais
       baixa de `ALTURA_LINHA`, para caber mais lançamentos na tela sem perder legibilidade. */
    baseFontStyle: '500 13px',
    headerFontStyle: '700 11px',
    editorFontSize: '13px',
    cellHorizontalPadding: 9,
    headerBottomBorderColor: lerVarCSS('--borda'),
  }
}

// ---------------------------------------------------------------------------
// Funções puras auxiliares — exportadas para testabilidade futura (T10)
// ---------------------------------------------------------------------------

// O realce permanente de linha por categoria (atenção / transferência própria /
// investimento) e sua legenda foram APOSENTADOS em 2026-08-09, a pedido do usuário:
// o que essas cores sinalizavam passou a ser tratado pelo algoritmo de sugestão de
// natureza (que já preenche as linhas) e pelos avisos acionáveis de investimento e
// transferência interna (que propõem a remoção da linha). O realce só sobrevive no
// modo inspeção de aviso — ver `calcularTemaLinhaComInspecao` logo abaixo, que é
// temporário e sai quando o usuário fecha a inspeção.

// ---------------------------------------------------------------------------
// Inspeção de proposta (Task T4, estendida por T8 — ADR `inspecao-proposta-conciliacao`)
// ---------------------------------------------------------------------------

/**
 * Origens de aviso que produzem efeito visual na grid durante a inspeção (Task T8, revisão de
 * D11/T4). `'conciliacao'` sempre teve efeito; `'valor-pendente'`/`'pagamento-recebido'` passaram
 * a ter linha real em `lancamentos` a partir de T6/T7 (D16/D17 do ADR) — a grid deixa de ser
 * 100% inalterada para essas origens. Só `'conciliacao'` tem o papel "fica" (verde-menta); as
 * demais têm `permanece` sempre `[]`, então só produzem o papel "sai".
 *
 * `'transferencia-interna'` e `'investimento'` entraram em 2026-08-16, corrigindo um vão: as duas
 * origens propõem `remover` linhas reais do grid (ver `registry.ts`), mas estavam fora deste
 * conjunto — então inspecionar esses avisos abria o banner ("1 linha") sem destacar linha nenhuma.
 * Enquanto existiu realce permanente por categoria, a cor de categoria mascarava a ausência; ela
 * foi aposentada em 2026-08-09 e o vão ficou visível.
 *
 * O critério para entrar aqui é ter alvo que aponta para linha existente no grid. `'vr'` e
 * `'rendimentos'` ficam de fora porque *criam* lançamentos em vez de apontar para os existentes,
 * e `'desalinhamento-mes'` é informativo, sem alvo.
 */
const ORIGENS_COM_EFEITO_GRID = new Set([
  'conciliacao',
  'valor-pendente',
  'pagamento-recebido',
  'transferencia-interna',
  'investimento',
])

/**
 * Origens cujo `Aviso.alvo` carrega `Lancamento.id` em vez de índice posicional.
 *
 * O campo `alvo` tem duas convenções no projeto, e a diferença é invisível pelo tipo (`string[]`
 * nos dois casos): `conciliacao`/`valor-pendente`/`pagamento-recebido` gravam a POSIÇÃO da linha
 * (ver `deteccoes.ts` e o remapeamento em `registry.ts`), enquanto `transferencia-interna` e
 * `investimento` gravam o ID do lançamento (ver `investimento.ts`, que documenta a escolha:
 * o aviso mira o lançamento independentemente de reordenação).
 *
 * Comparar id contra índice não casaria nunca — e pior, poderia casar por acidente quando um id
 * coincidisse com a posição de outra linha, destacando a linha errada. Por isso a comparação é
 * decidida pela origem, não por heurística.
 */
const ORIGENS_ALVO_POR_ID = new Set(['transferencia-interna', 'investimento'])

/**
 * Conjuntos de identidade para os papéis "sai"/"fica" da inspeção.
 *
 * `porId` diz contra o quê comparar: `true` → `Lancamento.id`; `false` → índice real em
 * `lancamentos`. Ver `ORIGENS_ALVO_POR_ID`.
 */
export interface ContextoInspecaoConciliacao {
  alvoSet: Set<string>
  permaneceSet: Set<string>
  porId: boolean
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
    porId: ORIGENS_ALVO_POR_ID.has(aviso.origem),
  }
}

/**
 * Folga vertical mínima (px) para o tooltip caber acima da célula. Abaixo disso ele vai para
 * baixo, senão ficaria cortado no topo da janela.
 */
const ALTURA_TOOLTIP_FOLGA = 90

/** Tooltip de célula truncada: o texto integral e a âncora (a própria célula sob o cursor). */
export interface TooltipCelula {
  texto: string
  /** Coordenadas de viewport da célula — Glide soma o `getBoundingClientRect()` do canvas. */
  x: number
  y: number
  alturaCelula: number
}

/**
 * Texto efetivamente desenhado numa célula — o que o tooltip precisa mostrar por inteiro.
 *
 * A coluna Valor é a única cujo texto renderizado difere do campo cru: o `drawCell` pinta o
 * formato contábil (`-R$ 10.595,06`), não o `-10595.06` de `String(l.valor)`.
 */
export function textoRenderizadoDaCelula(col: number, l: Lancamento): string {
  if (col === COL_VALOR) return formatarValorContabil(l.valor)
  const colId = COL_IDS[col]
  return colId === undefined ? '' : String(l[colId as keyof Lancamento] ?? '')
}

/**
 * Largura estimada, em px, do texto desenhado numa célula — sem o teto de `LARGURA_MAXIMA_PX`.
 *
 * Usa a MESMA heurística da auto-largura (`calcularLargurasColunas`) de propósito: assim
 * "a auto-largura coube" e "não há tooltip" são a mesma afirmação. Com o teto aplicado, uma
 * coluna estourada mediria exatamente a própria largura e o predicado nunca dispararia.
 */
export function estimarLarguraDaCelula(col: number, l: Lancamento): number {
  return col === COL_VALOR
    ? medirLarguraValorContabil(l.valor, Infinity)
    : medirLarguraHeuristica(textoRenderizadoDaCelula(col, l), Infinity)
}

/**
 * Decide se o item sob o cursor rende tooltip e onde ancorá-lo (item 14 do TODO).
 *
 * Vale para **qualquer** coluna cujo conteúdo não caiba na largura atual — não só a Transcrição,
 * que era o escopo da primeira versão. Motivo: a auto-largura tem teto (`LARGURA_MAXIMA_PX`) e o
 * usuário pode encolher qualquer coluna à mão, então Natureza, Descrição e Valor truncam também;
 * a densidade menor da grid (item 45) só tornou isso mais frequente.
 *
 * O predicado de truncamento compara a largura estimada do texto com a largura REAL da célula,
 * que o Glide já entrega em `bounds.width` — nada de reler o estado de larguras. Sem ele o
 * tooltip aparecia em toda célula sob o cursor, inclusive nas que cabem folgadas.
 *
 * Retorna `null` no cabeçalho (`row < 0`), em linha inexistente, em coluna fora do range (o
 * marcador de linha), sem `bounds` (Glide não devolve âncora fora da área de células), com
 * conteúdo em branco, ou quando o texto cabe.
 *
 * Função pura — a posição na tela vem só de `bounds`, sem tocar no DOM.
 */
export function derivarTooltipCelula(
  location: readonly [number, number],
  bounds: { x: number; y: number; width: number; height: number } | undefined,
  lancamentos: Lancamento[],
): TooltipCelula | null {
  const [col, row] = location
  if (row < 0 || bounds === undefined) return null
  if (col < 0 || col >= COL_IDS.length) return null

  const l = lancamentos[row]
  if (!l) return null

  const texto = textoRenderizadoDaCelula(col, l)
  if (texto.trim() === '') return null
  if (estimarLarguraDaCelula(col, l) <= bounds.width) return null

  return { texto, x: bounds.x, y: bounds.y, alturaCelula: bounds.height }
}

/**
 * Índices reais em `lancamentos` de todas as linhas envolvidas na inspeção ativa — união de
 * `alvo` (sai) e `permanece` (fica). Vazio quando não há inspeção com efeito de grid ativa
 * (origem fora de `ORIGENS_COM_EFEITO_GRID`).
 *
 * Para as origens de `ORIGENS_ALVO_POR_ID`, `alvo` traz `Lancamento.id` — aqui os ids são
 * traduzidos para posição via `lancamentos`, porque quem consome isto (`aplicarRevelacaoInspecao`)
 * trabalha com índice. Um id sem lançamento correspondente é descartado em vez de virar `NaN`.
 */
export function indicesEnvolvidos(aviso: Aviso | undefined, lancamentos: Lancamento[] = []): number[] {
  if (!aviso || !ORIGENS_COM_EFEITO_GRID.has(aviso.origem)) return []
  const bruto = [...aviso.alvo, ...aviso.permanece]
  if (!ORIGENS_ALVO_POR_ID.has(aviso.origem)) return bruto.map(Number)
  const posicaoPorId = new Map(lancamentos.map((l, i) => [String(l.id), i]))
  return bruto.map((id) => posicaoPorId.get(id)).filter((i): i is number => i !== undefined)
}

/**
 * Tema visual de uma linha considerando o modo inspeção (D4/D7 do ADR
 * `inspecao-proposta-conciliacao`).
 *
 * Casa por identidade — o índice REAL do lançamento em `lancamentos`, nunca a posição
 * visual/ordenada — o que torna o destaque robusto a filtro/ordenação ativos (D7). Fora da
 * inspeção nenhuma linha recebe realce: com a aposentadoria do realce permanente por
 * categoria (2026-08-09), a cor no grid passou a significar uma coisa só — "esta linha faz
 * parte do aviso que você está inspecionando agora".
 */
export function calcularTemaLinhaComInspecao(
  indiceReal: number,
  contextoInspecao: ContextoInspecaoConciliacao | undefined,
  idLancamento?: number | string,
): typeof TEMA_INSPECAO_SAI | typeof TEMA_INSPECAO_FICA | undefined {
  if (contextoInspecao) {
    // A chave de comparação depende da convenção da origem (ver `ORIGENS_ALVO_POR_ID`): posição da
    // linha para conciliação e afins, `Lancamento.id` para transferência interna e investimento.
    const chave =
      contextoInspecao.porId && idLancamento !== undefined
        ? String(idLancamento)
        : String(indiceReal)
    if (contextoInspecao.alvoSet.has(chave)) return TEMA_INSPECAO_SAI
    if (contextoInspecao.permaneceSet.has(chave)) return TEMA_INSPECAO_FICA
  }
  return undefined
}

/**
 * Posição visual (índice em `lancamentosVisiveis`/`mapaIndiceVisualReal`) da linha-âncora
 * ("sai", `alvo[0]`) para o auto-scroll da inspeção (D3 do ADR). Busca por identidade em
 * `mapaIndiceVisualReal`, robusto a ordenação ativa (D7). Retorna `undefined` quando não há
 * aviso em inspeção com efeito de grid (`ORIGENS_COM_EFEITO_GRID`), quando `alvo` está vazio,
 * ou quando o índice-âncora não está (ainda) presente no mapa — o chamador é responsável por
 * revelar a linha antes de rolar (`aplicarRevelacaoInspecao`). Estendido a `'valor-pendente'`/
 * `'pagamento-recebido'` na Task T8 (revisão de D11 — essas origens agora têm linha real).
 *
 * `alvo[0]` obedece às duas convenções de `ORIGENS_ALVO_POR_ID`: para `transferencia-interna` e
 * `investimento` ele é `Lancamento.id` e precisa da tradução id→índice que `indicesEnvolvidos`
 * já fazia para o realce. Sem ela, o id casava por acidente com a POSIÇÃO de outra linha (os
 * ids são seriais a partir de 1) e o scroll ia para a linha errada.
 */
export function calcularLinhaAncoraVisual(
  mapaIndiceVisualReal: number[],
  aviso: Aviso | undefined,
  lancamentos: Lancamento[] = [],
): number | undefined {
  if (!aviso || !ORIGENS_COM_EFEITO_GRID.has(aviso.origem) || aviso.alvo.length === 0) {
    return undefined
  }
  let indiceRealAncora: number | undefined
  if (ORIGENS_ALVO_POR_ID.has(aviso.origem)) {
    const posicaoPorId = new Map(lancamentos.map((l, i) => [String(l.id), i]))
    indiceRealAncora = posicaoPorId.get(aviso.alvo[0])
  } else {
    indiceRealAncora = Number(aviso.alvo[0])
  }
  if (indiceRealAncora === undefined) return undefined

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
 * Realce visual via `getRowThemeOverride` — só o da inspeção de aviso:
 * - Vermelho/verde-menta (`TEMA_INSPECAO_SAI`/`TEMA_INSPECAO_FICA`): enquanto uma proposta de
 *   origem `'conciliacao'`, `'valor-pendente'` ou `'pagamento-recebido'` está em inspeção
 *   (`avisosAcionaveis.avisoEmInspecao`) — Task T4/T8, D4/D16/D17 do ADR
 *   `inspecao-proposta-conciliacao`. Só `'conciliacao'` tem o papel "fica"
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
  const editarCelula = useAppStore((s) => s.editarCelula)
  const preencherIntervalo = useAppStore((s) => s.preencherIntervalo)
  const aplicarColagem = useAppStore((s) => s.aplicarColagem)
  const dicEntries = useAppStore((s) => s.dicEntries)
  const ordenacaoColuna = useAppStore((s) => s.ordenacaoColuna)
  const ordenacaoDirecao = useAppStore((s) => s.ordenacaoDirecao)
  const ciclarOrdenacao = useAppStore((s) => s.ciclarOrdenacao)
  const avisos = useAppStore((s) => s.avisosAcionaveis.avisos)
  const avisoEmInspecaoId = useAppStore((s) => s.avisosAcionaveis.avisoEmInspecao)
  const focoInspecao = useAppStore((s) => s.avisosAcionaveis.focoInspecao)

  // Tema base do Glide — montado uma vez, após o mount (T2: lê variáveis CSS de :root).
  const temaGrid = useMemo(() => criarTemaGrid(), [])

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
    () => indicesEnvolvidos(avisoEmInspecao, lancamentos),
    [avisoEmInspecao, lancamentos],
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
  //
  // `focoInspecao` entra nas dependências para cobrir o resíduo do item 39.1: depois de rolar a
  // grid à mão, pedir a mesma linha de novo não mudaria `avisoEmInspecao` e o efeito não voltaria
  // a rodar. O contador dá identidade nova a cada pedido (botão "Ir para a linha").
  const dataEditorRef = useRef<DataEditorRef | null>(null)
  useEffect(() => {
    const linhaAncora = calcularLinhaAncoraVisual(mapaExibidoReal, avisoEmInspecao, lancamentos)
    if (linhaAncora === undefined) return
    dataEditorRef.current?.scrollTo(0, linhaAncora, 'vertical')
  }, [mapaExibidoReal, avisoEmInspecao, lancamentos, focoInspecao])

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
        onChange,
        onFinishedEditing,
        initialValue,
      }: {
        value: GridCell
        onChange?: (cell: GridCell) => void
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
            /* Cada tecla vira tempValue no overlay do Glide — é o que o
               click-outside commita (senão descartaria o texto parcial). */
            onTextoAlterado={(texto) => {
              onChange?.({
                ...value,
                kind: GridCellKind.Text,
                data: texto,
                displayData: texto,
              } as GridCell)
            }}
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

  // Realce "copiado" (marching ants estilo Sheets): contorno tracejado no range
  // copiado com Ctrl/Cmd+C; some ao colar ou apertar Esc.
  const [highlightRegions, setHighlightRegions] = useState<readonly Highlight[] | undefined>(
    undefined,
  )

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
  // getRowThemeOverride: realce visual por linha — hoje só o da inspeção de
  // aviso (D4/D7, Task T4). O realce permanente por categoria foi aposentado.
  // -----------------------------------------------------------------

  const getRowThemeOverride: GetRowThemeCallback = useCallback(
    (row) => {
      const lancamento = lancamentosExibidos[row]
      if (!lancamento) return undefined
      const indiceReal = mapaExibidoReal[row] ?? row
      return calcularTemaLinhaComInspecao(indiceReal, contextoInspecao, lancamento.id)
    },
    [lancamentosExibidos, mapaExibidoReal, contextoInspecao],
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
      const { prefixo, numero } = partesValorContabil(l.valor)
      const pad = theme.cellHorizontalPadding
      const y = rect.y + rect.height / 2

      ctx.save()
      // Clipe ao retângulo da célula: sem ele o texto vaza para a coluna vizinha quando a
      // coluna Valor é estreita demais (dívida `bug-visualizacao-valor-grande-coluna-valor`).
      ctx.beginPath()
      ctx.rect(rect.x, rect.y, rect.width, rect.height)
      ctx.clip()
      ctx.font = `700 14px ${theme.fontFamily}`
      ctx.fillStyle = negativo ? '#b4654a' : '#4e6a53'
      ctx.textBaseline = 'middle'

      const disponivel = rect.width - pad * 2
      const layout = escolherLayoutValor(
        ctx.measureText(prefixo).width,
        ctx.measureText(numero).width,
        disponivel,
      )
      if (layout === 'contabil') {
        ctx.textAlign = 'left'
        ctx.fillText(prefixo, rect.x + pad, y)
        ctx.textAlign = 'right'
        ctx.fillText(numero, rect.x + rect.width - pad, y)
      } else {
        // Não cabe: prefixo e número colados numa string só, alinhada à direita. O clipe corta o
        // excesso pela ESQUERDA — o usuário vê que falta começo e o tooltip (item 14) entrega o
        // valor inteiro. O formato contábil aqui esconderia dígitos DENTRO do número, que é pior:
        // o número truncado continua parecendo um número válido.
        ctx.textAlign = 'right'
        ctx.fillText(`${prefixo} ${numero}`, rect.x + rect.width - pad, y)
      }
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
  // onPaste: colar (Ctrl/Cmd+V) preenche TODAS as células selecionadas, não só a
  // âncora (estilo Sheets/Excel). Um bloco copiado é replicado (tiled) na seleção.
  // Retorna `false`: assumimos a aplicação manualmente via editarCelula (recomendação
  // do Glide para colagem customizada). `montarColagem` é a lógica pura testada.
  // -----------------------------------------------------------------

  const onPaste = useCallback(
    (target: Item, values: readonly (readonly string[])[]): boolean => {
      const edicoes = montarColagem(
        target,
        values,
        gridSelection.current?.range,
        mapaExibidoReal,
        COL_IDS,
        COLUNAS_SOMENTE_LEITURA,
      )
      // Lote único: um Ctrl+Z desfaz a colagem inteira (item 40).
      aplicarColagem(
        edicoes.map(({ indiceReal, colId, valor }) => ({
          indice: indiceReal,
          campo: colId as CampoEditavel,
          valor,
        })),
      )
      // Colou: encerra o realce de "copiado" (como no Sheets).
      setHighlightRegions(undefined)
      if (edicoes.length > 0) agendarRecalculoLarguras(lancamentosVisiveis)
      return false
    },
    [gridSelection, mapaExibidoReal, aplicarColagem, agendarRecalculoLarguras, lancamentosVisiveis],
  )

  // -----------------------------------------------------------------
  // onKeyDown: feedback visual de "copiado". Ctrl/Cmd+C desenha o contorno
  // tracejado no range selecionado; Esc limpa. Não faz preventDefault — o Glide
  // segue tratando copy/escape normalmente; aqui só ligamos/desligamos o realce.
  // -----------------------------------------------------------------

  const onKeyDown = useCallback(
    (e: GridKeyEventArgs) => {
      const tecla = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && tecla === 'c') {
        const r = gridSelection.current?.range
        if (r) {
          // Alpha baixo: o Glide SEMPRE mescla region.color no fundo da célula
          // (blend), então cor opaca cobriria o texto. Tint translúcido + contorno
          // tracejado = feedback "copiado" estilo Sheets sem prejudicar a leitura.
          setHighlightRegions([
            { color: '#5e7c6340', range: { x: r.x, y: r.y, width: r.width, height: r.height }, style: 'dashed' },
          ])
        }
      } else if (tecla === 'escape') {
        setHighlightRegions(undefined)
      }
    },
    [gridSelection],
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

  // Tooltip de célula truncada: o texto integral da célula sob o cursor, em qualquer coluna cujo
  // conteúdo não caiba na largura atual (item 14). Estado local e puramente visual — some junto
  // com o hover, não entra no store.
  const [tooltip, setTooltip] = useState<TooltipCelula | null>(null)

  const onItemHovered = useCallback(
    (args: { location: readonly [number, number]; bounds?: { x: number; y: number; width: number; height: number } }) => {
      setTooltip(derivarTooltipCelula(args.location, args.bounds, lancamentosExibidos))
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
          /* `clickable-number`: o clique no número seleciona a linha inteira, como no Sheets
             (item 38). Com `"number"` o Glide trata o marcador como decorativo e ignora o
             clique. */
          rowMarkers="clickable-number"
          smoothScrollX
          smoothScrollY
          width="100%"
          height="100%"
          theme={temaGrid}
          headerHeight={ALTURA_CABECALHO}
          rowHeight={ALTURA_LINHA}
          /* Copiar (Ctrl/Cmd+C) usa getCellsForSelection; colar (Ctrl/Cmd+V) via onPaste
             customizado, que preenche TODAS as células selecionadas (estilo Sheets). */
          getCellsForSelection={true}
          onPaste={onPaste}
          /* Realce "copiado" (tracejado) e detecção de Ctrl/Cmd+C / Esc para ligá-lo. */
          highlightRegions={highlightRegions}
          onKeyDown={onKeyDown}
          /* Fill handle conectado: onFillPattern replica valor nas colunas editáveis (D14/D15). */
          fillHandle={true}
          onFillPattern={onFillPattern}
          /* Redimensionamento manual de colunas com estado local (D16). */
          onColumnResize={onColumnResize}
          /* Custom editor inline com ghost-text (T2 — D1/D5/D8 do ADR). */
          provideEditor={provideEditor}
          onCellActivated={onCellActivated}
          onHeaderClicked={onHeaderClicked}
          /* Tooltip de célula truncada — qualquer coluna cujo texto não caiba (item 14). */
          onItemHovered={onItemHovered}
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
            /* Ctrl/Cmd+F abre a busca nativa do Glide (item 43). Vem desligado por default; o
               Glide dá preventDefault no atalho, então a busca do navegador — que só enxerga as
               linhas renderizadas pelo virtualizador — não rouba a tecla. */
            search: true,
            /* F2 abre a edição da célula, além do default (Espaço/Enter/Shift+Enter). */
            activateCell: ' |Enter|shift+Enter|F2',
          }}
        />
      </div>

      {/* Tooltip de célula truncada: `position: fixed` porque os `bounds` do Glide já vêm em
          coordenadas de viewport (ele soma o `getBoundingClientRect()` do canvas). Ancora acima
          da célula; quando não cabe (linha no topo da tela), desce para baixo dela.
          `pointerEvents: none` para não roubar o hover da própria célula. */}
      {tooltip !== null && (
        <div
          role="tooltip"
          className="tooltip-transcricao"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform:
              tooltip.y > ALTURA_TOOLTIP_FOLGA
                ? 'translateY(calc(-100% - 6px))'
                : `translateY(${tooltip.alturaCelula + 6}px)`,
          }}
        >
          {tooltip.texto}
        </div>
      )}

      {somaSelecao !== null && (
        <div className="rodape-soma">
          <span>Soma da seleção</span>
          <span className={'valor ' + (somaSelecao < 0 ? 'neg' : 'pos')}>
            {somaSelecao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        </div>
      )}
    </div>
  )
}
