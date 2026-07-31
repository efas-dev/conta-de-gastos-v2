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

/** Formata centavos inteiros como reais em pt-BR (vírgula decimal), sem o prefixo "R$". */
function formatarReais(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Resumo textual da regra de casamento aplicada em `detectarConciliacao` (ver ADR
 * `inspecao-proposta-conciliacao`, Decisão 2) — usado em `Aviso.resumo`.
 */
function formatarResumoConciliacao(somaFaturaCentavos: number, pagamentoCentavos: number): string {
  return `somatório da fatura R$ ${formatarReais(somaFaturaCentavos)} ↔ pagamento R$ ${formatarReais(pagamentoCentavos)}, diferença ≤ R$ 0,05`
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
      permanece: [],
      estado: 'pendente',
    })
  })

  return avisos
}

/**
 * Encontra os índices (posição em `lancamentosFatura`) de algum subconjunto cuja soma em
 * centavos seja exatamente igual a `alvoCentavos`, ou `null` se não existir. Mesma programação
 * dinâmica de subset-sum de antes (soma alcançável em ordem), agora guardando a composição de
 * índices que atinge cada soma alcançável — a decisão de "existe casamento" continua idêntica
 * (deriva de "achou composição, sim ou não"), zero mudança na lógica de casamento.
 */
function subsetComposicaoIndices(
  lancamentosFatura: Lancamento[],
  alvoCentavos: number,
): number[] | null {
  if (alvoCentavos <= 0) return null

  const alcancaveis = new Map<number, number[]>([[0, []]])
  for (let indice = 0; indice < lancamentosFatura.length; indice++) {
    const valor = Math.abs(paraCentavos(lancamentosFatura[indice].valor))
    if (valor <= 0) continue
    const entradas = Array.from(alcancaveis.entries())
    for (const [soma, indices] of entradas) {
      const proxima = soma + valor
      if (proxima <= alvoCentavos && !alcancaveis.has(proxima)) {
        alcancaveis.set(proxima, [...indices, indice])
      }
    }
    if (alcancaveis.has(alvoCentavos)) break
  }
  return alcancaveis.get(alvoCentavos) ?? null
}

/** Monta o Aviso de proposta de conciliação apontando para o lançamento do extrato. */
function propostaConciliacao(
  lancamento: Lancamento,
  indexExtrato: number,
  permanece: string[],
  resumo: string,
): Aviso {
  return {
    id: `conciliacao-${indexExtrato}`,
    tipo: 'proposta',
    origem: 'conciliacao',
    mensagem: `Fatura conciliada com "${lancamento.transcricao}" do extrato — deseja remover esse lançamento?`,
    alvo: [String(indexExtrato)],
    permanece,
    resumo,
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
    const { lancamento, index } = candidatosTotal[0]
    const permanece = lancamentosFatura.map((_, i) => String(i))
    const resumo = formatarResumoConciliacao(
      somaFaturaCentavos,
      Math.abs(paraCentavos(lancamento.valor)),
    )
    return [propostaConciliacao(lancamento, index, permanece, resumo)]
  }
  if (candidatosTotal.length >= 2) {
    return []
  }

  const candidatosSubset = lancamentosExtrato
    .map((lancamento, index) => ({
      lancamento,
      index,
      composicao: subsetComposicaoIndices(lancamentosFatura, Math.abs(paraCentavos(lancamento.valor))),
    }))
    .filter(
      (candidato): candidato is typeof candidato & { composicao: number[] } =>
        candidato.composicao !== null,
    )

  if (candidatosSubset.length === 1) {
    const { lancamento, index, composicao } = candidatosSubset[0]
    const permanece = composicao.map((i) => String(i))
    const somaSubsetCentavos = composicao.reduce(
      (acc, i) => acc + Math.abs(paraCentavos(lancamentosFatura[i].valor)),
      0,
    )
    const resumo = formatarResumoConciliacao(
      somaSubsetCentavos,
      Math.abs(paraCentavos(lancamento.valor)),
    )
    return [propostaConciliacao(lancamento, index, permanece, resumo)]
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
      permanece: [],
      estado: 'pendente',
    },
  ]
}
