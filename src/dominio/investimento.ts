// ADR: see Docs/specs/dominio-transferencia-investimento-iniciais.adr.md

import type { Lancamento } from '../types'

/**
 * Detecta se um lançamento corresponde a uma operação de investimento de renda fixa.
 *
 * Regra de detecção (Decisão 5 do ADR):
 * - Palavras explícitas `APLICACAO` ou `RESGATE` na `transcricao` (case-insensitive) determinam
 *   o tipo diretamente, independentemente do sinal do valor.
 * - Palavras genéricas `RDB` ou `CDB` na `transcricao` são desambiguadas pelo sinal do valor:
 *   negativo → `'aplicacao'`; positivo → `'resgate'`.
 * - Quando há conflito entre palavra explícita e sinal do valor, a palavra vence.
 * - Lançamentos sem palavras-chave retornam `null`.
 *
 * @param lancamento - Lançamento financeiro normalizado
 * @returns `'aplicacao'`, `'resgate'` ou `null`
 */
export function detectarInvestimento(lancamento: Lancamento): 'aplicacao' | 'resgate' | null {
  const texto = lancamento.transcricao.toUpperCase()

  // Palavras explícitas: determinam o tipo independentemente do sinal
  if (texto.includes('APLICACAO')) return 'aplicacao'
  if (texto.includes('RESGATE')) return 'resgate'

  // Palavras genéricas: desambiguadas pelo sinal do valor
  if (texto.includes('RDB') || texto.includes('CDB')) {
    return lancamento.valor < 0 ? 'aplicacao' : 'resgate'
  }

  return null
}
