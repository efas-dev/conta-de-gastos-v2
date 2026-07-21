// ADR: see Docs/specs/avisos-acionaveis.adr.md

import type { Aviso, Lancamento } from '../types'

const TOLERANCIA_CENTAVOS = 5
const TITULO_VALOR_PENDENTE = 'valor pendente do mes anterior'

/**
 * Normaliza texto para comparação: minúsculas + remoção de diacríticos (NFD).
 * Mesmo precedente do leitor de dicionário (`src/excel/reader/leitor.ts`) e de
 * `normalizarParaBusca` (`src/dominio/normalizacao.ts`) — Decisão 2 do ADR `avisos-acionaveis`.
 */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/** Converte um valor em reais para centavos inteiros, evitando float drift. */
function paraCentavos(valor: number): number {
  return Math.round(valor * 100)
}

/**
 * Detecta, entre os lançamentos excluídos do parser (`ResultadoParse.excluidosPendentes`),
 * quais correspondem a "Valor pendente do mês anterior" e gera um aviso informativo para
 * cada um — tornando auditável um valor que, se tratado como lançamento comum, duplicaria
 * despesa já contada no ciclo anterior (ver ADR `avisos-acionaveis`, Contexto).
 *
 * Função pura: não faz I/O, não tem efeito colateral, não referencia o store.
 *
 * @param excluidosPendentes - Lançamentos excluídos pelo parser (mistura possível de
 *   "valor pendente" e "pagamento recebido" — apenas o primeiro é reportado aqui).
 * @returns Um `Aviso` informativo por lançamento casado; array vazio se nenhum casar.
 */
export function detectarValorPendente(excluidosPendentes: Lancamento[]): Aviso[] {
  const avisos: Aviso[] = []

  excluidosPendentes.forEach((lancamento, index) => {
    if (!normalizar(lancamento.transcricao).includes(TITULO_VALOR_PENDENTE)) return

    avisos.push({
      id: `valor-pendente-${index}`,
      tipo: 'informativo',
      origem: 'valor-pendente',
      mensagem: `Valor pendente do mês anterior: "${lancamento.transcricao}" (R$ ${Math.abs(lancamento.valor).toFixed(2)}).`,
      alvo: [String(index)],
      estado: 'pendente',
    })
  })

  return avisos
}

/**
 * Verifica se existe algum subconjunto de `valoresCentavos` (todos > 0) cuja soma seja
 * exatamente igual a `alvoCentavos`. Programação dinâmica clássica de subset-sum sobre um
 * `Set` de somas alcançáveis — O(n × alvo), adequado ao volume de itens de uma fatura.
 */
function subsetSomaExiste(valoresCentavos: number[], alvoCentavos: number): boolean {
  if (alvoCentavos <= 0) return false

  const alcancaveis = new Set<number>([0])
  for (const valor of valoresCentavos) {
    if (valor <= 0) continue
    const novos: number[] = []
    for (const soma of alcancaveis) {
      const proxima = soma + valor
      if (proxima <= alvoCentavos && !alcancaveis.has(proxima)) novos.push(proxima)
    }
    for (const nova of novos) alcancaveis.add(nova)
    if (alcancaveis.has(alvoCentavos)) return true
  }
  return false
}

/** Monta o Aviso de proposta de conciliação apontando para o lançamento do extrato. */
function propostaConciliacao(lancamento: Lancamento, indexExtrato: number): Aviso {
  return {
    id: `conciliacao-${indexExtrato}`,
    tipo: 'proposta',
    origem: 'conciliacao',
    mensagem: `Fatura conciliada com "${lancamento.transcricao}" do extrato — deseja remover esse lançamento?`,
    alvo: [String(indexExtrato)],
    estado: 'pendente',
  }
}

/**
 * Detecta conciliação entre os lançamentos de uma fatura e os lançamentos de um extrato,
 * evitando que a mesma despesa seja contada duas vezes (item a item pela fatura, agregada
 * pelo extrato) — ver ADR `avisos-acionaveis`, Decisão 8 (R1) e Decisão 9 (R2).
 *
 * Estratégia, nesta ordem:
 * 1. Casamento do somatório total da fatura contra cada lançamento do extrato, com
 *    tolerância de R$ 0,05 (arredondamento bancário). Exatamente 1 candidato → proposta.
 * 2. Fallback: quando o somatório total não casa com nenhum candidato, tenta casamento
 *    exato ao centavo entre um subconjunto da fatura e um lançamento do extrato (cenário
 *    de pagamento parcial).
 * 3. Em ambas as etapas, 2+ candidatos dentro do critério é ambiguidade — par único
 *    conservador (R2): nenhuma proposta é gerada.
 * 4. Nenhum casamento em nenhuma etapa → aviso informativo "fatura não conciliada".
 *
 * Função pura: não faz I/O, não tem efeito colateral, não referencia o store.
 *
 * @param lancamentosFatura - Lançamentos da fatura a conciliar.
 * @param lancamentosExtrato - Lançamentos do extrato candidatos ao casamento.
 * @returns Array com 0 ou 1 `Aviso` (proposta de conciliação ou informativo de não-casamento).
 */
export function detectarConciliacao(
  lancamentosFatura: Lancamento[],
  lancamentosExtrato: Lancamento[],
): Aviso[] {
  const somaFaturaCentavos = Math.abs(
    lancamentosFatura.reduce((acc, l) => acc + paraCentavos(l.valor), 0),
  )

  const candidatosTotal = lancamentosExtrato
    .map((lancamento, index) => ({ lancamento, index }))
    .filter(
      ({ lancamento }) =>
        Math.abs(Math.abs(paraCentavos(lancamento.valor)) - somaFaturaCentavos) <=
        TOLERANCIA_CENTAVOS,
    )

  if (candidatosTotal.length === 1) {
    return [propostaConciliacao(candidatosTotal[0].lancamento, candidatosTotal[0].index)]
  }
  if (candidatosTotal.length >= 2) {
    return []
  }

  const valoresFaturaCentavos = lancamentosFatura.map((l) => Math.abs(paraCentavos(l.valor)))
  const candidatosSubset = lancamentosExtrato
    .map((lancamento, index) => ({ lancamento, index }))
    .filter(({ lancamento }) =>
      subsetSomaExiste(valoresFaturaCentavos, Math.abs(paraCentavos(lancamento.valor))),
    )

  if (candidatosSubset.length === 1) {
    return [propostaConciliacao(candidatosSubset[0].lancamento, candidatosSubset[0].index)]
  }
  if (candidatosSubset.length >= 2) {
    return []
  }

  return [
    {
      id: 'conciliacao-sem-casamento',
      tipo: 'informativo',
      origem: 'conciliacao',
      mensagem: 'Aviso: fatura não conciliada — nenhum lançamento do extrato corresponde ao somatório da fatura.',
      alvo: [],
      estado: 'pendente',
    },
  ]
}
