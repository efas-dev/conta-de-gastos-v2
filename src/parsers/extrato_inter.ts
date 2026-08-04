import type { Lancamento, ResultadoParse } from '../types'
import { atribuirIds } from './idSerial'

/**
 * Header da tabela de dados do extrato Inter — discriminador do formato.
 * Vem após um preâmbulo de 4 linhas (título, conta, período, saldo).
 */
const HEADER = /^Data Lançamento;Histórico;Descrição;Valor;Saldo\s*$/

/**
 * Regex estrutural de uma linha de dados:
 * dd/mm/yyyy;histórico;descrição;valor-br;saldo-br (5 campos, separador `;`).
 * A última coluna (saldo corrente) é capturada apenas para ancorar o fim da
 * linha — o valor do lançamento é sempre a 4ª coluna.
 */
const LINHA_ESTRUTURAL = /^(\d{2}\/\d{2}\/\d{4});([^;]*);([^;]*);(-?[\d.]+,\d{2});(-?[\d.]+,\d{2})\s*$/

/**
 * Retorna true se o conteúdo contém o header do extrato Inter nas primeiras
 * 10 linhas não-vazias (o preâmbulo ocupa as 4 primeiras).
 */
function aceita(conteudo: string): boolean {
  const linhas = conteudo.replace(/\r/g, '').split('\n')
  let examinadas = 0
  for (const linha of linhas) {
    const l = linha.trim()
    if (!l) continue
    examinadas++
    if (HEADER.test(l)) return true
    if (examinadas >= 10) break
  }
  return false
}

/** Converte data dd/mm/yyyy para ISO YYYY-MM-DD. */
function parsearData(dataStr: string): string {
  const [dia, mes, ano] = dataStr.split('/')
  return `${ano}-${mes}-${dia}`
}

/**
 * Converte valor BR (ex.: `-1.400,00`) para número.
 * Sinal literal do arquivo é preservado — débito com minus, crédito sem sinal.
 */
function parsearValor(valorStr: string): number {
  return parseFloat(valorStr.replace(/\./g, '').replace(',', '.'))
}

/**
 * Parseia o conteúdo de um extrato do Banco Inter (CSV `;`) em lançamentos.
 *
 * - Remove CRLF antes de processar.
 * - Transcrição = `histórico - descrição` (com trim; só o histórico quando a
 *   descrição vem vazia) — mesmo formato "verbo - contraparte" do Nubank.
 * - O saldo corrente (5ª coluna) é ignorado.
 * - Sem deduplicação; linhas não estruturais (preâmbulo, header) são puladas
 *   e contadas em linhasIgnoradas.
 */
function parsear(conteudo: string): ResultadoParse {
  const lancamentos: Omit<Lancamento, 'id'>[] = []
  let linhasIgnoradas = 0

  const linhas = conteudo.replace(/\r/g, '').split('\n')

  for (const linha of linhas) {
    const l = linha.trim()
    if (!l) continue

    const match = LINHA_ESTRUTURAL.exec(l)
    if (!match) {
      linhasIgnoradas++
      continue
    }

    const historico = match[2].trim()
    const descricao = match[3].trim()
    const valor = parsearValor(match[4])
    if (isNaN(valor)) {
      linhasIgnoradas++
      continue
    }

    lancamentos.push({
      fonte: 'extrato_inter',
      data: parsearData(match[1]),
      transcricao: descricao ? `${historico} - ${descricao}` : historico,
      valor,
      iniciais: '',
      natureza: '',
      descricao: '',
    })
  }

  return { lancamentos: atribuirIds(lancamentos), linhasIgnoradas, excluidosPendentes: [] }
}

export const extratoInter = { aceita, parsear }
