// ADR: see Docs/specs/dominio-transferencia-investimento-iniciais.adr.md

import type { Lancamento, DicEntry } from '../types'
import { normalizarChave } from './normalizacao'

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
  // Entradas herdadas incompletas são descartadas aqui (item 24).
  const dic: DicEntry[] = dicAnterior.filter(classificacaoCompleta).map((e) => ({ ...e }))

  for (const lan of lancamentos) {
    // Item 24: só aprende lançamento com Natureza e Descrição preenchidas
    if (!classificacaoCompleta(lan)) continue

    const chave = normalizarChave(lan.transcricao)
    const idx = dic.findIndex((e) => e.chave === chave && e.fonte === lan.fonte)

    if (idx === -1) {
      // Nova entrada
      dic.push({
        chave,
        fonte: lan.fonte,
        natureza: lan.natureza,
        descricao: lan.descricao,
        iniciais: lan.iniciais,
        vezes: 1,
        ambiguo: false,
      })
    } else {
      const entrada = dic[idx]
      const padraoCasa =
        entrada.natureza === lan.natureza &&
        entrada.descricao === lan.descricao &&
        entrada.iniciais === lan.iniciais

      if (padraoCasa) {
        entrada.vezes++
      } else {
        entrada.ambiguo = true
      }
    }
  }

  return dic
}
