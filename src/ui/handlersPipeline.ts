// ADR: see spec/fundacao-operacoes.adr.md
import {
  produzirLancamentos,
  gerarAPartirDosRevisados,
  computarNomeArquivo,
} from './PipelineState'
import { lerNaturezas } from '../excel/reader/leitor'
import { classificarFonte } from '../dominio/mes'
import { decodificarCsv } from '../parsers/decodificar'
import {
  detectarConciliacao,
  detectarValorPendente,
  detectarPagamentoRecebido,
} from '../dominio/deteccoes'
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
 * Task T11 (spec `fundacao-operacoes`): extraído de `App.tsx::handleProduzir`,
 * comportamento preservado byte-a-byte (mesmas chamadas de detecção legadas —
 * o cutover para `reproduzirAvisos`/registry (D8/T09) fica DIFERIDO, ver
 * iteração-log desta task).
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
    const mensagem = 'Erro ao carregar Modelo.xlsx — verifique o servidor'
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
      nomeUsuario || undefined,
      [],
      adicionarAvisosAcionaveis,
    )
    todosLancamentos.push(...lans)
    for (const av of avs) {
      addAviso(`${arquivo.name}: ${av}`)
    }
  }

  // Task T11 do ADR `inspecao-proposta-conciliacao`: valor-pendente/pagamento-recebido
  // precisam ser detectados sobre o array TOTAL já concatenado (`todosLancamentos`),
  // não a sublista per-arquivo — `produzirLancamentos` (acima) parava de fazer isso
  // internamente por rodar por arquivo (T11, ver PipelineState.ts). Como
  // `origemEspecial` está presente em cada lançamento do total, `alvo` já nasce como
  // índice real, sem remapeamento de offset (mesmo padrão de `detectarConciliacao`
  // abaixo, mas sem precisar de `indicesFaturaNoTotal`/`indicesExtratoNoTotal` porque
  // a detecção já roda direto sobre o total). Corrige o bug achado na validação
  // visual manual (2026-08-01): quando a fatura não é o 1º arquivo do lote, o `alvo`
  // relativo à sublista per-arquivo casava com a linha errada em `state.lancamentos`.
  const avisosValorPendente = detectarValorPendente(todosLancamentos)
  const avisosPagamentoRecebido = detectarPagamentoRecebido(todosLancamentos)
  adicionarAvisosAcionaveis([...avisosValorPendente, ...avisosPagamentoRecebido])

  // Task 8 do ADR avisos-acionaveis: correlaciona fatura×extrato pelo campo
  // `fonte` que os parsers já gravam em cada lançamento — sem heurística de
  // nome de arquivo (decisão humana, ver spec Task 8). Reutiliza
  // `classificarFonte` (já usado acima para os rótulos fatura/extrato da
  // lista de arquivos) como única fonte de verdade, em vez de introduzir
  // uma segunda heurística. `produzirLancamentos` sempre roda por arquivo
  // com `lancamentosExtrato=[]` (linha 366: 5º argumento), então
  // `detectarConciliacao` nunca dispara ali — esta é a única chamada,
  // evitando dupla emissão de propostas. Só executa quando o lote produzido
  // tem ao menos uma fonte de cada lado; um único arquivo (só fatura ou só
  // extrato) fica sem proposta e sem o aviso informativo "não conciliada",
  // preservando o comportamento anterior.
  const fontesProduzidas = Array.from(new Set(todosLancamentos.map((l) => l.fonte)))
  const fontesFaturaProduzidas = fontesProduzidas.filter(
    (fonte) => classificarFonte(fonte, todosLancamentos, mesEscolhido) === 'fatura',
  )
  const fontesExtratoProduzidas = fontesProduzidas.filter(
    (fonte) => classificarFonte(fonte, todosLancamentos, mesEscolhido) === 'extrato',
  )

  if (fontesFaturaProduzidas.length > 0 && fontesExtratoProduzidas.length > 0) {
    const lancamentosExtratoTotal = todosLancamentos.filter((l) =>
      fontesExtratoProduzidas.includes(l.fonte),
    )
    // `detectarConciliacao` (T3, função pura) devolve `aviso.alvo` como índice
    // posicional relativo ao array `lancamentosExtrato` que ela recebeu — aqui,
    // o subconjunto filtrado `lancamentosExtratoTotal`, não `todosLancamentos`
    // inteiro. `avisosSlice.aplicar` (T4), por sua vez, interpreta `alvo` como
    // índice posicional em `state.lancamentos`, que é `todosLancamentos` sem
    // filtro (ver `setLancamentos(todosLancamentos)` abaixo). Os dois contratos
    // são internamente corretos, mas divergem no índice-base; sem remapear
    // aqui, `aplicar` removeria o item errado sempre que a fatura precedesse o
    // extrato no lote (evidência: Docs/.harness/iteracao-log-spec-20260720-avisos-acionaveis.md,
    // bloco "Debugging gate" da Task 7, 2ª tentativa). `indicesExtratoNoTotal[i]`
    // traduz o índice i dentro do subconjunto filtrado para o índice real em
    // `todosLancamentos`.
    const indicesExtratoNoTotal = todosLancamentos
      .map((l, indice) => ({ l, indice }))
      .filter(({ l }) => fontesExtratoProduzidas.includes(l.fonte))
      .map(({ indice }) => indice)
    // Par único por fatura (Decisão R2 do ADR): uma chamada de detectarConciliacao
    // por fonte de fatura, nunca as faturas somadas entre si.
    for (const fonteFatura of fontesFaturaProduzidas) {
      const lancamentosDestaFatura = todosLancamentos.filter((l) => l.fonte === fonteFatura)
      // Mesmo padrão de `indicesExtratoNoTotal` acima, agora para o lado da fatura:
      // `aviso.permanece` (T0, ADR `inspecao-proposta-conciliacao`) também é um índice
      // posicional relativo ao subconjunto filtrado que `detectarConciliacao` recebeu —
      // aqui, `lancamentosDestaFatura` — não a `todosLancamentos` inteiro. Sem este
      // remapeamento, `permanece` aponta para a linha errada sempre que a fatura não é o
      // primeiro arquivo do lote (dívida registrada em
      // Docs/debt/tecnica/remapeamento-permanece-ausente-app-tsx.md).
      const indicesFaturaNoTotal = todosLancamentos
        .map((l, indice) => ({ l, indice }))
        .filter(({ l }) => l.fonte === fonteFatura)
        .map(({ indice }) => indice)
      const avisosConciliacao = detectarConciliacao(lancamentosDestaFatura, lancamentosExtratoTotal)
      const avisosRemapeados = avisosConciliacao.map((aviso) => ({
        ...aviso,
        alvo: aviso.alvo.map((indiceStr) => String(indicesExtratoNoTotal[Number(indiceStr)])),
        permanece: aviso.permanece.map((indiceStr) => String(indicesFaturaNoTotal[Number(indiceStr)])),
      }))
      adicionarAvisosAcionaveis(avisosRemapeados)
    }
  }

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
  const nome = computarNomeArquivo(lancamentos, iniciais)

  const url = URL.createObjectURL(blob)
  const a = anchorRef.current
  if (!a) return
  a.href = url
  a.download = nome
  a.click()
  marcarLimpo() // seta sujo=false imediatamente após exportação — D6 do ADR
  URL.revokeObjectURL(url) // revoke imediato — zero-retenção
}
