// ADR: see spec/rendimentos.adr.md

import type { Lancamento } from '../types'

/** Converte um valor em reais para centavos inteiros, evitando float drift (mesmo padrão de `deteccoes.ts`/`vr.ts`). */
function paraCentavos(valor: number): number {
  return Math.round(valor * 100)
}

/**
 * Calcula o saldo do mês corrente a partir do saldo anterior (lido de B5 do xlsx do mês
 * anterior, `lerSaldoAnterior`, Task 1) mais a soma algébrica de todos os lançamentos do grid
 * corrente, sem filtro por natureza/fonte (ver ADR `rendimentos`, F3).
 *
 * Função pura, sem I/O: soma em centavos inteiros antes de converter de volta para reais, evitando
 * drift de ponto flutuante ao somar N lançamentos (mesmo cuidado de `deteccoes.ts`/`vr.ts`).
 *
 * `lancamentos: []` retorna exatamente `saldoAnterior`, sem alteração.
 *
 * @returns saldo anterior + soma de todos os valores de `lancamentos`, em reais.
 */
export function calcularSaldoCalculado(saldoAnterior: number, lancamentos: Lancamento[]): number {
  const somaCentavos = lancamentos.reduce((acc, lancamento) => acc + paraCentavos(lancamento.valor), 0)

  return (paraCentavos(saldoAnterior) + somaCentavos) / 100
}
