// ADR: see spec/fatura-itau-xlsx.adr.md

import type { Lancamento, ResultadoParse } from '../types'
import { lerCelulas } from '../excel/celulas/leitorCelulas'
import { atribuirIds } from './idSerial'
import { normalizarParaBusca } from '../dominio/normalizacao'

/**
 * Título da linha de quitação da fatura anterior, normalizado (NFD sem acentos,
 * minúsculas) para comparação tolerante a variações de acentuação/caixa entre
 * exportações do banco — mesmo padrão de `fatura_nubank.ts` (`TITULO_PAGAMENTO_RECEBIDO`).
 */
const TITULO_PAGAMENTO_RECEBIDO = normalizarParaBusca('Pagamento Debito Automatico')

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
 * Localiza o vencimento da fatura no bloco de metadados no topo da planilha,
 * pelo rótulo "Vencimento" (mesmo espírito de `localizarCabecalho`/Decisão 7
 * do ADR: nunca por posição fixa). Na amostra real o rótulo mora numa linha e
 * o serial Excel do vencimento mora na célula imediatamente abaixo, na mesma
 * coluna — é essa adjacência que a busca segue.
 *
 * Retorna `null` quando o rótulo não existe (arquivo sem vencimento
 * informado): a Decisão 1 do ADR cai então para o mês de referência escolhido
 * na tela, via `mesReferencia`.
 */
function localizarVencimento(matriz: string[][]): number | null {
  for (let i = 0; i < matriz.length; i++) {
    const colRotulo = matriz[i].findIndex((celula) => celula.trim() === 'Vencimento')
    if (colRotulo === -1) continue
    const valor = Number((matriz[i + 1]?.[colRotulo] ?? '').trim())
    return Number.isFinite(valor) && valor > 0 ? valor : null
  }
  return null
}

/** Mês (`YYYY-MM`) de uma data ISO 8601 (`YYYY-MM-DD`). */
function mesIso(dataIso: string): string {
  return dataIso.slice(0, 7)
}

/**
 * Parseia a tabela de lançamentos de uma fatura de cartão Itaú (.xlsx) em
 * `Lancamento`s (ver Decisões 1, 2 e 7 do ADR desta spec).
 *
 * Cada linha de dado após o cabeçalho vira um lançamento com `fonte
 * ='fatura_itau_cc'`, valor com sinal invertido em relação ao arquivo (compra
 * positiva → negativa no app; estorno negativo → positivo), `descricao` =
 * texto de Parcelamento (vazio quando ausente) e `transcricao` = texto de
 * Lançamento, sem mistura com Parcelamento — a transcrição limpa preserva a
 * chave do dicionário (Decisão 2).
 *
 * A leitura para assim que a coluna Data de uma linha vem vazia — é como a
 * linha de "Subtotal" (e qualquer linha em branco antes dela) se manifesta na
 * matriz esparsa devolvida por `lerCelulas` (linhas sem nenhuma célula não
 * aparecem na matriz).
 *
 * Regra de data (Decisão 1 do ADR, Task T5): quando o mês da data de compra
 * coincide com o mês da fatura, a data do lançamento é a própria data de
 * compra. Quando a compra é de um mês anterior ("parcela antiga"), a data do
 * lançamento vira a data de vencimento da fatura (`localizarVencimento`);
 * quando o arquivo não informa vencimento, vira o mês de referência escolhido
 * na tela (`mesReferencia`, formato `YYYY-MM`, dia fixo em `01` por ser o
 * único componente conhecido). O "mês da fatura" para efeito de comparação
 * sai do próprio arquivo (o vencimento é a fonte natural); só na ausência de
 * vencimento é que `mesReferencia` também assume esse papel de comparação.
 * Sem vencimento e sem `mesReferencia`, não há como determinar o mês da
 * fatura — mantém-se a data de compra (comportamento best-effort herdado da
 * Task T4).
 *
 * `mesReferencia` é opcional porque o parser não conhece o mês escolhido na
 * tela — é a UI (Task T9, wiring pendente) quem efetivamente passa esse
 * argumento; um parâmetro opcional extra não quebra o contrato `ParserBinario`
 * (`src/parsers/binario.ts`), que declara menos parâmetros.
 *
 * A linha "Pagamento Debito Automatico" (quitação da fatura anterior) recebe
 * `origemEspecial='pagamento-recebido'` (Decisão 5 do ADR, Task T6) — mesmo
 * mecanismo que `fatura_nubank.ts` já usa, gerando a proposta de remoção já
 * existente em `src/dominio/deteccoes.ts` sem duplicar a linha no mês corrente.
 * A comparação é normalizada (`normalizarParaBusca`) para tolerar variação de
 * acentuação/caixa entre exportações do banco.
 */
export function parsear(bytes: Uint8Array, mesReferencia?: string): ResultadoParse {
  const matriz = lerCelulas(bytes)
  const cabecalho = localizarCabecalho(matriz)
  if (!cabecalho) {
    return { lancamentos: [], linhasIgnoradas: 0, excluidosPendentes: [] }
  }

  const vencimentoSerial = localizarVencimento(matriz)
  const dataVencimentoIso = vencimentoSerial !== null ? serialExcelParaIso(vencimentoSerial) : null
  const mesFatura = dataVencimentoIso !== null ? mesIso(dataVencimentoIso) : (mesReferencia ?? null)

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

    const dataCompraIso = serialExcelParaIso(dataSerial)
    const data =
      mesFatura !== null && mesIso(dataCompraIso) !== mesFatura
        ? (dataVencimentoIso ?? (mesReferencia ? `${mesReferencia}-01` : dataCompraIso))
        : dataCompraIso

    const origemEspecial: Lancamento['origemEspecial'] =
      normalizarParaBusca(transcricao) === TITULO_PAGAMENTO_RECEBIDO ? 'pagamento-recebido' : undefined

    lancamentos.push({
      fonte: 'fatura_itau_cc',
      data,
      transcricao,
      valor: -valorArquivo,
      iniciais: '',
      natureza: '',
      descricao: parcelamento,
      ...(origemEspecial ? { origemEspecial } : {}),
    })
  }

  return { lancamentos: atribuirIds(lancamentos), linhasIgnoradas: 0, excluidosPendentes: [] }
}
