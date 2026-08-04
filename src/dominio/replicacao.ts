import type { Lancamento } from '../types'
import { normalizarChave } from './normalizacao'

/**
 * Sugestão de replicar a classificação de uma linha recém-classificada para as
 * demais linhas de transcrição idêntica ainda sem Natureza (item 36 do TODO).
 *
 * `alvos` são índices REAIS em `lancamentos`. `chave` é a transcrição
 * normalizada (sufixo de data removido, como no dicionário).
 */
export interface SugestaoReplicacao {
  chave: string
  natureza: string
  descricao: string
  alvos: number[]
  /** Uma transcrição de exemplo (a da linha-base) para compor o texto do popup. */
  exemplo: string
}

/**
 * Quantas outras linhas idênticas não classificadas bastam para sugerir a
 * replicação. `1` = propõe já com uma única outra linha igual.
 */
export const LIMIAR_REPLICACAO = 1

/**
 * Detecta se a linha em `indiceBase` (recém-classificada) tem outras linhas de
 * transcrição idêntica ainda **sem Natureza**, para propor replicar a
 * classificação (Natureza + Descrição) a elas.
 *
 * Regras:
 * - A linha-base precisa ter **Natureza** preenchida (é o que se replica).
 * - Casamento por transcrição **normalizada** (`normalizarChave`).
 * - Alvos: linhas com a mesma chave e **Natureza vazia** (não sobrescreve
 *   classificações existentes; não inclui a própria base).
 * - Retorna `null` se a base não tem Natureza, a chave é vazia, ou há menos de
 *   `LIMIAR_REPLICACAO` alvos.
 *
 * Função pura — sem store, sem efeito colateral.
 */
export function detectarReplicacao(
  lancamentos: Lancamento[],
  indiceBase: number,
): SugestaoReplicacao | null {
  const base = lancamentos[indiceBase]
  if (!base || base.natureza.trim() === '') return null

  const chave = normalizarChave(base.transcricao).trim()
  if (chave === '') return null

  const alvos: number[] = []
  for (let i = 0; i < lancamentos.length; i++) {
    if (i === indiceBase) continue
    const l = lancamentos[i]
    if (l.natureza.trim() !== '') continue
    if (normalizarChave(l.transcricao).trim() === chave) alvos.push(i)
  }

  if (alvos.length < LIMIAR_REPLICACAO) return null

  return {
    chave,
    natureza: base.natureza,
    descricao: base.descricao,
    alvos,
    exemplo: base.transcricao,
  }
}
