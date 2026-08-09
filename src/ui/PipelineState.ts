// ADR: see Docs/specs/grid-revisao.adr.md
// ADR: see Docs/specs/mes-referencia-ui.adr.md
// ADR: see Docs/specs/avisos-acionaveis.adr.md
// ADR: see Docs/specs/inspecao-proposta-conciliacao.adr.md
// ADR: see spec/fundacao-operacoes.adr.md

import type { Lancamento, DicEntry, Aviso } from '../types'
import { detectar } from '../parsers/index'
import { enriquecerLancamento } from '../dominio/dicionario'
import { detectarConciliacao } from '../dominio/deteccoes'
import { detectores, orquestrarDeteccao } from '../dominio/registry'
import { aprenderDicionario } from '../dominio/aprendizado'
import { lerDicionario } from '../excel/reader/leitor'
import { gerarXlsx } from '../excel/writer/gerador'

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

/**
 * Computa o nome do arquivo gerado: `AAAA-MM-INICIAIS.xlsx`.
 *
 * O mês/ano é derivado do campo `data` (YYYY-MM-DD) do primeiro lançamento.
 * Se a lista estiver vazia, retorna um nome genérico `exportacao-INICIAIS.xlsx`.
 */
export function computarNomeArquivo(lancamentos: Lancamento[], iniciais: string): string {
  if (lancamentos.length === 0) {
    return `exportacao-${iniciais}.xlsx`
  }
  // data: YYYY-MM-DD → substring(0,7) = YYYY-MM
  const anoMes = lancamentos[0].data.substring(0, 7)
  return `${anoMes}-${iniciais}.xlsx`
}

// ---------------------------------------------------------------------------
// Resultado intermediário do pipeline (entre parse e geração)
// ---------------------------------------------------------------------------

/**
 * Resultado de `produzirLancamentos`: lançamentos enriquecidos pelo dicionário,
 * entradas do dicionário lido e avisos acumulados durante o processamento.
 */
export interface ResultadoProduzir {
  lancamentos: Lancamento[]
  dicEntries: DicEntry[]
  avisos: string[]
}

// ---------------------------------------------------------------------------
// Etapa 1 — Parse + enriquecimento
// ---------------------------------------------------------------------------

/**
 * Faz parse do CSV e enriquece os lançamentos com o dicionário fornecido.
 *
 * Função pura de transformação — sem efeitos colaterais além do retorno.
 * Os avisos acumulados (linhas ignoradas) são retornados no campo `avisos`
 * para que o chamador decida como apresentá-los.
 *
 * O dicionário chega já parseado (`DicEntry[]`): a leitura dos bytes do .xlsx
 * acontece no upload (handler unificado do App), que guarda as entradas no store.
 *
 * A detecção de `detectarConciliacao` (ver `src/dominio/deteccoes.ts`) roda após o parse,
 * quando `lancamentosExtrato` é fornecido, e é despachada via `adicionarAvisos`, um callback
 * injetado — nunca uma importação direta de `avisosSlice` (ver ADR `avisos-acionaveis`,
 * Decisão 5: parser e este orquestrador não conhecem o store diretamente, o despacho é por
 * dado/callback, não por acoplamento a módulo).
 *
 * `detectarValorPendente`/`detectarPagamentoRecebido` NÃO rodam mais aqui (T11 do ADR
 * `inspecao-proposta-conciliacao`): esta função processa a sublista per-arquivo, então o
 * `alvo` gerado seria um índice relativo a essa sublista, nunca ao array total
 * (`todosLancamentos`/`state.lancamentos`) — quando a fatura não era o 1º arquivo do lote, o
 * destaque na grid caía na linha errada (bug achado na validação visual manual). As duas
 * detecções passaram para `App.tsx` (`handleProduzir`), rodando sobre `todosLancamentos` já
 * concatenado, mesmo padrão já usado por `detectarConciliacao` no call-site real.
 *
 * @param csvConteudo       Conteúdo do arquivo CSV (já lido como string)
 * @param dicEntries        Entradas do dicionário já lidas, ou [] se não fornecido
 * @param iniciais          Iniciais do usuário
 * @param lancamentosExtrato Lançamentos do extrato a conciliar com esta fatura (opcional).
 *   Quando vazio, `detectarConciliacao` não é chamado — evita o aviso "fatura não conciliada"
 *   em importações de um único arquivo sem contraparte de extrato.
 * @param adicionarAvisos  Callback chamado sempre, com o array de `Aviso[]` combinado das
 *   detecções (vazio se nenhuma gerar aviso). No-op por padrão.
 */
export function produzirLancamentos(
  csvConteudo: string,
  dicEntries: DicEntry[],
  iniciais: string,
  lancamentosExtrato: Lancamento[] = [],
  adicionarAvisos: (avisos: Aviso[]) => void = () => {},
): ResultadoProduzir {
  const avisos: string[] = []
  // Avisos informativos migrados para o canal único (slice `avisosAcionaveis`,
  // D18 do ADR `inspecao-proposta-conciliacao`) — hoje só "linhas ignoradas no
  // CSV"; acumulados aqui e despachados junto com as detecções de propostas
  // logo abaixo, num único array combinado.
  const avisosInformativosMigrados: Aviso[] = []

  // 1. Parse CSV (modo best-effort)
  const parser = detectar(csvConteudo)
  const { lancamentos, linhasIgnoradas } = parser.parsear(csvConteudo)

  if (linhasIgnoradas > 0) {
    const plural = linhasIgnoradas > 1 ? 's' : ''
    const mensagem = `${linhasIgnoradas} linha${plural} ignorada${plural} no CSV`
    avisos.push(mensagem)
    avisosInformativosMigrados.push({
      id: `linhas-ignoradas-${crypto.randomUUID()}`,
      tipo: 'informativo',
      origem: 'linhas-ignoradas',
      mensagem,
      alvo: [],
      permanece: [],
      estado: 'pendente',
    })
  }

  // 2. Enriquecimento via dicionário
  const lancamentosEnriquecidos = lancamentos.map((l) =>
    enriquecerLancamento(l, dicEntries, iniciais),
  )

  // 3. Avisos acionáveis: converte conciliação em Aviso[] e despacha. Valor-pendente/
  // pagamento-recebido deixaram de ser detectados aqui (T11 — ver docstring acima);
  // o call-site real (`App.tsx`, `handleProduzir`) os detecta sobre `todosLancamentos`.
  //
  // O antigo passo de "flags" (`investimento`/`transferenciaInterna` gravados no
  // lançamento) saiu em 2026-08-09: os campos só alimentavam o realce colorido da grid,
  // aposentado a pedido do usuário. Os detectores de domínio continuam vivos — o registry
  // chama `detectarInvestimento`/`detectarTransferenciaInterna` sobre o próprio lançamento
  // para gerar os avisos acionáveis, sem precisar da flag persistida.
  const avisosConciliacao =
    lancamentosExtrato.length > 0
      ? detectarConciliacao(lancamentosEnriquecidos, lancamentosExtrato)
      : []
  adicionarAvisos([...avisosConciliacao, ...avisosInformativosMigrados])

  return { lancamentos: lancamentosEnriquecidos, dicEntries, avisos }
}

// ---------------------------------------------------------------------------
// Política de "produzir" — limpar avisos e re-rodar o registry do zero (T09)
// ---------------------------------------------------------------------------

/**
 * Materializa a política de "produzir" declarada na Decisão 8 do ADR `fundacao-operacoes`
 * (Task T09): zera a lista de avisos por inteiro — incluindo decisões já tomadas
 * (`'aplicado'`/`'dispensado'`) — e re-roda TODOS os detectores registrados no registry
 * (`src/dominio/registry.ts`, T05/T06/T07/T07-bis) do zero sobre o array total de
 * lançamentos já concatenado. Nenhuma decisão anterior sobrevive a uma nova chamada —
 * previsibilidade sobre memória, decisão humana explícita da captura (o custo — o usuário
 * pode precisar re-dispensar propostas já dispensadas — foi registrado e aceito no ADR).
 *
 * `limparAvisos` é chamado SEMPRE antes de `adicionarAvisos` — nunca depois — para que a
 * lista nunca contenha, ainda que momentaneamente, avisos de duas rodadas de detecção
 * distintas.
 *
 * Wiring real (chamar esta função a partir do fluxo de "Produzir" do usuário, substituindo
 * as chamadas legadas diretas a `detectarValorPendente`/`detectarPagamentoRecebido`/
 * `detectarConciliacao` hoje em `App.tsx::handleProduzir`) é DIFERIDO para T10/T11 — ver
 * iteração-log da Task T09: `App.tsx` está fora das Áreas tocadas desta task; T11 já prevê
 * extrair `handleProduzir` para um módulo próprio que deixa de importar detectores
 * diretamente, ponto natural para este wiring.
 *
 * @param todosLancamentos Array total de lançamentos (já concatenado de todos os arquivos
 *   do lote), nunca a sublista de um único arquivo.
 * @param nomeUsuario      Nome do usuário (opcional) — habilita heurísticas nominais (ex.:
 *   Pix nominal em transferência interna).
 * @param mesRef           Mês de referência no formato YYYY-MM (opcional) — necessário para
 *   o detector de conciliação classificar fonte de fatura/extrato (ver `registry.ts`); sem
 *   ele, conciliação não produz aviso (degradação silenciosa já documentada em T06).
 * @param limparAvisos     Ação do avisosSlice que zera `avisos`/`removidos`/`avisoEmInspecao`.
 * @param adicionarAvisos  Ação do avisosSlice que despacha os avisos recém-detectados.
 */
export function reproduzirAvisos(
  todosLancamentos: Lancamento[],
  nomeUsuario: string | undefined,
  mesRef: string | undefined,
  limparAvisos: () => void,
  adicionarAvisos: (avisos: Aviso[]) => void,
): void {
  limparAvisos()
  adicionarAvisos(orquestrarDeteccao(todosLancamentos, detectores, nomeUsuario, mesRef))
}

// ---------------------------------------------------------------------------
// Etapa 2 — Aprendizado do dicionário + geração do .xlsx
// ---------------------------------------------------------------------------

/**
 * Dispara `aprenderDicionario` sobre os lançamentos revisados para enriquecer
 * o dicionário e gera o arquivo `.xlsx` injetando o dicionário enriquecido.
 *
 * Este é o ponto onde o aprendizado ao finalizar acontece (frase 10 do ADR).
 * A grid de revisão chama esta função após o usuário confirmar as edições.
 *
 * @param modeloBytes          Bytes do Modelo.xlsx (template base)
 * @param iniciais             Iniciais do usuário
 * @param lancamentosRevisados Lançamentos após revisão na grid
 * @param dicEntriesAnterior   Dicionário lido no início do pipeline (não mutado)
 * @param mesReferencia        Mês de referência no formato YYYY-MM (ex.: '2025-03')
 * @returns Bytes do .xlsx gerado
 */
export function gerarAPartirDosRevisados(
  modeloBytes: Uint8Array,
  iniciais: string,
  lancamentosRevisados: Lancamento[],
  dicEntriesAnterior: DicEntry[],
  mesReferencia: string,
): Uint8Array {
  const dicEnriquecido = aprenderDicionario(lancamentosRevisados, dicEntriesAnterior)
  return gerarXlsx(modeloBytes, iniciais, lancamentosRevisados, dicEnriquecido, mesReferencia)
}

// ---------------------------------------------------------------------------
// Fachada — mantida para compatibilidade com o E2E e com App.tsx (pré-T9)
// ---------------------------------------------------------------------------

/**
 * Fachada do pipeline completo: encadeia `produzirLancamentos` →
 * `gerarAPartirDosRevisados` → download, preservando a assinatura original.
 *
 * Representa o fluxo "sem revisão". A grid de revisão (T9) usará as duas
 * funções separadamente para interceptar os lançamentos antes da geração.
 *
 * `onAviso` é chamado para cada aviso acumulado (linhas ignoradas, dic inválido).
 * `onDownload` é chamado com o Blob e nome do arquivo gerado.
 *
 * @param csvConteudo  Conteúdo do arquivo CSV (já lido como string)
 * @param dicBytes     Bytes do .xlsx de dicionário, ou null se não fornecido
 * @param modeloBytes  Bytes do Modelo.xlsx (template base)
 * @param iniciais     Iniciais do usuário
 * @param onDownload   Callback chamado com (Blob, nomeArquivo)
 * @param onAviso      Callback chamado com mensagem de aviso
 */
export async function executarPipeline(
  csvConteudo: string,
  dicBytes: Uint8Array | null,
  modeloBytes: Uint8Array,
  iniciais: string,
  onDownload: (blob: Blob, nome: string) => void,
  onAviso: (msg: string) => void,
): Promise<void> {
  // A fachada preserva a assinatura por bytes: lê o dicionário aqui e repassa
  // as entradas já parseadas a `produzirLancamentos`.
  const dicLido: DicEntry[] =
    dicBytes !== null ? lerDicionario(dicBytes, (msg) => onAviso(`Dicionário: ${msg}`)) : []

  const { lancamentos, dicEntries, avisos } = produzirLancamentos(csvConteudo, dicLido, iniciais)

  for (const aviso of avisos) {
    onAviso(aviso)
  }

  // Fachada legada: mesReferencia não era parâmetro da assinatura original;
  // passa string vazia pois esta função é usada apenas em testes E2E e não
  // produz arquivo com B3 validado. O call-site real é App.tsx (T3).
  const xlsxBytes = gerarAPartirDosRevisados(modeloBytes, iniciais, lancamentos, dicEntries, '')

  // `.slice()` materializa um Uint8Array<ArrayBuffer> puro a partir do Uint8Array<ArrayBufferLike>
  // retornado pelo fflate — necessário porque BlobPart exige ArrayBufferView<ArrayBuffer> no
  // lib DOM do TS >= 5.7, e ArrayBufferLike (que inclui SharedArrayBuffer) não é atribuível.
  // O comportamento em runtime é idêntico: fflate nunca usa SharedArrayBuffer neste contexto.
  const blob = new Blob([xlsxBytes.slice()], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const nome = computarNomeArquivo(lancamentos, iniciais)
  onDownload(blob, nome)
}
