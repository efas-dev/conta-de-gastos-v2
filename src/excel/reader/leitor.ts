// ADR: see Docs/specs/mvp-vertical-nubank.adr.md
// ADR: see Docs/specs/dicionario-ponta-a-ponta.adr.md

import { unzipSync } from 'fflate'
import type { DicEntry, NaturezaRica } from '../../types'

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
    // Normaliza acentos (NFD) e caixa para compatibilidade com títulos amigáveis
    // (ex.: "Descrição" → "descricao") e com cabeçalhos antigos sem acento.
    const text = normalizarTitulo(getCellText(cell, sharedStrings))
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

/**
 * Lê a aba "Naturezas" de um arquivo .xlsx (OOXML) e retorna as naturezas
 * enriquecidas (sigla, nome, descricao) das linhas 3 a 32.
 *
 * Colunas lidas: B (sigla), A (nome completo), F (descrição curta).
 * Linha 2 é o cabeçalho e é pulada (só processa linhas 3–32).
 * Linha com coluna F ausente ou vazia resulta em `descricao: ""`.
 * Linhas sem sigla em B são ignoradas.
 *
 * Segue o mesmo padrão de `lerDicionario`: descomprime com fflate, localiza
 * a planilha via workbook.xml + relacionamentos, parseia com DOMParser.
 *
 * Qualquer falha (bytes inválidos, aba ausente) retorna `[]` sem lançar.
 *
 * @param bytes  Conteúdo binário do arquivo .xlsx.
 * @returns      Array de NaturezaRica das linhas 3–32 com sigla não-vazia.
 */
export function lerNaturezas(bytes: Uint8Array): NaturezaRica[] {
  if (bytes.length === 0) return []

  let zip: Record<string, Uint8Array>
  try {
    zip = unzipSync(bytes) as Record<string, Uint8Array>
  } catch {
    return []
  }

  const decoder = new TextDecoder()

  // ----- 1. Localizar r:id da aba "Naturezas" em workbook.xml ---------------

  const workbookBytes = zip['xl/workbook.xml']
  if (!workbookBytes) return []

  let workbookDoc: Document
  try {
    workbookDoc = new DOMParser().parseFromString(
      decoder.decode(workbookBytes),
      'text/xml',
    )
  } catch {
    return []
  }

  const sheetEls = workbookDoc.getElementsByTagNameNS('*', 'sheet')
  let naturezasRid: string | null = null
  for (let i = 0; i < sheetEls.length; i++) {
    const el = sheetEls[i]
    if (el.getAttribute('name') === 'Naturezas') {
      naturezasRid = getAttr(el, 'id')
      break
    }
  }

  if (!naturezasRid) return []

  // ----- 2. Resolver o Target via workbook.xml.rels -------------------------

  const relsBytes = zip['xl/_rels/workbook.xml.rels']
  if (!relsBytes) return []

  let relsDoc: Document
  try {
    relsDoc = new DOMParser().parseFromString(
      decoder.decode(relsBytes),
      'text/xml',
    )
  } catch {
    return []
  }

  const relEls = relsDoc.getElementsByTagNameNS('*', 'Relationship')
  let sheetTarget: string | null = null
  for (let i = 0; i < relEls.length; i++) {
    const el = relEls[i]
    if (el.getAttribute('Id') === naturezasRid) {
      sheetTarget = el.getAttribute('Target')
      break
    }
  }

  if (!sheetTarget) return []

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
      // sem sharedStrings: células tipo "s" retornarão vazio
    }
  }

  // ----- 4. Carregar e parsear o XML da planilha ---------------------------

  const sheetPath = sheetTarget.startsWith('/')
    ? sheetTarget.slice(1)
    : `xl/${sheetTarget}`

  const sheetBytes = zip[sheetPath]
  if (!sheetBytes) return []

  let sheetDoc: Document
  try {
    sheetDoc = new DOMParser().parseFromString(
      decoder.decode(sheetBytes),
      'text/xml',
    )
  } catch {
    return []
  }

  // ----- 5. Extrair colunas A, B e F, linhas 3 a 32 -----------------------

  const ROW_MIN = 3
  const ROW_MAX = 32

  const rowEls = sheetDoc.getElementsByTagNameNS('*', 'row')
  const result: NaturezaRica[] = []

  for (let i = 0; i < rowEls.length; i++) {
    const rowEl = rowEls[i]
    const rowNum = parseInt(rowEl.getAttribute('r') ?? '0', 10)
    if (rowNum < ROW_MIN || rowNum > ROW_MAX) continue

    // Extrair valores das colunas A, B e F desta linha
    let sigla = ''
    let nome = ''
    let descricao = ''

    const cellEls = rowEl.getElementsByTagNameNS('*', 'c')
    for (let j = 0; j < cellEls.length; j++) {
      const cell = cellEls[j]
      const ref = cell.getAttribute('r') ?? ''
      const col = colLetterFromRef(ref)
      if (col === 'A') {
        nome = getCellText(cell, sharedStrings).trim()
      } else if (col === 'B') {
        sigla = getCellText(cell, sharedStrings).trim()
      } else if (col === 'F') {
        descricao = getCellText(cell, sharedStrings).trim()
      }
    }

    // Ignora linhas sem sigla em B
    if (!sigla) continue

    result.push({ sigla, nome, descricao })
  }

  return result
}

// ---------------------------------------------------------------------------
// ehDicionario
// ---------------------------------------------------------------------------

/**
 * Detecta se um arquivo .xlsx contém uma aba "Dicionario" legível.
 *
 * Estratégia: tenta ler a aba Dicionario via `lerDicionario`; qualquer
 * resultado (inclusive []) indica que a aba existe e foi parseada com sucesso.
 * Falha de parse ou aba ausente retorna false.
 *
 * Não usa o resultado de lerDicionario — o critério é apenas se a tentativa
 * de leitura chegou até o final sem erro (aba presente e parseável).
 *
 * @param bytes  Conteúdo binário do arquivo .xlsx.
 * @returns      true se a aba "Dicionario" existe e é legível, false caso contrário.
 */
export function ehDicionario(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false

  let zip: Record<string, Uint8Array>
  try {
    zip = unzipSync(bytes) as Record<string, Uint8Array>
  } catch {
    return false
  }

  const decoder = new TextDecoder()

  const workbookBytes = zip['xl/workbook.xml']
  if (!workbookBytes) return false

  let workbookDoc: Document
  try {
    workbookDoc = new DOMParser().parseFromString(
      decoder.decode(workbookBytes),
      'text/xml',
    )
  } catch {
    return false
  }

  const sheetEls = workbookDoc.getElementsByTagNameNS('*', 'sheet')
  let dicionarioRid: string | null = null
  for (let i = 0; i < sheetEls.length; i++) {
    const el = sheetEls[i]
    if (el.getAttribute('name') === 'Dicionario') {
      dicionarioRid = getAttr(el, 'id')
      break
    }
  }

  return dicionarioRid !== null
}

// ---------------------------------------------------------------------------
// lerIniciais
// ---------------------------------------------------------------------------

/**
 * Lê a célula B2 da aba "Extrato" de um arquivo .xlsx.
 *
 * Usada ao importar um dicionário exportado pela app: a aba Extrato contém
 * as iniciais do usuário em B2 (inseridas pelo writer em gerador.ts:73-76).
 *
 * @param bytes  Conteúdo binário do arquivo .xlsx.
 * @returns      String da célula B2 ou null se vazia, ausente ou erro de parse.
 */
export function lerIniciais(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return null

  let zip: Record<string, Uint8Array>
  try {
    zip = unzipSync(bytes) as Record<string, Uint8Array>
  } catch {
    return null
  }

  const decoder = new TextDecoder()

  const workbookBytes = zip['xl/workbook.xml']
  if (!workbookBytes) return null

  let workbookDoc: Document
  try {
    workbookDoc = new DOMParser().parseFromString(
      decoder.decode(workbookBytes),
      'text/xml',
    )
  } catch {
    return null
  }

  // Localizar r:id da aba "Extrato"
  const sheetEls = workbookDoc.getElementsByTagNameNS('*', 'sheet')
  let extratoRid: string | null = null
  for (let i = 0; i < sheetEls.length; i++) {
    const el = sheetEls[i]
    if (el.getAttribute('name') === 'Extrato') {
      extratoRid = getAttr(el, 'id')
      break
    }
  }

  if (!extratoRid) return null

  // Resolver Target via workbook.xml.rels
  const relsBytes = zip['xl/_rels/workbook.xml.rels']
  if (!relsBytes) return null

  let relsDoc: Document
  try {
    relsDoc = new DOMParser().parseFromString(
      decoder.decode(relsBytes),
      'text/xml',
    )
  } catch {
    return null
  }

  const relEls = relsDoc.getElementsByTagNameNS('*', 'Relationship')
  let sheetTarget: string | null = null
  for (let i = 0; i < relEls.length; i++) {
    const el = relEls[i]
    if (el.getAttribute('Id') === extratoRid) {
      sheetTarget = el.getAttribute('Target')
      break
    }
  }

  if (!sheetTarget) return null

  // Carregar sharedStrings opcionalmente
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
      // sem sharedStrings: células tipo "s" retornarão vazio
    }
  }

  // Carregar a planilha da aba Extrato
  const sheetPath = sheetTarget.startsWith('/')
    ? sheetTarget.slice(1)
    : `xl/${sheetTarget}`

  const sheetBytes = zip[sheetPath]
  if (!sheetBytes) return null

  let sheetDoc: Document
  try {
    sheetDoc = new DOMParser().parseFromString(
      decoder.decode(sheetBytes),
      'text/xml',
    )
  } catch {
    return null
  }

  // Localizar a célula B2
  const rowEls = sheetDoc.getElementsByTagNameNS('*', 'row')
  for (let i = 0; i < rowEls.length; i++) {
    const rowEl = rowEls[i]
    const rowNum = parseInt(rowEl.getAttribute('r') ?? '0', 10)
    if (rowNum !== 2) continue

    const cellEls = rowEl.getElementsByTagNameNS('*', 'c')
    for (let j = 0; j < cellEls.length; j++) {
      const cell = cellEls[j]
      const ref = cell.getAttribute('r') ?? ''
      if (colLetterFromRef(ref) !== 'B') continue
      const val = getCellText(cell, sharedStrings).trim()
      return val || null
    }
    break // linha 2 encontrada mas sem célula B2
  }

  return null
}

// ---------------------------------------------------------------------------
// Utilitários internos
// ---------------------------------------------------------------------------

/**
 * Normaliza um título de coluna para comparação: remove acentos via NFD e
 * converte para minúsculas. Permite casar "Descrição" com "descricao" e
 * "CHAVE" com "chave", garantindo compatibilidade retroativa com dicionários
 * exportados com e sem acento.
 */
function normalizarTitulo(titulo: string): string {
  // NFD decompõe caracteres acentuados em base + diacrítico (ex.: ç → c + ̧).
  // O replace elimina os diacríticos (U+0300–U+036F), deixando apenas a base.
  return titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

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
