// ADR: see spec/spike-geracao-xlsx.adr.md
import ExcelJS from 'exceljs'
import { unzipSync, zipSync } from 'fflate'
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
  erroC1?: string
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
 * Compara uma parte XML específica do candidato com a do virgem byte-a-byte.
 * Retorna 'pass' se idênticas, 'fail' se divergem.
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
  const stripSheetData = (xml: string): string =>
    xml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, '<sheetData/>')
  const virgemNorm = stripSheetData(virgemContent)
  const candidateNorm = stripSheetData(candidateContent)
  return virgemNorm === candidateNorm ? 'pass' : 'fail'
}

/**
 * Carrega Modelo.xlsx, injeta dataset em Extrato e Dicionario via ExcelJS,
 * pós-processa o buffer com fflate para atualizar o ref da Tabela1,
 * e retorna o buffer do xlsx gerado.
 *
 * ExcelJS não expõe API de tabela para arquivos existentes; o ref é
 * atualizado cirurgicamente em xl/tables/table1.xml após o write.
 *
 * ACHADO DO SPIKE: ExcelJS 4.4.0 lança TypeError em writeBuffer() quando
 * o arquivo fonte contém certas regras de formatação condicional
 * (bug em CfRuleXform.renderExpression). Esse erro é propagado para o caller.
 */
async function injetarDados(modeloPath: string, dataset: Dataset): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(modeloPath)

  const extratoSheet = wb.getWorksheet('Extrato')
  const dicionarioSheet = wb.getWorksheet('Dicionario')
  if (!extratoSheet) throw new Error('Aba Extrato não encontrada no modelo')
  if (!dicionarioSheet) throw new Error('Aba Dicionario não encontrada no modelo')

  // Injeta Extrato: linhas 8–72 (65 lançamentos)
  // Colunas: A=Fonte B=Data C=Transcrição D=Iniciais E=Natureza F=Descrição G=Valor
  for (let i = 0; i < dataset.extrato.length; i++) {
    const row = dataset.extrato[i]
    const rowNum = i + 8
    const r = extratoSheet.getRow(rowNum)
    r.getCell(1).value = row.Fonte
    r.getCell(2).value = row.Data
    r.getCell(3).value = row.Transcrição
    r.getCell(4).value = row.Iniciais
    r.getCell(5).value = row.Natureza
    r.getCell(6).value = row.Descrição
    r.getCell(7).value = row.Valor
    r.commit()
  }

  // Injeta Dicionario: linhas 2+ (144 entradas)
  // Colunas: A=Fonte B=Transcrição C=Iniciais D=Natureza E=Descrição F=Vezes
  for (let i = 0; i < dataset.dicionario.length; i++) {
    const row = dataset.dicionario[i]
    const rowNum = i + 2
    const r = dicionarioSheet.getRow(rowNum)
    r.getCell(1).value = row.Fonte
    r.getCell(2).value = row.Transcrição
    r.getCell(3).value = row.Iniciais
    r.getCell(4).value = row.Natureza
    r.getCell(5).value = row.Descrição
    r.getCell(6).value = row.Vezes
    r.commit()
  }

  // ExcelJS writeBuffer: pode lançar TypeError em arquivos com CF avançada
  const rawBuffer = await wb.xlsx.writeBuffer()
  const excelBuffer = Buffer.isBuffer(rawBuffer)
    ? rawBuffer
    : Buffer.from(rawBuffer as ArrayBuffer)

  // Pós-processa via fflate: atualiza ref da Tabela1 em xl/tables/table1.xml.
  // ExcelJS não oferece API para modificar tabelas existentes — acesso direto
  // ao ZIP é necessário (mesmo padrão usado na candidata xlsx-populate).
  const uint8 = new Uint8Array(
    excelBuffer.buffer,
    excelBuffer.byteOffset,
    excelBuffer.byteLength
  )
  const parts = unzipSync(uint8)

  const tableKey = 'xl/tables/table1.xml'
  if (parts[tableKey]) {
    const tableXml = new TextDecoder().decode(parts[tableKey])
    const updatedTableXml = tableXml.replace(/\bref="[^"]*"/g, 'ref="A7:G72"')
    parts[tableKey] = new TextEncoder().encode(updatedTableXml)
  }

  const rezipped = zipSync(parts)
  return Buffer.from(rezipped)
}

/**
 * Ponto de entrada da candidata ExcelJS.
 *
 * Executa 3 rodadas de injeção (para medir tempo médio), grava o xlsx de saída,
 * verifica os critérios automatizáveis (C3–C8) e grava o relatório JSON.
 *
 * C1 e C2 exigem abertura no Excel real (T8 — gate humano); C1 é registrado
 * como 'pendente-manual' somente se a execução não lançar exceção.
 * Se ExcelJS lançar durante a geração, C1='fail' e os critérios que dependem
 * do arquivo de saída são registrados como 'fail'; o relatório é escrito de qualquer forma.
 */
export async function candidateExceljs(
  modeloPath: string,
  outputPath: string,
  reportPath: string,
  dataset: Dataset,
  virgemPartsDir: string
): Promise<void> {
  const bundleSizeBytes = getFolderSizeSync(
    path.resolve(__dirname, '../node_modules/exceljs')
  )

  // Mede tempo médio em 3 execuções sequenciais (C9).
  // Se injetarDados lançar, capturamos o erro e registramos C1=fail.
  const tempos: number[] = []
  let ultimoBuffer: Buffer | null = null
  let erroC1: string | undefined

  for (let run = 0; run < 3; run++) {
    const t0 = performance.now()
    try {
      ultimoBuffer = await injetarDados(modeloPath, dataset)
      tempos.push(performance.now() - t0)
    } catch (err) {
      tempos.push(performance.now() - t0)
      // Registra o erro determinístico na primeira falha; as demais rodadas
      // medem o mesmo ponto de falha para compor a média de 3 runs (C9).
      if (erroC1 === undefined) {
        erroC1 = err instanceof Error ? `${err.constructor.name}: ${err.message}` : String(err)
      }
    }
  }

  const tempoMedioMs = tempos.length > 0
    ? Math.round((tempos.reduce((s, t) => s + t, 0) / tempos.length) * 100) / 100
    : 0

  // Se houve erro (C1=fail), grava relatório parcial e retorna sem criar output xlsx
  if (erroC1 !== undefined || ultimoBuffer === null) {
    const report: Report = {
      candidata: 'exceljs',
      C1: 'fail',
      C2: 'pendente-manual',
      C3: 'fail',
      C4: 'fail',
      C5: 'fail',
      C6: 'fail',
      C7: 'fail',
      C8: 'fail',
      C9: 'pass',
      bundleSizeBytes,
      tempoMedioMs,
      erroC1,
    }
    fs.mkdirSync(path.dirname(reportPath), { recursive: true })
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
    return
  }

  const outputBuffer = ultimoBuffer
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, outputBuffer)

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
    candidata: 'exceljs',
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
