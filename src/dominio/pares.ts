// ADR: see Docs/specs/motor-de-pares.adr.md

import type { Lancamento } from '../types'

/** Um par casado pelo motor: uma perna positiva e uma perna negativa de valor idêntico. */
export interface ParEncontrado {
  positivo: Lancamento
  negativo: Lancamento
  distanciaDias: number
}

/**
 * Grupo de lançamentos que empataram exatamente na distância mínima em dias (ADR
 * `motor-de-pares`, Decisões 7 e 9) — o motor não escolhe por eles; `ancora` é o lançamento
 * cujos candidatos empataram, `candidatos` são as opções empatadas (todas dentro da janela,
 * mesma `distanciaDias` que `ancora`).
 */
export interface GrupoAmbiguo {
  ancora: Lancamento
  candidatos: Lancamento[]
  distanciaDias: number
}

/**
 * Opções de `encontrarPares`. `padroesExcluidos` (ADR `motor-de-pares`, Decisões 5 e 17) é
 * SEMPRE um parâmetro, nunca uma constante interna ao motor — quem conhece os padrões
 * concretos de auto-sweep/aplicação (`BB Rende Fácil`, `RDB`, `CDB`) são os consumidores
 * (políticas `reembolso`/`transferencia-interna`), não o motor puro.
 */
export interface OpcoesMotorPares {
  /** Lançamentos cuja `transcricao` bate em algum destes padrões são excluídos do casamento. */
  padroesExcluidos?: RegExp[]
}

/**
 * Contexto repassado a `encontrarPares` e às políticas construídas sobre ele (futuras
 * consumidoras T2 `detectarReembolsoAvisos` e T3 `detectarTransferenciaInternaAvisos`, que já
 * recebem `nomeUsuario` hoje em `transferencia.ts`). O motor puro desta task (T1) não lê
 * nenhum campo daqui — nenhuma regra do Definition of done de T1 depende de `contexto`; o
 * parâmetro existe para já fechar a assinatura final `(lancamentos, contexto, opcoes)`
 * declarada na Decomposição da spec, decisão registrada em
 * `Docs/.harness/iteracao-log-spec-20260831-motor-de-pares-task-1.md`.
 */
export interface ContextoMotorPares {
  nomeUsuario?: string
}

/** Janela máxima de dias entre as duas pernas de um par candidato (ADR, Decisão 4). */
const JANELA_MAXIMA_DIAS = 7

/** Fontes de lançamentos manuais do próprio app — nunca participam do motor (D14, fixo). */
const FONTES_MANUAIS = new Set(['form_vr', 'form_rendimentos'])

/** Converte um valor em reais para centavos inteiros, evitando float drift. */
function paraCentavos(valor: number): number {
  return Math.round(valor * 100)
}

/**
 * Converte uma data ISO (`YYYY-MM-DD`) para o número de dia juliano (inteiro), usando apenas
 * aritmética de inteiros sobre os componentes de `split('-')` — nunca `Date`/fuso horário,
 * mesma disciplina de `deteccoes.ts`. `deteccoes.ts` só formata datas (não subtrai); esta
 * função estende o mesmo padrão de "nunca passar por `Date`" para permitir a subtração de
 * datas exigida pela janela de dias (D4) sem introduzir deriva de fuso.
 */
function paraDiaJuliano(dataIso: string): number {
  const [anoStr, mesStr, diaStr] = dataIso.split('-')
  const ano = Number(anoStr)
  const mes = Number(mesStr)
  const dia = Number(diaStr)

  const a = Math.floor((14 - mes) / 12)
  const y = ano + 4800 - a
  const m = mes + 12 * a - 3

  return (
    dia +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  )
}

/** Distância absoluta em dias entre duas datas ISO, sem passar por `Date`. */
function diasEntre(dataA: string, dataB: string): number {
  return Math.abs(paraDiaJuliano(dataA) - paraDiaJuliano(dataB))
}

/** Um lançamento entra na disputa de casamento se não for manual e não bater em nenhuma exclusão. */
function elegivel(lancamento: Lancamento, padroesExcluidos: RegExp[]): boolean {
  if (FONTES_MANUAIS.has(lancamento.fonte)) return false
  if (padroesExcluidos.some((padrao) => padrao.test(lancamento.transcricao))) return false
  return true
}

interface Candidato {
  positivo: Lancamento
  negativo: Lancamento
  distanciaDias: number
}

/** Registra `candidato` no grupo ambíguo de `ancora` em `distanciaDias`, criando-o se preciso. */
function adicionarAoGrupoAmbiguo(
  ambiguos: GrupoAmbiguo[],
  ancora: Lancamento,
  candidato: Lancamento,
  distanciaDias: number,
): void {
  const existente = ambiguos.find((g) => g.ancora.id === ancora.id && g.distanciaDias === distanciaDias)
  if (existente) {
    existente.candidatos.push(candidato)
    return
  }
  ambiguos.push({ ancora, candidatos: [candidato], distanciaDias })
}

/**
 * Casa toda perna positiva de `lancamentos` com a perna negativa de valor absoluto idêntico
 * ao centavo (tolerância zero — ADR `motor-de-pares`, Decisão 8) dentro de uma janela de 7
 * dias (Decisão 4), elegendo a distância mínima (Decisão 9); um empate exato de distância
 * entre 2+ candidatos vira `GrupoAmbiguo` em vez de par (Decisão 7). Cada lançamento entra em
 * no máximo um par.
 *
 * Exclui sempre lançamentos de fontes manuais (`form_vr`, `form_rendimentos` — Decisão 14,
 * fixo dentro do motor) e lançamentos cuja `transcricao` bate em `opcoes.padroesExcluidos`
 * (Decisão 5/17, parâmetro — o motor não conhece `BB Rende Fácil`/`RDB`/`CDB` diretamente).
 * Um valor `0` nunca entra em par: não é nem estritamente positivo nem estritamente negativo
 * (Decisão 13, consequência natural da definição de casamento, sem guarda extra).
 *
 * Algoritmo: constrói todos os pares candidatos (mesmo valor absoluto, dentro da janela) e os
 * processa em ordem crescente de distância. Em cada distância, um candidato só vira par se for
 * a única opção disponível tanto para a perna positiva quanto para a negativa naquele nível —
 * um lançamento com 2+ candidatos disponíveis na MESMA distância mínima não é decidido pelo
 * motor: vira `GrupoAmbiguo` e é retirado da disputa (não compete em distâncias maiores). Um
 * candidato de um lançamento ambíguo que não é ele mesmo ambíguo (contagem 1 no seu próprio
 * lado) permanece disponível para casar em uma distância maior com outro lançamento.
 *
 * Função pura: não faz I/O, não muta `lancamentos` nem os objetos `Lancamento` recebidos, não
 * conhece `Aviso`/`registry` — apenas casa números e datas; o significado do par (transferência
 * própria vs. reembolso) é decidido pelas políticas construídas sobre esta função.
 *
 * @param lancamentos - Lançamentos a inspecionar (fatura e extrato, sem restrição de fonte
 *   além da exclusão fixa de manuais — ADR `motor-de-pares`, Decisão 12).
 * @param _contexto - Reservado para as políticas consumidoras (ver `ContextoMotorPares`); não
 *   lido por esta função.
 * @param opcoes - `padroesExcluidos` (ver `OpcoesMotorPares`).
 */
export function encontrarPares(
  lancamentos: Lancamento[],
  _contexto: ContextoMotorPares,
  opcoes: OpcoesMotorPares = {},
): { pares: ParEncontrado[]; ambiguos: GrupoAmbiguo[] } {
  const padroesExcluidos = opcoes.padroesExcluidos ?? []
  const elegiveis = lancamentos.filter((l) => elegivel(l, padroesExcluidos))

  const positivos = elegiveis.filter((l) => l.valor > 0)
  const negativos = elegiveis.filter((l) => l.valor < 0)

  const candidatos: Candidato[] = []
  for (const positivo of positivos) {
    for (const negativo of negativos) {
      if (paraCentavos(positivo.valor) !== paraCentavos(Math.abs(negativo.valor))) continue
      const distanciaDias = diasEntre(positivo.data, negativo.data)
      if (distanciaDias > JANELA_MAXIMA_DIAS) continue
      candidatos.push({ positivo, negativo, distanciaDias })
    }
  }

  const consumidos = new Set<number>()
  const pares: ParEncontrado[] = []
  const ambiguos: GrupoAmbiguo[] = []

  const distancias = Array.from(new Set(candidatos.map((c) => c.distanciaDias))).sort((a, b) => a - b)

  for (const distancia of distancias) {
    const nivel = candidatos.filter(
      (c) =>
        c.distanciaDias === distancia && !consumidos.has(c.positivo.id) && !consumidos.has(c.negativo.id),
    )
    if (nivel.length === 0) continue

    const contagemPositivo = new Map<number, number>()
    const contagemNegativo = new Map<number, number>()
    for (const c of nivel) {
      contagemPositivo.set(c.positivo.id, (contagemPositivo.get(c.positivo.id) ?? 0) + 1)
      contagemNegativo.set(c.negativo.id, (contagemNegativo.get(c.negativo.id) ?? 0) + 1)
    }

    for (const c of nivel) {
      if (contagemPositivo.get(c.positivo.id) === 1 && contagemNegativo.get(c.negativo.id) === 1) {
        pares.push({ positivo: c.positivo, negativo: c.negativo, distanciaDias: distancia })
        consumidos.add(c.positivo.id)
        consumidos.add(c.negativo.id)
      }
    }

    const ancorasAmbiguas = new Set<number>()
    for (const [id, contagem] of contagemPositivo) {
      if (contagem > 1 && !consumidos.has(id)) ancorasAmbiguas.add(id)
    }
    for (const [id, contagem] of contagemNegativo) {
      if (contagem > 1 && !consumidos.has(id)) ancorasAmbiguas.add(id)
    }

    for (const c of nivel) {
      if (ancorasAmbiguas.has(c.positivo.id)) {
        adicionarAoGrupoAmbiguo(ambiguos, c.positivo, c.negativo, distancia)
      }
      if (ancorasAmbiguas.has(c.negativo.id)) {
        adicionarAoGrupoAmbiguo(ambiguos, c.negativo, c.positivo, distancia)
      }
    }
    for (const id of ancorasAmbiguas) consumidos.add(id)
  }

  return { pares, ambiguos }
}
