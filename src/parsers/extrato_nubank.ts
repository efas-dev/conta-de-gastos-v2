// ADR: see Docs/specs/mvp-vertical-nubank.adr.md

import type { Lancamento } from '../types'

const CABECALHO_ESPERADO = 'Data,Valor,Identificador,Descrição'

/**
 * Lançado quando o conteúdo do arquivo não é reconhecido como um formato suportado.
 * Aplicável a arquivo inteiro com cabeçalho errado — distinto do modo best-effort
 * de linhas inválidas (D6 do ADR).
 */
export class ErroArquivoNaoReconhecido extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroArquivoNaoReconhecido'
  }
}

/** Resultado do parse: lançamentos válidos + contagem de linhas puladas (D6 do ADR). */
export interface ResultadoParse {
  lancamentos: Lancamento[]
  linhasIgnoradas: number
}

/**
 * Parseia uma linha CSV com suporte a campos quoted (RFC 4180 simples).
 * Necessário para suportar valores com vírgula decimal (ex: "-150,50").
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
 * Converte data de DD/MM/YYYY para ISO 8601 YYYY-MM-DD.
 */
function parsearData(dataStr: string): string {
  const [dia, mes, ano] = dataStr.split('/')
  return `${ano}-${mes}-${dia}`
}

/**
 * Converte string de valor para número, suportando ponto e vírgula decimal.
 */
function parsearValor(valorStr: string): number {
  return parseFloat(valorStr.replace(',', '.'))
}

/**
 * Retorna true se o conteúdo começa com o cabeçalho exato do extrato Nubank.
 */
function aceita(conteudo: string): boolean {
  const primeiraLinha = conteudo.split('\n')[0].trim()
  return primeiraLinha === CABECALHO_ESPERADO
}

/**
 * Parseia o conteúdo de um extrato Nubank CSV em lançamentos.
 *
 * Modo best-effort (D6 do ADR): linhas inválidas são puladas e contadas.
 * Arquivo com cabeçalho errado lança ErroArquivoNaoReconhecido.
 * Deduplicação por Identificador: primeiro registro vence (D3 do ADR).
 */
function parsear(conteudo: string): ResultadoParse {
  if (!aceita(conteudo)) {
    throw new ErroArquivoNaoReconhecido(
      `Cabeçalho não reconhecido. Esperado: "${CABECALHO_ESPERADO}"`,
    )
  }

  const linhas = conteudo.split('\n')
  const identificadoresVistos = new Set<string>()
  const lancamentos: Lancamento[] = []
  let linhasIgnoradas = 0

  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i].trim()
    if (!linha) continue

    const campos = parsearLinhaCSV(linha)
    if (campos.length < 4) {
      linhasIgnoradas++
      continue
    }

    const dataStr = campos[0].trim()
    const valorStr = campos[1].trim()
    const identificador = campos[2].trim()
    // Descrição pode conter vírgulas — reunir tudo após o 3º campo
    const transcricao = campos.slice(3).join(',').trim()

    // Validar data (DD/MM/YYYY)
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dataStr)) {
      linhasIgnoradas++
      continue
    }

    // Validar valor numérico
    const valor = parsearValor(valorStr)
    if (isNaN(valor)) {
      linhasIgnoradas++
      continue
    }

    // Validar identificador não-vazio
    if (!identificador) {
      linhasIgnoradas++
      continue
    }

    // Deduplicação por Identificador — primeiro vence, duplicata não conta como ignorada
    if (identificadoresVistos.has(identificador)) {
      continue
    }
    identificadoresVistos.add(identificador)

    lancamentos.push({
      fonte: 'extrato_nubank',
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

export const extratoNubank = { aceita, parsear }
