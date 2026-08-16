// ADR: see spec/fundacao-operacoes.adr.md
import {
  produzirLancamentos,
  gerarAPartirDosRevisados,
  computarNomeArquivo,
  reproduzirAvisos,
} from './PipelineState'
import { lerNaturezas } from '../excel/reader/leitor'
import { decodificarCsv } from '../parsers/decodificar'
import type { Aviso, DicEntry, Lancamento, NaturezaRica } from '../types'

/**
 * Lê um arquivo CSV/TXT como texto, decodificando o encoding de forma robusta.
 *
 * Não usa `File.text()` (que assume UTF-8): alguns bancos exportam em ISO-8859-1
 * (ex.: Banco do Brasil), e a decodificação com fallback (`decodificarCsv`)
 * evita acentos corrompidos. Ver `parsers/decodificar.ts`.
 *
 * Task T11 (spec `fundacao-operacoes`): extraído de `App.tsx` — usado tanto pelo
 * upload (`processarArquivos`, permanece em `App.tsx`) quanto por `handleProduzir`
 * (abaixo).
 */
export async function lerTextoArquivo(arquivo: File): Promise<string> {
  const bytes = new Uint8Array(await arquivo.arrayBuffer())
  return decodificarCsv(bytes)
}

/**
 * Constrói um `Aviso` informativo dispensável para os avisos legados migrados ao
 * canal único (sheet `PainelLateral`/aba Avisos, D18 do ADR `inspecao-proposta-conciliacao`
 * — Task T9). Convive com o canal legado `avisos: string[]` (`addAviso`/`clearAvisos`)
 * nos call-sites que ainda o alimentam — este helper só adiciona a via nova.
 *
 * Task T11 (spec `fundacao-operacoes`): extraído de `App.tsx` — usado tanto pelo
 * upload (`processarArquivos`, permanece em `App.tsx`) quanto por `handleProduzir`
 * (abaixo).
 */
export function criarAvisoInformativo(id: string, origem: string, mensagem: string): Aviso {
  return {
    id,
    tipo: 'informativo',
    origem,
    mensagem,
    alvo: [],
    permanece: [],
    estado: 'pendente',
  }
}

/** Dependências de `handleProduzir` — estado/setters do `App.tsx` que a Etapa 1 precisa. */
export interface DepsHandleProduzir {
  csvArquivos: File[]
  dicEntries: DicEntry[]
  iniciais: string
  nomeUsuario: string
  mesEscolhido: string
  addAviso: (mensagem: string) => void
  adicionarAvisosAcionaveis: (avisos: Aviso[]) => void
  /**
   * Ação do avisosSlice (T09) que zera `avisosAcionaveis` por inteiro — chamada por
   * `reproduzirAvisos` (política D8) antes de re-rodar o registry. Task T14: novo campo,
   * único jeito de o cutover ficar OBSERVÁVEL em produção (sem ele, `reproduzirAvisos`
   * não tem como limpar o canal real do store).
   */
  limparAvisos: () => void
  setLancamentos: (lancamentos: Lancamento[]) => void
  setNaturezasRicas: (naturezas: NaturezaRica[]) => void
  setNaturezasValidas: (siglas: string[]) => void
  setModeloBytes: (bytes: Uint8Array | null) => void
}

/**
 * Etapa 1 — Parse + enriquecimento.
 *
 * Lê CSV como texto, carrega dicionário opcional como bytes,
 * busca Modelo.xlsx, chama `produzirLancamentos` e povoa o store.
 * Também lê `lerNaturezas` do modelo e grava `naturezasValidas` no store.
 *
 * Task T11 (spec `fundacao-operacoes`): extraído de `App.tsx::handleProduzir`.
 * Task T14 (spec `fundacao-operacoes`): cutover — as detecções diretas de
 * valor-pendente/pagamento-recebido/conciliação foram substituídas por uma única
 * chamada a `reproduzirAvisos` (política D8/T09: zera `avisosAcionaveis` e roda os 5
 * detectores do registry sobre `todosLancamentos`).
 */
export async function handleProduzir(deps: DepsHandleProduzir): Promise<void> {
  const {
    csvArquivos,
    dicEntries,
    iniciais,
    nomeUsuario,
    mesEscolhido,
    addAviso,
    adicionarAvisosAcionaveis,
    limparAvisos,
    setLancamentos,
    setNaturezasRicas,
    setNaturezasValidas,
    setModeloBytes,
  } = deps

  if (csvArquivos.length === 0) return

  let modelo: Uint8Array
  try {
    // BASE_URL resolve o subcaminho do GitHub Pages ('/' em dev)
    const resp = await fetch(`${import.meta.env.BASE_URL}Modelo.xlsx`)
    modelo = new Uint8Array(await resp.arrayBuffer())
  } catch (err) {
    console.error('[handlersPipeline] Falha ao carregar Modelo.xlsx:', err)
    const mensagem = 'Erro ao carregar Modelo.xlsx: verifique o servidor'
    addAviso(mensagem)
    adicionarAvisosAcionaveis([
      criarAvisoInformativo(crypto.randomUUID(), 'erro-modelo-xlsx', mensagem),
    ])
    return
  }

  // Cada arquivo é parseado independentemente (pode ser de banco/formato
  // diferente — `detectar` roda por arquivo) e os lançamentos são concatenados
  // na ordem dos arquivos selecionados. O dicionário (dicEntries do store,
  // carregado pelo upload unificado) e as naturezas são os mesmos para todos.
  const todosLancamentos: Lancamento[] = []
  for (const arquivo of csvArquivos) {
    const csvConteudo = await lerTextoArquivo(arquivo)
    const { lancamentos: lans, avisos: avs } = produzirLancamentos(
      csvConteudo,
      dicEntries,
      iniciais,
      [],
      adicionarAvisosAcionaveis,
    )
    todosLancamentos.push(...lans)
    for (const av of avs) {
      addAviso(`${arquivo.name}: ${av}`)
    }
  }

  // Task T14 (spec `fundacao-operacoes`): cutover para o registry — política D8 (T09):
  // `reproduzirAvisos` zera `avisosAcionaveis` por inteiro (incluindo decisões de rodadas
  // anteriores E os informativos já emitidos acima nesta mesma rodada, ex.: "linhas
  // ignoradas" — D8 não filtra por origem/rodada, ver Test List de T09) e roda os 5
  // detectores registrados (`src/dominio/registry.ts`: valor-pendente, pagamento-recebido,
  // conciliação, investimento, transferência interna) sobre `todosLancamentos` já
  // concatenado. Substitui as 3 chamadas legadas diretas
  // (`detectarValorPendente`/`detectarPagamentoRecebido`/`detectarConciliacao`) e o
  // remapeamento manual de índice que viviam aqui — o wrapper de conciliação do registry
  // (`registry.ts::detectarConciliacaoRegistry`) já reproduz essa mesma lógica de
  // classificação/agrupamento/remapeamento (ver iteração-log de T06).
  reproduzirAvisos(
    todosLancamentos,
    nomeUsuario || undefined,
    mesEscolhido,
    limparAvisos,
    adicionarAvisosAcionaveis,
  )

  // Parseia naturezas uma única vez e deriva ambos os campos (D2 do ADR colinha-naturezas).
  const ricas = lerNaturezas(modelo)

  setLancamentos(todosLancamentos)
  setNaturezasRicas(ricas)
  // `naturezasValidas` derivado das siglas — sem parse adicional (D2 do ADR colinha-naturezas).
  // `App.tsx` original chamava `useAppStore.setState(...)` diretamente; aqui o módulo de
  // pipeline recebe `setNaturezasValidas` como dependência explícita para não acoplar a
  // `useAppStore` (mesma disciplina de `PipelineState.ts`, que também não conhece o store).
  setNaturezasValidas(ricas.map((n) => n.sigla))

  setModeloBytes(modelo)
}

/** Dependências de `handleGerar` — estado/refs do `App.tsx` que a Etapa 3 precisa. */
export interface DepsHandleGerar {
  modeloBytes: Uint8Array | null
  lancamentos: Lancamento[]
  iniciais: string
  dicEntries: DicEntry[]
  mesEscolhido: string
  anchorRef: { current: HTMLAnchorElement | null }
  marcarLimpo: () => void
}

/**
 * Etapa 3 — Aprendizado do dicionário + geração do .xlsx.
 *
 * Chama `gerarAPartirDosRevisados` com os lançamentos revisados do store,
 * cria o Blob, dispara o download via `<a download>` e revoga o objectURL
 * imediatamente — zero-retenção (invariante do projeto).
 *
 * Task T11 (spec `fundacao-operacoes`): extraído de `App.tsx::handleGerar`,
 * comportamento preservado byte-a-byte.
 */
export function handleGerar(deps: DepsHandleGerar): void {
  const { modeloBytes, lancamentos, iniciais, dicEntries, mesEscolhido, anchorRef, marcarLimpo } = deps

  if (!modeloBytes || lancamentos.length === 0) return

  const xlsxBytes = gerarAPartirDosRevisados(modeloBytes, iniciais, lancamentos, dicEntries, mesEscolhido)

  // `.slice()` materializa Uint8Array<ArrayBuffer> puro a partir do
  // Uint8Array<ArrayBufferLike> do fflate — necessário para BlobPart no TS ≥ 5.7.
  const blob = new Blob([xlsxBytes.slice()], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  // Nome pelo mês de REFERÊNCIA (mesma autoridade de B3/Ref.), nunca pela data
  // do primeiro lançamento — que numa fatura é do mês anterior (daria M-1).
  const nome = computarNomeArquivo(lancamentos, iniciais, mesEscolhido)

  const url = URL.createObjectURL(blob)
  const a = anchorRef.current
  if (!a) return
  a.href = url
  a.download = nome
  a.click()
  marcarLimpo() // seta sujo=false imediatamente após exportação — D6 do ADR
  URL.revokeObjectURL(url) // revoke imediato — zero-retenção
}
