import type { Lancamento, ResultadoParse } from '../types'
import { parsearLinhaCsv } from './csv'

/**
 * Header exato do extrato do Banco do Brasil (CSV com campos entre aspas).
 * Discriminador do formato — as aspas e as colunas distinguem do Nubank/fatura.
 * O arquivo real vem em ISO-8859-1; a decodificação (`decodificar.ts`) já entrega
 * os acentos corretos antes de o parser rodar.
 */
const CABECALHO_ESPERADO = '"Data","Lançamento","Detalhes","N° documento","Valor","Tipo Lançamento"'

/**
 * Prefixo de data/hora que o BB antepõe ao contraparte no campo Detalhes
 * (ex.: `01/07 13:33 LOJA EXEMPLO`). É redundante com a coluna Data e varia a
 * cada transação — removê-lo mantém a transcrição estável para o dicionário.
 */
const PREFIXO_DATA_HORA = /^\d{2}\/\d{2}\s+\d{2}:\d{2}\s+/

/** Converte data DD/MM/YYYY para ISO YYYY-MM-DD. */
function parsearData(dataStr: string): string {
  const [dia, mes, ano] = dataStr.split('/')
  return `${ano}-${mes}-${dia}`
}

/**
 * Converte valor pt-BR (ex.: `-1.500,00`) para número.
 * O sinal literal do arquivo é preservado — Saída vem com minus, Entrada sem.
 */
function parsearValor(valorStr: string): number {
  return parseFloat(valorStr.replace(/\./g, '').replace(',', '.'))
}

/** Retorna true se a primeira linha não-vazia é o header do extrato BB. */
function aceita(conteudo: string): boolean {
  const primeiraLinha = conteudo.replace(/\r/g, '').split('\n')[0].trim()
  return primeiraLinha === CABECALHO_ESPERADO
}

/**
 * Parseia o conteúdo de um extrato do Banco do Brasil (CSV `,` quoted) em lançamentos.
 *
 * - Colunas: Data, Lançamento, Detalhes, N° documento, Valor, Tipo Lançamento.
 * - Só linhas de movimento (Tipo = "Entrada"/"Saída") viram lançamento; as linhas
 *   de saldo ("Saldo Anterior", "Saldo do dia" com data 00/00/0000, "S A L D O")
 *   têm Tipo vazio e são puladas — contadas em `linhasIgnoradas`, junto do header.
 * - Transcrição = `Lançamento - Detalhes` (com o prefixo de data/hora do Detalhes
 *   removido); só o Lançamento quando Detalhes vem vazio.
 * - O N° documento é ignorado; sem deduplicação.
 */
function parsear(conteudo: string): ResultadoParse {
  const lancamentos: Lancamento[] = []
  let linhasIgnoradas = 0

  const linhas = conteudo.replace(/\r/g, '').split('\n')

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i].trim()
    if (!linha) continue

    // Header (1ª linha não-vazia) não é dado.
    if (i === 0 || linha === CABECALHO_ESPERADO) {
      linhasIgnoradas++
      continue
    }

    const campos = parsearLinhaCsv(linha)
    if (campos.length < 6) {
      linhasIgnoradas++
      continue
    }

    const dataStr = campos[0].trim()
    const lancamento = campos[1].trim()
    const detalhes = campos[2].trim()
    const valorStr = campos[4].trim()
    const tipo = campos[5].trim()

    // Linhas de saldo não têm direção (Tipo vazio) — descartadas.
    if (!tipo) {
      linhasIgnoradas++
      continue
    }

    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dataStr)) {
      linhasIgnoradas++
      continue
    }

    const valor = parsearValor(valorStr)
    if (isNaN(valor)) {
      linhasIgnoradas++
      continue
    }

    const detalhesLimpo = detalhes.replace(PREFIXO_DATA_HORA, '').trim()

    lancamentos.push({
      fonte: 'extrato_bb',
      data: parsearData(dataStr),
      transcricao: detalhesLimpo ? `${lancamento} - ${detalhesLimpo}` : lancamento,
      valor,
      iniciais: '',
      natureza: '',
      descricao: '',
    })
  }

  return { lancamentos, linhasIgnoradas, excluidosPendentes: [] }
}

export const extratoBb = { aceita, parsear }
