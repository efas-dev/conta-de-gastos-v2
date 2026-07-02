// ADR: see Docs/specs/dominio-transferencia-investimento-iniciais.adr.md

import type { Lancamento } from '../types'

/**
 * Padrões genéricos de palavras-chave que indicam transferência interna.
 * Ref. legado: `legado/src/gastos/modelos.py` — `_PADROES_INTERNOS`.
 * Padrões de investimento (APLICACAO, RESGATE, RDB, CDB) são tratados
 * por `detectarInvestimento` (src/dominio/investimento.ts).
 */
const PADROES_INTERNOS: RegExp[] = [
  /Open Banking/i,
  /Pagamento de fatura/i,
  /ITAU BLACK/i,
]

/**
 * Detecta se um lançamento é uma transferência interna — movimentação entre
 * contas do próprio usuário (ex.: TED/Pix para conta própria, pagamento de
 * fatura de cartão próprio, Open Banking).
 *
 * Quando `nomeUsuario` é fornecido, verifica também se a `transcricao` contém
 * o nome (case-insensitive), o que indica Pix nominal para conta própria.
 * Quando ausente, apenas os padrões genéricos são avaliados — sem inferência.
 *
 * @param lancamento - Lançamento a avaliar.
 * @param nomeUsuario - Nome do usuário (opcional). Fornecido pela UI (spec 2).
 * @returns `true` se o lançamento for uma transferência interna.
 */
export function detectarTransferenciaInterna(
  lancamento: Lancamento,
  nomeUsuario?: string,
): boolean {
  const transcricao = lancamento.transcricao

  // Padrões genéricos fixos
  for (const padrao of PADROES_INTERNOS) {
    if (padrao.test(transcricao)) return true
  }

  // Pix nominal: só quando o nome está presente e casa com a transcrição
  if (nomeUsuario && transcricao.toLowerCase().includes(nomeUsuario.toLowerCase())) {
    return true
  }

  return false
}
