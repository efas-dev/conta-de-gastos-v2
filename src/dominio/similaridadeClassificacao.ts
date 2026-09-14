// ADR: see spec/dicionario-chave-canonica.adr.md

import type { Aviso, DicEntry, Lancamento } from '../types'
import type { ContextoDeteccao } from './registry'
import { canonizarChave, normalizarParaBusca } from './normalizacao'
import { valorEquivalente } from './dicionario'

/**
 * Similaridade textual mínima para um par entrar na lista de candidatos.
 *
 * **Este limiar NÃO é a trava de segurança**, e tratá-lo como tal seria um erro caro. A medição
 * sobre os pares reais mostra que os conjuntos se sobrepõem (ADR, Decisão 21):
 *
 * | par                                              | similaridade | é a mesma coisa? |
 * |--------------------------------------------------|--------------|------------------|
 * | `PIX TRANSF JOAO AU` × `PIX TRANSF JOAO GU`      | 0,944        | **não**          |
 * | `PIX TRANSF CESAR`   × `PIX TRANSF CESAR D`      | 0,889        | sim              |
 *
 * O pior falso positivo pontua mais alto que uma variação legítima, porque o Itaú trunca nomes em
 * largura fixa e nomes parecidos produzem prefixos quase iguais. Nenhum valor de limiar separa os
 * dois grupos. Quem protege é a corroboração por valor, exigida sem exceção abaixo.
 */
export const LIMIAR_SIMILARIDADE = 0.9

/**
 * Comprimento mínimo da chave mais curta para o par ser considerado.
 *
 * Strings curtas pontuam alto por acidente: `Lbf` e `Lbg` têm 0,67 de similaridade sem nenhuma
 * relação entre si.
 */
const TAMANHO_MINIMO_CHAVE = 8

/** Distância de edição de Levenshtein entre duas strings. */
function distanciaEdicao(a: string, b: string): number {
  const linhaAnterior: number[] = Array.from({ length: b.length + 1 }, (_, j) => j)

  for (let i = 1; i <= a.length; i++) {
    let diagonal = linhaAnterior[0]
    linhaAnterior[0] = i

    for (let j = 1; j <= b.length; j++) {
      const anterior = linhaAnterior[j]
      linhaAnterior[j] = Math.min(
        linhaAnterior[j] + 1,
        linhaAnterior[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      diagonal = anterior
    }
  }

  return linhaAnterior[b.length]
}

/**
 * Similaridade normalizada entre dois textos, de 0 (nada em comum) a 1 (idênticos).
 *
 * Compara depois de `normalizarParaBusca`, então caixa e acentos não pesam — `Café Central` e
 * `CAFE CENTRAL` são o mesmo texto para esta métrica.
 */
export function similaridade(a: string, b: string): number {
  const x = normalizarParaBusca(a)
  const y = normalizarParaBusca(b)
  const maior = Math.max(x.length, y.length)
  if (maior === 0) return 1

  return 1 - distanciaEdicao(x, y) / maior
}

/**
 * Propõe classificação para lançamentos que o dicionário não classificou, quando existe uma entrada
 * textualmente muito próxima **e** de valor equivalente.
 *
 * **Nunca auto-preenche.** Emite `Aviso` do tipo `proposta`, que o humano aceita ou ignora no sheet
 * lateral de inspeção (ADR, Decisões 7 e 8). A escolha é deliberada: o sinal textual aqui é fraco
 * demais para escrever direto na grid, e um valor já escrito é psicologicamente mais difícil de
 * questionar do que uma proposta pendente.
 *
 * **A corroboração por valor é obrigatória e sem exceção** (Decisão 21). Entrada de dicionário sem
 * valor gravado — que é a maioria, já que o valor só é gravado em chaves afrouxadas por parcela —
 * nunca gera proposta, por mais alta que seja a similaridade textual. Na prática isso torna o
 * detector silencioso na maior parte dos dados, e isso é o comportamento correto: a medição que
 * motivou a Decisão 7 mostrou que, com a trava, ele não produz nenhum casamento na amostra
 * disponível, e sem a trava produziria 75% de falso positivo.
 *
 * Cala também na dúvida: dois candidatos igualmente plausíveis não geram proposta nenhuma, porque
 * escolher um deles seria chutar.
 *
 * Função pura: não muta os lançamentos nem o dicionário recebidos.
 */
export function detectarClassificacaoPorSimilaridade(
  lancamentos: Lancamento[],
  contexto: ContextoDeteccao,
): Aviso[] {
  const dicEntries = contexto.dicEntries
  if (!dicEntries || dicEntries.length === 0) return []

  const avisos: Aviso[] = []

  for (const lancamento of lancamentos) {
    // Já classificado (pelo dicionário ou pelo usuário) não é problema desta função.
    if (lancamento.natureza.trim() !== '' || lancamento.descricao.trim() !== '') continue

    const { chave } = canonizarChave(lancamento.transcricao)
    if (chave.length < TAMANHO_MINIMO_CHAVE) continue

    const candidatos = dicEntries.filter((entrada) =>
      ehCandidato(entrada, chave, lancamento.fonte, lancamento.valor),
    )

    // Zero candidatos: nada a propor. Dois ou mais: ambiguidade real, e propor um deles seria
    // chutar — exatamente o erro que esta spec existe para eliminar.
    if (candidatos.length !== 1) continue

    const entrada = candidatos[0]
    avisos.push({
      id: `classificacao-similaridade-${lancamento.id}`,
      tipo: 'proposta',
      origem: 'classificacao-similaridade',
      mensagem:
        `"${lancamento.transcricao}" parece ser "${entrada.descricao}": a descrição é quase ` +
        `idêntica à de "${entrada.chave}" e o valor confere.`,
      alvo: [String(lancamento.id)],
      permanece: [],
      resumo:
        `O dicionário não tem esta linha, mas tem uma quase igual, com o mesmo valor. ` +
        `Aprovar classifica como ${entrada.natureza} · ${entrada.descricao}. ` +
        `A semelhança de texto sozinha não é prova — é o valor coincidente que sustenta a proposta.`,
      estado: 'pendente',
      mutacaoProposta: {
        verbo: 'classificar',
        alvo: [lancamento.id],
        natureza: entrada.natureza.toUpperCase(),
        descricao: entrada.descricao,
        iniciais: entrada.iniciais,
      },
    })
  }

  return avisos
}

/**
 * Decide se uma entrada do dicionário pode sustentar uma proposta para a chave dada.
 *
 * A ordem das guardas é a ordem da Decisão 21: mesma fonte, não ambígua, **valor presente e
 * equivalente**, texto próximo mas não idêntico. O casamento exato é excluído de propósito —
 * `enriquecerLancamento` já teria resolvido, e propor o que já foi resolvido só geraria ruído.
 */
function ehCandidato(
  entrada: DicEntry,
  chave: string,
  fonte: string,
  valorLancamento: number,
): boolean {
  if (entrada.fonte !== fonte) return false
  if (entrada.ambiguo) return false
  if (entrada.chave === chave) return false
  if (entrada.chave.length < TAMANHO_MINIMO_CHAVE) return false
  if (entrada.valor === undefined) return false
  if (!valorEquivalente(entrada.valor, valorLancamento)) return false

  return similaridade(entrada.chave, chave) >= LIMIAR_SIMILARIDADE
}
