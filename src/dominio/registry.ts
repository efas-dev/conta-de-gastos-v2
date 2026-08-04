// ADR: see spec/fundacao-operacoes.adr.md

import type { Aviso, Lancamento } from '../types'

/**
 * Escopo de execução declarado por um detector (ver ADR `fundacao-operacoes`, Decisão 3):
 * `'por-fonte'` roda uma vez por arquivo/fonte (`Lancamento.fonte`); `'global'` roda uma única
 * vez sobre o total de lançamentos. O orquestrador (T05) decide a fatia com base neste campo —
 * o detector nunca fatia sozinho.
 */
export type EscopoDetector = 'por-fonte' | 'global'

/**
 * Contexto auxiliar disponível a todo detector, além da fatia de lançamentos que lhe cabe
 * (a fatia inteira em `'global'`, ou a fatia da fonte em `'por-fonte'` — decidida pelo
 * orquestrador de T05, não por este contrato).
 */
export interface ContextoDeteccao {
  /**
   * Todos os lançamentos do estado, não fatiados — necessário para detectores que precisam
   * olhar além da própria fatia (ex.: conciliação, que casa lançamentos de uma fatura contra
   * lançamentos de um extrato de fonte distinta).
   */
  todosLancamentos: Lancamento[]
  /** Nome do usuário, quando informado — habilita heurísticas nominais (ex.: Pix nominal). */
  nomeUsuario?: string
}

/**
 * Função pura de detecção: recebe a fatia de lançamentos que lhe cabe (por escopo) mais o
 * contexto auxiliar, devolve os `Aviso`s produzidos. Sem I/O, sem efeito colateral, sem
 * referência ao store — mesma disciplina já praticada pelos detectores existentes em
 * `src/dominio/deteccoes.ts`, `investimento.ts` e `transferencia.ts` (a migrar em
 * T06/T07/T07-bis).
 */
export type FuncaoDeteccao = (lancamentos: Lancamento[], contexto: ContextoDeteccao) => Aviso[]

/**
 * Contrato de um detector de operação (conciliação, valor pendente, investimento, etc.),
 * análogo ao `Parser` de `src/parsers/index.ts` (ver ADR `fundacao-operacoes`, Decisão 3).
 */
export interface Detector {
  /**
   * Identificador da origem/detector (ex.: 'valor-pendente', 'conciliacao') — espelha
   * `Aviso.origem`.
   */
  origem: string
  /** Regime de execução: quem fatia os lançamentos antes de chamar `detectar` (ver `EscopoDetector`). */
  escopo: EscopoDetector
  /** Função pura de detecção (ver `FuncaoDeteccao`). */
  detectar: FuncaoDeteccao
}

/**
 * Registro de detectores disponíveis, análogo ao array `parsers` de `src/parsers/index.ts`.
 *
 * Nasce vazio nesta task (T04): nenhum detector hoje existente satisfaz `FuncaoDeteccao` sem
 * adaptação — `detectarValorPendente`/`detectarPagamentoRecebido`/`detectarConciliacao`
 * (`src/dominio/deteccoes.ts`) recebem array(s) de lançamentos mas não o `ContextoDeteccao`
 * definido aqui; `detectarInvestimento` (`src/dominio/investimento.ts`) e
 * `detectarTransferenciaInterna` (`src/dominio/transferencia.ts`) operam sobre um único
 * `Lancamento`, não sobre um array. O contrato está definido e testado nesta task; a migração
 * real de cada detector para popular esta lista é escopo de T06/T07/T07-bis.
 */
export const detectores: Detector[] = []
