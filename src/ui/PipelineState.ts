// ADR: see Docs/specs/grid-revisao.adr.md

import type { Lancamento, DicEntry } from '../types'
import { detectar } from '../parsers/index'
import { enriquecerLancamento } from '../dominio/dicionario'
import { detectarInvestimento } from '../dominio/investimento'
import { detectarTransferenciaInterna } from '../dominio/transferencia'
import { aprenderDicionario } from '../dominio/aprendizado'
import { lerDicionario } from '../excel/reader/leitor'
import { gerarXlsx } from '../excel/writer/gerador'

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

/**
 * Estado do pipeline de importação.
 * Gerenciado pelo redutor puro `reduzir` — sem efeitos colaterais.
 */
export interface Estado {
  /** Iniciais do usuário (obrigatório para habilitar o botão Gerar) */
  iniciais: string
  /** Arquivo CSV do extrato selecionado pelo usuário */
  csvArquivo: File | null
  /** Arquivo .xlsx do mês anterior (opcional — dicionário) */
  dicArquivo: File | null
  /** true quando o arquivo CSV está selecionado e pronto para geração */
  csvPronto: boolean
  /** true quando o arquivo .xlsx de dicionário está selecionado */
  dicPronto: boolean
  /** Mensagens de aviso acumuladas (linhas ignoradas, dicionário inválido, etc.) */
  avisos: string[]
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

export type Acao =
  | { tipo: 'SET_INICIAIS'; valor: string }
  | { tipo: 'SET_CSV'; arquivo: File }
  | { tipo: 'SET_DIC'; arquivo: File }
  | { tipo: 'ADICIONAR_AVISO'; mensagem: string }
  | { tipo: 'LIMPAR_AVISOS' }

// ---------------------------------------------------------------------------
// Estado inicial
// ---------------------------------------------------------------------------

export const estadoInicial: Estado = {
  iniciais: '',
  csvArquivo: null,
  dicArquivo: null,
  csvPronto: false,
  dicPronto: false,
  avisos: [],
}

// ---------------------------------------------------------------------------
// Redutor puro
// ---------------------------------------------------------------------------

/**
 * Redutor puro do estado do pipeline.
 * Sem efeitos colaterais — dados persistência, I/O ou chamadas de rede
 * ficam no `executarPipeline` e no `App.tsx`.
 *
 * Regras de validação:
 * - SET_INICIAIS com string vazia é rejeitado (iniciais permanece inalterada).
 */
export function reduzir(estado: Estado, acao: Acao): Estado {
  switch (acao.tipo) {
    case 'SET_INICIAIS':
      // Validação: rejeita string vazia
      if (!acao.valor) return estado
      return { ...estado, iniciais: acao.valor }

    case 'SET_CSV':
      return { ...estado, csvArquivo: acao.arquivo, csvPronto: true }

    case 'SET_DIC':
      return { ...estado, dicArquivo: acao.arquivo, dicPronto: true }

    case 'ADICIONAR_AVISO':
      return { ...estado, avisos: [...estado.avisos, acao.mensagem] }

    case 'LIMPAR_AVISOS':
      return { ...estado, avisos: [] }

    default:
      return estado
  }
}

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
 * Resultado de `produzirLancamentos`: lançamentos enriquecidos com flags,
 * entradas do dicionário lido e avisos acumulados durante o processamento.
 */
export interface ResultadoProduzir {
  lancamentos: Lancamento[]
  dicEntries: DicEntry[]
  avisos: string[]
}

// ---------------------------------------------------------------------------
// Etapa 1 — Parse + enriquecimento + detecção de flags
// ---------------------------------------------------------------------------

/**
 * Faz parse do CSV, lê o dicionário (se fornecido), enriquece os lançamentos
 * e aplica as detecções de investimento/transferência com regra de precedência.
 *
 * Função pura de transformação — sem efeitos colaterais além do retorno.
 * Os avisos acumulados (linhas ignoradas, erros de dicionário) são retornados
 * no campo `avisos` para que o chamador decida como apresentá-los.
 *
 * @param csvConteudo  Conteúdo do arquivo CSV (já lido como string)
 * @param dicBytes     Bytes do .xlsx de dicionário, ou null se não fornecido
 * @param iniciais     Iniciais do usuário
 * @param nomeUsuario  Nome do usuário (opcional — habilita Pix nominal em `detectarTransferenciaInterna`)
 */
export function produzirLancamentos(
  csvConteudo: string,
  dicBytes: Uint8Array | null,
  iniciais: string,
  nomeUsuario?: string,
): ResultadoProduzir {
  const avisos: string[] = []

  // 1. Parse CSV (modo best-effort)
  const parser = detectar(csvConteudo)
  const { lancamentos, linhasIgnoradas } = parser.parsear(csvConteudo)

  if (linhasIgnoradas > 0) {
    const plural = linhasIgnoradas > 1 ? 's' : ''
    avisos.push(`${linhasIgnoradas} linha${plural} ignorada${plural} no CSV`)
  }

  // 2. Leitura do dicionário (opcional)
  let dicEntries: DicEntry[] = []
  if (dicBytes !== null) {
    dicEntries = lerDicionario(dicBytes, (msg) => avisos.push(`Dicionário: ${msg}`))
  }

  // 3. Enriquecimento via dicionário
  const lancamentosEnriquecidos = lancamentos.map((l) =>
    enriquecerLancamento(l, dicEntries, iniciais),
  )

  // 4. Detecção de flags com regra de precedência: investimento vence transferenciaInterna
  const lancamentosComFlags = lancamentosEnriquecidos.map((l) => {
    const investimento = detectarInvestimento(l)
    const transferenciaInterna =
      investimento !== null ? false : detectarTransferenciaInterna(l, nomeUsuario)
    return { ...l, investimento, transferenciaInterna }
  })

  return { lancamentos: lancamentosComFlags, dicEntries, avisos }
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
 * @returns Bytes do .xlsx gerado
 */
export function gerarAPartirDosRevisados(
  modeloBytes: Uint8Array,
  iniciais: string,
  lancamentosRevisados: Lancamento[],
  dicEntriesAnterior: DicEntry[],
): Uint8Array {
  const dicEnriquecido = aprenderDicionario(lancamentosRevisados, dicEntriesAnterior)
  return gerarXlsx(modeloBytes, iniciais, lancamentosRevisados, dicEnriquecido)
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
  const { lancamentos, dicEntries, avisos } = produzirLancamentos(csvConteudo, dicBytes, iniciais)

  for (const aviso of avisos) {
    onAviso(aviso)
  }

  const xlsxBytes = gerarAPartirDosRevisados(modeloBytes, iniciais, lancamentos, dicEntries)

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
