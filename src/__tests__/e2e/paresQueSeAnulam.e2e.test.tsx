// ADR: see Docs/specs/motor-de-pares.adr.md

/**
 * Prova E2E — Task 7 do ADR/spec `motor-de-pares` (F9, Decisão 11): o gate final da spec.
 * Fixture SINTÉTICA (transcrições/datas/valores inventados — NUNCA copiados de `data_sample/`,
 * que é git-ignored por convenção do projeto), derivada da ESTRUTURA dos 89 lançamentos reais
 * medidos na Captura (ver ADR, Decisão 5: "há 4 pares `BB Rende Fácil ↔ Pix real` cuja
 * contraparte é despesa verdadeira (Raia Drogasil, McDonald's) — sem essa exclusão, o motor
 * proporia apagar essas despesas").
 *
 * Roda `orquestrarDeteccao` com o array `detectores` de PRODUÇÃO (import direto de
 * `../../dominio/registry`, ordem D16), sem `mesRef` — o guard de `detectarConciliacaoRegistry`
 * fecha o detector `conciliacao` de propósito (fora do escopo desta task, que é só
 * reembolso/transferência interna) e nenhum outro detector depende de `mesRef`.
 *
 * A fixture combina:
 *  - Duas linhas de auto-sweep/aplicação (`BB Rende Fácil`, `Resgate RDB`) cada uma colidindo em
 *    valor absoluto, dentro da janela de 7 dias, com uma despesa real não relacionada
 *    (McDonald's, Raia Drogasil) — a armadilha que a Decisão 5 do ADR existe para neutralizar.
 *  - Um par real de reembolso (Pix "Fernanda" de ida e volta, sem sinal de transferência) — prova
 *    de que a exclusão de auto-sweep não é geral demais a ponto de apagar a funcionalidade da
 *    Task 2.
 *  - Um par real de transferência interna (duas pernas "Open Banking") — mesmo controle para a
 *    Task 3.
 *
 * Fora do alcance desta fixture, deliberadamente: nenhuma data produz empate exato de distância
 * envolvendo perna de transferência — esse cenário aciona um defeito de integração T2×T3 já
 * conhecido e reportado pela facade (`GrupoAmbiguo` com perna de transferência não gera aviso de
 * ninguém), que esta task não corrige nem cristaliza como comportamento correto.
 */

import { describe, it, expect } from 'vitest'
import type { Lancamento, Aviso } from '../../types'
import { detectores, orquestrarDeteccao } from '../../dominio/registry'

/** Constrói um `Lancamento` sintético com os campos mínimos, sobrescrevendo o que for dado. */
function lancamento(overrides: Partial<Lancamento> & Pick<Lancamento, 'id' | 'data' | 'valor' | 'transcricao'>): Lancamento {
  return {
    fonte: 'extrato_itau_cc',
    iniciais: 'ES',
    natureza: '',
    descricao: '',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Fixture sintética — Área tocada da Task 7 é literalmente este arquivo, sem
// leitura de `data_sample/`. Ids sequenciais só para legibilidade do teste.
// ---------------------------------------------------------------------------

const BB_RENDE_FACIL = lancamento({
  id: 1,
  fonte: 'extrato_bb_cc',
  data: '2026-03-03',
  transcricao: 'BB Rende Fácil - transferência automática',
  valor: 45.9,
})

const MC_DONALDS = lancamento({
  id: 2,
  fonte: 'fatura_nubank_cc',
  data: '2026-03-04',
  transcricao: "McDonald's Itaim Bibi",
  valor: -45.9,
})

const RESGATE_RDB = lancamento({
  id: 3,
  fonte: 'extrato_bb_cc',
  data: '2026-03-10',
  transcricao: 'Resgate RDB Banco XPTO',
  valor: 32.5,
})

const RAIA_DROGASIL = lancamento({
  id: 4,
  fonte: 'fatura_nubank_cc',
  data: '2026-03-12',
  transcricao: 'Raia Drogasil Farmácia',
  valor: -32.5,
})

const PIX_ENVIADO_FERNANDA = lancamento({
  id: 5,
  fonte: 'extrato_itau_cc',
  data: '2026-03-12',
  transcricao: 'Pix enviado para Fernanda - adiantamento do fim de semana',
  valor: -120,
})

const PIX_RECEBIDO_FERNANDA = lancamento({
  id: 6,
  fonte: 'extrato_itau_cc',
  data: '2026-03-16',
  transcricao: 'Pix recebido de Fernanda - reembolso do almoço dividido',
  valor: 120,
})

const TRANSFERENCIA_ENVIADA = lancamento({
  id: 7,
  fonte: 'extrato_bb_cc',
  data: '2026-03-18',
  transcricao: 'Open Banking - transferência enviada conta corrente',
  valor: -500,
})

const TRANSFERENCIA_RECEBIDA = lancamento({
  id: 8,
  fonte: 'extrato_itau_cc',
  data: '2026-03-20',
  transcricao: 'Open Banking - transferência recebida conta poupança',
  valor: 500,
})

const FIXTURE: Lancamento[] = [
  BB_RENDE_FACIL,
  MC_DONALDS,
  RESGATE_RDB,
  RAIA_DROGASIL,
  PIX_ENVIADO_FERNANDA,
  PIX_RECEBIDO_FERNANDA,
  TRANSFERENCIA_ENVIADA,
  TRANSFERENCIA_RECEBIDA,
]

// Roda a fiação REAL de produção uma única vez — sem `mesRef` (fecha `conciliacao` de propósito,
// fora do escopo desta task) e sem `nomeUsuario` (nenhum Pix nominal na fixture).
const avisos: Aviso[] = orquestrarDeteccao(FIXTURE, detectores)

/** Todos os `mutacaoProposta.alvo` (ids de `Lancamento`) de avisos de uma dada `origem`. */
function alvosDaOrigem(origemAlvo: string): number[] {
  return avisos
    .filter((aviso) => aviso.origem === origemAlvo && aviso.mutacaoProposta !== undefined)
    .flatMap((aviso) => aviso.mutacaoProposta!.alvo)
}

describe('E2E — Task 7: motor de pares não apaga despesa real (F9, Decisão 11)', () => {
  it('TL7-1: "BB Rende Fácil" nunca aparece em mutacaoProposta.alvo de origem "reembolso"', () => {
    expect(alvosDaOrigem('reembolso')).not.toContain(BB_RENDE_FACIL.id)
  })

  it('TL7-2: "Resgate RDB" nunca aparece em mutacaoProposta.alvo de origem "reembolso"', () => {
    expect(alvosDaOrigem('reembolso')).not.toContain(RESGATE_RDB.id)
  })

  it('TL7-3: nem "BB Rende Fácil" nem "Resgate RDB" aparecem em mutacaoProposta.alvo de origem "transferencia-interna"', () => {
    const alvosTransferencia = alvosDaOrigem('transferencia-interna')
    expect(alvosTransferencia).not.toContain(BB_RENDE_FACIL.id)
    expect(alvosTransferencia).not.toContain(RESGATE_RDB.id)
  })

  it('TL7-4: as despesas reais que colidiam em valor (McDonald\'s, Raia Drogasil) nunca são alvo de reembolso/transferencia-interna', () => {
    const alvosRisco = [...alvosDaOrigem('reembolso'), ...alvosDaOrigem('transferencia-interna')]
    expect(alvosRisco).not.toContain(MC_DONALDS.id)
    expect(alvosRisco).not.toContain(RAIA_DROGASIL.id)
  })

  it('TL7-5 (controle positivo): o par real de reembolso (Pix Fernanda) PRODUZ um aviso "reembolso" com os dois ids', () => {
    const avisoReembolso = avisos.find(
      (aviso) =>
        aviso.origem === 'reembolso' &&
        aviso.mutacaoProposta !== undefined &&
        aviso.mutacaoProposta.alvo.includes(PIX_ENVIADO_FERNANDA.id) &&
        aviso.mutacaoProposta.alvo.includes(PIX_RECEBIDO_FERNANDA.id),
    )
    expect(avisoReembolso).toBeDefined()
    expect(avisoReembolso?.mutacaoProposta?.alvo).toHaveLength(2)
  })

  it('TL7-6 (controle positivo): o par real de transferência interna ("Open Banking") PRODUZ um aviso "transferencia-interna" com os dois ids', () => {
    const avisoTransferencia = avisos.find(
      (aviso) =>
        aviso.origem === 'transferencia-interna' &&
        aviso.mutacaoProposta !== undefined &&
        aviso.mutacaoProposta.alvo.includes(TRANSFERENCIA_ENVIADA.id) &&
        aviso.mutacaoProposta.alvo.includes(TRANSFERENCIA_RECEBIDA.id),
    )
    expect(avisoTransferencia).toBeDefined()
    expect(avisoTransferencia?.mutacaoProposta?.alvo).toHaveLength(2)
  })

  it('TL7-7: "investimento" (ordem D16, antes de reembolso/transferencia-interna) reivindica "Resgate RDB" com proposta própria', () => {
    const avisoInvestimento = avisos.find(
      (aviso) =>
        aviso.origem === 'investimento' &&
        aviso.mutacaoProposta !== undefined &&
        aviso.mutacaoProposta.alvo.includes(RESGATE_RDB.id),
    )
    expect(avisoInvestimento).toBeDefined()
  })
})
