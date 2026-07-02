// ADR: see Docs/specs/mvp-vertical-nubank.adr.md

import type { Lancamento, DicEntry } from '../types'
import { detectar } from '../parsers/index'
import { enriquecerLancamento } from '../dominio/dicionario'
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
// Pipeline de execução (assíncrono — efeitos ficam aqui, não no redutor)
// ---------------------------------------------------------------------------

/**
 * Executa o pipeline completo: parse → enriquecimento → geração → download.
 *
 * Efeitos colaterais isolados aqui para manter `reduzir` puro.
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
  // 1. Parse CSV (modo best-effort — D6 do ADR)
  const parser = detectar(csvConteudo)
  const { lancamentos, linhasIgnoradas } = parser.parsear(csvConteudo)

  if (linhasIgnoradas > 0) {
    const plural = linhasIgnoradas > 1 ? 's' : ''
    onAviso(`${linhasIgnoradas} linha${plural} ignorada${plural} no CSV`)
  }

  // 2. Leitura do dicionário (opcional — D5 do ADR)
  let dicEntries: DicEntry[] = []
  if (dicBytes !== null) {
    dicEntries = lerDicionario(dicBytes, (msg) => onAviso(`Dicionário: ${msg}`))
  }

  // 3. Enriquecimento dos lançamentos via dicionário (D4 do ADR)
  const lancamentosEnriquecidos = lancamentos.map((l) =>
    enriquecerLancamento(l, dicEntries, iniciais),
  )

  // 4. Geração do .xlsx por injeção cirúrgica (D7 do ADR)
  const xlsxBytes = gerarXlsx(modeloBytes, iniciais, lancamentosEnriquecidos, dicEntries)

  // 5. Entrega do resultado via callback (sem persistência — zero-retenção)
  // `.slice()` materializa um Uint8Array<ArrayBuffer> puro a partir do Uint8Array<ArrayBufferLike>
  // retornado pelo fflate — necessário porque BlobPart exige ArrayBufferView<ArrayBuffer> no
  // lib DOM do TS >= 5.7, e ArrayBufferLike (que inclui SharedArrayBuffer) não é atribuível.
  // O comportamento em runtime é idêntico: fflate nunca usa SharedArrayBuffer neste contexto.
  const blob = new Blob([xlsxBytes.slice()], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const nome = computarNomeArquivo(lancamentosEnriquecidos, iniciais)
  onDownload(blob, nome)
}
