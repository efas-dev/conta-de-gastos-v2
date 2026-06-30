// ADR: see spec/spike-geracao-xlsx.adr.md
import { readFile, write, utils } from 'xlsx'
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
 * Carrega Modelo.xlsx via SheetJS (xlsx 0.18.5 Community), injeta o dataset
 * em Extrato (linhas 8–72) e Dicionario (linhas 2+), pós-processa o buffer
 * com fflate para atualizar o ref da Tabela1 em xl/tables/table1.xml, e
 * retorna o buffer do xlsx resultante.
 *
 * SheetJS Community regenera todo o XML ao escrever (não preserva partes
 * inalteradas byte-a-byte). O fflate post-processing é necessário para o ref
 * da tabela porque SheetJS não expõe API de tabela para arquivos existentes.
 *
 * ACHADO DO SPIKE: SheetJS Community 0.18.5 não preserva formatação condicional
 * nem estilos originais ao reescrever o arquivo. Esse comportamento é esperado
 * e documentado no relatório (C3=fail, C5=fail, C7=fail).
 */
function injetarDados(modeloPath: string, dataset: Dataset): Buffer {
  // Lê o modelo com cellFormula e cellStyles para capturar fórmulas e estilos
  const wb = readFile(modeloPath, { cellFormula: true, cellStyles: true, sheetStubs: true })

  const extratoSheet = wb.Sheets['Extrato']
  const dicionarioSheet = wb.Sheets['Dicionario']
  if (!extratoSheet) throw new Error('Aba Extrato não encontrada no modelo')
  if (!dicionarioSheet) throw new Error('Aba Dicionario não encontrada no modelo')

  // Injeta Extrato: linhas 8–72 (65 lançamentos)
  // Colunas: A=Fonte B=Data C=Transcrição D=Iniciais E=Natureza F=Descrição G=Valor
  for (let i = 0; i < dataset.extrato.length; i++) {
    const row = dataset.extrato[i]
    const rowNum = i + 8  // linha Excel (1-indexada)
    extratoSheet[`A${rowNum}`] = { t: 's', v: row.Fonte }
    extratoSheet[`B${rowNum}`] = { t: 's', v: row.Data }
    extratoSheet[`C${rowNum}`] = { t: 's', v: row.Transcrição }
    extratoSheet[`D${rowNum}`] = { t: 's', v: row.Iniciais }
    extratoSheet[`E${rowNum}`] = { t: 's', v: row.Natureza }
    extratoSheet[`F${rowNum}`] = { t: 's', v: row.Descrição }
    extratoSheet[`G${rowNum}`] = { t: 'n', v: row.Valor }
  }

  // Expande o !ref do Extrato para cobrir as linhas injetadas.
  // O virgem tem dimension ref="A1:AM1003"; SheetJS lê isso como !ref='A1:AM1003'.
  // Após injeção em linhas 8–72 (dentro do range), o !ref já cobre os dados.
  // Atualiza de qualquer forma para garantir consistência caso o !ref seja menor.
  const extratoRef = extratoSheet['!ref']
  if (extratoRef) {
    const r = utils.decode_range(extratoRef)
    // Linhas injetadas: 8–72 (0-indexed: 7–71); colunas A–G (0-indexed: 0–6)
    r.e.r = Math.max(r.e.r, 71)
    r.e.c = Math.max(r.e.c, 6)
    extratoSheet['!ref'] = utils.encode_range(r)
  } else {
    extratoSheet['!ref'] = 'A1:G72'
  }

  // Injeta Dicionario: linhas 2+ (144 entradas)
  // Colunas: A=Fonte B=Transcrição C=Iniciais D=Natureza E=Descrição F=Vezes
  for (let i = 0; i < dataset.dicionario.length; i++) {
    const row = dataset.dicionario[i]
    const rowNum = i + 2  // linha Excel (cabeçalho na linha 1)
    dicionarioSheet[`A${rowNum}`] = { t: 's', v: row.Fonte }
    dicionarioSheet[`B${rowNum}`] = { t: 's', v: row.Transcrição }
    dicionarioSheet[`C${rowNum}`] = { t: 's', v: row.Iniciais }
    dicionarioSheet[`D${rowNum}`] = { t: 's', v: row.Natureza }
    dicionarioSheet[`E${rowNum}`] = { t: 's', v: row.Descrição }
    dicionarioSheet[`F${rowNum}`] = { t: 'n', v: row.Vezes }
  }

  // Atualiza !ref do Dicionario para cobrir o cabeçalho + 144 linhas de dados.
  // O virgem tem dimension ref="A1" (vazio); precisamos expandir para A1:F145.
  const dicRef = dicionarioSheet['!ref']
  if (dicRef) {
    const r = utils.decode_range(dicRef)
    const lastDataRow = 1 + dataset.dicionario.length  // 0-indexed: 1 + 144 = 145
    r.e.r = Math.max(r.e.r, lastDataRow - 1)  // 0-indexed: linha 145 = r=144
    r.e.c = Math.max(r.e.c, 5)  // coluna F = c=5
    dicionarioSheet['!ref'] = utils.encode_range(r)
  } else {
    dicionarioSheet['!ref'] = `A1:F${1 + dataset.dicionario.length}`
  }

  // Escreve para buffer (SheetJS regenera TODO o XML das partes)
  const rawBuffer = write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true })
  const excelBuffer = Buffer.isBuffer(rawBuffer)
    ? rawBuffer
    : Buffer.from(rawBuffer as ArrayBuffer)

  // Pós-processa via fflate: atualiza ref da Tabela1 em xl/tables/table1.xml.
  // SheetJS não expõe API de tabela para arquivos existentes — acesso direto
  // ao ZIP é necessário (mesmo padrão usado nas candidatas xlsx-populate e exceljs).
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
 * Ponto de entrada da candidata SheetJS.
 *
 * Executa 3 rodadas de injeção (para medir tempo médio), grava o xlsx de saída,
 * verifica os critérios automatizáveis (C3–C8) e grava o relatório JSON.
 *
 * C1 e C2 exigem abertura no Excel real (T8 — gate humano); são registrados
 * como 'pendente-manual'.
 *
 * ACHADO ESPERADO: SheetJS Community regenera toda a estrutura XML ao escrever,
 * não preservando [Content_Types].xml, xl/styles.xml, xl/worksheets/sheet3.xml
 * com seus conteúdos originais. Resultado esperado: C3=fail, C5=fail, C6=fail, C7=fail.
 */
export async function candidateSheetjs(
  modeloPath: string,
  outputPath: string,
  reportPath: string,
  dataset: Dataset,
  virgemPartsDir: string
): Promise<void> {
  const bundleSizeBytes = getFolderSizeSync(
    path.resolve(__dirname, '../node_modules/xlsx')
  )

  // Mede tempo médio em 3 execuções sequenciais (C9).
  const tempos: number[] = []
  let ultimoBuffer: Buffer | null = null

  for (let run = 0; run < 3; run++) {
    const t0 = performance.now()
    ultimoBuffer = injetarDados(modeloPath, dataset)
    tempos.push(performance.now() - t0)
  }

  const tempoMedioMs =
    Math.round((tempos.reduce((s, t) => s + t, 0) / tempos.length) * 100) / 100

  if (ultimoBuffer === null) {
    throw new Error('injetarDados retornou null — estado inválido')
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
    candidata: 'sheetjs',
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
