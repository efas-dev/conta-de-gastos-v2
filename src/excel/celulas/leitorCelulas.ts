// ADR: see Docs/specs/fatura-itau-xlsx.adr.md

import { unzipSync } from 'fflate'

/**
 * Uma célula extraída de um `.xlsx`, sempre como texto bruto — conversões
 * (número, data, booleano) ficam a cargo do consumidor.
 */
export type Celula = string

/** Matriz retangular-esparsa de células: `Matriz[linha][coluna]`, 0-based. */
export type Matriz = Celula[][]

/**
 * Lê a primeira aba de um arquivo `.xlsx` (OOXML) e devolve sua matriz de
 * células, sem que o consumidor precise saber que existe um ZIP ou XML por
 * trás.
 *
 * Estratégia (mesmo padrão de `src/excel/reader/leitor.ts`): descomprime com
 * `fflate.unzipSync`, localiza a primeira aba declarada em `xl/workbook.xml`,
 * resolve o caminho da planilha via `xl/_rels/workbook.xml.rels` e parseia o
 * XML da planilha com `DOMParser`.
 *
 * Best-effort: qualquer falha (bytes vazios, ZIP inválido, XML malformado,
 * workbook sem nenhuma aba) devolve `[]` sem lançar exceção — mesma disciplina
 * de robustez de `lerDicionario`/`lerNaturezas`.
 *
 * @param bytes  Conteúdo binário do arquivo `.xlsx`.
 * @returns      Matriz de células da primeira aba, ou `[]` em caso de falha.
 */
export function lerCelulas(bytes: Uint8Array): Matriz {
  if (bytes.length === 0) return []

  let zip: Record<string, Uint8Array>
  try {
    zip = unzipSync(bytes) as Record<string, Uint8Array>
  } catch {
    return []
  }

  const decoder = new TextDecoder()

  // ----- 1. Localizar o r:id da primeira aba em workbook.xml ----------------

  const workbookBytes = zip['xl/workbook.xml']
  if (!workbookBytes) return []

  let workbookDoc: Document
  try {
    workbookDoc = new DOMParser().parseFromString(decoder.decode(workbookBytes), 'text/xml')
  } catch {
    return []
  }

  const sheetEls = workbookDoc.getElementsByTagNameNS('*', 'sheet')
  if (sheetEls.length === 0) return []

  const primeiraAbaRid = getAttr(sheetEls[0], 'id')
  if (!primeiraAbaRid) return []

  // ----- 2. Resolver o Target via workbook.xml.rels --------------------------

  const relsBytes = zip['xl/_rels/workbook.xml.rels']
  if (!relsBytes) return []

  let relsDoc: Document
  try {
    relsDoc = new DOMParser().parseFromString(decoder.decode(relsBytes), 'text/xml')
  } catch {
    return []
  }

  const relEls = relsDoc.getElementsByTagNameNS('*', 'Relationship')
  let sheetTarget: string | null = null
  for (let i = 0; i < relEls.length; i++) {
    const el = relEls[i]
    if (el.getAttribute('Id') === primeiraAbaRid) {
      sheetTarget = el.getAttribute('Target')
      break
    }
  }
  if (!sheetTarget) return []

  // ----- 3. Carregar sharedStrings opcionalmente ------------------------------

  const sharedStrings: string[] = []
  const ssBytes = zip['xl/sharedStrings.xml']
  if (ssBytes) {
    try {
      const ssDoc = new DOMParser().parseFromString(decoder.decode(ssBytes), 'text/xml')
      const siEls = ssDoc.getElementsByTagNameNS('*', 'si')
      for (let i = 0; i < siEls.length; i++) {
        const tEls = siEls[i].getElementsByTagNameNS('*', 't')
        let text = ''
        for (let j = 0; j < tEls.length; j++) {
          text += tEls[j].textContent ?? ''
        }
        sharedStrings.push(text)
      }
    } catch {
      // sharedStrings indisponível: células tipo "s" retornarão vazio
    }
  }

  // ----- 4. Localizar e parsear o XML da planilha -----------------------------

  const sheetPath = sheetTarget.startsWith('/') ? sheetTarget.slice(1) : `xl/${sheetTarget}`
  const sheetBytes = zip[sheetPath]
  if (!sheetBytes) return []

  let sheetDoc: Document
  try {
    sheetDoc = new DOMParser().parseFromString(decoder.decode(sheetBytes), 'text/xml')
  } catch {
    return []
  }

  // ----- 5. Construir a matriz de células -------------------------------------

  const rowEls = sheetDoc.getElementsByTagNameNS('*', 'row')
  const matriz: Matriz = []

  for (let i = 0; i < rowEls.length; i++) {
    const rowEl = rowEls[i]
    const cellEls = rowEl.getElementsByTagNameNS('*', 'c')

    const colValues: Record<number, string> = {}
    let maxCol = -1
    for (let j = 0; j < cellEls.length; j++) {
      const cell = cellEls[j]
      const ref = cell.getAttribute('r') ?? ''
      const col = colLetterToIndex(colLetterFromRef(ref))
      colValues[col] = getCellText(cell, sharedStrings)
      if (col > maxCol) maxCol = col
    }

    const linha: Celula[] = []
    for (let col = 0; col <= maxCol; col++) {
      linha.push(colValues[col] ?? '')
    }
    matriz.push(linha)
  }

  return matriz
}

// ---------------------------------------------------------------------------
// Utilitários internos (mesmo padrão de src/excel/reader/leitor.ts)
// ---------------------------------------------------------------------------

/**
 * Extrai o valor textual de uma célula OOXML.
 * Suporta: inlineStr, shared string (t="s"), string de fórmula (t="str"),
 * e valor numérico (sem t).
 */
function getCellText(cell: Element, sharedStrings: string[]): string {
  const t = cell.getAttribute('t')

  if (t === 'inlineStr') {
    const tEl = cell.getElementsByTagNameNS('*', 't')[0]
    return tEl?.textContent ?? ''
  }

  if (t === 's') {
    const vEl = cell.getElementsByTagNameNS('*', 'v')[0]
    const idx = parseInt(vEl?.textContent ?? '', 10)
    return isNaN(idx) ? '' : (sharedStrings[idx] ?? '')
  }

  // 'str' (resultado de fórmula string) ou valor numérico/ausente
  const vEl = cell.getElementsByTagNameNS('*', 'v')[0]
  return vEl?.textContent ?? ''
}

/** Extrai a parte de letras de uma referência de célula (ex.: "AB12" → "AB"). */
function colLetterFromRef(ref: string): string {
  return ref.replace(/[0-9]/g, '')
}

/**
 * Converte letras de coluna para índice 0-based.
 * A=0, B=1, ..., Z=25, AA=26, AB=27, ...
 */
function colLetterToIndex(col: string): number {
  let result = 0
  for (const ch of col.toUpperCase()) {
    result = result * 26 + (ch.charCodeAt(0) - 64)
  }
  return result - 1
}

/**
 * Obtém o valor de um atributo pelo localName, ignorando prefixo de namespace.
 * Necessário para acessar `r:id` em documentos XML com namespaces declarados.
 */
function getAttr(el: Element, localName: string): string | null {
  const direct = el.getAttribute(localName)
  if (direct !== null) return direct

  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i]
    if (attr.localName === localName) return attr.value
  }
  return null
}
