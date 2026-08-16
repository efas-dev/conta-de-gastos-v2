// ADR: see Docs/specs/dominio-transferencia-investimento-iniciais.adr.md
// ADR: see spec/fundacao-operacoes.adr.md

import type { Aviso, Lancamento } from '../types'

/**
 * Padrões genéricos de palavras-chave que indicam transferência interna.
 * Ref. legado: `legado/src/gastos/modelos.py` — `_PADROES_INTERNOS`.
 * Padrões de investimento (APLICACAO, RESGATE, RDB, CDB) são tratados
 * por `detectarInvestimento` (src/dominio/investimento.ts).
 *
 * Decisão de domínio (2026-08-04, Task T14, autorizada pelo usuário — ver ADR
 * `fundacao-operacoes`): `/Pagamento de fatura/i` foi REMOVIDO deste conjunto.
 * Ligar o registry (5 detectores) ao fluxo real de produção (T14) revelou que
 * esse padrão colidia com `detectarConciliacaoRegistry` — a mesma linha do
 * extrato ("Pagamento de fatura") casava simultaneamente com conciliação e com
 * transferência interna, gerando duas propostas concorrentes para o mesmo
 * lançamento. Conciliação (item 26 do TODO) já é dona dessa linha — o pagamento
 * de fatura é resolvido por correlação fatura×extrato, não por palavra-chave
 * genérica. Padrões de fatura de cartão SEM correlação de conciliação (ex.:
 * "ITAU BLACK") continuam cobertos por padrão dedicado abaixo.
 */
const PADROES_INTERNOS: RegExp[] = [
  /Open Banking/i,
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

/**
 * Detecta, entre `lancamentos`, as linhas de transferência interna (via
 * `detectarTransferenciaInterna`) e gera uma proposta de remoção acionável para cada uma —
 * mesma paridade de detecção do call-site legado (`detectarTransferenciaInterna` não muda), mas
 * agora emitindo `Aviso` com `mutacaoProposta` (verbo `'remover'`, ver ADR `fundacao-operacoes`,
 * Decisão 4), aplicável/desfazível via o caminho genérico do `avisosSlice` (T03).
 *
 * `mutacaoProposta.alvo` usa `Lancamento.id` (não índice posicional) — cada `Aviso` mira
 * exatamente o lançamento que o originou, independentemente de reordenação/fatiamento posterior.
 * `alvo`/`permanece` legados (`string[]`) também são populados (id como string) para
 * compatibilidade com os consumidores existentes de `Aviso.alvo` que só leem sua contagem.
 *
 * Cobre apenas o caso já detectado por `detectarTransferenciaInterna` hoje (padrões genéricos
 * fixos + Pix nominal por `nomeUsuario`, ambos avaliados por-lançamento). O par entre contas de
 * bancos distintos (item 27 do TODO — matching cruzado entre dois lançamentos de fontes
 * diferentes) NÃO é adicionado por este wrapper e segue fora de escopo.
 *
 * Não muta `lancamentos` nem os objetos `Lancamento` recebidos — função pura, mesma disciplina
 * de `detectarTransferenciaInterna` e de `detectarInvestimentoAvisos` (T07).
 *
 * @param lancamentos - Lista de lançamentos a inspecionar.
 * @param nomeUsuario - Nome do usuário (opcional), repassado a `detectarTransferenciaInterna`.
 * @returns Um `Aviso` proposta por linha de transferência interna encontrada; array vazio se
 *   nenhuma existir.
 */
export function detectarTransferenciaInternaAvisos(
  lancamentos: Lancamento[],
  nomeUsuario?: string,
): Aviso[] {
  const avisos: Aviso[] = []

  for (const lancamento of lancamentos) {
    if (!detectarTransferenciaInterna(lancamento, nomeUsuario)) continue

    avisos.push({
      id: `transferencia-interna-${lancamento.id}`,
      tipo: 'proposta',
      origem: 'transferencia-interna',
      mensagem: `Transferência interna detectada: "${lancamento.transcricao}". Deseja remover esse lançamento?`,
      alvo: [String(lancamento.id)],
      permanece: [],
      resumo: `Transferência interna: "${lancamento.transcricao}"`,
      estado: 'pendente',
      mutacaoProposta: { verbo: 'remover', alvo: [lancamento.id] },
    })
  }

  return avisos
}
