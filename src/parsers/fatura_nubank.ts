// ADR: see Docs/specs/parsers-fatura-nubank-extrato-itau.adr.md

import type { Lancamento } from '../types'
import type { ResultadoParse } from './extrato_nubank'

const CABECALHO_ESPERADO = 'date,title,amount'

/**
 * Retorna true se o conteúdo começa com o cabeçalho da fatura Nubank CC.
 */
function aceita(conteudo: string): boolean {
  const primeiraLinha = conteudo.split('\n')[0].trim()
  return primeiraLinha === CABECALHO_ESPERADO
}

/**
 * Parseia uma linha CSV com suporte a campos quoted (RFC 4180 simples).
 * Necessário para suportar valores com vírgula decimal (ex: "1.234,56").
 */
function parsearLinhaCSV(linha: string): string[] {
  const campos: string[] = []
  let campo = ''
  let dentroAspas = false

  for (let i = 0; i < linha.length; i++) {
    const char = linha[i]
    if (char === '"') {
      dentroAspas = !dentroAspas
    } else if (char === ',' && !dentroAspas) {
      campos.push(campo)
      campo = ''
    } else {
      campo += char
    }
  }
  campos.push(campo)
  return campos
}

/**
 * Converte string de valor da fatura Nubank para número.
 *
 * Suporta:
 * - Ponto decimal: "10.00" → 10.0
 * - Vírgula decimal BR com ponto de milhar: "1.234,56" → 1234.56
 * - Minus-com-espaço: "- 18,44" → -18.44
 * - Valores negativos simples: "-50.00" → -50.0
 */
function parsearValorFatura(valorStr: string): number {
  const limpo = valorStr.trim()
  const negativo = limpo.startsWith('-')
  // Remove sinal e espaços iniciais
  let abs = limpo.replace(/^-\s*/, '').trim()
  // Formato BR: vírgula como decimal, ponto como milhar
  if (abs.includes(',')) {
    abs = abs.replace(/\./g, '').replace(',', '.')
  }
  const num = parseFloat(abs)
  return negativo ? -num : num
}

/**
 * Parseia o conteúdo de uma fatura Nubank CSV em lançamentos.
 *
 * Regras:
 * - Pular header (primeira linha)
 * - Ignorar linhas com título "pagamento recebido" (case-insensitive)
 * - Inverter sinal: cobrança positiva no arquivo → valor negativo; estorno negativo → positivo
 * - Linhas malformadas (< 3 colunas) são puladas e contadas em linhasIgnoradas
 * - fonte: 'fatura_nubank_cc'
 */
function parsear(conteudo: string): ResultadoParse {
  const linhas = conteudo.split('\n')
  const lancamentos: Lancamento[] = []
  let linhasIgnoradas = 0

  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i].trim()
    if (!linha) continue

    const campos = parsearLinhaCSV(linha)
    if (campos.length < 3) {
      linhasIgnoradas++
      continue
    }

    const dataStr = campos[0].trim()
    const titulo = campos[1].trim()
    const valorStr = campos[2].trim()

    // Ignorar pagamento recebido (case-insensitive)
    if (titulo.toLowerCase() === 'pagamento recebido') {
      continue
    }

    const valor = parsearValorFatura(valorStr)
    if (isNaN(valor)) {
      linhasIgnoradas++
      continue
    }

    lancamentos.push({
      fonte: 'fatura_nubank_cc',
      data: dataStr,
      transcricao: titulo,
      valor: -valor,
      iniciais: '',
      natureza: '',
      descricao: '',
    })
  }

  return { lancamentos, linhasIgnoradas }
}

export const faturaNumbank = { aceita, parsear }
