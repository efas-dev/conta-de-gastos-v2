// ADR: see Docs/decisions/spike-geracao-xlsx.adr.md
import ExcelJS from 'exceljs'
import * as fs from 'fs'
import * as path from 'path'

export interface ExtratoRow {
  Fonte: string
  Data: string
  Transcrição: string
  Iniciais: string
  Natureza: string
  Descrição: string
  Valor: number
}

export interface DicionarioRow {
  Fonte: string
  Transcrição: string
  Iniciais: string
  Natureza: string
  Descrição: string
  Vezes: number
}

export interface Dataset {
  extrato: ExtratoRow[]
  dicionario: DicionarioRow[]
}

function resolverValorCelula(cell: ExcelJS.Cell): unknown {
  const v = cell.value
  if (v === null || v === undefined) return null
  if (typeof v === 'object' && 'result' in (v as object)) {
    return (v as { result: unknown }).result
  }
  return v
}

function resolverNumero(cell: ExcelJS.Cell): number {
  const v = resolverValorCelula(cell)
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(',', '.'))
    if (!isNaN(n)) return n
  }
  return 0
}

function resolverString(cell: ExcelJS.Cell): string {
  const v = resolverValorCelula(cell)
  if (v === null || v === undefined) return ''
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10)
  }
  return String(v)
}

function resolverData(cell: ExcelJS.Cell): string {
  const v = resolverValorCelula(cell)
  if (v instanceof Date) {
    // Formata como DD/MM/AAAA para manter consistência com o modelo
    const d = v.getDate().toString().padStart(2, '0')
    const m = (v.getMonth() + 1).toString().padStart(2, '0')
    const y = v.getFullYear()
    return `${d}/${m}/${y}`
  }
  if (typeof v === 'number') {
    // Número serial do Excel — converte via Date
    const excelEpoch = new Date(1899, 11, 30)
    const ms = v * 86400000
    const date = new Date(excelEpoch.getTime() + ms)
    const d = date.getDate().toString().padStart(2, '0')
    const mo = (date.getMonth() + 1).toString().padStart(2, '0')
    const y = date.getFullYear()
    return `${d}/${mo}/${y}`
  }
  return resolverString(cell)
}

// Colunas do Extrato na ordem da planilha (A=1, B=2, ...)
// A=Fonte, B=Data, C=Transcrição, D=Iniciais, E=Natureza, F=Descrição, G=Valor
export function extractExtrato(wb: ExcelJS.Workbook): ExtratoRow[] {
  const ws = wb.getWorksheet('Extrato')
  if (!ws) throw new Error('Aba Extrato não encontrada')

  const rows: ExtratoRow[] = []
  // Dados: linhas 8 a 72 (65 lançamentos)
  for (let rowNum = 8; rowNum <= 72; rowNum++) {
    const row = ws.getRow(rowNum)
    const fonte = resolverString(row.getCell(1))
    const data = resolverData(row.getCell(2))
    const transcricao = resolverString(row.getCell(3))
    const iniciais = resolverString(row.getCell(4))
    const natureza = resolverString(row.getCell(5))
    const descricao = resolverString(row.getCell(6))
    const valor = resolverNumero(row.getCell(7))

    rows.push({
      Fonte: fonte,
      Data: data,
      Transcrição: transcricao,
      Iniciais: iniciais,
      Natureza: natureza,
      Descrição: descricao,
      Valor: valor,
    })
  }
  return rows
}

// Colunas do Dicionario: A=Fonte, B=Transcrição, C=Iniciais, D=Natureza, E=Descrição, F=Vezes
export function extractDicionario(wb: ExcelJS.Workbook): DicionarioRow[] {
  const ws = wb.getWorksheet('Dicionario')
  if (!ws) throw new Error('Aba Dicionario não encontrada')

  const rows: DicionarioRow[] = []
  // Identifica dinamicamente o intervalo de dados buscando a primeira linha com conteúdo
  // e parando quando Fonte ficar vazio
  let rowNum = 2 // assume cabeçalho na linha 1
  while (true) {
    const row = ws.getRow(rowNum)
    const fonte = resolverString(row.getCell(1))
    if (!fonte) break
    rows.push({
      Fonte: fonte,
      Transcrição: resolverString(row.getCell(2)),
      Iniciais: resolverString(row.getCell(3)),
      Natureza: resolverString(row.getCell(4)),
      Descrição: resolverString(row.getCell(5)),
      Vezes: resolverNumero(row.getCell(6)),
    })
    rowNum++
  }
  return rows
}

export async function gerarDataset(
  goldenPath: string,
  outputPath: string
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(goldenPath)

  const extrato = extractExtrato(wb)
  const dicionario = extractDicionario(wb)

  const dataset: Dataset = { extrato, dicionario }

  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  fs.writeFileSync(outputPath, JSON.stringify(dataset, null, 2), 'utf-8')
}

// Ponto de entrada CLI
if (process.argv[1] && process.argv[1].endsWith('extract-golden.ts')) {
  const worktreeRoot = path.resolve(import.meta.dirname, '../..')
  const goldenPath = path.join(worktreeRoot, 'Modelo_preenchido.xlsx')
  const outputPath = path.join(worktreeRoot, 'spike/fixtures/dataset.json')
  gerarDataset(goldenPath, outputPath)
    .then(() => console.log('dataset.json gerado com sucesso'))
    .catch((e) => { console.error(e); process.exit(1) })
}
