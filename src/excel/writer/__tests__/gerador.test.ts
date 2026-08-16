// ADR: see Docs/specs/mvp-vertical-nubank.adr.md
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { unzipSync, zipSync } from 'fflate'
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

/**
 * Remove o atributo `tabSelected` de um XML de worksheet.
 *
 * O gerador limpa `tabSelected` de toda aba que não seja a Extrato — não é
 * efeito colateral, é defesa deliberada (ver `gerador.ts`, passo 5): duas abas
 * selecionadas viram GRUPO no Excel, e em modo grupo o Excel bloqueia editar e
 * excluir linhas. Se o humano salvar o Modelo com outra aba ativa, essa limpeza
 * passa a alterar aquela aba.
 *
 * A garantia que este teste existe para proteger é "nenhum conteúdo, fórmula ou
 * estilo das abas não escritas muda" — e `tabSelected` é estado de janela, não
 * conteúdo. Normalizar antes de comparar mantém a garantia real sem transformar
 * um salvamento legítimo do Modelo em falso vermelho.
 */
function semTabSelected(data: Uint8Array): Uint8Array {
  const xml = new TextDecoder().decode(data)
  return new TextEncoder().encode(xml.replace(/\s+tabSelected="[^"]*"/g, ''))
}

const ehWorksheet = (parte: string) => /^xl\/worksheets\/sheet\d+\.xml$/.test(parte)

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

  // Item 19 do TODO: o gerado deve abrir na aba Extrato, não na Dicionario
  it('força a aba Extrato ativa: activeTab="0" no workbook e tabSelected movido de sheet2 para sheet1', () => {
    const resultado = gerarXlsx(modeloBytes, 'ES', [], [], '2026-06')
    const parts = unzipSync(resultado)

    // workbook.xml: aba ativa é a primeira (Extrato) — o Modelo vem salvo com activeTab="1"
    expect(decodePart(parts, 'xl/workbook.xml')).toMatch(/<workbookView[^>]*activeTab="0"/)
    // sheet1 (Extrato) ganha a seleção; sheet2 (Dicionario) perde a que o Modelo carregava
    expect(decodePart(parts, 'xl/worksheets/sheet1.xml')).toMatch(/<sheetView[^>]*tabSelected="1"/)
    expect(decodePart(parts, 'xl/worksheets/sheet2.xml')).not.toContain('tabSelected')
  })

  // Regressão (2026-08-04): o .xlsx exportado saía com abas AGRUPADAS (sheet1 +
  // sheet3 selecionadas) porque o Modelo tinha tabSelected="1" na sheet3 e o writer
  // só tratava sheet1/sheet2. Em modo grupo o Excel bloqueia editar/excluir linhas.
  // Guard: SÓ a Extrato (sheet1) pode ficar selecionada no gerado.
  it('TL-GRUPO-1: seleção única — nenhuma aba além da Extrato fica selecionada no gerado', () => {
    const resultado = gerarXlsx(modeloBytes, 'ES', [], [], '2026-06')
    const parts = unzipSync(resultado)
    const selecionadas = Object.keys(parts)
      .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
      .filter((k) => decodePart(parts, k).includes('tabSelected'))
    expect(selecionadas).toEqual(['xl/worksheets/sheet1.xml'])
  })

  // Endurecimento: mesmo que o Modelo venha salvo AGRUPADO (sheet3 com
  // tabSelected="1"), o gerado deve sair com seleção única. Trava a causa raiz.
  it('TL-GRUPO-2: Modelo salvo agrupado (sheet3 selecionada) gera export desagrupado', () => {
    // Sintetiza um Modelo agrupado: injeta tabSelected="1" na sheetView da sheet3.
    const grupoParts = { ...modeloParts }
    const sheet3 = new TextDecoder().decode(modeloParts['xl/worksheets/sheet3.xml'])
    const sheet3Agrupada = sheet3.replace(
      /<sheetView\b(?![^>]*tabSelected)/,
      '<sheetView tabSelected="1"',
    )
    expect(sheet3Agrupada).toContain('tabSelected="1"') // garante que a síntese funcionou
    grupoParts['xl/worksheets/sheet3.xml'] = new TextEncoder().encode(sheet3Agrupada)
    const modeloAgrupado = zipSync(grupoParts)

    const resultado = gerarXlsx(modeloAgrupado, 'ES', [], [], '2026-06')
    const parts = unzipSync(resultado)

    expect(decodePart(parts, 'xl/worksheets/sheet1.xml')).toMatch(/tabSelected="1"/)
    expect(decodePart(parts, 'xl/worksheets/sheet3.xml')).not.toContain('tabSelected')
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

      // Worksheets são comparadas sem `tabSelected` (estado de janela, não
      // conteúdo) — ver `semTabSelected`. Demais partes: byte a byte.
      const normalizar = ehWorksheet(parte) ? semTabSelected : (x: Uint8Array) => x

      const hashOriginal = hashSha256(normalizar(modeloParts[parte]))
      const hashResultado = hashSha256(normalizar(resultParts[parte]))

      expect(hashResultado, `SHA256 da parte "${parte}" deve ser idêntico ao original`).toBe(hashOriginal)
    }
  })

  // Contrapartida do relaxamento acima: o que `semTabSelected` deixa de checar
  // vira asserção explícita aqui, para a normalização não virar buraco cego.
  it('deixa apenas a aba Extrato selecionada, mesmo se o Modelo foi salvo com outra aba ativa', () => {
    const resultado = gerarXlsx(modeloBytes, 'ES', [], [], '2026-06')
    const resultParts = unzipSync(resultado)

    const selecionadas = Object.keys(resultParts)
      .filter(ehWorksheet)
      .filter((p) => decodePart(resultParts, p).includes('tabSelected'))

    expect(selecionadas).toEqual(['xl/worksheets/sheet1.xml'])
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

// --- T2: cabeçalho amigável e colunas F/G em gerarSheetDataDicionario ---
describe('gerarSheetDataDicionario via gerarXlsx — cabeçalho e colunas Vezes/Ambíguo', () => {
  let modeloBytes: Uint8Array

  beforeAll(() => {
    modeloBytes = new Uint8Array(readFileSync(FIXTURE_PATH))
  })

  // Test List T2-1: linha 1 com 7 títulos amigáveis na ordem correta
  it('emite linha 1 com os 7 títulos amigáveis na ordem: Chave, Fonte, Natureza, Descrição, Iniciais, Vezes, Ambíguo', () => {
    const dicEntries: DicEntry[] = [
      { chave: 'Mercado', fonte: 'Nubank', natureza: 'Alimentação', descricao: 'Supermercado', iniciais: 'ES', vezes: 2, ambiguo: false },
    ]
    const resultado = gerarXlsx(modeloBytes, 'ES', [], dicEntries, '2026-07')
    const parts = unzipSync(resultado)
    const sheet2 = new TextDecoder().decode(parts['xl/worksheets/sheet2.xml'])

    // Linha 1, célula A1 = "Chave"
    expect(sheet2).toContain('<c r="A1" t="inlineStr"><is><t>Chave</t></is></c>')
    // Célula B1 = "Fonte"
    expect(sheet2).toContain('<c r="B1" t="inlineStr"><is><t>Fonte</t></is></c>')
    // Célula C1 = "Natureza"
    expect(sheet2).toContain('<c r="C1" t="inlineStr"><is><t>Natureza</t></is></c>')
    // Célula D1 = "Descrição" (com acento)
    expect(sheet2).toContain('<c r="D1" t="inlineStr"><is><t>Descrição</t></is></c>')
    // Célula E1 = "Iniciais"
    expect(sheet2).toContain('<c r="E1" t="inlineStr"><is><t>Iniciais</t></is></c>')
    // Célula F1 = "Vezes"
    expect(sheet2).toContain('<c r="F1" t="inlineStr"><is><t>Vezes</t></is></c>')
    // Célula G1 = "Ambíguo" (com acento)
    expect(sheet2).toContain('<c r="G1" t="inlineStr"><is><t>Ambíguo</t></is></c>')
  })

  // Test List T2-2: linha 1 é row r="1" com spans="1:7"
  it('emite a linha de cabeçalho com r="1" e spans="1:7"', () => {
    const dicEntries: DicEntry[] = [
      { chave: 'X', fonte: 'Itaú', natureza: 'Outros', descricao: '', iniciais: 'AB', vezes: 1, ambiguo: true },
    ]
    const resultado = gerarXlsx(modeloBytes, 'AB', [], dicEntries, '2026-07')
    const parts = unzipSync(resultado)
    const sheet2 = new TextDecoder().decode(parts['xl/worksheets/sheet2.xml'])

    expect(sheet2).toContain('<row r="1" spans="1:7">')
  })

  // Test List T2-3: linhas de dados têm spans="1:7"
  it('emite linhas de dados com spans="1:7" (não mais "1:5")', () => {
    const dicEntries: DicEntry[] = [
      { chave: 'Padaria', fonte: 'Nubank', natureza: 'Alimentação', descricao: 'Pão', iniciais: 'ES', vezes: 5, ambiguo: false },
    ]
    const resultado = gerarXlsx(modeloBytes, 'ES', [], dicEntries, '2026-07')
    const parts = unzipSync(resultado)
    const sheet2 = new TextDecoder().decode(parts['xl/worksheets/sheet2.xml'])

    // Linha de dados começa em r="2" (após o cabeçalho em r="1")
    expect(sheet2).toContain('<row r="2" spans="1:7">')
    // Não deve haver spans="1:5"
    expect(sheet2).not.toContain('spans="1:5"')
  })

  // Test List T2-4: coluna F = entry.vezes como número
  it('emite coluna F com entry.vezes como valor numérico', () => {
    const dicEntries: DicEntry[] = [
      { chave: 'Academia', fonte: 'Itaú', natureza: 'Saúde', descricao: 'Mensalidade', iniciais: 'ES', vezes: 7, ambiguo: false },
    ]
    const resultado = gerarXlsx(modeloBytes, 'ES', [], dicEntries, '2026-07')
    const parts = unzipSync(resultado)
    const sheet2 = new TextDecoder().decode(parts['xl/worksheets/sheet2.xml'])

    // F2 = 7 como número (não como string inline)
    expect(sheet2).toContain('<c r="F2"><v>7</v></c>')
  })

  // Test List T2-5: coluna G = "true" quando ambiguo=true
  it('emite coluna G com "true" quando entry.ambiguo é true', () => {
    const dicEntries: DicEntry[] = [
      { chave: 'Pix', fonte: 'Nubank', natureza: 'Transferência', descricao: '', iniciais: 'ES', vezes: 3, ambiguo: true },
    ]
    const resultado = gerarXlsx(modeloBytes, 'ES', [], dicEntries, '2026-07')
    const parts = unzipSync(resultado)
    const sheet2 = new TextDecoder().decode(parts['xl/worksheets/sheet2.xml'])

    expect(sheet2).toContain('<c r="G2" t="inlineStr"><is><t>true</t></is></c>')
  })

  // Test List T2-6: coluna G = "false" quando ambiguo=false
  it('emite coluna G com "false" quando entry.ambiguo é false', () => {
    const dicEntries: DicEntry[] = [
      { chave: 'Mercado', fonte: 'Nubank', natureza: 'Alimentação', descricao: 'Compra', iniciais: 'ES', vezes: 2, ambiguo: false },
    ]
    const resultado = gerarXlsx(modeloBytes, 'ES', [], dicEntries, '2026-07')
    const parts = unzipSync(resultado)
    const sheet2 = new TextDecoder().decode(parts['xl/worksheets/sheet2.xml'])

    expect(sheet2).toContain('<c r="G2" t="inlineStr"><is><t>false</t></is></c>')
  })

  // Test List T2-7: múltiplas entradas — dados em linhas 2, 3, 4...
  it('com múltiplas entradas, dados ficam nas linhas 2, 3, ... (cabeçalho ocupa linha 1)', () => {
    const dicEntries: DicEntry[] = [
      { chave: 'A', fonte: 'N', natureza: 'X', descricao: '', iniciais: 'ES', vezes: 1, ambiguo: false },
      { chave: 'B', fonte: 'N', natureza: 'Y', descricao: '', iniciais: 'ES', vezes: 2, ambiguo: true },
      { chave: 'C', fonte: 'N', natureza: 'Z', descricao: '', iniciais: 'AB', vezes: 3, ambiguo: false },
    ]
    const resultado = gerarXlsx(modeloBytes, 'ES', [], dicEntries, '2026-07')
    const parts = unzipSync(resultado)
    const sheet2 = new TextDecoder().decode(parts['xl/worksheets/sheet2.xml'])

    expect(sheet2).toContain('<c r="A2" t="inlineStr"><is><t>A</t></is></c>')
    expect(sheet2).toContain('<c r="F2"><v>1</v></c>')
    expect(sheet2).toContain('<c r="G2" t="inlineStr"><is><t>false</t></is></c>')

    expect(sheet2).toContain('<c r="A3" t="inlineStr"><is><t>B</t></is></c>')
    expect(sheet2).toContain('<c r="F3"><v>2</v></c>')
    expect(sheet2).toContain('<c r="G3" t="inlineStr"><is><t>true</t></is></c>')

    expect(sheet2).toContain('<c r="A4" t="inlineStr"><is><t>C</t></is></c>')
    expect(sheet2).toContain('<c r="F4"><v>3</v></c>')
    expect(sheet2).toContain('<c r="G4" t="inlineStr"><is><t>false</t></is></c>')
  })

  // Test List T2-8: lista vazia preserva <sheetData/> (comportamento intacto)
  it('com lista vazia de dicEntries, retorna <sheetData/> (sem cabeçalho)', () => {
    const resultado = gerarXlsx(modeloBytes, 'ES', [], [], '2026-07')
    const parts = unzipSync(resultado)
    const sheet2 = new TextDecoder().decode(parts['xl/worksheets/sheet2.xml'])

    expect(sheet2).toContain('<sheetData/>')
  })
})

// Guard de drift do Modelo (2026-08-04): o app exporta injetando em
// public/Modelo.xlsx, mas os testes rodam contra a fixture. Se os dois divergirem,
// os testes passam mas o app quebra (foi o que aconteceu no bug das abas agrupadas:
// public/ estava salvo agrupado e a fixture não). Este teste trava que o Modelo
// usado no export seja byte-idêntico ao Modelo validado pelos testes.
describe('sincronia public/Modelo.xlsx ↔ fixture de testes', () => {
  it('public/Modelo.xlsx é byte-idêntico à fixture usada nos testes do gerador', () => {
    const publicPath = resolve(__dirname, '../../../../public/Modelo.xlsx')
    const publicBytes = new Uint8Array(readFileSync(publicPath))
    const fixtureBytes = new Uint8Array(readFileSync(FIXTURE_PATH))
    expect(hashSha256(publicBytes)).toBe(hashSha256(fixtureBytes))
  })
})
