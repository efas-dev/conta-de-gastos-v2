// ADR: see Docs/specs/grid-revisao.adr.md

import type { Lancamento } from '../types'

/**
 * Alvo de um rateio: pessoa (iniciais) que recebe uma cópia do lançamento.
 * `valor` é reservado para uso futuro (split proporcional); quando omitido,
 * `ratearSplit` divide igualmente entre todos os alvos.
 */
export interface AlvoSplit {
  iniciais: string
  valor?: number
}

/**
 * Divide um lançamento entre N pessoas, criando uma cópia por alvo.
 *
 * Regras de arredondamento:
 * - Trabalha em centavos inteiros (Math.round) para evitar erro de ponto flutuante.
 * - Cada cópia recebe `floor(centavosTotal / N)`.
 * - A **última** cópia absorve a sobra: `centavosTotal - soma das demais`.
 * - Isso garante que a soma dos `.valor` em centavos seja exatamente igual ao original.
 *
 * @param l - Lançamento original a ratear.
 * @param alvos - Lista de alvos; deve ter pelo menos 1 elemento.
 * @returns Lista de N lançamentos, um por alvo.
 */
export function ratearSplit(l: Lancamento, alvos: AlvoSplit[]): Lancamento[] {
  const n = alvos.length
  const centavosTotal = Math.round(l.valor * 100)
  const centavosPorAlvo = Math.floor(centavosTotal / n)

  const resultado: Lancamento[] = []

  for (let i = 0; i < n; i++) {
    const isUltimo = i === n - 1
    const centavosEste = isUltimo
      ? centavosTotal - centavosPorAlvo * (n - 1)
      : centavosPorAlvo

    resultado.push({
      ...l,
      iniciais: alvos[i].iniciais,
      valor: centavosEste / 100,
    })
  }

  return resultado
}
