// ADR: see spec/fundacao-operacoes.adr.md
// ADR: see spec/conciliacao-robusta.adr.md

import type { Aviso, Lancamento } from '../types'
import { detectarValorPendente, detectarPagamentoRecebido, detectarConciliacao } from './deteccoes'
import { detectarInvestimentoAvisos } from './investimento'
import { detectarTransferenciaInternaAvisos } from './transferencia'
import { classificarFontePorPrefixo } from './mes'

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
  /**
   * Mês de referência (formato `YYYY-MM`), quando informado — usado por
   * `detectarConciliacaoRegistry` apenas como guard de entrada (sem ele, o detector não produz
   * aviso). A classificação fatura/extrato em si é autoritativa por prefixo de `fonte`
   * (`classificarFontePorPrefixo`, `src/dominio/mes.ts`, T1, ADR `conciliacao-robusta` Decisão 1)
   * e não depende deste campo — diferente do papel que `mesRef` tinha antes da Task 6 (ADR
   * `conciliacao-robusta`), quando alimentava a heurística por data `classificarFonte`.
   */
  mesRef?: string
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
 * Wrapper de conciliação para o contrato `Detector` (T06, ver ADR `fundacao-operacoes`).
 *
 * A função pura `detectarConciliacao` (`src/dominio/deteccoes.ts`) permanece intocada — recebe
 * `lancamentosFatura`/`lancamentosExtrato` já filtrados e devolve `alvo`/`permanece` como índices
 * relativos a esses arrays filtrados. Este wrapper reproduz, célula a célula, a orquestração que
 * hoje vive em `App.tsx` (linhas 528-591): classifica cada fonte presente em `lancamentos` como
 * fatura/extrato via `classificarFontePorPrefixo` (T1, ADR `conciliacao-robusta` Decisão 1 —
 * classificação AUTORITATIVA pelo prefixo de `fonte`, não mais pela heurística por data
 * `classificarFonte`; `contexto.mesRef` segue exigido apenas como guard de entrada, ver abaixo),
 * agrupa todas as fontes de extrato num único array (`lancamentosExtratoTotal`), e itera uma vez
 * por fonte de FATURA chamando `detectarConciliacao` e remapeando os índices locais de volta para
 * índices globais em `lancamentos`.
 *
 * Escopo `'global'` (ver Decisão de escopo no iteração-log de T06): conciliação precisa enxergar
 * todas as fontes simultaneamente para classificar e casar através delas — um fatiamento cego
 * `'por-fonte'` do orquestrador (T05) isolaria cada fonte sem o contexto cruzado necessário.
 */
function detectarConciliacaoRegistry(lancamentos: Lancamento[], contexto: ContextoDeteccao): Aviso[] {
  // `mesRef` já não é usado para classificar fatura/extrato (T1 é autoritativo por prefixo e
  // independe de data/mesRef) — o guard abaixo é preservado como está, como sinal de produto
  // ("usuário ainda não escolheu o mês de referência"), não como requisito técnico da
  // classificação. Mudar esse guard está fora do escopo declarado pela Task 6 (troca só QUEM
  // decide fatura/extrato).
  const mesRef = contexto.mesRef
  if (!mesRef) return []

  const fontesProduzidas = Array.from(new Set(lancamentos.map((l) => l.fonte)))
  const fontesFatura = fontesProduzidas.filter(
    (fonte) => classificarFontePorPrefixo(fonte) === 'fatura',
  )
  const fontesExtrato = fontesProduzidas.filter(
    (fonte) => classificarFontePorPrefixo(fonte) === 'extrato',
  )

  if (fontesFatura.length === 0 || fontesExtrato.length === 0) return []

  const lancamentosExtratoTotal = lancamentos.filter((l) => fontesExtrato.includes(l.fonte))
  const indicesExtratoNoTotal = lancamentos
    .map((l, indice) => ({ l, indice }))
    .filter(({ l }) => fontesExtrato.includes(l.fonte))
    .map(({ indice }) => indice)

  const avisos: Aviso[] = []
  for (const fonteFatura of fontesFatura) {
    const lancamentosDestaFatura = lancamentos.filter((l) => l.fonte === fonteFatura)
    const indicesFaturaNoTotal = lancamentos
      .map((l, indice) => ({ l, indice }))
      .filter(({ l }) => l.fonte === fonteFatura)
      .map(({ indice }) => indice)
    const avisosConciliacao = detectarConciliacao(lancamentosDestaFatura, lancamentosExtratoTotal)
    const avisosRemapeados = avisosConciliacao.map((aviso) => ({
      ...aviso,
      alvo: aviso.alvo.map((indiceStr) => String(indicesExtratoNoTotal[Number(indiceStr)])),
      permanece: aviso.permanece.map((indiceStr) => String(indicesFaturaNoTotal[Number(indiceStr)])),
    }))
    avisos.push(...avisosRemapeados)
  }
  return avisos
}

/**
 * Registro de detectores disponíveis, análogo ao array `parsers` de `src/parsers/index.ts`.
 *
 * T06 migrou os 3 detectores de índice posicional (`valor-pendente`, `pagamento-recebido`,
 * `conciliacao`) com escopo `'global'` — ver iteração-log de T06 para a justificativa (preservar
 * paridade com os índices calculados sobre o array total pelo call-site legado).
 *
 * T07 acrescenta `investimento` (`detectarInvestimentoAvisos`, `src/dominio/investimento.ts`).
 * Escopo `'global'` (decisão desta task, ver iteração-log): diferente dos 3 detectores de T06,
 * `investimento` não calcula `alvo` como índice posicional — usa `Lancamento.id`
 * (`mutacaoProposta.alvo: number[]`), então um fatiamento `'por-fonte'` produziria o mesmo
 * conjunto de avisos corretamente (id não depende de posição no array recebido). `'global'` foi
 * escolhido mesmo assim para preservar a ORDEM de emissão idêntica à do call-site legado (um
 * único `.map()` sobre `todosLancamentos`, sem reagrupar por fonte) e para manter o mesmo padrão
 * dos demais detectores desta lista — não por necessidade de correção do alvo, apenas por
 * simplicidade e paridade de ordem.
 *
 * T07-bis acrescenta `transferencia-interna` (`detectarTransferenciaInternaAvisos`,
 * `src/dominio/transferencia.ts`). Mesma decisão de escopo `'global'` e mesmos motivos de T07
 * (paridade de ordem de emissão com o call-site legado + consistência com os demais detectores
 * desta lista) — `mutacaoProposta.alvo` também é id-based aqui, então `'por-fonte'` produziria o
 * mesmo conjunto de ids corretamente, mas `'global'` preserva a ordem de um único `.map()` sobre
 * `todosLancamentos`. `nomeUsuario` é repassado do `contexto` (já propagado pelo orquestrador,
 * T05), sem exigir nenhuma mudança na assinatura de `FuncaoDeteccao`.
 */
export const detectores: Detector[] = [
  {
    origem: 'valor-pendente',
    escopo: 'global',
    detectar: (lancamentos) => detectarValorPendente(lancamentos),
  },
  {
    origem: 'pagamento-recebido',
    escopo: 'global',
    detectar: (lancamentos) => detectarPagamentoRecebido(lancamentos),
  },
  {
    origem: 'conciliacao',
    escopo: 'global',
    detectar: detectarConciliacaoRegistry,
  },
  {
    origem: 'investimento',
    escopo: 'global',
    detectar: (lancamentos) => detectarInvestimentoAvisos(lancamentos),
  },
  {
    origem: 'transferencia-interna',
    escopo: 'global',
    detectar: (lancamentos, contexto) =>
      detectarTransferenciaInternaAvisos(lancamentos, contexto.nomeUsuario),
  },
]

/**
 * Orquestrador do registry (ver ADR `fundacao-operacoes`, Decisão 3): percorre `detectoresLista`
 * e, para cada detector, decide a fatia de `lancamentos` que lhe cabe conforme `escopo` —
 * `'global'` roda uma única vez sobre o array total; `'por-fonte'` roda uma vez por valor
 * distinto de `Lancamento.fonte`, recebendo apenas a fatia daquela fonte (mesmo critério de
 * particionamento já usado por `classificarFonte`, `src/dominio/mes.ts`). Em ambos os casos,
 * `contexto.todosLancamentos` é sempre o array total, nunca a fatia da chamada — necessário para
 * detectores como conciliação, que precisam olhar além da própria fatia.
 *
 * Zero lançamentos e um detector `'por-fonte'` produz zero chamadas (zero fontes = zero fatias).
 *
 * Os `Aviso[]` de todas as chamadas são concatenados, preservando a ordem de execução.
 *
 * `mesRef` (T06, ver ADR `fundacao-operacoes`): repassado ao contexto sem alteração — usado hoje
 * apenas pelo detector de conciliação (`detectarConciliacaoRegistry`) como guard de entrada (a
 * classificação fatura/extrato em si é autoritativa por prefixo de `fonte`, ver Task 6 do ADR
 * `conciliacao-robusta`). Parâmetro opcional e aditivo; chamadas existentes (T05) continuam
 * válidas sem informá-lo.
 */
export function orquestrarDeteccao(
  lancamentos: Lancamento[],
  detectoresLista: Detector[],
  nomeUsuario?: string,
  mesRef?: string,
): Aviso[] {
  const contexto: ContextoDeteccao = { todosLancamentos: lancamentos, nomeUsuario, mesRef }
  const avisos: Aviso[] = []

  for (const detector of detectoresLista) {
    if (detector.escopo === 'global') {
      avisos.push(...detector.detectar(lancamentos, contexto))
      continue
    }

    // escopo 'por-fonte': agrupa por Lancamento.fonte, preservando a ordem de primeira aparição.
    const fatias = new Map<string, Lancamento[]>()
    for (const lancamento of lancamentos) {
      const fatia = fatias.get(lancamento.fonte)
      if (fatia) {
        fatia.push(lancamento)
      } else {
        fatias.set(lancamento.fonte, [lancamento])
      }
    }
    for (const fatia of fatias.values()) {
      avisos.push(...detector.detectar(fatia, contexto))
    }
  }

  return avisos
}
