// ADR: see Docs/specs/parsers-fatura-nubank-extrato-itau.adr.md

import type { Lancamento } from '../types'
import type { ResultadoParse } from './extrato_nubank'

/** Regex estrutural: dd/mm/yyyy;qualquer-descrição;-?valor-br */
const LINHA_ESTRUTURAL = /^(\d{2}\/\d{2}\/\d{4});(.+);(-?[\d.]+,\d{2})\s*$/

/**
 * Retorna true se pelo menos uma linha do conteúdo corresponde ao padrão estrutural
 * do extrato Itaú TXT (dd/mm/yyyy;descrição;valor).
 *
 * Detecção por amostragem: examina até 5 linhas não-vazias e exige pelo menos 1 match.
 */
function aceita(conteudo: string): boolean {
  const linhas = conteudo.replace(/\r/g, '').split('\n')
  let examinadas = 0
  for (const linha of linhas) {
    const l = linha.trim()
    if (!l) continue
    examinadas++
    if (LINHA_ESTRUTURAL.test(l)) return true
    if (examinadas >= 5) break
  }
  return false
}

/**
 * Converte data dd/mm/yyyy para ISO YYYY-MM-DD.
 */
function parsearData(dataStr: string): string {
  const [dia, mes, ano] = dataStr.split('/')
  return `${ano}-${mes}-${dia}`
}

/**
 * Converte valor BR (ex: `-350,00`, `350,00`) para número.
 * Sinal literal do arquivo é preservado — débito vem com minus, crédito sem sinal.
 */
function parsearValor(valorStr: string): number {
  return parseFloat(valorStr.replace('.', '').replace(',', '.'))
}

/**
 * Parseia o conteúdo de um extrato Itaú TXT em lançamentos.
 *
 * - Remove CRLF antes de processar.
 * - Confia no sinal literal: minus inline = débito, sem sinal = crédito.
 * - Sem deduplicação: duas linhas idênticas produzem dois lançamentos.
 * - Linhas não estruturais são puladas e contadas em linhasIgnoradas.
 */
function parsear(conteudo: string): ResultadoParse {
  const lancamentos: Lancamento[] = []
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

    const dataStr = match[1]
    const transcricao = match[2].trim()
    const valorStr = match[3]

    const valor = parsearValor(valorStr)
    if (isNaN(valor)) {
      linhasIgnoradas++
      continue
    }

    lancamentos.push({
      fonte: 'extrato_itau',
      data: parsearData(dataStr),
      transcricao,
      valor,
      iniciais: '',
      natureza: '',
      descricao: '',
    })
  }

  return { lancamentos, linhasIgnoradas }
}

export const extratoItau = { aceita, parsear }
