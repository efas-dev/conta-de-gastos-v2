// ADR: see Docs/specs/grid-ux-filtros.adr.md

import type { Lancamento } from '../types'

// ---------------------------------------------------------------------------
// rankFontes — D13 do ADR grid-ux-filtros
// ---------------------------------------------------------------------------

/**
 * Ordena as fontes presentes em `lancamentos` por número de operações
 * excluindo lançamentos com `transferenciaInterna === true` ou
 * `investimento !== null && investimento !== undefined`.
 *
 * Fontes com zero operações válidas aparecem no resultado mas após as demais.
 * Retorna array de nomes de fonte, da mais operada para a menos operada.
 */
export function rankFontes(lancamentos: Lancamento[]): string[] {
  // Coleta todas as fontes únicas
  const fontes = [...new Set(lancamentos.map((l) => l.fonte))]

  // Conta operações válidas por fonte (excluindo transferências internas e investimentos)
  const contagem = new Map<string, number>()
  for (const fonte of fontes) {
    contagem.set(fonte, 0)
  }
  for (const l of lancamentos) {
    const ehExcluido = l.transferenciaInterna === true || (l.investimento !== null && l.investimento !== undefined)
    if (!ehExcluido) {
      contagem.set(l.fonte, (contagem.get(l.fonte) ?? 0) + 1)
    }
  }

  // Ordena por contagem descendente; empate mantém ordem de inserção (estável)
  return fontes.sort((a, b) => (contagem.get(b) ?? 0) - (contagem.get(a) ?? 0))
}

// ---------------------------------------------------------------------------
// rankNaturezas — D12 do ADR grid-ux-filtros
// ---------------------------------------------------------------------------

/** Resultado de `rankNaturezas`: top-5 naturezas e o resto para o chip "+N mais". */
export interface RankNaturezas {
  /** As até 5 naturezas de maior valor somado em módulo. */
  top5: string[]
  /** Naturezas restantes (além das top-5), para o chip "+N mais". */
  resto: string[]
}

/**
 * Ordena naturezas por valor somado em módulo (`Math.abs`), retornando
 * as 5 primeiras em `top5` e as demais em `resto` (para o chip "+N mais").
 *
 * D12 do ADR grid-ux-filtros.
 */
export function rankNaturezas(lancamentos: Lancamento[]): RankNaturezas {
  if (lancamentos.length === 0) return { top5: [], resto: [] }

  // Soma valor em módulo por natureza — naturezas vazias não geram chip
  // (linhas sem natureza são cobertas pelo chip "só incompletos").
  const somaPorNatureza = new Map<string, number>()
  for (const l of lancamentos) {
    const nat = l.natureza
    if (!nat || nat.trim() === '') continue
    somaPorNatureza.set(nat, (somaPorNatureza.get(nat) ?? 0) + Math.abs(l.valor))
  }

  // Ordena por soma descendente
  const ordenadas = [...somaPorNatureza.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([natureza]) => natureza)

  return {
    top5: ordenadas.slice(0, 5),
    resto: ordenadas.slice(5),
  }
}

// ---------------------------------------------------------------------------
// contarIncompletos — DoD da T2
// ---------------------------------------------------------------------------

/**
 * Conta lançamentos com `natureza` ou `iniciais` vazios/nulos.
 * Um lançamento com ambos os campos vazios é contado uma única vez.
 */
export function contarIncompletos(lancamentos: Lancamento[]): number {
  return lancamentos.filter((l) => !l.natureza || !l.iniciais).length
}
