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

    const resultado = gerarXlsx(modeloBytes, 'ES', lancamentos, dicEntries)
    const parts = unzipSync(resultado)
    const sheet1 = decodePart(parts, 'xl/worksheets/sheet1.xml')

    expect(sheet1).toContain('<c r="B2" s="40" t="inlineStr"><is><t>ES</t></is></c>')
  })

  // Test List item 2 e 3: colunas corretas em A8:G8
  it('injeta lançamento em A8:G8 com colunas corretas (Fonte/Data/Transcrição/Iniciais/Natureza/Descrição/Valor)', () => {
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

    const resultado = gerarXlsx(modeloBytes, 'ES', lancamentos, dicEntries)
    const parts = unzipSync(resultado)
    const sheet1 = decodePart(parts, 'xl/worksheets/sheet1.xml')

    // A8: Fonte
    expect(sheet1).toContain('<c r="A8" s="42" t="inlineStr"><is><t>Nubank</t></is></c>')
    // B8: Data
    expect(sheet1).toContain('<c r="B8" s="44" t="inlineStr"><is><t>2024-01-15</t></is></c>')
    // C8: Transcrição
    expect(sheet1).toContain('<c r="C8" s="41" t="inlineStr"><is><t>Compra no Mercado</t></is></c>')
    // D8: Iniciais
    expect(sheet1).toContain('<c r="D8" s="41" t="inlineStr"><is><t>ES</t></is></c>')
    // E8: Natureza
    expect(sheet1).toContain('<c r="E8" s="11" t="inlineStr"><is><t>Alimentação</t></is></c>')
    // F8: Descrição
    expect(sheet1).toContain('<c r="F8" s="11" t="inlineStr"><is><t>Supermercado</t></is></c>')
    // G8: Valor numérico
    expect(sheet1).toContain('<c r="G8" s="43"><v>-123.45</v></c>')
  })

  // Test List item 3: ref da Tabela1 ajustado para n lançamentos
  it('ajusta ref da Tabela1 e autoFilter para A7:G{7+n} com n lançamentos', () => {
    const lancamentos: Lancamento[] = [
      { fonte: 'Nubank', data: '2024-01-01', transcricao: 'L1', valor: -10, iniciais: 'ES', natureza: '', descricao: '' },
      { fonte: 'Nubank', data: '2024-01-02', transcricao: 'L2', valor: -20, iniciais: 'ES', natureza: '', descricao: '' },
      { fonte: 'Nubank', data: '2024-01-03', transcricao: 'L3', valor: -30, iniciais: 'ES', natureza: '', descricao: '' },
    ]
    const dicEntries: DicEntry[] = []

    const resultado = gerarXlsx(modeloBytes, 'ES', lancamentos, dicEntries)
    const parts = unzipSync(resultado)
    const table1 = decodePart(parts, 'xl/tables/table1.xml')

    // 7 (header) + 3 (dados) = linha 10
    expect(table1).toContain('ref="A7:G10"')
    // autoFilter também deve ter ref atualizado
    expect(table1.match(/ref="A7:G10"/g)?.length).toBeGreaterThanOrEqual(2)
  })

  // Test List item 4: fullCalcOnLoad="1" em workbook.xml
  it('insere fullCalcOnLoad="1" em calcPr de workbook.xml', () => {
    const resultado = gerarXlsx(modeloBytes, 'ES', [], [])
    const parts = unzipSync(resultado)
    const workbook = decodePart(parts, 'xl/workbook.xml')

    expect(workbook).toContain('fullCalcOnLoad="1"')
    // Garante que está no elemento calcPr
    expect(workbook).toMatch(/<calcPr[^>]*fullCalcOnLoad="1"[^>]*\/>/)
  })

  // Test List item 5: aba Dicionario com entradas corretas
  it('injeta DicEntry em sheet2.xml com colunas chave/fonte/natureza/descricao/iniciais', () => {
    const dicEntries: DicEntry[] = [
      { chave: 'Compra Padaria', fonte: 'Nubank', natureza: 'Alimentação', descricao: 'Pão', iniciais: 'ES', vezes: 3, ambiguo: false },
      { chave: 'Transferência Pix', fonte: 'Nubank', natureza: 'Transferência', descricao: 'Repasse', iniciais: 'RM', vezes: 1, ambiguo: false },
    ]

    const resultado = gerarXlsx(modeloBytes, 'ES', [], dicEntries)
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

  // Test List item 6: SHA256 de partes não tocadas idêntico ao original
  it('preserva SHA256 de todas as partes não tocadas pela injeção', () => {
    const resultado = gerarXlsx(modeloBytes, 'ES', [], [])
    const resultParts = unzipSync(resultado)

    const partesOriginais = Object.keys(modeloParts)

    for (const parte of partesOriginais) {
      if (PARTES_MODIFICADAS.has(parte)) continue

      const hashOriginal = hashSha256(modeloParts[parte])
      const hashResultado = hashSha256(resultParts[parte])

      expect(hashResultado, `SHA256 da parte "${parte}" deve ser idêntico ao original`).toBe(hashOriginal)
    }
  })

  // Test List item 7: XML escape em valores com caracteres especiais
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

    const resultado = gerarXlsx(modeloBytes, 'ES', lancamentos, [])
    const parts = unzipSync(resultado)
    const sheet1 = decodePart(parts, 'xl/worksheets/sheet1.xml')

    expect(sheet1).toContain('Compra &amp; Venda &lt;Mercado&gt; &quot;Preferido&quot;')
    // Não deve conter os caracteres brutos
    expect(sheet1).not.toContain('Compra & Venda <Mercado>')
  })

  // Test List item 8: lista vazia de lançamentos — ref A7:G7
  it('com zero lançamentos, ref da Tabela1 é A7:G7 (apenas cabeçalho)', () => {
    const resultado = gerarXlsx(modeloBytes, 'ES', [], [])
    const parts = unzipSync(resultado)
    const table1 = decodePart(parts, 'xl/tables/table1.xml')

    expect(table1).toContain('ref="A7:G7"')
  })
})
