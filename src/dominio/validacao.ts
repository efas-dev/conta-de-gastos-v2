// ADR: see Docs/specs/grid-revisao.adr.md
import type { Lancamento } from '../types'

/**
 * Determina se um lançamento "precisa de atenção" para revisão do usuário.
 *
 * Retorna `true` quando:
 * - A natureza está vazia mas a linha tem dados (transcricao e/ou valor preenchidos).
 * - A natureza está preenchida mas não consta em `naturezasValidas`.
 *
 * Retorna `false` para linhas normais (natureza válida dentro da lista, ou linha sem dados).
 */
export function validarLinha(l: Lancamento, naturezasValidas: string[]): boolean {
  const temDados = l.transcricao.trim() !== '' || l.valor !== 0

  if (l.natureza.trim() === '') {
    return temDados
  }

  return !naturezasValidas.includes(l.natureza)
}
