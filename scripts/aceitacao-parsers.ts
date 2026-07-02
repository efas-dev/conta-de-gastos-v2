// Script fora do CI — consome dados reais de data_sample/ e grava output lá. Não versionar dados.
// ADR: see spec/parsers-fatura-nubank-extrato-itau.adr.md

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectar, ErroArquivoNaoReconhecido } from '../src/parsers/index.js'
import { gerarXlsx } from '../src/excel/writer/gerador.js'
import type { Lancamento } from '../src/types.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(__dirname, '..')
const DATA_SAMPLE = join(ROOT, 'data_sample')
const MODELO = join(ROOT, 'Modelo.xlsx')
const OUTPUT = join(DATA_SAMPLE, 'aceitacao-output.xlsx')

const EXTENSOES_BANCARIAS = new Set(['.csv', '.txt'])
const ARQUIVOS_IGNORADOS = new Set(['aceitacao-output.xlsx'])

function listarArquivosBancarios(): string[] {
  return readdirSync(DATA_SAMPLE)
    .filter(nome => {
      if (ARQUIVOS_IGNORADOS.has(nome)) return false
      return EXTENSOES_BANCARIAS.has(extname(nome).toLowerCase())
    })
    .map(nome => join(DATA_SAMPLE, nome))
}

function processarArquivo(caminho: string): Lancamento[] {
  const conteudo = readFileSync(caminho, 'utf-8')
  const nome = basename(caminho)
  try {
    const parser = detectar(conteudo)
    const resultado = parser.parsear(conteudo)
    console.log(
      `[ok] ${nome}: ${resultado.lancamentos.length} lançamentos, ${resultado.linhasIgnoradas} linha(s) ignorada(s)`,
    )
    return resultado.lancamentos
  } catch (e) {
    if (e instanceof ErroArquivoNaoReconhecido) {
      console.warn(`[ignorado] ${nome}: formato não reconhecido pelo pipeline`)
      return []
    }
    throw e
  }
}

const arquivos = listarArquivosBancarios()
console.log(`Arquivos bancários encontrados em data_sample/: ${arquivos.length}`)

const todos: Lancamento[] = []
for (const caminho of arquivos) {
  todos.push(...processarArquivo(caminho))
}

console.log(`Total de lançamentos acumulados: ${todos.length}`)

const modelo = readFileSync(MODELO)
const xlsx = gerarXlsx(modelo, '', todos, [])
writeFileSync(OUTPUT, xlsx)

const tamanho = xlsx.length
console.log(`Output gravado: ${OUTPUT} (${tamanho} bytes)`)

if (tamanho === 0) {
  console.error('ERRO: arquivo gerado com tamanho zero.')
  process.exit(1)
}
