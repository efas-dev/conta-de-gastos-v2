// ADR: see Docs/specs/dominio-transferencia-investimento-iniciais.adr.md

import type { Lancamento, DicEntry } from '../types'
import { canonizarChave } from './normalizacao'
import { valorEquivalente } from './dicionario'

/**
 * Um padrão de classificação só tem valor no dicionário se Natureza E Descrição
 * estiverem preenchidas (item 24 do TODO) — entrada incompleta volta no próximo
 * import sem valor de classificação.
 */
function classificacaoCompleta(x: { natureza: string; descricao: string }): boolean {
  return x.natureza.trim() !== '' && x.descricao.trim() !== ''
}

/**
 * Atualiza o dicionário de classificações com base nos lançamentos fornecidos.
 *
 * Para cada lançamento, computa `chave = normalizarChave(lancamento.transcricao)` e
 * busca no dicionário acumulado a entrada com mesma `(chave, fonte)`.
 *
 * Regras (Decisão 6 do ADR):
 * - Sem entrada existente: cria nova com `vezes: 1` e `ambiguo: false`.
 * - Entrada existente com padrão idêntico (`natureza`, `descricao`, `iniciais`): incrementa `vezes`.
 * - Entrada existente com qualquer divergência no padrão: marca `ambiguo: true`.
 *
 * Item 24 do TODO: lançamento com Natureza ou Descrição vazia é ignorado (não
 * cria entrada, não incrementa, não marca ambíguo), e entradas herdadas de
 * `dicAnterior` já incompletas são filtradas do retorno — o round-trip de
 * export não as re-grava.
 *
 * Não muta `dicAnterior`; retorna novo array.
 *
 * @param lancamentos - Lançamentos já classificados (natureza, descricao, iniciais preenchidos).
 * @param dicAnterior - Estado anterior do dicionário (não mutado).
 * @returns Novo dicionário com as entradas atualizadas.
 */
export function aprenderDicionario(
  lancamentos: Lancamento[],
  dicAnterior: DicEntry[],
): DicEntry[] {
  // Copia do dicionário anterior — nunca mutamos o parâmetro recebido.
  // Entradas herdadas incompletas são descartadas aqui (item 24); a natureza
  // herdada é normalizada para caixa alta (item 28), convergindo dicionários
  // antigos gravados em minúsculas.
  const dic: DicEntry[] = dicAnterior
    .filter(classificacaoCompleta)
    .map((e) => ({ ...e, natureza: e.natureza.toUpperCase() }))

  for (const lan of lancamentos) {
    // Item 24: só aprende lançamento com Natureza e Descrição preenchidas
    if (!classificacaoCompleta(lan)) continue

    const { chave, afrouxadaPorParcela } = canonizarChave(lan.transcricao)
    const mesmaChave = (e: DicEntry) => e.chave === chave && e.fonte === lan.fonte

    // Em chave afrouxada por parcela, a identidade da entrada é `(chave, fonte, valor)`: duas
    // compras distintas do mesmo lojista, ambas parceladas no mesmo número de vezes, colapsam na
    // mesma chave e só o valor as separa (ADR `dicionario-chave-canonica`, Decisão 1). Procura-se
    // primeiro a entrada de valor correspondente; na ausência dela, uma entrada herdada sem valor
    // é PROMOVIDA (recebe o valor) em vez de duplicada — é assim que o "desempate por import
    // futuro" da Decisão 5 acontece na prática.
    const idx = afrouxadaPorParcela
      ? acharOuPromover(dic, mesmaChave, lan.valor)
      : dic.findIndex(mesmaChave)

    if (idx === -1) {
      // Nova entrada — natureza em caixa alta (item 28). O valor só é gravado onde discrimina
      // (Decisão 16): em chave não afrouxada ele não distingue nada e sugeriria um significado
      // que não tem.
      dic.push({
        chave,
        fonte: lan.fonte,
        natureza: lan.natureza.toUpperCase(),
        descricao: lan.descricao,
        iniciais: lan.iniciais,
        vezes: 1,
        ambiguo: false,
        ...(afrouxadaPorParcela ? { valor: lan.valor } : {}),
      })
    } else {
      const entrada = dic[idx]
      // Natureza compara sem diferenciar caixa (item 28) — a entrada já está
      // normalizada; o lançamento normaliza aqui
      const padraoCasa =
        entrada.natureza === lan.natureza.toUpperCase() &&
        entrada.descricao === lan.descricao &&
        entrada.iniciais === lan.iniciais

      if (padraoCasa) {
        entrada.vezes++
        // Promoção da entrada herdada: grava o valor que faltava. Nunca sobrescreve um valor já
        // gravado nem tira média (Decisão 16) — sobrescrever criaria deriva silenciosa ao longo
        // dos meses.
        if (afrouxadaPorParcela && entrada.valor === undefined) {
          entrada.valor = lan.valor
        }
      } else {
        entrada.ambiguo = true
      }
    }
  }

  return dic
}

/**
 * Localiza a entrada de uma chave afrouxada por parcela, na ordem de prioridade da Decisão 1:
 * primeiro a de valor equivalente; na ausência dela, uma entrada herdada sem valor, que será
 * promovida pelo chamador.
 *
 * Devolve `-1` quando nenhuma das duas existe — sinal de que é outra compra e merece entrada
 * própria, não um `ambiguo: true` sobre a entrada alheia.
 */
function acharOuPromover(
  dic: DicEntry[],
  mesmaChave: (e: DicEntry) => boolean,
  valorLancamento: number,
): number {
  const porValor = dic.findIndex(
    (e) => mesmaChave(e) && e.valor !== undefined && valorEquivalente(e.valor, valorLancamento),
  )
  if (porValor !== -1) return porValor

  return dic.findIndex((e) => mesmaChave(e) && e.valor === undefined)
}
