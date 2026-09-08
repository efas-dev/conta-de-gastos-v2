// ADR: see Docs/specs/dominio-transferencia-investimento-iniciais.adr.md
// ADR: see Docs/specs/fundacao-operacoes.adr.md
// ADR: see Docs/specs/motor-de-pares.adr.md

import type { Aviso, Lancamento } from '../types'
import { encontrarPares, descreverPerna } from './pares'

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
 * Padrões de auto-sweep/aplicação financeira excluídos do motor de pares (ADR
 * `motor-de-pares`, Decisões 5 e 17) — passados como parâmetro para `encontrarPares`, nunca
 * conhecidos por ele. Os mesmos três padrões literais (`BB Rende Fácil`, `RDB`, `CDB`) também
 * são usados pela política `reembolso` (`src/dominio/pares.ts`, Task 2); não há módulo
 * compartilhado para essa constante — cada política declara sua própria cópia (D17: "quem
 * conhece os padrões concretos são os consumidores", não um módulo comum entre eles).
 */
const PADROES_EXCLUSAO_AUTOSWEEP: RegExp[] = [
  /BB Rende Fácil/i,
  /RDB/i,
  /CDB/i,
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
 * Detecta, entre `lancamentos`, as transferências internas — agora consultando o motor de
 * casamento de pares (`encontrarPares`, `../pares`, ADR `motor-de-pares` Task 3) antes de
 * decidir a forma da proposta:
 *
 * - Quando um `ParEncontrado` tem QUALQUER uma das duas pernas batendo em
 *   `detectarTransferenciaInterna`, emite UM ÚNICO `Aviso` com os DOIS ids em
 *   `mutacaoProposta.alvo` (Decisão 1 e 2 do ADR — basta 1 das 2 pernas, formato de par).
 * - Quando a perna bate no padrão mas não há par nem grupo ambíguo (contrapartida não
 *   encontrada), MANTÉM o comportamento antigo de proposta isolada, mas a `mensagem` passa a
 *   declarar explicitamente a ausência de contrapartida (Decisão 6).
 * - Grupos ambíguos (`GrupoAmbiguo`, empate de distância) que envolvem uma perna de
 *   transferência viram um `Aviso` informativo desta origem, listando os candidatos empatados
 *   para escolha manual (Decisão 7). A divisão com `detectarReembolsoAvisos` (`../pares`) segue
 *   o mesmo rótulo por sinal textual da Decisão 2: grupo COM sinal de transferência é falado
 *   aqui, grupo SEM sinal é falado lá. Cada grupo gera exatamente um informativo, nunca dois
 *   concorrentes — `pares.ts` pula os grupos com sinal, e esta função pula os sem sinal.
 *
 * `mutacaoProposta.alvo` usa `Lancamento.id` (não índice posicional) — cada `Aviso` mira
 * exatamente o(s) lançamento(s) que o originou(aram), independentemente de
 * reordenação/fatiamento posterior. `alvo`/`permanece` legados (`string[]`) também são
 * populados (id como string) para compatibilidade com os consumidores existentes de
 * `Aviso.alvo` que só leem sua contagem.
 *
 * Não muta `lancamentos` nem os objetos `Lancamento` recebidos — função pura, mesma disciplina
 * de `detectarTransferenciaInterna`, `encontrarPares` e `detectarInvestimentoAvisos` (T07).
 *
 * @param lancamentos - Lista de lançamentos a inspecionar.
 * @param nomeUsuario - Nome do usuário (opcional), repassado a `detectarTransferenciaInterna`.
 * @returns Um `Aviso` por par de transferência encontrado (2 ids) e um `Aviso` por perna de
 *   transferência sem contrapartida (1 id); array vazio se nenhuma existir.
 */
export function detectarTransferenciaInternaAvisos(
  lancamentos: Lancamento[],
  nomeUsuario?: string,
): Aviso[] {
  const avisos: Aviso[] = []
  const { pares, ambiguos } = encontrarPares(
    lancamentos,
    { nomeUsuario },
    { padroesExcluidos: PADROES_EXCLUSAO_AUTOSWEEP },
  )

  // Ids já cobertos pelo motor — nem par (aviso próprio abaixo) nem grupo ambíguo (delegado ao
  // informativo de pares.ts/T2) devem cair no caminho de "perna isolada" mais adiante.
  const idsCobertosPeloMotor = new Set<number>()
  for (const par of pares) {
    idsCobertosPeloMotor.add(par.positivo.id)
    idsCobertosPeloMotor.add(par.negativo.id)
  }
  for (const grupo of ambiguos) {
    idsCobertosPeloMotor.add(grupo.ancora.id)
    for (const candidato of grupo.candidatos) idsCobertosPeloMotor.add(candidato.id)
  }

  for (const par of pares) {
    const pernaTransferencia = [par.positivo, par.negativo].find((perna) =>
      detectarTransferenciaInterna(perna, nomeUsuario),
    )
    if (!pernaTransferencia) continue

    avisos.push({
      id: `transferencia-interna-par-${par.positivo.id}-${par.negativo.id}`,
      tipo: 'proposta',
      origem: 'transferencia-interna',
      mensagem: `Par de transferência interna detectado: ${descreverPerna(par.positivo)} e ${descreverPerna(par.negativo)}. Deseja remover os dois lançamentos?`,
      alvo: [String(par.positivo.id), String(par.negativo.id)],
      permanece: [],
      resumo: `Par de transferência interna: ${descreverPerna(par.positivo)} ↔ ${descreverPerna(par.negativo)}`,
      estado: 'pendente',
      mutacaoProposta: { verbo: 'remover', alvo: [par.positivo.id, par.negativo.id] },
    })
  }

  for (const grupo of ambiguos) {
    const temSinalDeTransferencia =
      detectarTransferenciaInterna(grupo.ancora, nomeUsuario) ||
      grupo.candidatos.some((candidato) => detectarTransferenciaInterna(candidato, nomeUsuario))
    if (!temSinalDeTransferencia) continue

    avisos.push({
      id: `transferencia-interna-ambiguo-${grupo.ancora.id}`,
      tipo: 'informativo',
      origem: 'transferencia-interna',
      mensagem: `${descreverPerna(grupo.ancora)} tem ${grupo.candidatos.length} possíveis contrapartidas de transferência à mesma distância — escolha manualmente qual remover, se for o caso.`,
      alvo: [],
      permanece: [],
      resumo: `Transferência interna ambígua: ${descreverPerna(grupo.ancora)}`,
      estado: 'pendente',
      candidatos: grupo.candidatos.map((candidato) => ({
        alvo: String(candidato.id),
        resumo: `"${candidato.transcricao}" (${candidato.data})`,
      })),
    })
  }

  for (const lancamento of lancamentos) {
    if (!detectarTransferenciaInterna(lancamento, nomeUsuario)) continue
    if (idsCobertosPeloMotor.has(lancamento.id)) continue

    avisos.push({
      id: `transferencia-interna-${lancamento.id}`,
      tipo: 'proposta',
      origem: 'transferencia-interna',
      mensagem: `Transferência interna detectada: ${descreverPerna(lancamento)}. Não foi encontrada a contrapartida desta transferência — deseja remover esse lançamento mesmo assim?`,
      alvo: [String(lancamento.id)],
      permanece: [],
      resumo: `Transferência interna sem par: ${descreverPerna(lancamento)}`,
      estado: 'pendente',
      mutacaoProposta: { verbo: 'remover', alvo: [lancamento.id] },
    })
  }

  return avisos
}
