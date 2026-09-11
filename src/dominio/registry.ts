// ADR: see Docs/specs/fundacao-operacoes.adr.md
// ADR: see Docs/specs/conciliacao-robusta.adr.md
// ADR: see Docs/specs/vr-despesas.adr.md
// ADR: see Docs/specs/rendimentos.adr.md
// ADR: see Docs/specs/motor-de-pares.adr.md

import type { Aviso, Lancamento } from '../types'
import { detectarValorPendente, detectarPagamentoRecebido, detectarConciliacao } from './deteccoes'
import { detectarInvestimentoAvisos } from './investimento'
import { detectarTransferenciaInternaAvisos } from './transferencia'
import { detectarReembolsoAvisos } from './pares'
import { detectarVR } from './vr'
import { detectarRendimentos } from './rendimentos'
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
 *
 * Task 4 (spec `vr-despesas`) acrescentou `vr` (`detectarVR`, `src/dominio/vr.ts`) como PENÚLTIMO
 * elemento — posição deliberada (ADR `vr-despesas`, Decisão 5). Escopo `'global'` pelos mesmos
 * motivos de paridade/simplicidade dos detectores anteriores, ainda que aqui não haja `alvo`
 * id-based algum (o detector sempre emite 1 aviso fixo, sem `mutacaoProposta` — ver JSDoc de
 * `detectarVR`).
 *
 * Task 9 (spec `rendimentos`) acrescenta `rendimentos` (`detectarRendimentos`,
 * `src/dominio/rendimentos.ts`) como o ÚLTIMO elemento do array — posição definitiva conforme a
 * Decisão 2 do ADR `rendimentos` e o Follow-up já registrado na Decisão 5 do ADR `vr-despesas`,
 * preservando `vr` na penúltima posição. Mesmo padrão de escopo `'global'` e mesmo formato
 * "detector sempre emite 1 aviso fixo, sem `mutacaoProposta`" de `detectarVR` — ver JSDoc de
 * `detectarRendimentos`.
 *
 * Task 4 (spec `motor-de-pares`) acrescenta `reembolso` (`detectarReembolsoAvisos`,
 * `src/dominio/pares.ts`) imediatamente APÓS `transferencia-interna` e ANTES de `vr` (ADR
 * `motor-de-pares`, Decisão 16 — posição com efeito comportamental direto, não um detalhe de
 * implementação: a ordem deste array É a precedência de `deduplicarPorPrecedenciaDeAlvo`, ver
 * abaixo). Escopo `'global'` pelos mesmos motivos de paridade/simplicidade dos detectores
 * anteriores. Manter `investimento` ANTES de `reembolso` nesta ordem é o que garante que uma
 * proposta de `investimento` sobre um `Resgate RDB`/aplicação (ex.: `RDB`, `CDB`, `BB Rende
 * Fácil`) reivindique o alvo primeiro — quando o motor de pares (via
 * `PADROES_EXCLUSAO_REEMBOLSO`, `src/dominio/pares.ts`) não bastar sozinho para excluir esses
 * lançamentos do casamento, a precedência de ordem deste array ainda protege o alvo já
 * reivindicado por `investimento` (Decisão 3, ver `deduplicarPorPrecedenciaDeAlvo`).
 *
 * **Risco D12 (ADR `motor-de-pares`, Decisão 12) — documentado, NÃO mitigado nesta task:**
 * `detectarConciliacaoRegistry` (acima), quando `detectarConciliacao` falha ao casar uma linha de
 * fatura com uma de extrato, emite um `Aviso` **informativo** (`tipo: 'informativo'`, sem
 * `mutacaoProposta`) listando candidatos próximos. Um aviso sem `mutacaoProposta` NUNCA
 * reivindica alvo (ver `deduplicarPorPrecedenciaDeAlvo`) — logo a precedência de ordem
 * introduzida pela Decisão 3/Task 4 desta spec **não protege** esse caminho: o motor de pares
 * (`reembolso`/`transferencia-interna`) pode, em tese, propor a remoção de uma linha que a
 * conciliação já se declarou incapaz de casar, sem que a ordem deste array ofereça proteção
 * adicional a esse caso específico — a proteção de ordem só existe entre detectores que
 * REIVINDICAM alvo via `mutacaoProposta`, e `conciliacao` (informativo de falha) nunca reivindica.
 * Mitigação fica para spec futura (ver Follow-up da Decisão 12 do ADR).
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
  {
    origem: 'reembolso',
    escopo: 'global',
    detectar: (lancamentos, contexto) => detectarReembolsoAvisos(lancamentos, contexto),
  },
  {
    origem: 'vr',
    escopo: 'global',
    detectar: (lancamentos, contexto) => detectarVR(lancamentos, contexto),
  },
  {
    origem: 'rendimentos',
    escopo: 'global',
    detectar: (lancamentos, contexto) => detectarRendimentos(lancamentos, contexto),
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
      avisos.push(...executarDetector(detector, lancamentos, contexto))
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
      avisos.push(...executarDetector(detector, fatia, contexto, fatia[0]?.fonte))
    }
  }

  return deduplicarPorPrecedenciaDeAlvo(avisos)
}

/**
 * Roda UM detector protegido: uma detecção que falha não pode derrubar as outras nem a
 * importação inteira (achado lateral do item 47 do TODO).
 *
 * O contrato de extensão do projeto é o prefixo de `fonte` declarado pelo parser, e
 * `classificarFontePorPrefixo` (`src/dominio/mes.ts`) lança para quem o viola — comportamento
 * correto na fronteira, porque um prefixo desconhecido não tem classificação honesta. Só que
 * `orquestrarDeteccao` roda dentro de `reproduzirAvisos`, ANTES de `setLancamentos`
 * (`src/ui/handlersPipeline.ts`): sem esta proteção, um parser da comunidade com fonte fora da
 * convenção fazia a importação inteira morrer — nenhum lançamento chegava à grid.
 *
 * A falha é DECLARADA, nunca engolida: vira um aviso informativo nomeando a origem que falhou,
 * porque uma detecção que não rodou é exatamente o tipo de silêncio que a spec
 * `conciliacao-robusta` existiu para matar. Id determinístico por origem (mais a fonte, no
 * escopo `'por-fonte'`) — `reproduzirAvisos` re-roda a cada mudança de lançamentos, e um id
 * aleatório encheria o painel de cards repetidos.
 */
function executarDetector(
  detector: Detector,
  lancamentos: Lancamento[],
  contexto: ContextoDeteccao,
  fonte?: string,
): Aviso[] {
  try {
    return detector.detectar(lancamentos, contexto)
  } catch (erro) {
    const ondeaFalha = fonte === undefined ? detector.origem : `${detector.origem}/${fonte}`
    const motivo = erro instanceof Error ? erro.message : String(erro)
    return [
      {
        id: `deteccao-falhou-${ondeaFalha}`,
        tipo: 'informativo',
        origem: 'deteccao-falhou',
        mensagem:
          `A detecção "${ondeaFalha}" não pôde rodar e foi ignorada — os lançamentos estão na ` +
          `grid, mas esta verificação não foi feita. Motivo: ${motivo}`,
        alvo: [],
        permanece: [],
        estado: 'pendente',
      },
    ]
  }
}

/**
 * Passada de deduplicação por precedência de alvo (ADR `motor-de-pares`, Decisão 3):
 * percorre `avisos` na ordem de emissão (= ordem do array `detectores`, já concatenada acima) e
 * descarta qualquer aviso cujo `mutacaoProposta.alvo` intersecte um alvo já reivindicado por um
 * aviso anterior. O primeiro detector da ordem a reivindicar um id vence; quem vem depois cede.
 *
 * Só reivindica alvo o verbo `'remover'` (`Mutacao.alvo: number[]`, referencia lançamentos JÁ
 * EXISTENTES por id) — o verbo `'adicionar'` (`Mutacao.lancamentos`, sem `id` ainda) não tem
 * `alvo` na união discriminada e portanto nunca participa desta regra, mesmo que no futuro algum
 * detector o combine com `'remover'` no mesmo registry.
 *
 * Avisos sem `mutacaoProposta` (informativos, ou propostas ainda não migradas ao formato
 * estruturado) nunca reivindicam alvo e nunca são descartados por esta regra — essencial para os
 * informativos de ambiguidade do motor de pares (`reembolso`, T2) e para o informativo de falha
 * de casamento da conciliação (ver risco D12, documentado em `detectarConciliacaoRegistry` acima
 * e no JSDoc de `reembolso` no array `detectores`).
 */
function deduplicarPorPrecedenciaDeAlvo(avisos: Aviso[]): Aviso[] {
  const alvosReivindicados = new Set<number>()
  const resultado: Aviso[] = []

  for (const aviso of avisos) {
    if (!aviso.mutacaoProposta || aviso.mutacaoProposta.verbo !== 'remover') {
      resultado.push(aviso)
      continue
    }

    const alvoDoAviso = aviso.mutacaoProposta.alvo
    const intersecta = alvoDoAviso.some((id) => alvosReivindicados.has(id))
    if (intersecta) continue

    for (const id of alvoDoAviso) alvosReivindicados.add(id)
    resultado.push(aviso)
  }

  return resultado
}
