// ADR: see spec/fatura-itau-xlsx.adr.md

import { describe, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { aceita } from '../fatura_itau_cc'

// ---------------------------------------------------------------------------
// Helper: constrói um .xlsx OOXML mínimo com uma única aba nomeável e um
// conjunto arbitrário de linhas (mesmo padrão de
// src/excel/celulas/__tests__/leitorCelulas.test.ts), permitindo controlar
// livremente em que linha/coluna cai o cabeçalho — usado para provar que
// `aceita` não depende de posição fixa nem de nome de aba (Decisão 7 do ADR).
// ---------------------------------------------------------------------------

function celulaTexto(ref: string, texto: string): string {
  return `<c r="${ref}" t="inlineStr"><is><t>${texto}</t></is></c>`
}

function celulaNumero(ref: string, valor: number): string {
  return `<c r="${ref}"><v>${valor}</v></c>`
}

function construirXlsx(nomeAba: string, linhas: { numero: number; celulasXml: string }[]): Uint8Array {
  const sheetData = linhas
    .map(({ numero, celulasXml }) => `<row r="${numero}">${celulasXml}</row>`)
    .join('')

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetData}</sheetData>
</worksheet>`

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${nomeAba}" sheetId="1" r:id="rId1"/>
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

/** Cabeçalho da tabela da fatura (Data/Lançamento/Parcelamento/Valor), fora de qualquer posição fixa. */
function construirLinhaCabecalho(numero: number, colBase = 'B'): { numero: number; celulasXml: string } {
  const cols = ['B', 'C', 'D', 'E'].map((_, i) => String.fromCharCode(colBase.charCodeAt(0) + i))
  return {
    numero,
    celulasXml:
      celulaTexto(`${cols[0]}${numero}`, 'Data') +
      celulaTexto(`${cols[1]}${numero}`, 'Lançamento') +
      celulaTexto(`${cols[2]}${numero}`, 'Parcelamento') +
      celulaTexto(`${cols[3]}${numero}`, 'Valor'),
  }
}

function construirLinhaDado(numero: number, data: string, lancamento: string, valor: number, colBase = 'B'): {
  numero: number
  celulasXml: string
} {
  const cols = ['B', 'C', 'D', 'E'].map((_, i) => String.fromCharCode(colBase.charCodeAt(0) + i))
  return {
    numero,
    celulasXml:
      celulaTexto(`${cols[0]}${numero}`, data) +
      celulaTexto(`${cols[1]}${numero}`, lancamento) +
      celulaNumero(`${cols[3]}${numero}`, valor),
  }
}

function lerFixtureBytes(...segmentos: string[]): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.resolve(__dirname, ...segmentos)))
}

describe('fatura_itau_cc — aceita()', () => {
  it('retorna true para a fixture paga da fatura Itaú (cabeçalho na linha 14)', () => {
    const bytes = lerFixtureBytes('./fixtures/fatura_itau_cc_sintetica.xlsx')
    expect(aceita(bytes)).toBe(true)
  })

  it('retorna true para uma variante "em aberto" — sem bloco de pagamento no topo e com o cabeçalho fora da linha 14', () => {
    const bytes = construirXlsx('Fatura 09-26', [
      construirLinhaCabecalho(5),
      construirLinhaDado(6, '05/09/2026', 'Compra Loja Alfa', 120.5),
      construirLinhaDado(7, '10/09/2026', 'Compra Loja Beta', 89.9),
    ])
    expect(aceita(bytes)).toBe(true)
  })

  it('não depende do nome da aba: mesma tabela sob um nome de aba diferente ainda é aceita', () => {
    const bytes = construirXlsx('Fatura 12-26', [
      construirLinhaCabecalho(14),
      construirLinhaDado(15, '01/12/2026', 'Pagamento Debito Automatico', -500),
      construirLinhaDado(16, '02/12/2026', 'Compra Loja Gama', 200),
    ])
    expect(aceita(bytes)).toBe(true)
  })

  it.each([
    ['extrato_nubank_ponto.csv'],
    ['fatura_nubank_normal.csv'],
    ['extrato_itau_crlf.txt'],
    ['extrato_inter_normal.csv'],
    ['extrato_bb_conta_corrente.csv'],
  ])('retorna false para a fixture de texto %s (não é .xlsx)', (nomeArquivo) => {
    const bytes = lerFixtureBytes('./fixtures', nomeArquivo)
    expect(aceita(bytes)).toBe(false)
  })

  it('retorna false para a fixture de dicionário (Modelo.xlsx real, sem a tabela da fatura)', () => {
    const bytes = lerFixtureBytes('..', '..', '..', 'public', 'Modelo.xlsx')
    expect(aceita(bytes)).toBe(false)
  })

  it('retorna false sem lançar exceção para bytes vazios', () => {
    expect(() => aceita(new Uint8Array(0))).not.toThrow()
    expect(aceita(new Uint8Array(0))).toBe(false)
  })

  it('retorna false sem lançar exceção para bytes arbitrários que não formam um ZIP válido', () => {
    const bytesInvalidos = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    expect(() => aceita(bytesInvalidos)).not.toThrow()
    expect(aceita(bytesInvalidos)).toBe(false)
  })
})
