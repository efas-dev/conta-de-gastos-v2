// ADR: see spec/grid-autocomplete-aviso-saida.adr.md

import type { DicEntry } from '../types'
import { normalizarParaBusca } from './normalizacao'

/**
 * Calcula sugestões de autocompletar para uma coluna de texto na grid de revisão.
 *
 * Fontes e prioridade (Decisão 2 do ADR):
 *   1. `dicEntries` filtrados (ordenados por `vezes` desc) — padrões consolidados.
 *   2. `historicoColunaAtual` como complemento — valores da sessão atual não
 *      presentes no dicionário.
 *
 * Casamento de prefixo ignora caixa e acentos via `normalizarParaBusca`
 * (Decisão 3 do ADR). O valor retornado é sempre a forma canônica armazenada
 * — nunca o prefixo normalizado.
 *
 * Detecção de coluna via parâmetros irmã (Decisão 4 do ADR):
 *   - `naturezaIrma` não-vazio → preenchendo Descrição → extrai `e.descricao`,
 *     filtra `e.natureza === naturezaIrma`.
 *   - `descricaoIrma` não-vazio → preenchendo Natureza → extrai `e.natureza`,
 *     filtra `e.descricao === descricaoIrma`.
 *   - nenhuma irmã → preenchendo Iniciais → extrai `e.iniciais`.
 *
 * Zero imports de UI ou store — função pura, testável em isolamento.
 *
 * @param prefixo           Texto digitado pelo usuário até o momento.
 * @param dicEntries        Entradas do dicionário carregado (todos os registros).
 * @param historicoColunaAtual Valores já usados na coluna nesta sessão.
 * @param naturezaIrma      Valor atual da coluna Natureza na mesma linha (opcional).
 * @param descricaoIrma     Valor atual da coluna Descrição na mesma linha (opcional).
 * @returns                 Lista de sugestões ordenada, formas canônicas.
 */
export function calcularSugestoes(
  prefixo: string,
  dicEntries: DicEntry[],
  historicoColunaAtual: string[],
  naturezaIrma?: string,
  descricaoIrma?: string,
): string[] {
  const prefNorm = normalizarParaBusca(prefixo)
  if (!prefNorm) return []

  // Determine extrator de campo e filtro de irmã
  let dicFiltrado: DicEntry[]
  let extrator: (e: DicEntry) => string

  if (naturezaIrma !== undefined && naturezaIrma !== '') {
    dicFiltrado = dicEntries.filter((e) => e.natureza === naturezaIrma)
    extrator = (e) => e.descricao
  } else if (descricaoIrma !== undefined && descricaoIrma !== '') {
    dicFiltrado = dicEntries.filter((e) => e.descricao === descricaoIrma)
    extrator = (e) => e.natureza
  } else {
    dicFiltrado = dicEntries
    extrator = (e) => e.iniciais
  }

  // Extrai candidatos do dicionário filtrado; acumula o maior vezes por valor canônico
  const dicMap = new Map<string, number>()
  for (const entry of dicFiltrado) {
    const valor = extrator(entry)
    if (!valor) continue
    if (normalizarParaBusca(valor).startsWith(prefNorm)) {
      const existente = dicMap.get(valor) ?? 0
      dicMap.set(valor, Math.max(existente, entry.vezes))
    }
  }

  // Ordena por vezes desc
  const dicSorted = Array.from(dicMap.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([v]) => v)

  // Complementa com historicoColunaAtual (apenas itens ainda não presentes)
  const dicSet = new Set(dicSorted)
  const historico = historicoColunaAtual.filter(
    (v) => !dicSet.has(v) && normalizarParaBusca(v).startsWith(prefNorm),
  )

  return [...dicSorted, ...historico]
}
