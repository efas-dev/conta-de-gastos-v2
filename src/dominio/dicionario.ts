// ADR: see Docs/specs/mvp-vertical-nubank.adr.md
// ADR: see spec/dicionario-chave-canonica.adr.md

import type { Lancamento, DicEntry } from '../types'
import { canonizarChave } from './normalizacao'

/**
 * Folga, em centavos, para considerar dois valores equivalentes numa chave afrouxada por parcela
 * (ADR `dicionario-chave-canonica`, Decisão 3).
 *
 * Existe porque parcelamento nem sempre divide exato: R$ 100,00 em 3x vira 33,34 + 33,33 + 33,33,
 * e emissores às vezes concentram todo o resto numa única parcela. Cinco centavos cobrem esses
 * casos e ficam ordens de grandeza abaixo da separação entre compras distintas — no caso real que
 * motivou a trava, os valores diferem em dezenas de reais.
 */
export const TOLERANCIA_VALOR_PARCELA_CENTAVOS = 5

/**
 * Compara dois valores monetários em centavos inteiros.
 *
 * A conversão para inteiro não é preciosismo: `Math.abs(a - b) <= 0.05` em ponto flutuante é uma
 * fonte clássica de teste intermitente, porque `0.05` não tem representação binária exata.
 */
export function valorEquivalente(a: number, b: number): boolean {
  return Math.abs(Math.round(a * 100) - Math.round(b * 100)) <= TOLERANCIA_VALOR_PARCELA_CENTAVOS
}

/**
 * Enriquece um lançamento com Natureza, Descrição e Iniciais a partir do dicionário.
 *
 * O casamento usa a **chave canônica** (`canonizarChave`), que remove os tokens variáveis mês a
 * mês — sufixo de data e número da parcela. Isso é o que faz a classificação aprendida em um mês
 * ser reaproveitada no seguinte.
 *
 * Mascarar o número da parcela, porém, apaga informação que distinguia compras: duas compras
 * diferentes do mesmo lojista, ambas em 4x, colapsam na mesma chave. Por isso o casamento tem
 * **duas regras**, conforme a Decisão 2:
 *
 * - **chave não afrouxada** — igualdade pura de `(chave, fonte)`, exatamente como antes desta spec.
 *   O valor não participa, e não pode participar: mercado, posto e farmácia têm valor diferente
 *   toda vez e deixariam de casar;
 * - **chave afrouxada por parcela** — exige, além da chave, valor equivalente ao aprendido
 *   (Decisão 1). É o que impede "Inceticidas" de herdar a classificação de "Fluido acendedor
 *   oratório".
 *
 * Entradas herdadas de dicionários anteriores à coluna H não têm valor gravado, então a trava não
 * pode ser aplicada a elas. A Decisão 5 resolve pelo grau de concorrência: chave canônica única
 * auto-preenche (sem concorrência não há falso positivo possível); havendo colisão, nenhuma
 * preenche até que um import futuro grave o valor e desempate.
 *
 * Entrada ambígua nunca auto-preenche, em qualquer um dos caminhos.
 */
export function enriquecerLancamento(
  lancamento: Lancamento,
  dicionario: DicEntry[],
  iniciaisUsuario: string,
): Lancamento {
  const { chave, afrouxadaPorParcela } = canonizarChave(lancamento.transcricao)
  const candidatos = dicionario.filter((e) => e.chave === chave && e.fonte === lancamento.fonte)

  const entrada = afrouxadaPorParcela
    ? escolherPorValor(candidatos, lancamento.valor)
    : candidatos[0]

  if (entrada !== undefined && !entrada.ambiguo) {
    return {
      ...lancamento,
      // Item 28: Natureza chega à grid sempre em caixa alta, mesmo herdada
      // de dicionário antigo gravado em minúsculas
      natureza: entrada.natureza.toUpperCase(),
      descricao: entrada.descricao,
      iniciais: entrada.iniciais,
    }
  }

  return {
    ...lancamento,
    natureza: '',
    descricao: '',
    iniciais: iniciaisUsuario,
  }
}

/**
 * Desempata candidatos de uma chave afrouxada por parcela.
 *
 * Prioridade: uma entrada cujo valor aprendido corresponda ao do lançamento vence sempre. Só na
 * ausência dela entra a regra do legado sem valor (Decisão 5) — e ela exige que a chave canônica
 * seja **única**, porque com dois candidatos disputando a mesma chave não há como saber qual das
 * duas compras é esta, e chutar é exatamente o erro que a spec existe para eliminar.
 */
function escolherPorValor(candidatos: DicEntry[], valorLancamento: number): DicEntry | undefined {
  const porValor = candidatos.find(
    (e) => e.valor !== undefined && valorEquivalente(e.valor, valorLancamento),
  )
  if (porValor !== undefined) return porValor

  if (candidatos.length === 1 && candidatos[0].valor === undefined) return candidatos[0]

  return undefined
}
