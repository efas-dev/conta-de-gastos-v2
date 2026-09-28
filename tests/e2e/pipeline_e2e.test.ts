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
import { aprenderDicionario } from '../../src/dominio/aprendizado'
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
 * Remove `tabSelected` de um XML de worksheet antes da comparação de hash.
 *
 * Espelha o helper de mesmo nome em `src/excel/writer/__tests__/gerador.test.ts`
 * — ver lá o racional completo. Em resumo: o gerador limpa `tabSelected` de toda
 * aba que não seja a Extrato de propósito (duas abas selecionadas = grupo, e em
 * modo grupo o Excel bloqueia editar/excluir linhas). `tabSelected` é estado de
 * janela, não conteúdo, então normalizá-lo preserva a garantia que importa.
 */
function semTabSelected(data: Uint8Array): Uint8Array {
  const xml = new TextDecoder().decode(data)
  return new TextEncoder().encode(xml.replace(/\s+tabSelected="[^"]*"/g, ''))
}

const ehWorksheet = (parte: string) => /^xl\/worksheets\/sheet\d+\.xml$/.test(parte)

/**
 * Extrai o XML de UMA célula pela referência, qualquer que seja o índice de estilo.
 *
 * Espelha o helper de mesmo nome em `src/excel/writer/__tests__/gerador.test.ts` — ver lá o
 * racional completo. Em resumo: o `s="…"` é posição na tabela `cellXfs` do `styles.xml`, que o
 * Excel renumera a cada salvamento do Modelo, então asserção ancorada no número vira vermelho a
 * cada re-save legítimo.
 */
function celula(xml: string, ref: string): string {
  const achado = xml.match(new RegExp(`<c r="${ref}"(?:[^>]*?/>|[^>]*?>[\\s\\S]*?</c>)`))
  if (!achado) throw new Error(`Célula ${ref} não encontrada no XML`)
  return achado[0]
}

/** Índice de estilo que o Modelo declara para a célula — o gerado precisa preservá-lo. */
function estiloNoModelo(modeloParts: Record<string, Uint8Array>, ref: string): string {
  const s = celula(decodePart(modeloParts, 'xl/worksheets/sheet1.xml'), ref).match(/\bs="(\d+)"/)
  if (!s) throw new Error(`Célula ${ref} do Modelo não tem atributo s`)
  return s[1]
}

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

    resultadoBytes = gerarXlsx(modeloBytes, INICIAIS, lancamentosEnriquecidos, [], '2026-03')
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

  /**
   * TL-03: cada lançamento na sua linha, coluna por coluna — layout do Modelo de 2026-09-28
   * (`Tabela1` = `A8:I504`): A Fonte · B Data · C Transcrição · D Ref. · E Mês · F Descrição ·
   * G Valor · H Natureza · I Iniciais. Sem dicionário, Natureza e Descrição saem em branco.
   */
  const ESPERADOS = [
    { linha: 9, data: '2026-03-01', transcricao: 'Transferência enviada pelo Pix - João', valor: -150 },
    { linha: 10, data: '2026-03-05', transcricao: 'Transferência recebida pelo Pix - Salário', valor: 3500 },
    { linha: 11, data: '2026-03-10', transcricao: 'PAG BOLETO ENERGIA', valor: -22.5 },
    { linha: 12, data: '2026-03-15', transcricao: 'Pagamento de fatura', valor: -1200 },
  ]

  for (const { linha, data, transcricao, valor } of ESPERADOS) {
    it(`lançamento de "${transcricao}" ocupa a linha ${linha} da Tabela1 com as 9 colunas certas`, () => {
      const sheet1 = decodePart(resultadoParts, 'xl/worksheets/sheet1.xml')
      const s = (ref: string) => estiloNoModelo(modeloParts, ref)
      const em = (col: string) => celula(sheet1, `${col}${linha}`)

      expect(em('A')).toBe(`<c r="A${linha}" s="${s(`A${linha}`)}" t="inlineStr"><is><t>extrato_nubank</t></is></c>`)
      expect(em('B')).toBe(`<c r="B${linha}" s="${s(`B${linha}`)}" t="inlineStr"><is><t>${data}</t></is></c>`)
      expect(em('C')).toBe(`<c r="C${linha}" s="${s(`C${linha}`)}" t="inlineStr"><is><t>${transcricao}</t></is></c>`)
      expect(em('D')).toBe(`<c r="D${linha}" s="${s(`D${linha}`)}" t="inlineStr"><is><t>2026-03</t></is></c>`)
      // E = Mês: número 3, derivado da referência 2026-03
      expect(em('E')).toBe(`<c r="E${linha}" s="${s(`E${linha}`)}"><v>3</v></c>`)
      expect(em('G')).toBe(`<c r="G${linha}" s="${s(`G${linha}`)}"><v>${valor}</v></c>`)
      // I = Iniciais (default do usuário, sem dicionário)
      expect(em('I')).toBe(`<c r="I${linha}" s="${s(`I${linha}`)}" t="inlineStr"><is><t>${INICIAIS}</t></is></c>`)
      // Sem dicionário: Natureza (H) e Descrição (F) ficam GENUINAMENTE vazias — é isso que
      // faz a formatação condicional "Natureza vazia com dados na linha" incidir.
      expect(em('F')).toBe(`<c r="F${linha}" s="${s(`F${linha}`)}"/>`)
      expect(em('H')).toBe(`<c r="H${linha}" s="${s(`H${linha}`)}"/>`)
    })
  }

  // TL-04: ref da Tabela1 ajustado para A8:I12 (4 lançamentos, cabeçalho linha 8)
  it('ref da Tabela1 em table1.xml é A8:I12 para 4 lançamentos', () => {
    const table1 = decodePart(resultadoParts, 'xl/tables/table1.xml')
    expect(table1).toContain('ref="A8:I12"')
  })

  // TL-04b: B3 contém o mês de referência como inlineStr
  it('B3 contém o mês de referência "2026-03" como inlineStr', () => {
    const sheet1 = decodePart(resultadoParts, 'xl/worksheets/sheet1.xml')
    expect(celula(sheet1, 'B3')).toBe(
      `<c r="B3" s="${estiloNoModelo(modeloParts, 'B3')}" t="inlineStr"><is><t>2026-03</t></is></c>`,
    )
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

      const normalizar = ehWorksheet(parte) ? semTabSelected : (x: Uint8Array) => x

      const hashOriginal = hashSha256(normalizar(modeloParts[parte]))
      const hashResultado = hashSha256(normalizar(resultadoParts[parte]))

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
  let modeloParts: Record<string, Uint8Array>
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
    modeloParts = unzipSync(modeloBytes)

    const csvConteudo = readFileSync(FIXTURE_CSV_PATH, 'utf-8')
    lancamentos = extratoNubank.parsear(csvConteudo).lancamentos

    // Ler dicionário a partir de .xlsx sintético (simulando "arquivo do mês anterior")
    const dicionarioBytes = criarXlsxDicionario(LINHAS_DICIONARIO)
    dicEntries = lerDicionario(dicionarioBytes)

    // Enriquecer lançamentos com o dicionário
    const lancamentosEnriquecidos = lancamentos.map((l) =>
      enriquecerLancamento(l, dicEntries, INICIAIS),
    )

    const resultadoBytes = gerarXlsx(modeloBytes, INICIAIS, lancamentosEnriquecidos, dicEntries, '2026-03')
    resultadoParts = unzipSync(resultadoBytes)
  })

  // TL-07: chave não-ambígua → Natureza/Descrição/Iniciais preenchidas (linha 11)
  it('lançamento com chave não-ambígua (PAG BOLETO ENERGIA) tem Natureza/Descrição/Iniciais preenchidas na linha 11', () => {
    const sheet1 = decodePart(resultadoParts, 'xl/worksheets/sheet1.xml')
    const s = (ref: string) => estiloNoModelo(modeloParts, ref)

    // I11 = Iniciais (vem do dicionário = 'ES')
    expect(celula(sheet1, 'I11')).toBe(`<c r="I11" s="${s('I11')}" t="inlineStr"><is><t>ES</t></is></c>`)
    // H11 = Natureza (caixa alta na grid — item 28)
    expect(celula(sheet1, 'H11')).toBe(`<c r="H11" s="${s('H11')}" t="inlineStr"><is><t>MORADIA</t></is></c>`)
    // F11 = Descrição
    expect(celula(sheet1, 'F11')).toBe(`<c r="F11" s="${s('F11')}" t="inlineStr"><is><t>Conta de luz</t></is></c>`)
  })

  // TL-08: chave ambígua → Natureza e Descrição em branco, Iniciais = usuário (linha 12)
  it('lançamento com chave ambígua (Pagamento de fatura) tem Natureza/Descrição em branco na linha 12', () => {
    const sheet1 = decodePart(resultadoParts, 'xl/worksheets/sheet1.xml')
    const s = (ref: string) => estiloNoModelo(modeloParts, ref)

    // I12 = Iniciais = INICIAIS (default do usuário)
    expect(celula(sheet1, 'I12')).toBe(`<c r="I12" s="${s('I12')}" t="inlineStr"><is><t>ES</t></is></c>`)
    // H12 = Natureza em branco → célula genuinamente vazia (não inlineStr vazio),
    // para que a formatação condicional "Natureza vazia com dados" incida.
    expect(celula(sheet1, 'H12')).toBe(`<c r="H12" s="${s('H12')}"/>`)
    // F12 = Descrição em branco
    expect(celula(sheet1, 'F12')).toBe(`<c r="F12" s="${s('F12')}"/>`)
  })

  // TL-09: chave ausente → Natureza e Descrição em branco, Iniciais = usuário (linha 9)
  it('lançamento com chave ausente (Transferência Pix enviada) tem Natureza/Descrição em branco na linha 9', () => {
    const sheet1 = decodePart(resultadoParts, 'xl/worksheets/sheet1.xml')
    const s = (ref: string) => estiloNoModelo(modeloParts, ref)

    // I9 = Iniciais = INICIAIS (default)
    expect(celula(sheet1, 'I9')).toBe(`<c r="I9" s="${s('I9')}" t="inlineStr"><is><t>ES</t></is></c>`)
    // H9 = Natureza em branco → célula genuinamente vazia (não inlineStr vazio).
    expect(celula(sheet1, 'H9')).toBe(`<c r="H9" s="${s('H9')}"/>`)
    // F9 = Descrição em branco
    expect(celula(sheet1, 'F9')).toBe(`<c r="F9" s="${s('F9')}"/>`)
  })

  // TL-10: aba Dicionario do ZIP contém as entradas do dicionário fornecido
  it('aba Dicionario do ZIP resultante contém as entradas do dicionário (2 entradas)', () => {
    const sheet2 = decodePart(resultadoParts, 'xl/worksheets/sheet2.xml')

    expect(dicEntries).toHaveLength(2)

    // Primeira entrada: PAG BOLETO ENERGIA
    expect(sheet2).toContain(
      '<c r="A2" t="inlineStr"><is><t>PAG BOLETO ENERGIA</t></is></c>',
    )
    // O writer grava o que recebe (aqui o dicionário cru, sem aprendizado);
    // no app real o dicionário passa por aprenderDicionario, que normaliza a
    // natureza para caixa alta (item 28 — coberto em TL28-6)
    expect(sheet2).toContain('<c r="C2" t="inlineStr"><is><t>Moradia</t></is></c>')

    // Segunda entrada: Pagamento de fatura
    expect(sheet2).toContain(
      '<c r="A3" t="inlineStr"><is><t>Pagamento de fatura</t></is></c>',
    )
  })
})

// ---------------------------------------------------------------------------
// Caso 3 — Round-trip da frequência do dicionário: vezes N → N+1
// ---------------------------------------------------------------------------

describe('E2E — Caso 3: round-trip de frequência do dicionário (vezes=3 → vezes=4)', () => {
  const INICIAIS = 'ES'
  const CHAVE_TESTE = 'PAG BOLETO ENERGIA'

  // Entrada inicial com vezes=3
  const dicInicial: DicEntry[] = [
    {
      chave: CHAVE_TESTE,
      fonte: 'extrato_nubank',
      natureza: 'Moradia',
      descricao: 'Conta de luz',
      iniciais: INICIAIS,
      vezes: 3,
      ambiguo: false,
    },
  ]

  // Lançamento com transcrição idêntica à chave (sem sufixo de data)
  // para que aprenderDicionario case via normalizarChave(transcricao) === chave
  const lancamentoRound: Lancamento = {
    fonte: 'extrato_nubank',
    data: '2026-07-01',
    transcricao: CHAVE_TESTE,
    valor: -22.5,
    iniciais: INICIAIS,
    natureza: 'Moradia',
    descricao: 'Conta de luz',
  }

  let modeloBytes: Uint8Array

  beforeAll(() => {
    modeloBytes = new Uint8Array(readFileSync(MODELO_XLSX_PATH))
  })

  // TL4-1: gerarXlsx com vezes=3 → lerDicionario confirma vezes=3
  it('lerDicionario sobre .xlsx gerado com vezes=3 retorna entry com vezes=3', () => {
    const xlsxV3 = gerarXlsx(modeloBytes, INICIAIS, [], dicInicial, '2026-07')
    const entriesV3 = lerDicionario(xlsxV3)

    expect(entriesV3).toHaveLength(1)
    expect(entriesV3[0].chave).toBe(CHAVE_TESTE)
    expect(entriesV3[0].vezes).toBe(3)
  })

  // TL4-2: aprenderDicionario com padrão idêntico incrementa vezes para 4
  it('aprenderDicionario com lançamento de padrão idêntico incrementa vezes de 3 para 4', () => {
    const xlsxV3 = gerarXlsx(modeloBytes, INICIAIS, [], dicInicial, '2026-07')
    const entriesV3 = lerDicionario(xlsxV3)

    const entriesV4 = aprenderDicionario([lancamentoRound], entriesV3)

    expect(entriesV4).toHaveLength(1)
    expect(entriesV4[0].vezes).toBe(4)
    expect(entriesV4[0].ambiguo).toBe(false)
  })

  // TL4-3: novo gerarXlsx com vezes=4 → lerDicionario confirma vezes=4
  it('lerDicionario sobre .xlsx regenerado com vezes=4 confirma vezes=4 (round-trip completo)', () => {
    const xlsxV3 = gerarXlsx(modeloBytes, INICIAIS, [], dicInicial, '2026-07')
    const entriesV3 = lerDicionario(xlsxV3)

    const entriesV4 = aprenderDicionario([lancamentoRound], entriesV3)

    const xlsxV4 = gerarXlsx(modeloBytes, INICIAIS, [], entriesV4, '2026-07')
    const entriesConfirmados = lerDicionario(xlsxV4)

    expect(entriesConfirmados).toHaveLength(1)
    expect(entriesConfirmados[0].chave).toBe(CHAVE_TESTE)
    expect(entriesConfirmados[0].vezes).toBe(4)
    expect(entriesConfirmados[0].ambiguo).toBe(false)
  })
})
