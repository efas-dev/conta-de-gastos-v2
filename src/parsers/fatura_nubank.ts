// ADR: see Docs/specs/parsers-fatura-nubank-extrato-itau.adr.md
// ADR: see Docs/specs/inspecao-proposta-conciliacao.adr.md

import type { Lancamento, ResultadoParse } from '../types'
import { normalizarParaBusca } from '../dominio/normalizacao'
import { atribuirIds } from './idSerial'

const CABECALHO_ESPERADO = 'date,title,amount'

const TITULO_PAGAMENTO_RECEBIDO = normalizarParaBusca('Pagamento recebido')
const TITULO_VALOR_PENDENTE = normalizarParaBusca('Valor pendente do mês anterior')

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
 * - "Pagamento recebido" e "Valor pendente do mês anterior" (matching NFD+lowercase,
 *   precedente: leitor do dicionário) entram em `lancamentos` como lançamentos normais,
 *   marcados com `origemEspecial` ('pagamento-recebido'/'valor-pendente' — ver ADR
 *   `inspecao-proposta-conciliacao`, Decisões 16/17); `excluidosPendentes` fica vazio para
 *   este parser (nenhum descarte silencioso, nenhuma exclusão do parse)
 * - "Multa por fatura atrasada" e "IOF por fatura atrasada" permanecem em `lancamentos`
 * - Inverter sinal: cobrança positiva no arquivo → valor negativo; estorno negativo → positivo
 * - Linhas malformadas (< 3 colunas) são puladas e contadas em linhasIgnoradas
 * - fonte: 'fatura_nubank_cc'
 */
function parsear(conteudo: string): ResultadoParse {
  const linhas = conteudo.split('\n')
  const lancamentos: Omit<Lancamento, 'id'>[] = []
  const excluidosPendentes: Lancamento[] = []
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

    const valor = parsearValorFatura(valorStr)
    if (isNaN(valor)) {
      linhasIgnoradas++
      continue
    }

    const tituloNormalizado = normalizarParaBusca(titulo)
    let origemEspecial: Lancamento['origemEspecial']
    if (tituloNormalizado === TITULO_PAGAMENTO_RECEBIDO) {
      origemEspecial = 'pagamento-recebido'
    } else if (tituloNormalizado === TITULO_VALOR_PENDENTE) {
      origemEspecial = 'valor-pendente'
    }

    const lancamento: Omit<Lancamento, 'id'> = {
      fonte: 'fatura_nubank_cc',
      data: dataStr,
      transcricao: titulo,
      valor: -valor,
      iniciais: '',
      natureza: '',
      descricao: '',
      ...(origemEspecial ? { origemEspecial } : {}),
    }

    lancamentos.push(lancamento)
  }

  return { lancamentos: atribuirIds(lancamentos), linhasIgnoradas, excluidosPendentes }
}

export const faturaNumbank = { aceita, parsear }
