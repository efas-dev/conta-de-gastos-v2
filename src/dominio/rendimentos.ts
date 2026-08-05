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

/** Cada termo aceita apenas dígitos com vírgula decimal opcional (convenção BR), sem ponto/sinal. */
const REGEX_TERMO_SOMA_INLINE = /^\d+(,\d+)?$/

/**
 * Interpreta o texto do campo "aplicações" do form de rendimentos (ver ADR `rendimentos`, Decisão 4):
 * o usuário digita valores separados por `+` (ex.: `"1000+500+200"`), representando N aplicações
 * (caixinhas, porquinhos, cofrinhos), e a função devolve a soma.
 *
 * Função pura, sem I/O, que NUNCA lança exceção — entradas malformadas (termo vazio, não-numérico, ou
 * string vazia/só espaços) retornam `valido: false`. O flag `valido` é o sinal que a UI (Task 10) usa
 * para o feedback visual por cor (estilo Excel) que a Decisão 4 pede.
 *
 * Um único valor sem `+` é uma soma válida de 1 termo. Vírgula é aceita como separador decimal por
 * termo; ponto e separador de milhar não são aceitos. Soma em centavos inteiros antes de converter de
 * volta para reais, mesmo cuidado de `calcularSaldoCalculado`/`vr.ts`/`deteccoes.ts`.
 */
export function parsearSomaInline(texto: string): { valor: number | null; valido: boolean } {
  const termos = texto.split('+').map((termo) => termo.trim())

  if (termos.some((termo) => termo === '' || !REGEX_TERMO_SOMA_INLINE.test(termo))) {
    return { valor: null, valido: false }
  }

  const somaCentavos = termos.reduce(
    (acc, termo) => acc + Math.round(Number(termo.replace(',', '.')) * 100),
    0,
  )

  return { valor: somaCentavos / 100, valido: true }
}
