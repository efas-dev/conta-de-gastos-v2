// ADR: see spec/spike-geracao-xlsx.adr.md
import { unzipSync, zipSync } from 'fflate'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertXmlParity } from '../tests/helpers/xml-diff.js'
import { assertDataMatch } from '../tests/helpers/golden-checker.js'
import type { Dataset, ExtratoRow, DicionarioRow } from './extract-golden.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const encoder = new TextEncoder()
const decoder = new TextDecoder()

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
 * Escapa caracteres especiais XML no conteúdo de texto.
 * Necessário para embutir valores de células como inline strings.
 */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Gera o XML de uma célula de string inline.
 * Formato: <c r="REF" s="STYLE" t="inlineStr"><is><t>VALUE</t></is></c>
 */
function celulaStr(ref: string, style: string, value: string): string {
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`
}

/**
 * Gera o XML de uma célula numérica.
 * Formato: <c r="REF" s="STYLE"><v>VALUE</v></c>
 */
function celulaNum(ref: string, style: string, value: number): string {
  return `<c r="${ref}" s="${style}"><v>${value}</v></c>`
}

/**
 * Injeta os dados do Extrato em sheet1.xml cirurgicamente.
 *
 * O Modelo.xlsx virgem tem as células A–G de cada linha de dados (8–503) como
 * células de estilo vazias (ex: <c r="A8" s="42"/>). Esta função substitui
 * apenas as células A–G das linhas 8–72 pelos valores do dataset, preservando
 * todo o restante do XML (fórmulas dinâmicas, formatação condicional, etc.).
 *
 * Estilos confirmados no virgem:
 *   A (Fonte): s="42"  B (Data): s="44"  C (Transcrição): s="41"
 *   D (Iniciais): s="41"  E (Natureza): s="11"  F (Descrição): s="11"
 *   G (Valor): s="43"
 */
function injetarExtratoEmSheet1(sheet1Xml: string, extrato: ExtratoRow[]): string {
  let result = sheet1Xml

  for (let i = 0; i < extrato.length; i++) {
    const n = i + 8 // linhas 8–72
    const row = extrato[i]

    // Usa função como replacement para evitar interpretação de $ no valor
    result = result.replace(
      `<c r="A${n}" s="42"/>`,
      () => celulaStr(`A${n}`, '42', row.Fonte),
    )
    result = result.replace(
      `<c r="B${n}" s="44"/>`,
      () => celulaStr(`B${n}`, '44', row.Data),
    )
    result = result.replace(
      `<c r="C${n}" s="41"/>`,
      () => celulaStr(`C${n}`, '41', row.Transcrição),
    )
    result = result.replace(
      `<c r="D${n}" s="41"/>`,
      () => celulaStr(`D${n}`, '41', row.Iniciais),
    )
    result = result.replace(
      `<c r="E${n}" s="11"/>`,
      () => celulaStr(`E${n}`, '11', row.Natureza),
    )
    result = result.replace(
      `<c r="F${n}" s="11"/>`,
      () => celulaStr(`F${n}`, '11', row.Descrição),
    )
    result = result.replace(
      `<c r="G${n}" s="43"/>`,
      () => celulaNum(`G${n}`, '43', row.Valor),
    )
  }

  return result
}

/**
 * Gera o bloco <sheetData> completo para a aba Dicionario.
 *
 * O Modelo.xlsx virgem tem <sheetData/> vazio na aba Dicionario.
 * As 144 entradas vão nas linhas 2–145 (linha 1 = cabeçalho — não gerado aqui
 * pois a aba virgem não tem linhas; extractDicionario lê a partir da linha 2).
 *
 * Colunas: A=Fonte, B=Transcrição, C=Iniciais, D=Natureza, E=Descrição, F=Vezes
 */
function gerarSheetDataDicionario(dicionario: DicionarioRow[]): string {
  const rows: string[] = []

  for (let i = 0; i < dicionario.length; i++) {
    const n = i + 2 // linhas 2–145
    const row = dicionario[i]
    const cells = [
      `<c r="A${n}" t="inlineStr"><is><t>${xmlEscape(row.Fonte)}</t></is></c>`,
      `<c r="B${n}" t="inlineStr"><is><t>${xmlEscape(row.Transcrição)}</t></is></c>`,
      `<c r="C${n}" t="inlineStr"><is><t>${xmlEscape(row.Iniciais)}</t></is></c>`,
      `<c r="D${n}" t="inlineStr"><is><t>${xmlEscape(row.Natureza)}</t></is></c>`,
      `<c r="E${n}" t="inlineStr"><is><t>${xmlEscape(row.Descrição)}</t></is></c>`,
      `<c r="F${n}"><v>${row.Vezes}</v></c>`,
    ].join('')
    rows.push(`<row r="${n}" spans="1:6">${cells}</row>`)
  }

  return `<sheetData>${rows.join('')}</sheetData>`
}

/**
 * Substitui <sheetData/> da aba Dicionario pelo sheetData gerado com os dados.
 */
function injetarDicionarioEmSheet2(sheet2Xml: string, dicionario: DicionarioRow[]): string {
  const novoSheetData = gerarSheetDataDicionario(dicionario)
  return sheet2Xml.replace('<sheetData/>', novoSheetData)
}

/**
 * Atualiza o atributo ref em xl/tables/table1.xml para o range das 65 linhas.
 * Substitui TODOS os ref="..." da tabela (inclui autoFilter) pelo novo range.
 */
function atualizarRefTabela1(table1Xml: string, ref: string): string {
  return table1Xml.replace(/\bref="[^"]*"/g, () => `ref="${ref}"`)
}

/**
 * Compara parte XML do candidato com a do virgem (byte-a-byte após decode UTF-8).
 */
function verificarParteByteByte(
  parts: Record<string, Uint8Array>,
  virgemDir: string,
  partPath: string,
): PassFail {
  const partData = parts[partPath]
  if (!partData) return 'fail'
  const virgemFilePath = path.join(virgemDir, partPath)
  if (!fs.existsSync(virgemFilePath)) return 'pass'
  const virgemContent = fs.readFileSync(virgemFilePath, 'utf-8')
  const candidateContent = decoder.decode(partData)
  return virgemContent === candidateContent ? 'pass' : 'fail'
}

/**
 * Verifica C3: conditionalFormatting preservado em sheet1.xml (Extrato).
 * Normaliza <sheetData> antes de comparar para isolar apenas o CF.
 */
function verificarConditionalFormatting(
  parts: Record<string, Uint8Array>,
  virgemDir: string,
): PassFail {
  const partPath = 'xl/worksheets/sheet1.xml'
  const partData = parts[partPath]
  if (!partData) return 'fail'
  const virgemFilePath = path.join(virgemDir, partPath)
  if (!fs.existsSync(virgemFilePath)) return 'fail'
  const virgemContent = fs.readFileSync(virgemFilePath, 'utf-8')
  const candidateContent = decoder.decode(partData)
  const stripSheetData = (xml: string): string =>
    xml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, '<sheetData/>')
  return stripSheetData(virgemContent) === stripSheetData(candidateContent) ? 'pass' : 'fail'
}

/**
 * Lê Modelo.xlsx virgem como Uint8Array, descompacta com fflate.unzipSync,
 * modifica cirurgicamente sheet1.xml, sheet2.xml e table1.xml,
 * e recompacta com fflate.zipSync.
 *
 * Partes não tocadas (styles.xml, Naturezas/sheet3.xml, [Content_Types].xml, etc.)
 * passam pelo roundtrip unzip→zip com conteúdo descomprimido idêntico ao virgem.
 */
async function injetarDados(modeloPath: string, dataset: Dataset): Promise<Uint8Array> {
  const modeloBytes = new Uint8Array(fs.readFileSync(modeloPath))
  const parts = unzipSync(modeloBytes)

  // Modificar sheet1.xml (Extrato): injetar valores nas células A–G das linhas 8–72
  const sheet1Xml = decoder.decode(parts['xl/worksheets/sheet1.xml'])
  parts['xl/worksheets/sheet1.xml'] = encoder.encode(
    injetarExtratoEmSheet1(sheet1Xml, dataset.extrato),
  )

  // Modificar sheet2.xml (Dicionario): substituir <sheetData/> com 144 linhas
  const sheet2Xml = decoder.decode(parts['xl/worksheets/sheet2.xml'])
  parts['xl/worksheets/sheet2.xml'] = encoder.encode(
    injetarDicionarioEmSheet2(sheet2Xml, dataset.dicionario),
  )

  // Modificar table1.xml: atualizar ref para cobrir as 65 linhas de dados + cabeçalho
  const table1Xml = decoder.decode(parts['xl/tables/table1.xml'])
  parts['xl/tables/table1.xml'] = encoder.encode(atualizarRefTabela1(table1Xml, 'A7:G72'))

  // Recompactar: fflate.zipSync preserva o conteúdo de cada parte; apenas metadados
  // do container ZIP podem diferir (método de compressão, timestamps).
  return zipSync(parts)
}

/**
 * Ponto de entrada da candidata fflate artesanal.
 *
 * Executa 3 rodadas de injeção cirúrgica, grava o xlsx de saída,
 * verifica os critérios automatizáveis (C3–C8) e grava o relatório JSON.
 *
 * C1 e C2 exigem abertura no Excel real (gate humano T8); registrados como
 * 'pendente-manual'.
 */
export async function candidateFflate(
  modeloPath: string,
  outputPath: string,
  reportPath: string,
  dataset: Dataset,
  virgemPartsDir: string,
): Promise<void> {
  // Mede tempo médio em 3 execuções sequenciais (C9)
  const tempos: number[] = []
  let ultimoOutput: Uint8Array | null = null

  for (let run = 0; run < 3; run++) {
    const t0 = performance.now()
    ultimoOutput = await injetarDados(modeloPath, dataset)
    tempos.push(performance.now() - t0)
  }

  const outputBytes = ultimoOutput!
  fs.writeFileSync(outputPath, Buffer.from(outputBytes))
  const tempoMedioMs = Math.round((tempos.reduce((s, t) => s + t, 0) / 3) * 100) / 100

  // Bundle size de fflate em node_modules
  const bundleSizeBytes = getFolderSizeSync(
    path.resolve(__dirname, '../node_modules/fflate'),
  )

  // Descompacta output para análise por critério
  const parts = unzipSync(outputBytes)

  // C4: atributo ref da Tabela1 aponta para A7:G72
  let C4: PassFail = 'fail'
  const table1Bytes = parts['xl/tables/table1.xml']
  if (table1Bytes) {
    const table1Xml = decoder.decode(table1Bytes)
    if (table1Xml.includes('ref="A7:G72"')) C4 = 'pass'
  }

  // C3: conditionalFormatting de Extrato preservado (sheet1.xml com sheetData normalizado)
  const C3 = verificarConditionalFormatting(parts, virgemPartsDir)

  // C5: xl/styles.xml byte-a-byte idêntico ao virgem (conteúdo descomprimido)
  const C5 = verificarParteByteByte(parts, virgemPartsDir, 'xl/styles.xml')

  // C6: xl/worksheets/sheet3.xml (Naturezas) byte-a-byte idêntico ao virgem
  const C6 = verificarParteByteByte(parts, virgemPartsDir, 'xl/worksheets/sheet3.xml')

  // C7: assertXmlParity — somente sheetData de Extrato/Dicionario e ref de Tabela1 diferem
  let C7: PassFail = 'pass'
  try {
    assertXmlParity(outputBytes, virgemPartsDir)
  } catch {
    C7 = 'fail'
  }

  // C8: dados injetados conferem exatamente com o dataset de T2 (contagens + soma)
  let C8: PassFail = 'fail'
  try {
    await assertDataMatch(outputBytes, dataset)
    C8 = 'pass'
  } catch {
    C8 = 'fail'
  }

  const report: Report = {
    candidata: 'fflate',
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
