// ADR: see spec/mvp-vertical-nubank.adr.md

import type { Lancamento, DicEntry } from '../types'
import { normalizarChave } from './normalizacao'

/**
 * Enriquece um lançamento com Natureza, Descrição e Iniciais a partir do dicionário.
 *
 * Algoritmo (Decisão 4 do ADR):
 * 1. Normaliza a transcrição do lançamento via `normalizarChave`.
 * 2. Busca a chave normalizada no dicionário.
 * 3. Se encontrada e não-ambígua: preenche natureza, descricao e iniciais do dicionário.
 * 4. Se ambígua ou ausente: natureza e descricao ficam em branco; iniciais = iniciaisUsuario.
 */
export function enriquecerLancamento(
  lancamento: Lancamento,
  dicionario: DicEntry[],
  iniciaisUsuario: string,
): Lancamento {
  const chave = normalizarChave(lancamento.transcricao)
  const entrada = dicionario.find((e) => e.chave === chave)

  if (entrada !== undefined && !entrada.ambiguo) {
    return {
      ...lancamento,
      natureza: entrada.natureza,
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
