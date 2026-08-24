// ADR: see spec/fatura-itau-xlsx.adr.md

import type { Lancamento, ResultadoParse } from '../types'
import { lerCelulas } from '../excel/celulas/leitorCelulas'
import { atribuirIds } from './idSerial'

/**
 * Retorna `true` quando `bytes` contém uma tabela de fatura de cartão Itaú:
 * uma linha com as células "Data", "Lançamento" e "Valor" (Decisão 7 do ADR
 * desta spec) — sem depender do nome da aba nem da posição da linha na
 * planilha, já que o layout observado varia mês a mês.
 *
 * Cobre tanto fatura paga quanto em aberto (Decisão 8): a tabela em si não
 * distingue os dois casos, então nenhum marcador de "fatura paga" é exigido.
 *
 * Best-effort: `lerCelulas` nunca lança exceção (bytes vazios, ZIP inválido —
 * ex.: um `.csv`/`.txt` solto no app — ou XML malformado viram matriz `[]`),
 * então `aceita` também nunca lança.
 *
 * @param bytes  Conteúdo binário do arquivo oferecido ao registry binário.
 */
export function aceita(bytes: Uint8Array): boolean {
  const matriz = lerCelulas(bytes)
  return matriz.some((linha) => {
    const celulas = linha.map((celula) => celula.trim())
    return celulas.includes('Data') && celulas.includes('Lançamento') && celulas.includes('Valor')
  })
}

/** Dias entre a data-base do Excel (1899-12-30) e a época Unix (1970-01-01). */
const DIAS_EPOCH_EXCEL_PARA_UNIX = 25569

/**
 * Converte um serial de data do Excel (base 1899-12-30) para uma data ISO 8601
 * (`YYYY-MM-DD`), o formato usado por `Lancamento.data` (`src/types.ts`).
 */
function serialExcelParaIso(serial: number): string {
  const milissegundosUnix = (serial - DIAS_EPOCH_EXCEL_PARA_UNIX) * 86400 * 1000
  return new Date(milissegundosUnix).toISOString().slice(0, 10)
}

/**
 * Localiza a linha de cabeçalho da tabela (mesmo critério de `aceita`) e devolve
 * o índice de cada coluna relevante pelo nome, em vez de posição fixa (Decisão 7
 * do ADR desta spec) — Titularidade/Nome/Tipo do cartão/Número do cartão nunca
 * são procuradas aqui, então seus valores nunca chegam ao `Lancamento` (non-goal
 * F2/Decisão 2 do ADR).
 */
function localizarCabecalho(matriz: string[][]): {
  indiceLinha: number
  colData: number
  colLancamento: number
  colParcelamento: number
  colValor: number
} | null {
  const indiceLinha = matriz.findIndex((linha) => {
    const celulas = linha.map((celula) => celula.trim())
    return celulas.includes('Data') && celulas.includes('Lançamento') && celulas.includes('Valor')
  })
  if (indiceLinha === -1) return null

  const cabecalho = matriz[indiceLinha].map((celula) => celula.trim())
  return {
    indiceLinha,
    colData: cabecalho.indexOf('Data'),
    colLancamento: cabecalho.indexOf('Lançamento'),
    colParcelamento: cabecalho.indexOf('Parcelamento'),
    colValor: cabecalho.indexOf('Valor'),
  }
}

/**
 * Parseia a tabela de lançamentos de uma fatura de cartão Itaú (.xlsx) em
 * `Lancamento`s (ver Decisões 1, 2 e 7 do ADR desta spec).
 *
 * Cada linha de dado após o cabeçalho vira um lançamento com `fonte
 * ='fatura_itau_cc'`, valor com sinal invertido em relação ao arquivo (compra
 * positiva → negativa no app; estorno negativo → positivo), data convertida do
 * serial Excel, `descricao` = texto de Parcelamento (vazio quando ausente) e
 * `transcricao` = texto de Lançamento, sem mistura com Parcelamento — a
 * transcrição limpa preserva a chave do dicionário (Decisão 2).
 *
 * A leitura para assim que a coluna Data de uma linha vem vazia — é como a
 * linha de "Subtotal" (e qualquer linha em branco antes dela) se manifesta na
 * matriz esparsa devolvida por `lerCelulas` (linhas sem nenhuma célula não
 * aparecem na matriz).
 *
 * Nesta task (T4), a data é sempre a conversão direta do serial da coluna Data
 * — a regra condicional de parcela antiga usar o vencimento da fatura (Decisão
 * 1) é da Task T5. A linha "Pagamento Debito Automatico" é tratada como
 * lançamento comum, sem `origemEspecial` — a marcação é da Task T6.
 */
export function parsear(bytes: Uint8Array): ResultadoParse {
  const matriz = lerCelulas(bytes)
  const cabecalho = localizarCabecalho(matriz)
  if (!cabecalho) {
    return { lancamentos: [], linhasIgnoradas: 0, excluidosPendentes: [] }
  }

  const { indiceLinha, colData, colLancamento, colParcelamento, colValor } = cabecalho
  const lancamentos: Omit<Lancamento, 'id'>[] = []

  for (let i = indiceLinha + 1; i < matriz.length; i++) {
    const linha = matriz[i]
    const dataTexto = (linha[colData] ?? '').trim()
    if (dataTexto === '') break

    const dataSerial = Number(dataTexto)
    if (!Number.isFinite(dataSerial)) break

    const transcricao = (linha[colLancamento] ?? '').trim()
    const parcelamento = colParcelamento >= 0 ? (linha[colParcelamento] ?? '').trim() : ''
    const valorArquivo = Number((linha[colValor] ?? '').trim())

    lancamentos.push({
      fonte: 'fatura_itau_cc',
      data: serialExcelParaIso(dataSerial),
      transcricao,
      valor: -valorArquivo,
      iniciais: '',
      natureza: '',
      descricao: parcelamento,
    })
  }

  return { lancamentos: atribuirIds(lancamentos), linhasIgnoradas: 0, excluidosPendentes: [] }
}
