// Script fora do CI — consome dados reais de data_sample/, apenas lê e imprime, não grava nem versiona dados.
// ADR: see Docs/specs/dominio-transferencia-investimento-iniciais.adr.md

import { readFileSync, readdirSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectar, ErroArquivoNaoReconhecido } from '../src/parsers/index.js'
import { detectarInvestimento } from '../src/dominio/investimento.js'
import { detectarTransferenciaInterna } from '../src/dominio/transferencia.js'
import type { Lancamento } from '../src/types.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(__dirname, '..')
const DATA_SAMPLE = join(ROOT, 'data_sample')

const EXTENSOES_BANCARIAS = new Set(['.csv', '.txt'])
const ARQUIVOS_IGNORADOS = new Set(['aceitacao-output.xlsx', 'Modelo_preenchido.xlsx'])

function listarArquivosBancarios(): string[] {
  return readdirSync(DATA_SAMPLE)
    .filter(nome => {
      const ext = extname(nome).toLowerCase()
      if (!EXTENSOES_BANCARIAS.has(ext)) return false
      if (ARQUIVOS_IGNORADOS.has(nome)) return false
      return true
    })
    .map(nome => join(DATA_SAMPLE, nome))
}

function truncar(texto: string, max: number): string {
  if (texto.length <= max) return texto.padEnd(max)
  return texto.slice(0, max - 1) + '…'
}

function formatarValor(valor: number): string {
  return valor.toFixed(2).padStart(10)
}

function rotularInvestimento(inv: 'aplicacao' | 'resgate' | null | undefined): string {
  if (inv === 'aplicacao') return 'aplicacao'
  if (inv === 'resgate') return 'resgate '
  return '—       '
}

function rotularTransferencia(tf: boolean | undefined): string {
  return tf ? 'sim' : '—  '
}

interface Resumo {
  total: number
  aplicacoes: number
  resgates: number
  transferencias: number
  comuns: number
}

function processarArquivo(caminho: string): { lancamentos: Lancamento[]; resumo: Resumo } {
  const nome = basename(caminho)
  const conteudo = readFileSync(caminho, 'utf-8')

  let lancamentos: Lancamento[] = []
  try {
    const parser = detectar(conteudo)
    const resultado = parser.parsear(conteudo)
    lancamentos = resultado.lancamentos
    console.log(`\n[ok] ${nome} — ${lancamentos.length} lançamento(s), ${resultado.linhasIgnoradas} linha(s) ignorada(s)`)
  } catch (e) {
    if (e instanceof ErroArquivoNaoReconhecido) {
      console.warn(`[ignorado] ${nome}: formato não reconhecido`)
      return { lancamentos: [], resumo: { total: 0, aplicacoes: 0, resgates: 0, transferencias: 0, comuns: 0 } }
    }
    throw e
  }

  // Aplicar detecções com precedência: investimento tem prioridade sobre transferência
  const enriquecidos = lancamentos.map(l => {
    const inv = detectarInvestimento(l)
    const tf = inv !== null ? false : detectarTransferenciaInterna(l)
    return { ...l, investimento: inv, transferenciaInterna: tf }
  })

  // Cabeçalho da tabela
  const SEP = '─'.repeat(100)
  console.log(SEP)
  console.log(
    'Data'.padEnd(12) +
    'Transcrição'.padEnd(42) +
    'Valor'.padStart(10) +
    '  ' +
    'Investimento'.padEnd(10) +
    'Transf.Int.',
  )
  console.log(SEP)

  const resumo: Resumo = { total: 0, aplicacoes: 0, resgates: 0, transferencias: 0, comuns: 0 }

  for (const l of enriquecidos) {
    const inv = l.investimento as 'aplicacao' | 'resgate' | null
    const tf = l.transferenciaInterna as boolean

    console.log(
      l.data.padEnd(12) +
      truncar(l.transcricao, 42) +
      formatarValor(l.valor) +
      '  ' +
      rotularInvestimento(inv).padEnd(10) +
      rotularTransferencia(tf),
    )

    resumo.total++
    if (inv === 'aplicacao') resumo.aplicacoes++
    else if (inv === 'resgate') resumo.resgates++
    else if (tf) resumo.transferencias++
    else resumo.comuns++
  }

  console.log(SEP)
  console.log(
    `Resumo ${nome}: ` +
    `total=${resumo.total}  ` +
    `aplicacoes=${resumo.aplicacoes}  ` +
    `resgates=${resumo.resgates}  ` +
    `transf.internas=${resumo.transferencias}  ` +
    `comuns=${resumo.comuns}`,
  )

  return { lancamentos: enriquecidos, resumo }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const arquivos = listarArquivosBancarios()
console.log(`=== Aceitação de Detecções — data_sample/ ===`)
console.log(`Arquivos bancários encontrados: ${arquivos.length}`)

let totalGeral = 0
let aplicacoesGeral = 0
let resgatesGeral = 0
let transferenciasGeral = 0
let comunsGeral = 0

for (const caminho of arquivos) {
  const { resumo } = processarArquivo(caminho)
  totalGeral += resumo.total
  aplicacoesGeral += resumo.aplicacoes
  resgatesGeral += resumo.resgates
  transferenciasGeral += resumo.transferencias
  comunsGeral += resumo.comuns
}

console.log('\n' + '═'.repeat(100))
console.log(
  `TOTAL GERAL: ${totalGeral} lançamentos  |  ` +
  `aplicacoes=${aplicacoesGeral}  ` +
  `resgates=${resgatesGeral}  ` +
  `transf.internas=${transferenciasGeral}  ` +
  `comuns=${comunsGeral}`,
)
console.log('═'.repeat(100))
