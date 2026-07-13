// ADR: see Docs/specs/mvp-vertical-nubank.adr.md
/**
 * Teste de aceitação ponta-a-ponta — Task 7
 *
 * GATE MANUAL HUMANO (C1): O arquivo .xlsx gerado deve abrir no Excel real sem
 * prompt de reparo. Não automatizável via Vitest — requer abertura manual no Excel.
 *
 * GATE MANUAL HUMANO (C2): As fórmulas devem recalcular na abertura do Excel,
 * confirmado visualmente pelo saldo em B4 batendo com a soma dos valores.
 * A verificação automatizável de C2 (presença de `fullCalcOnLoad="1"` em
 * `xl/workbook.xml`) é coberta no teste "workbook.xml contém fullCalcOnLoad".
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { unzipSync, zipSync, strToU8 } from 'fflate'
import { extratoNubank } from '../../src/parsers/extrato_nubank'
import { enriquecerLancamento } from '../../src/dominio/dicionario'
import { gerarXlsx } from '../../src/excel/writer/gerador'
import { lerDicionario } from '../../src/excel/reader/leitor'
import type { Lancamento, DicEntry } from '../../src/types'

// ---------------------------------------------------------------------------
// Caminhos dos fixtures
// ---------------------------------------------------------------------------

const FIXTURE_CSV_PATH = resolve(__dirname, '../../legado/tests/fixtures/extrato_nubank.csv')
const MODELO_XLSX_PATH = resolve(__dirname, '../../Modelo.xlsx')

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function hashSha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

function decodePart(parts: Record<string, Uint8Array>, key: string): string {
  const data = parts[key]
  if (!data) throw new Error(`Parte não encontrada no ZIP: ${key}`)
  return new TextDecoder().decode(data)
}

/** Partes que gerarXlsx modifica cirurgicamente (declaradas na spec/ADR). */
const PARTES_MODIFICADAS = new Set([
  'xl/worksheets/sheet1.xml',
  'xl/worksheets/sheet2.xml',
  'xl/tables/table1.xml',
  'xl/workbook.xml',
])

/**
 * Constrói um ZIP OOXML mínimo com aba "Dicionario" para uso como dicionário
 * em testes de aceitação.
 *
 * Formato idêntico ao helper de leitor.test.ts — mantido local por se tratar
 * de código de teste. inlineStr evita dependência de sharedStrings.
 */
function criarXlsxDicionario(linhas: (string | number)[][]): Uint8Array {
  const colLetra = (idx: number): string => {
    let result = ''
    let n = idx
    do {
      result = String.fromCharCode(65 + (n % 26)) + result
      n = Math.floor(n / 26) - 1
    } while (n >= 0)
    return result
  }

  const COLUNAS_NUMERICAS = new Set(['vezes'])
  const COLUNAS_BOOLEANAS = new Set(['ambiguo'])
  const cabecalho = linhas[0] as string[]

  const buildCelula = (valor: string | number, linhaIdx: number, colIdx: number): string => {
    const ref = `${colLetra(colIdx)}${linhaIdx + 1}`
    const nomCol = cabecalho[colIdx]?.toLowerCase() ?? ''

    if (linhaIdx === 0) {
      return `<c r="${ref}" t="inlineStr"><is><t>${String(valor)}</t></is></c>`
    }
    if (COLUNAS_BOOLEANAS.has(nomCol)) {
      return `<c r="${ref}" t="inlineStr"><is><t>${String(valor)}</t></is></c>`
    }
    if (COLUNAS_NUMERICAS.has(nomCol)) {
      return `<c r="${ref}"><v>${String(valor)}</v></c>`
    }
    return `<c r="${ref}" t="inlineStr"><is><t>${String(valor)}</t></is></c>`
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
    <sheet name="Dicionario" sheetId="1" r:id="rId1"/>
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

// ---------------------------------------------------------------------------
// Caso 1 — Pipeline sem dicionário (extrato_nubank.csv real)
// ---------------------------------------------------------------------------

describe('E2E — Caso 1: pipeline completo sem dicionário', () => {
  let modeloBytes: Uint8Array
  let modeloParts: Record<string, Uint8Array>
  let lancamentos: Lancamento[]
  let linhasIgnoradas: number
  let resultadoBytes: Uint8Array
  let resultadoParts: Record<string, Uint8Array>

  const INICIAIS = 'ES'

  beforeAll(() => {
    modeloBytes = new Uint8Array(readFileSync(MODELO_XLSX_PATH))
    modeloParts = unzipSync(modeloBytes)

    const csvConteudo = readFileSync(FIXTURE_CSV_PATH, 'utf-8')
    const resultado = extratoNubank.parsear(csvConteudo)
    lancamentos = resultado.lancamentos
    linhasIgnoradas = resultado.linhasIgnoradas

    // Enriquecer sem dicionário → todos os campos em branco; iniciais = INICIAIS
    const lancamentosEnriquecidos = lancamentos.map((l) =>
      enriquecerLancamento(l, [], INICIAIS),
    )

    resultadoBytes = gerarXlsx(modeloBytes, INICIAIS, lancamentosEnriquecidos, [], 'TODO-mes')
    resultadoParts = unzipSync(resultadoBytes)
  })

  // TL-01
  it('fixture extrato_nubank.csv contém 4 lançamentos válidos e 0 linhas ignoradas', () => {
    expect(lancamentos).toHaveLength(4)
    expect(linhasIgnoradas).toBe(0)
  })

  // TL-02
  it('pipeline produz Uint8Array não-vazio', () => {
    expect(resultadoBytes.length).toBeGreaterThan(0)
  })

  // TL-03a: lançamento 1 presente em A8 (Fonte/Data/Transcrição)
  it('lançamento 1 (Transferência Pix enviada) presente em linha 8 da Tabela1', () => {
    const sheet1 = decodePart(resultadoParts, 'xl/worksheets/sheet1.xml')
    expect(sheet1).toContain('<c r="A8" s="42" t="inlineStr"><is><t>extrato_nubank</t></is></c>')
    expect(sheet1).toContain('<c r="B8" s="44" t="inlineStr"><is><t>2026-03-01</t></is></c>')
    expect(sheet1).toContain(
      '<c r="C8" s="41" t="inlineStr"><is><t>Transferência enviada pelo Pix - João</t></is></c>',
    )
    expect(sheet1).toContain('<c r="G8" s="43"><v>-150</v></c>')
  })

  // TL-03b: lançamento 2 presente em A9
  it('lançamento 2 (Transferência Pix recebida) presente em linha 9 da Tabela1', () => {
    const sheet1 = decodePart(resultadoParts, 'xl/worksheets/sheet1.xml')
    expect(sheet1).toContain('<c r="A9" s="42" t="inlineStr"><is><t>extrato_nubank</t></is></c>')
    expect(sheet1).toContain('<c r="B9" s="44" t="inlineStr"><is><t>2026-03-05</t></is></c>')
    expect(sheet1).toContain(
      '<c r="C9" s="41" t="inlineStr"><is><t>Transferência recebida pelo Pix - Salário</t></is></c>',
    )
    expect(sheet1).toContain('<c r="G9" s="43"><v>3500</v></c>')
  })

  // TL-03c: lançamento 3 presente em A10
  it('lançamento 3 (PAG BOLETO ENERGIA) presente em linha 10 da Tabela1', () => {
    const sheet1 = decodePart(resultadoParts, 'xl/worksheets/sheet1.xml')
    expect(sheet1).toContain('<c r="A10" s="42" t="inlineStr"><is><t>extrato_nubank</t></is></c>')
    expect(sheet1).toContain('<c r="B10" s="44" t="inlineStr"><is><t>2026-03-10</t></is></c>')
    expect(sheet1).toContain(
      '<c r="C10" s="41" t="inlineStr"><is><t>PAG BOLETO ENERGIA</t></is></c>',
    )
    expect(sheet1).toContain('<c r="G10" s="43"><v>-22.5</v></c>')
  })

  // TL-03d: lançamento 4 presente em A11
  it('lançamento 4 (Pagamento de fatura) presente em linha 11 da Tabela1', () => {
    const sheet1 = decodePart(resultadoParts, 'xl/worksheets/sheet1.xml')
    expect(sheet1).toContain('<c r="A11" s="42" t="inlineStr"><is><t>extrato_nubank</t></is></c>')
    expect(sheet1).toContain('<c r="B11" s="44" t="inlineStr"><is><t>2026-03-15</t></is></c>')
    expect(sheet1).toContain(
      '<c r="C11" s="41" t="inlineStr"><is><t>Pagamento de fatura</t></is></c>',
    )
    expect(sheet1).toContain('<c r="G11" s="43"><v>-1200</v></c>')
  })

  // TL-04: ref da Tabela1 ajustado para A7:G11 (4 lançamentos)
  it('ref da Tabela1 em table1.xml é A7:G11 para 4 lançamentos', () => {
    const table1 = decodePart(resultadoParts, 'xl/tables/table1.xml')
    expect(table1).toContain('ref="A7:G11"')
  })

  // TL-05: fullCalcOnLoad presente em workbook.xml
  it('workbook.xml contém fullCalcOnLoad="1"', () => {
    const workbook = decodePart(resultadoParts, 'xl/workbook.xml')
    expect(workbook).toContain('fullCalcOnLoad="1"')
    expect(workbook).toMatch(/<calcPr[^>]*fullCalcOnLoad="1"[^>]*\/>/)
  })

  // TL-06: SHA256 das partes não tocadas idêntico ao Modelo.xlsx
  it('SHA256 de todas as partes não tocadas é idêntico ao Modelo.xlsx original', () => {
    for (const parte of Object.keys(modeloParts)) {
      if (PARTES_MODIFICADAS.has(parte)) continue

      const hashOriginal = hashSha256(modeloParts[parte])
      const hashResultado = hashSha256(resultadoParts[parte])

      expect(hashResultado, `SHA256 da parte "${parte}" deve ser idêntico ao original`).toBe(
        hashOriginal,
      )
    }
  })
})

// ---------------------------------------------------------------------------
// Caso 2 — Pipeline com dicionário fornecido via fixture .xlsx
// ---------------------------------------------------------------------------

describe('E2E — Caso 2: pipeline com dicionário', () => {
  let modeloBytes: Uint8Array
  let lancamentos: Lancamento[]
  let dicEntries: DicEntry[]
  let resultadoParts: Record<string, Uint8Array>

  const INICIAIS = 'ES'

  /**
   * Dicionário para Caso 2:
   * - 'PAG BOLETO ENERGIA': não-ambígua → auto-preenche Natureza/Descrição/Iniciais
   * - 'Pagamento de fatura': ambígua → campos em branco
   * - 'Transferência enviada pelo Pix - João': ausente → campos em branco
   * - 'Transferência recebida pelo Pix - Salário': ausente → campos em branco
   */
  const LINHAS_DICIONARIO = [
    ['chave', 'fonte', 'natureza', 'descricao', 'iniciais', 'vezes', 'ambiguo'],
    ['PAG BOLETO ENERGIA', 'extrato_nubank', 'Moradia', 'Conta de luz', 'ES', 3, 'false'],
    ['Pagamento de fatura', 'extrato_nubank', 'Despesa', 'Fatura cartão', 'RM', 2, 'true'],
  ]

  beforeAll(() => {
    modeloBytes = new Uint8Array(readFileSync(MODELO_XLSX_PATH))

    const csvConteudo = readFileSync(FIXTURE_CSV_PATH, 'utf-8')
    lancamentos = extratoNubank.parsear(csvConteudo).lancamentos

    // Ler dicionário a partir de .xlsx sintético (simulando "arquivo do mês anterior")
    const dicionarioBytes = criarXlsxDicionario(LINHAS_DICIONARIO)
    dicEntries = lerDicionario(dicionarioBytes)

    // Enriquecer lançamentos com o dicionário
    const lancamentosEnriquecidos = lancamentos.map((l) =>
      enriquecerLancamento(l, dicEntries, INICIAIS),
    )

    const resultadoBytes = gerarXlsx(modeloBytes, INICIAIS, lancamentosEnriquecidos, dicEntries, 'TODO-mes')
    resultadoParts = unzipSync(resultadoBytes)
  })

  // TL-07: chave não-ambígua → Natureza/Descrição/Iniciais preenchidas
  it('lançamento com chave não-ambígua (PAG BOLETO ENERGIA) tem Natureza/Descrição/Iniciais preenchidas na linha 10', () => {
    const sheet1 = decodePart(resultadoParts, 'xl/worksheets/sheet1.xml')
    // E10 = Natureza
    expect(sheet1).toContain('<c r="E10" s="11" t="inlineStr"><is><t>Moradia</t></is></c>')
    // F10 = Descrição
    expect(sheet1).toContain('<c r="F10" s="11" t="inlineStr"><is><t>Conta de luz</t></is></c>')
    // D10 = Iniciais (vem do dicionário = 'ES')
    expect(sheet1).toContain('<c r="D10" s="41" t="inlineStr"><is><t>ES</t></is></c>')
  })

  // TL-08: chave ambígua → Natureza e Descrição em branco, Iniciais = usuário
  it('lançamento com chave ambígua (Pagamento de fatura) tem Natureza/Descrição em branco na linha 11', () => {
    const sheet1 = decodePart(resultadoParts, 'xl/worksheets/sheet1.xml')
    // E11 = Natureza em branco → célula genuinamente vazia (não inlineStr vazio),
    // para que a formatação condicional "Natureza vazia com dados" incida.
    expect(sheet1).toContain('<c r="E11" s="11"/>')
    // F11 = Descrição em branco
    expect(sheet1).toContain('<c r="F11" s="11"/>')
    // D11 = Iniciais = INICIAIS (default do usuário)
    expect(sheet1).toContain('<c r="D11" s="41" t="inlineStr"><is><t>ES</t></is></c>')
  })

  // TL-09: chave ausente → Natureza e Descrição em branco, Iniciais = usuário
  it('lançamento com chave ausente (Transferência Pix enviada) tem Natureza/Descrição em branco na linha 8', () => {
    const sheet1 = decodePart(resultadoParts, 'xl/worksheets/sheet1.xml')
    // E8 = Natureza em branco → célula genuinamente vazia (não inlineStr vazio).
    expect(sheet1).toContain('<c r="E8" s="11"/>')
    // F8 = Descrição em branco
    expect(sheet1).toContain('<c r="F8" s="11"/>')
    // D8 = Iniciais = INICIAIS (default)
    expect(sheet1).toContain('<c r="D8" s="41" t="inlineStr"><is><t>ES</t></is></c>')
  })

  // TL-10: aba Dicionario do ZIP contém as entradas do dicionário fornecido
  it('aba Dicionario do ZIP resultante contém as entradas do dicionário (2 entradas)', () => {
    const sheet2 = decodePart(resultadoParts, 'xl/worksheets/sheet2.xml')

    expect(dicEntries).toHaveLength(2)

    // Primeira entrada: PAG BOLETO ENERGIA
    expect(sheet2).toContain(
      '<c r="A2" t="inlineStr"><is><t>PAG BOLETO ENERGIA</t></is></c>',
    )
    expect(sheet2).toContain('<c r="C2" t="inlineStr"><is><t>Moradia</t></is></c>')

    // Segunda entrada: Pagamento de fatura
    expect(sheet2).toContain(
      '<c r="A3" t="inlineStr"><is><t>Pagamento de fatura</t></is></c>',
    )
  })
})
