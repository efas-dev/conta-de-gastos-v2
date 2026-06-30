// ADR: see spec/spike-geracao-xlsx.adr.md
import { unzipSync } from 'fflate'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Partes de planilha onde mudanças em <sheetData> são esperadas (Extrato e Dicionario).
 */
const SHEET_DATA_PARTS = new Set([
  'xl/worksheets/sheet1.xml',
  'xl/worksheets/sheet2.xml',
])

/**
 * Regex para remover o conteúdo de <sheetData> antes de comparar.
 * Substitui o bloco inteiro por um marcador vazio para que o candidato
 * possa injetar dados sem que a comparação falhe.
 */
const SHEET_DATA_REGEX = /<sheetData>[\s\S]*?<\/sheetData>/

/**
 * Regex para normalizar o atributo `ref` em table1.xml e seu autoFilter.
 * Candidatos atualizam o ref para refletir o range real dos dados injetados.
 */
const TABLE_REF_REGEX = /\bref="[^"]*"/g

/**
 * Normaliza o conteúdo XML de uma parte antes de comparar byte-a-byte.
 * Aplica apenas as exclusões declaradas no ADR (Decisão 4):
 *  - sheetData de Extrato/Dicionario
 *  - atributo ref da Tabela1
 */
function normalizeParaComparacao(partPath: string, xml: string): string {
  let normalized = xml

  if (SHEET_DATA_PARTS.has(partPath)) {
    normalized = normalized.replace(SHEET_DATA_REGEX, '<sheetData/>')
  }

  if (partPath === 'xl/tables/table1.xml') {
    normalized = normalized.replace(TABLE_REF_REGEX, 'ref="NORMALIZADO"')
  }

  return normalized
}

/**
 * Verifica que todas as partes XML do candidato são byte-a-byte idênticas
 * às partes correspondentes em `virgemDir`, ignorando apenas:
 *  - `<sheetData>` de Extrato (sheet1.xml) e Dicionario (sheet2.xml)
 *  - atributo `ref` em xl/tables/table1.xml
 *
 * Lança Error com o nome da parte e um trecho do diff em caso de divergência.
 */
export function assertXmlParity(candidateZip: Uint8Array, virgemDir: string): void {
  const decoder = new TextDecoder()
  const parts = unzipSync(candidateZip)

  for (const [partPath, partData] of Object.entries(parts)) {
    const virgemFilePath = path.join(virgemDir, partPath)

    if (!fs.existsSync(virgemFilePath)) {
      // Parte extra no candidato — não faz parte do virgem; ignorar
      continue
    }

    const virgemContent = fs.readFileSync(virgemFilePath, 'utf-8')
    const candidateContent = decoder.decode(partData)

    const virgemNorm = normalizeParaComparacao(partPath, virgemContent)
    const candidateNorm = normalizeParaComparacao(partPath, candidateContent)

    if (virgemNorm !== candidateNorm) {
      const previewLen = 300
      throw new Error(
        `assertXmlParity: divergência em "${partPath}"\n` +
        `  Candidato (norm, primeiros ${previewLen}): ${candidateNorm.substring(0, previewLen)}\n` +
        `  Virgem    (norm, primeiros ${previewLen}): ${virgemNorm.substring(0, previewLen)}`
      )
    }
  }
}
