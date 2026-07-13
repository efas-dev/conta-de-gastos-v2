// ADR: see Docs/specs/mvp-vertical-nubank.adr.md
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { unzipSync } from 'fflate'
import { gerarXlsx } from '../gerador.js'
import type { Lancamento, DicEntry } from '../../../types.js'

const FIXTURE_PATH = resolve(__dirname, 'fixtures/Modelo.xlsx')

function hashSha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

function decodePart(parts: Record<string, Uint8Array>, key: string): string {
  const data = parts[key]
  if (!data) throw new Error(`Parte não encontrada: ${key}`)
  return new TextDecoder().decode(data)
}

// Partes que a injeção cirúrgica MODIFICA (as 4 declaradas na spec/ADR)
const PARTES_MODIFICADAS = new Set([
  'xl/worksheets/sheet1.xml',
  'xl/worksheets/sheet2.xml',
  'xl/tables/table1.xml',
  'xl/workbook.xml',
])

describe('gerarXlsx', () => {
  let modeloBytes: Uint8Array
  let modeloParts: Record<string, Uint8Array>

  beforeAll(() => {
    modeloBytes = new Uint8Array(readFileSync(FIXTURE_PATH))
    modeloParts = unzipSync(modeloBytes)
  })

  // Test List item 1: B2 recebe iniciais como inlineStr
  it('grava iniciais na célula B2 de sheet1.xml', () => {
    const lancamentos: Lancamento[] = []
    const dicEntries: DicEntry[] = []

    const resultado = gerarXlsx(modeloBytes, 'ES', lancamentos, dicEntries, '2026-06')
    const parts = unzipSync(resultado)
    const sheet1 = decodePart(parts, 'xl/worksheets/sheet1.xml')

    expect(sheet1).toContain('<c r="B2" s="40" t="inlineStr"><is><t>ES</t></is></c>')
  })

  // Test List item 2: B3 recebe mês de referência como inlineStr
  it('grava mês de referência na célula B3 de sheet1.xml como inlineStr', () => {
    const resultado = gerarXlsx(modeloBytes, 'ES', [], [], '2026-06')
    const parts = unzipSync(resultado)
    const sheet1 = decodePart(parts, 'xl/worksheets/sheet1.xml')

    expect(sheet1).toContain('<c r="B3" s="45" t="inlineStr"><is><t>2026-06</t></is></c>')
  })

  // Test List item 3: lançamento injetado em linha 9 (layout novo A9:H9)
  it('injeta lançamento em A9:H9 com colunas corretas (Fonte/Data/Transcrição/Ref./Iniciais/Natureza/Descrição/Valor)', () => {
    const lancamentos: Lancamento[] = [
      {
        fonte: 'Nubank',
        data: '2024-01-15',
        transcricao: 'Compra no Mercado',
        valor: -123.45,
        iniciais: 'ES',
        natureza: 'Alimentação',
        descricao: 'Supermercado',
      },
    ]
    const dicEntries: DicEntry[] = []

    const resultado = gerarXlsx(modeloBytes, 'ES', lancamentos, dicEntries, '2026-06')
    const parts = unzipSync(resultado)
    const sheet1 = decodePart(parts, 'xl/worksheets/sheet1.xml')

    // A9: Fonte
    expect(sheet1).toContain('<c r="A9" s="42" t="inlineStr"><is><t>Nubank</t></is></c>')
    // B9: Data
    expect(sheet1).toContain('<c r="B9" s="44" t="inlineStr"><is><t>2024-01-15</t></is></c>')
    // C9: Transcrição
    expect(sheet1).toContain('<c r="C9" s="41" t="inlineStr"><is><t>Compra no Mercado</t></is></c>')
    // D9: Ref. (mês de referência literal)
    expect(sheet1).toContain('<c r="D9" s="41" t="inlineStr"><is><t>2026-06</t></is></c>')
    // E9: Iniciais
    expect(sheet1).toContain('<c r="E9" s="41" t="inlineStr"><is><t>ES</t></is></c>')
    // F9: Natureza
    expect(sheet1).toContain('<c r="F9" s="11" t="inlineStr"><is><t>Alimentação</t></is></c>')
    // G9: Descrição
    expect(sheet1).toContain('<c r="G9" s="11" t="inlineStr"><is><t>Supermercado</t></is></c>')
    // H9: Valor numérico
    expect(sheet1).toContain('<c r="H9" s="43"><v>-123.45</v></c>')
  })

  // Test List item 4: ref da Tabela1 ajustado para A8:H{8+n} com n lançamentos
  it('ajusta ref da Tabela1 e autoFilter para A8:H{8+n} com n lançamentos', () => {
    const lancamentos: Lancamento[] = [
      { fonte: 'Nubank', data: '2024-01-01', transcricao: 'L1', valor: -10, iniciais: 'ES', natureza: '', descricao: '' },
      { fonte: 'Nubank', data: '2024-01-02', transcricao: 'L2', valor: -20, iniciais: 'ES', natureza: '', descricao: '' },
      { fonte: 'Nubank', data: '2024-01-03', transcricao: 'L3', valor: -30, iniciais: 'ES', natureza: '', descricao: '' },
    ]
    const dicEntries: DicEntry[] = []

    const resultado = gerarXlsx(modeloBytes, 'ES', lancamentos, dicEntries, '2026-06')
    const parts = unzipSync(resultado)
    const table1 = decodePart(parts, 'xl/tables/table1.xml')

    // 8 (header) + 3 (dados) = linha 11
    expect(table1).toContain('ref="A8:H11"')
    // autoFilter também deve ter ref atualizado
    expect(table1.match(/ref="A8:H11"/g)?.length).toBeGreaterThanOrEqual(2)
  })

  // Test List item 5: fullCalcOnLoad="1" em workbook.xml
  it('insere fullCalcOnLoad="1" em calcPr de workbook.xml', () => {
    const resultado = gerarXlsx(modeloBytes, 'ES', [], [], '2026-06')
    const parts = unzipSync(resultado)
    const workbook = decodePart(parts, 'xl/workbook.xml')

    expect(workbook).toContain('fullCalcOnLoad="1"')
    // Garante que está no elemento calcPr
    expect(workbook).toMatch(/<calcPr[^>]*fullCalcOnLoad="1"[^>]*\/>/)
  })

  // Test List item 6: aba Dicionario com entradas corretas
  it('injeta DicEntry em sheet2.xml com colunas chave/fonte/natureza/descricao/iniciais', () => {
    const dicEntries: DicEntry[] = [
      { chave: 'Compra Padaria', fonte: 'Nubank', natureza: 'Alimentação', descricao: 'Pão', iniciais: 'ES', vezes: 3, ambiguo: false },
      { chave: 'Transferência Pix', fonte: 'Nubank', natureza: 'Transferência', descricao: 'Repasse', iniciais: 'RM', vezes: 1, ambiguo: false },
    ]

    const resultado = gerarXlsx(modeloBytes, 'ES', [], dicEntries, '2026-06')
    const parts = unzipSync(resultado)
    const sheet2 = decodePart(parts, 'xl/worksheets/sheet2.xml')

    // Linha 2: primeira entrada
    expect(sheet2).toContain('<c r="A2" t="inlineStr"><is><t>Compra Padaria</t></is></c>')
    expect(sheet2).toContain('<c r="B2" t="inlineStr"><is><t>Nubank</t></is></c>')
    expect(sheet2).toContain('<c r="C2" t="inlineStr"><is><t>Alimentação</t></is></c>')
    expect(sheet2).toContain('<c r="D2" t="inlineStr"><is><t>Pão</t></is></c>')
    expect(sheet2).toContain('<c r="E2" t="inlineStr"><is><t>ES</t></is></c>')

    // Linha 3: segunda entrada
    expect(sheet2).toContain('<c r="A3" t="inlineStr"><is><t>Transferência Pix</t></is></c>')
    expect(sheet2).toContain('<c r="E3" t="inlineStr"><is><t>RM</t></is></c>')
  })

  // Test List item 7: SHA256 de partes não tocadas idêntico ao original
  it('preserva SHA256 de todas as partes não tocadas pela injeção', () => {
    const resultado = gerarXlsx(modeloBytes, 'ES', [], [], '2026-06')
    const resultParts = unzipSync(resultado)

    const partesOriginais = Object.keys(modeloParts)

    for (const parte of partesOriginais) {
      if (PARTES_MODIFICADAS.has(parte)) continue

      const hashOriginal = hashSha256(modeloParts[parte])
      const hashResultado = hashSha256(resultParts[parte])

      expect(hashResultado, `SHA256 da parte "${parte}" deve ser idêntico ao original`).toBe(hashOriginal)
    }
  })

  // Test List item 8: XML escape em valores com caracteres especiais
  it('escapa caracteres especiais XML em valores de células', () => {
    const lancamentos: Lancamento[] = [
      {
        fonte: 'Nubank',
        data: '2024-01-15',
        transcricao: 'Compra & Venda <Mercado> "Preferido"',
        valor: -50,
        iniciais: 'ES',
        natureza: '',
        descricao: '',
      },
    ]

    const resultado = gerarXlsx(modeloBytes, 'ES', lancamentos, [], '2026-06')
    const parts = unzipSync(resultado)
    const sheet1 = decodePart(parts, 'xl/worksheets/sheet1.xml')

    expect(sheet1).toContain('Compra &amp; Venda &lt;Mercado&gt; &quot;Preferido&quot;')
    // Não deve conter os caracteres brutos
    expect(sheet1).not.toContain('Compra & Venda <Mercado>')
  })

  // Test List item 9: lista vazia de lançamentos — ref A8:H8
  it('com zero lançamentos, ref da Tabela1 é A8:H8 (apenas cabeçalho)', () => {
    const resultado = gerarXlsx(modeloBytes, 'ES', [], [], '2026-06')
    const parts = unzipSync(resultado)
    const table1 = decodePart(parts, 'xl/tables/table1.xml')

    expect(table1).toContain('ref="A8:H8"')
  })

  // Test List item 10: mesReferencia vazio lança Error com "obrigatório"
  it('lança Error com "obrigatório" quando mesReferencia é string vazia', () => {
    expect(() => gerarXlsx(modeloBytes, 'ES', [], [], '')).toThrow(/obrigatório/i)
  })

  // Test List item 11: mesReferencia só whitespace também lança Error
  it('lança Error com "obrigatório" quando mesReferencia é só whitespace', () => {
    expect(() => gerarXlsx(modeloBytes, 'ES', [], [], '   ')).toThrow(/obrigatório/i)
  })

  // Test List item 12: mesReferencia válido não lança erro
  it('não lança erro quando mesReferencia é válido (ex.: "2025-07")', () => {
    expect(() => gerarXlsx(modeloBytes, 'ES', [], [], '2025-07')).not.toThrow()
  })

  // Test List item 13: erro explícito com argumento inválido conforme spec T5
  it('lança Error quando chamado com mesReferencia vazio mesmo com iniciais "AB"', () => {
    const lancamentos: Lancamento[] = []
    expect(() => gerarXlsx(modeloBytes, 'AB', lancamentos, [], '')).toThrow(/obrigatório/i)
  })
})
