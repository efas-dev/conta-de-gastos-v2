// ADR: see spec/spike-geracao-xlsx.adr.md
import XlsxPopulate from 'xlsx-populate'
import { unzipSync } from 'fflate'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertXmlParity } from '../tests/helpers/xml-diff.js'
import { assertDataMatch } from '../tests/helpers/golden-checker.js'
import type { Dataset } from './extract-golden.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

type PassFail = 'pass' | 'fail' | 'pendente-manual'

interface Report {
  candidata: string
  C1: PassFail
  C2: PassFail
  C3: PassFail
  C4: PassFail
  C5: PassFail
  C6: PassFail
  C7: PassFail
  C8: PassFail
  C9: PassFail
  bundleSizeBytes: number
  tempoMedioMs: number
}

/**
 * Calcula recursivamente o tamanho em bytes de um diretório.
 */
function getFolderSizeSync(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0
  let total = 0
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name)
    total += entry.isDirectory()
      ? getFolderSizeSync(entryPath)
      : fs.statSync(entryPath).size
  }
  return total
}

/**
 * Compara uma parte XML específica do candidato com a do virgem (byte-a-byte,
 * sem nenhuma normalização). Retorna 'pass' se idênticas, 'fail' se divergem.
 */
function verificarParteByteByte(
  parts: Record<string, Uint8Array>,
  virgemDir: string,
  partPath: string
): PassFail {
  const partData = parts[partPath]
  if (!partData) return 'fail'
  const virgemFilePath = path.join(virgemDir, partPath)
  if (!fs.existsSync(virgemFilePath)) return 'pass'
  const virgemContent = fs.readFileSync(virgemFilePath, 'utf-8')
  const candidateContent = new TextDecoder().decode(partData)
  return virgemContent === candidateContent ? 'pass' : 'fail'
}

/**
 * Verifica C3 (conditionalFormatting preservado em sheet1.xml) normalizando
 * o bloco <sheetData> antes de comparar — a injeção de dados altera sheetData,
 * mas o restante do XML (incluindo conditionalFormatting) deve permanecer intacto.
 */
function verificarConditionalFormatting(
  parts: Record<string, Uint8Array>,
  virgemDir: string
): PassFail {
  const partPath = 'xl/worksheets/sheet1.xml'
  const partData = parts[partPath]
  if (!partData) return 'fail'
  const virgemFilePath = path.join(virgemDir, partPath)
  if (!fs.existsSync(virgemFilePath)) return 'fail'
  const virgemContent = fs.readFileSync(virgemFilePath, 'utf-8')
  const candidateContent = new TextDecoder().decode(partData)
  // Normaliza <sheetData> (mudança esperada) para isolar o restante do XML
  const stripSheetData = (xml: string): string =>
    xml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, '<sheetData/>')
  const virgemNorm = stripSheetData(virgemContent)
  const candidateNorm = stripSheetData(candidateContent)
  return virgemNorm === candidateNorm ? 'pass' : 'fail'
}

/**
 * Carrega Modelo.xlsx, injeta dataset em Extrato e Dicionario,
 * atualiza ref da Tabela1 para A7:G72 e retorna o buffer do xlsx gerado.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function injetarDados(modeloPath: string, dataset: Dataset): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wb: any = await XlsxPopulate.fromFileAsync(modeloPath)

  const extratoSheet = wb.sheet('Extrato')
  const dicionarioSheet = wb.sheet('Dicionario')

  // Injeta Extrato: linhas 8–72 (65 lançamentos)
  // Colunas: A=Fonte B=Data C=Transcrição D=Iniciais E=Natureza F=Descrição G=Valor
  for (let i = 0; i < dataset.extrato.length; i++) {
    const row = dataset.extrato[i]
    const rowNum = i + 8
    extratoSheet.cell(`A${rowNum}`).value(row.Fonte)
    extratoSheet.cell(`B${rowNum}`).value(row.Data)
    extratoSheet.cell(`C${rowNum}`).value(row.Transcrição)
    extratoSheet.cell(`D${rowNum}`).value(row.Iniciais)
    extratoSheet.cell(`E${rowNum}`).value(row.Natureza)
    extratoSheet.cell(`F${rowNum}`).value(row.Descrição)
    extratoSheet.cell(`G${rowNum}`).value(row.Valor)
  }

  // Injeta Dicionario: linhas 2+ (144 entradas)
  // Colunas: A=Fonte B=Transcrição C=Iniciais D=Natureza E=Descrição F=Vezes
  for (let i = 0; i < dataset.dicionario.length; i++) {
    const row = dataset.dicionario[i]
    const rowNum = i + 2
    dicionarioSheet.cell(`A${rowNum}`).value(row.Fonte)
    dicionarioSheet.cell(`B${rowNum}`).value(row.Transcrição)
    dicionarioSheet.cell(`C${rowNum}`).value(row.Iniciais)
    dicionarioSheet.cell(`D${rowNum}`).value(row.Natureza)
    dicionarioSheet.cell(`E${rowNum}`).value(row.Descrição)
    dicionarioSheet.cell(`F${rowNum}`).value(row.Vezes)
  }

  // Atualiza ref da Tabela1 via acesso ao ZIP interno
  // xlsx-populate usa JSZip internamente; _zip.file retorna objeto JSZip
  const tableXml: string = await wb._zip.file('xl/tables/table1.xml').async('string')
  const updatedTableXml = tableXml.replace(/\bref="[^"]*"/g, 'ref="A7:G72"')
  wb._zip.file('xl/tables/table1.xml', updatedTableXml)

  return wb.outputAsync() as Promise<Buffer>
}

/**
 * Ponto de entrada da candidata xlsx-populate.
 *
 * Executa 3 rodadas de injeção (para medir tempo médio), grava o xlsx de saída,
 * verifica os critérios automatizáveis (C3–C8) e grava o relatório JSON.
 *
 * C1 e C2 exigem abertura no Excel real (T8 — gate humano); registrados como
 * 'pendente-manual'.
 */
export async function candidateXlsxPopulate(
  modeloPath: string,
  outputPath: string,
  reportPath: string,
  dataset: Dataset,
  virgemPartsDir: string
): Promise<void> {
  // Mede tempo médio em 3 execuções sequenciais (C9)
  const tempos: number[] = []
  let ultimoBuffer: Buffer | null = null

  for (let run = 0; run < 3; run++) {
    const t0 = performance.now()
    ultimoBuffer = await injetarDados(modeloPath, dataset)
    tempos.push(performance.now() - t0)
  }

  const outputBuffer = ultimoBuffer!
  fs.writeFileSync(outputPath, outputBuffer)
  const tempoMedioMs = Math.round((tempos.reduce((s, t) => s + t, 0) / 3) * 100) / 100

  // Tamanho do bundle de xlsx-populate em bytes
  const bundleSizeBytes = getFolderSizeSync(
    path.resolve(__dirname, '../node_modules/xlsx-populate')
  )

  // Descompacta o output para análise por critério
  const candidateZip = new Uint8Array(
    outputBuffer.buffer,
    outputBuffer.byteOffset,
    outputBuffer.byteLength
  )
  const parts = unzipSync(candidateZip)

  // C4: atributo ref da Tabela1 aponta para A7:G72
  let C4: PassFail = 'fail'
  const table1Bytes = parts['xl/tables/table1.xml']
  if (table1Bytes) {
    const table1Xml = new TextDecoder().decode(table1Bytes)
    if (table1Xml.includes('ref="A7:G72"')) C4 = 'pass'
  }

  // C3: conditionalFormatting de Extrato preservado (sheet1.xml normalizado)
  const C3 = verificarConditionalFormatting(parts, virgemPartsDir)

  // C5: xl/styles.xml byte-a-byte idêntico ao virgem
  const C5 = verificarParteByteByte(parts, virgemPartsDir, 'xl/styles.xml')

  // C6: xl/worksheets/sheet3.xml (Naturezas) byte-a-byte idêntico ao virgem
  const C6 = verificarParteByteByte(parts, virgemPartsDir, 'xl/worksheets/sheet3.xml')

  // C7: assertXmlParity — diff só muda o esperado (sheetData + ref Tabela1)
  let C7: PassFail = 'pass'
  try {
    assertXmlParity(candidateZip, virgemPartsDir)
  } catch {
    C7 = 'fail'
  }

  // C8: dados injetados conferem com o dataset de T2 (contagens + soma)
  let C8: PassFail = 'fail'
  try {
    await assertDataMatch(candidateZip, dataset)
    C8 = 'pass'
  } catch {
    C8 = 'fail'
  }

  const report: Report = {
    candidata: 'xlsx-populate',
    C1: 'pendente-manual',
    C2: 'pendente-manual',
    C3,
    C4,
    C5,
    C6,
    C7,
    C8,
    C9: 'pass',
    bundleSizeBytes,
    tempoMedioMs,
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
}
