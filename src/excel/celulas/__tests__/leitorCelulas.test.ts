// ADR: see spec/fatura-itau-xlsx.adr.md

import { describe, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { lerCelulas } from '../leitorCelulas'

// ---------------------------------------------------------------------------
// Helper: cria um .xlsx sintético mínimo com uma única aba, a partir de uma
// matriz de linhas. Mesmo padrão de src/excel/reader/__tests__/leitor.test.ts
// (célula inline via t="inlineStr"), mas sem depender de nomes de coluna —
// este módulo não sabe nada sobre o domínio da fatura.
// ---------------------------------------------------------------------------

function colLetra(idx: number): string {
  let result = ''
  let n = idx
  do {
    result = String.fromCharCode(65 + (n % 26)) + result
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return result
}

/**
 * Constrói um ZIP OOXML mínimo com uma aba chamada "Planilha1".
 *
 * @param linhas       Matriz esparsa: cada linha é um array de células, onde
 *                     `undefined` representa uma coluna ausente naquela linha.
 * @param linhasNumericas  Índices (0-based) de linhas cujas células devem ser
 *                     escritas como valor numérico puro (sem `t="inlineStr"`).
 */
function criarXlsxSimples(
  linhas: (string | undefined)[][],
  linhasNumericas: Set<number> = new Set(),
): Uint8Array {
  const buildCelula = (valor: string | undefined, linhaIdx: number, colIdx: number): string => {
    if (valor === undefined) return ''
    const ref = `${colLetra(colIdx)}${linhaIdx + 1}`
    if (linhasNumericas.has(linhaIdx)) {
      return `<c r="${ref}"><v>${valor}</v></c>`
    }
    return `<c r="${ref}" t="inlineStr"><is><t>${valor}</t></is></c>`
  }

  const buildLinhas = (): string =>
    linhas
      .map((linha, li) => {
        const celulas = linha.map((val, ci) => buildCelula(val, li, ci)).join('')
        return `<row r="${li + 1}">${celulas}</row>`
      })
      .join('')

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${buildLinhas()}</sheetData>
</worksheet>`

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Planilha1" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"
    Target="worksheets/sheet1.xml"/>
</Relationships>`

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml"
    ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml"
    ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="xl/workbook.xml"/>
</Relationships>`

  return zipSync({
    '[Content_Types].xml': strToU8(contentTypesXml),
    '_rels/.rels': strToU8(rootRelsXml),
    'xl/workbook.xml': strToU8(workbookXml),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRelsXml),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml),
  })
}

/** Constrói um workbook.xml sem nenhuma aba declarada (`<sheets>` vazio). */
function criarXlsxSemAbas(): Uint8Array {
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets></sheets>
</workbook>`

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml"
    ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
</Types>`

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="xl/workbook.xml"/>
</Relationships>`

  return zipSync({
    '[Content_Types].xml': strToU8(contentTypesXml),
    '_rels/.rels': strToU8(rootRelsXml),
    'xl/workbook.xml': strToU8(workbookXml),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRelsXml),
  })
}

describe('lerCelulas', () => {
  it('retorna matriz vazia para bytes vazios', () => {
    expect(lerCelulas(new Uint8Array(0))).toEqual([])
  })

  it('retorna matriz vazia para bytes que não formam um ZIP válido', () => {
    const bytesInvalidos = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    expect(lerCelulas(bytesInvalidos)).toEqual([])
  })

  it('extrai a matriz de células de uma fixture sintética simples', () => {
    const bytes = criarXlsxSimples([
      ['Data', 'Lançamento', 'Valor'],
      ['01/07/2026', 'Supermercado ABC', '150,00'],
      ['02/07/2026', 'Farmácia XYZ', '42,50'],
    ])

    const matriz = lerCelulas(bytes)

    expect(matriz).toEqual([
      ['Data', 'Lançamento', 'Valor'],
      ['01/07/2026', 'Supermercado ABC', '150,00'],
      ['02/07/2026', 'Farmácia XYZ', '42,50'],
    ])
  })

  it('preserva células ausentes no meio de uma linha esparsa como string vazia', () => {
    const bytes = criarXlsxSimples([
      ['A', 'B', 'C'],
      ['x', undefined, 'z'],
    ])

    const matriz = lerCelulas(bytes)

    expect(matriz[1]).toEqual(['x', '', 'z'])
  })

  it('extrai célula numérica pura (sem atributo t) como string do valor', () => {
    const bytes = criarXlsxSimples(
      [
        ['Quantidade'],
        ['42'],
      ],
      new Set([1]),
    )

    const matriz = lerCelulas(bytes)

    expect(matriz[1]).toEqual(['42'])
  })

  it('retorna matriz vazia quando o workbook não possui nenhuma aba', () => {
    const bytes = criarXlsxSemAbas()
    expect(lerCelulas(bytes)).toEqual([])
  })
})
