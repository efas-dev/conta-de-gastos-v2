// ADR: see Docs/specs/mvp-vertical-nubank.adr.md

import { unzipSync } from 'fflate'
import type { DicEntry } from '../../types'

/**
 * Lê a aba "Dicionario" de um arquivo .xlsx (OOXML) e retorna as entradas do
 * dicionário de classificações.
 *
 * Estratégia: descomprime o ZIP com `fflate.unzipSync`, localiza a planilha
 * pelo `workbook.xml` + relacionamentos, e parseia o XML com `DOMParser`
 * nativo do navegador (disponível também em jsdom para testes).
 *
 * Robustez: qualquer falha (bytes inválidos, aba ausente, XML malformado)
 * chama `onAviso` e retorna `[]` sem lançar exceção.
 *
 * @param bytes    Conteúdo binário do arquivo .xlsx.
 * @param onAviso  Callback opcional chamado com mensagem descritiva em caso
 *                 de arquivo inválido ou aba ausente.
 * @returns        Array de `DicEntry` extraídas, ou `[]` em caso de falha.
 */
export function lerDicionario(
  bytes: Uint8Array,
  onAviso?: (msg: string) => void,
): DicEntry[] {
  if (bytes.length === 0) {
    onAviso?.('Arquivo .xlsx vazio — dicionário ignorado')
    return []
  }

  let zip: Record<string, Uint8Array>
  try {
    zip = unzipSync(bytes) as Record<string, Uint8Array>
  } catch (err) {
    onAviso?.(`Arquivo .xlsx inválido: não foi possível descompactar (${String(err)})`)
    return []
  }

  const decoder = new TextDecoder()

  // ----- 1. Localizar o r:id da aba "Dicionario" em workbook.xml -----------

  const workbookBytes = zip['xl/workbook.xml']
  if (!workbookBytes) {
    onAviso?.('Arquivo .xlsx sem xl/workbook.xml — dicionário ignorado')
    return []
  }

  let workbookDoc: Document
  try {
    workbookDoc = new DOMParser().parseFromString(
      decoder.decode(workbookBytes),
      'text/xml',
    )
  } catch (err) {
    onAviso?.(`Falha ao parsear xl/workbook.xml: ${String(err)}`)
    return []
  }

  const sheetEls = workbookDoc.getElementsByTagNameNS('*', 'sheet')
  let dicionarioRid: string | null = null
  for (let i = 0; i < sheetEls.length; i++) {
    const el = sheetEls[i]
    if (el.getAttribute('name') === 'Dicionario') {
      // r:id pode estar como atributo namespaced; tenta pelo localName 'id'
      dicionarioRid = getAttr(el, 'id')
      break
    }
  }

  if (!dicionarioRid) {
    onAviso?.('Aba "Dicionario" não encontrada no .xlsx — dicionário ignorado')
    return []
  }

  // ----- 2. Resolver o Target via workbook.xml.rels -------------------------

  const relsBytes = zip['xl/_rels/workbook.xml.rels']
  if (!relsBytes) {
    onAviso?.('Arquivo .xlsx sem xl/_rels/workbook.xml.rels — dicionário ignorado')
    return []
  }

  let relsDoc: Document
  try {
    relsDoc = new DOMParser().parseFromString(
      decoder.decode(relsBytes),
      'text/xml',
    )
  } catch (err) {
    onAviso?.(`Falha ao parsear xl/_rels/workbook.xml.rels: ${String(err)}`)
    return []
  }

  const relEls = relsDoc.getElementsByTagNameNS('*', 'Relationship')
  let sheetTarget: string | null = null
  for (let i = 0; i < relEls.length; i++) {
    const el = relEls[i]
    if (el.getAttribute('Id') === dicionarioRid) {
      sheetTarget = el.getAttribute('Target')
      break
    }
  }

  if (!sheetTarget) {
    onAviso?.(`Relacionamento "${dicionarioRid}" não encontrado em workbook.xml.rels`)
    return []
  }

  // ----- 3. Carregar sharedStrings opcionalmente ---------------------------

  const sharedStrings: string[] = []
  const ssBytes = zip['xl/sharedStrings.xml']
  if (ssBytes) {
    try {
      const ssDoc = new DOMParser().parseFromString(
        decoder.decode(ssBytes),
        'text/xml',
      )
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
      // sharedStrings indisponível: string cells via s vão retornar vazio
    }
  }

  // ----- 4. Localizar e parsear o XML da planilha --------------------------

  // Target em workbook.xml.rels é relativo a xl/ (ex.: "worksheets/sheet1.xml")
  const sheetPath = sheetTarget.startsWith('/')
    ? sheetTarget.slice(1)                   // caminho absoluto dentro do ZIP
    : `xl/${sheetTarget}`                    // relativo a xl/

  const sheetBytes = zip[sheetPath]
  if (!sheetBytes) {
    onAviso?.(`Planilha da aba "Dicionario" não encontrada em "${sheetPath}"`)
    return []
  }

  let sheetDoc: Document
  try {
    sheetDoc = new DOMParser().parseFromString(
      decoder.decode(sheetBytes),
      'text/xml',
    )
  } catch (err) {
    onAviso?.(`Falha ao parsear planilha da aba "Dicionario": ${String(err)}`)
    return []
  }

  const rowEls = sheetDoc.getElementsByTagNameNS('*', 'row')
  if (rowEls.length < 1) return []

  // ----- 5. Construir índice de colunas a partir da linha de cabeçalho -----

  const headerRow = rowEls[0]
  const headerCells = headerRow.getElementsByTagNameNS('*', 'c')
  const colIndex: Record<string, number> = {}

  for (let i = 0; i < headerCells.length; i++) {
    const cell = headerCells[i]
    const ref = cell.getAttribute('r') ?? ''
    const col = colLetterToIndex(colLetterFromRef(ref))
    const text = getCellText(cell, sharedStrings).toLowerCase()
    if (text) {
      colIndex[text] = col
    }
  }

  // ----- 6. Parsear linhas de dados ----------------------------------------

  const result: DicEntry[] = []
  for (let i = 1; i < rowEls.length; i++) {
    const row = rowEls[i]
    const cellEls = row.getElementsByTagNameNS('*', 'c')
    const colValues: Record<number, string> = {}

    for (let j = 0; j < cellEls.length; j++) {
      const cell = cellEls[j]
      const ref = cell.getAttribute('r') ?? ''
      const col = colLetterToIndex(colLetterFromRef(ref))
      colValues[col] = getCellText(cell, sharedStrings)
    }

    const get = (key: string): string => {
      const idx = colIndex[key]
      return idx !== undefined ? (colValues[idx] ?? '') : ''
    }

    const chave = get('chave')
    if (!chave) continue // linha vazia ou sem chave → pula

    const vezesStr = get('vezes')
    const ambiguoStr = get('ambiguo')

    result.push({
      chave,
      fonte: get('fonte'),
      natureza: get('natureza'),
      descricao: get('descricao'),
      iniciais: get('iniciais'),
      vezes: vezesStr ? (parseInt(vezesStr, 10) || 0) : 0,
      ambiguo: ambiguoStr === 'true' || ambiguoStr === '1',
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// Utilitários internos
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

/**
 * Extrai a parte de letras de uma referência de célula (ex.: "AB12" → "AB").
 */
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
 * Necessário para acessar `r:id` em documentos XML com namespaces declarados,
 * onde o DOM armazena o atributo com localName="id".
 */
function getAttr(el: Element, localName: string): string | null {
  // Tentativa direta (funciona quando não há namespace)
  const direct = el.getAttribute(localName)
  if (direct !== null) return direct

  // Iteração por localName (funciona com namespaces declarados)
  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i]
    if (attr.localName === localName) return attr.value
  }
  return null
}
