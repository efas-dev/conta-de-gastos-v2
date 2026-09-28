// ADR: see Docs/specs/mvp-vertical-nubank.adr.md
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
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

/**
 * Extrai o XML de UMA célula pela referência, qualquer que seja o índice de estilo.
 *
 * As asserções deste arquivo NÃO podem casar `s="35"` literal: o índice de estilo é posição na
 * tabela `cellXfs` do `styles.xml`, e o Excel reescreve essa tabela a cada salvamento do Modelo —
 * a coluna Fonte já foi `s="42"`, `s="44"` e `s="35"` em três versões. Testes ancorados no número
 * viravam vermelho a cada re-save legítimo do Modelo, escondendo o que realmente importa: qual
 * valor foi gravado em qual coluna, com o estilo que o Modelo declara (seja ele qual for).
 */
function celula(xml: string, ref: string): string {
  const achado = xml.match(new RegExp(`<c r="${ref}"(?:[^>]*?/>|[^>]*?>[\\s\\S]*?</c>)`))
  if (!achado) throw new Error(`Célula ${ref} não encontrada no XML`)
  return achado[0]
}

/** Índice de estilo que o Modelo declara para a célula — o gerado precisa preservá-lo. */
function estiloNoModelo(modeloParts: Record<string, Uint8Array>, ref: string): string {
  const sheet1 = new TextDecoder().decode(modeloParts['xl/worksheets/sheet1.xml'])
  const s = celula(sheet1, ref).match(/\bs="(\d+)"/)
  if (!s) throw new Error(`Célula ${ref} do Modelo não tem atributo s`)
  return s[1]
}

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

    const s = estiloNoModelo(modeloParts, 'B2')
    expect(celula(sheet1, 'B2')).toBe(`<c r="B2" s="${s}" t="inlineStr"><is><t>ES</t></is></c>`)
  })

  // Test List item 2: B3 recebe mês de referência como inlineStr
  it('grava mês de referência na célula B3 de sheet1.xml como inlineStr', () => {
    const resultado = gerarXlsx(modeloBytes, 'ES', [], [], '2026-06')
    const parts = unzipSync(resultado)
    const sheet1 = decodePart(parts, 'xl/worksheets/sheet1.xml')

    const s = estiloNoModelo(modeloParts, 'B3')
    expect(celula(sheet1, 'B3')).toBe(
      `<c r="B3" s="${s}" t="inlineStr"><is><t>2026-06</t></is></c>`,
    )
  })

  // Test List item 3: lançamento injetado em linha 9 — layout Modelo 2026-09-28,
  // Tabela1 = A8:I504: Fonte | Data | Transcrição | Ref. | Mês | Descrição | Valor |
  // Natureza | Iniciais.
  it('injeta lançamento em A9:I9 com as colunas na ordem do Modelo', () => {
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
    const s = (ref: string) => estiloNoModelo(modeloParts, ref)

    // A9: Fonte
    expect(celula(sheet1, 'A9')).toBe(`<c r="A9" s="${s('A9')}" t="inlineStr"><is><t>Nubank</t></is></c>`)
    // B9: Data
    expect(celula(sheet1, 'B9')).toBe(`<c r="B9" s="${s('B9')}" t="inlineStr"><is><t>2024-01-15</t></is></c>`)
    // C9: Transcrição
    expect(celula(sheet1, 'C9')).toBe(`<c r="C9" s="${s('C9')}" t="inlineStr"><is><t>Compra no Mercado</t></is></c>`)
    // D9: Ref. (mês de referência literal)
    expect(celula(sheet1, 'D9')).toBe(`<c r="D9" s="${s('D9')}" t="inlineStr"><is><t>2026-06</t></is></c>`)
    // E9: Mês — número do mês de referência, não texto
    expect(celula(sheet1, 'E9')).toBe(`<c r="E9" s="${s('E9')}"><v>6</v></c>`)
    // F9: Descrição
    expect(celula(sheet1, 'F9')).toBe(`<c r="F9" s="${s('F9')}" t="inlineStr"><is><t>Supermercado</t></is></c>`)
    // G9: Valor numérico
    expect(celula(sheet1, 'G9')).toBe(`<c r="G9" s="${s('G9')}"><v>-123.45</v></c>`)
    // H9: Natureza
    expect(celula(sheet1, 'H9')).toBe(`<c r="H9" s="${s('H9')}" t="inlineStr"><is><t>Alimentação</t></is></c>`)
    // I9: Iniciais
    expect(celula(sheet1, 'I9')).toBe(`<c r="I9" s="${s('I9')}" t="inlineStr"><is><t>ES</t></is></c>`)
  })

  // A coluna Mês (E) vem do mês de REFERÊNCIA, não da data da linha: uma compra de abril que
  // entra na fatura de maio pertence ao fechamento de maio, igual à coluna Ref. (decisão do
  // usuário em 2026-09-28).
  it('TL-MES-1: Mês vem da referência, mesmo quando a data do lançamento é de outro mês', () => {
    const lancamentos: Lancamento[] = [
      { id: 1, fonte: 'Nubank', data: '2026-04-28', transcricao: 'Compra de abril', valor: -10, iniciais: 'ES', natureza: 'CM', descricao: '' },
    ]
    const sheet1 = decodePart(
      unzipSync(gerarXlsx(modeloBytes, 'ES', lancamentos, [], '2026-05')),
      'xl/worksheets/sheet1.xml',
    )

    expect(celula(sheet1, 'E9')).toContain('<v>5</v>')
    expect(celula(sheet1, 'D9')).toContain('2026-05')
  })

  it('TL-MES-2: mês sem zero à esquerda sai como número (janeiro = 1, não "01")', () => {
    const lancamentos: Lancamento[] = [
      { id: 1, fonte: 'Nubank', data: '2026-01-05', transcricao: 'L1', valor: -10, iniciais: 'ES', natureza: 'CM', descricao: '' },
    ]
    const sheet1 = decodePart(
      unzipSync(gerarXlsx(modeloBytes, 'ES', lancamentos, [], '2026-01')),
      'xl/worksheets/sheet1.xml',
    )

    expect(celula(sheet1, 'E9')).toContain('<v>1</v>')
    expect(celula(sheet1, 'E9')).not.toContain('inlineStr')
  })

  it('TL-MES-3: mês de referência fora de 1–12 faz a geração falhar em vez de gravar lixo', () => {
    expect(() => gerarXlsx(modeloBytes, 'ES', [], [], '2026-13')).toThrow(/mês de referência/i)
    expect(() => gerarXlsx(modeloBytes, 'ES', [], [], 'junho/2026')).toThrow(/mês de referência/i)
  })

  // Test List item 4: ref da Tabela1 ajustado para A8:I{8+n} com n lançamentos
  it('ajusta ref da Tabela1 e autoFilter para A8:I{8+n} com n lançamentos', () => {
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
    expect(table1).toContain('ref="A8:I11"')
    // autoFilter também deve ter ref atualizado
    expect(table1.match(/ref="A8:I11"/g)?.length).toBeGreaterThanOrEqual(2)
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

  // Test List item 9: lista vazia de lançamentos — ref A8:I8
  it('com zero lançamentos, ref da Tabela1 é A8:I8 (apenas cabeçalho)', () => {
    const resultado = gerarXlsx(modeloBytes, 'ES', [], [], '2026-06')
    const parts = unzipSync(resultado)
    const table1 = decodePart(parts, 'xl/tables/table1.xml')

    expect(table1).toContain('ref="A8:I8"')
  })

  /**
   * O corpo da Tabela1 tem 496 linhas (9–504). Acima disso o Modelo ainda TEM linhas no XML,
   * mas elas estão fora da tabela e sem as células das colunas de dados — o lançamento excedente
   * era descartado em silêncio, e o usuário só descobriria conferindo o .xlsx linha por linha.
   */
  it('TL-CAPACIDADE: mais lançamentos que as 496 linhas da Tabela1 faz a geração falhar', () => {
    const umLancamento = (i: number): Lancamento => ({
      id: i + 1, fonte: 'Nubank', data: '2026-06-01', transcricao: `L${i}`, valor: -1, iniciais: 'ES', natureza: 'CM', descricao: '',
    })
    const noLimite = Array.from({ length: 496 }, (_, i) => umLancamento(i))
    const umAMais = Array.from({ length: 497 }, (_, i) => umLancamento(i))

    expect(() => gerarXlsx(modeloBytes, 'ES', noLimite, [], '2026-06')).not.toThrow()
    expect(() => gerarXlsx(modeloBytes, 'ES', umAMais, [], '2026-06')).toThrow(/496/)
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

  // Test List T2-2: linha 1 é row r="1" com spans="1:8" (coluna H, spec dicionario-chave-canonica)
  it('emite a linha de cabeçalho com r="1" e spans="1:8"', () => {
    const dicEntries: DicEntry[] = [
      { chave: 'X', fonte: 'Itaú', natureza: 'Outros', descricao: '', iniciais: 'AB', vezes: 1, ambiguo: true },
    ]
    const resultado = gerarXlsx(modeloBytes, 'AB', [], dicEntries, '2026-07')
    const parts = unzipSync(resultado)
    const sheet2 = new TextDecoder().decode(parts['xl/worksheets/sheet2.xml'])

    expect(sheet2).toContain('<row r="1" spans="1:8">')
  })

  // Test List T2-3: linhas de dados têm spans="1:8"
  it('emite linhas de dados com spans="1:8" (não mais "1:7")', () => {
    const dicEntries: DicEntry[] = [
      { chave: 'Padaria', fonte: 'Nubank', natureza: 'Alimentação', descricao: 'Pão', iniciais: 'ES', vezes: 5, ambiguo: false },
    ]
    const resultado = gerarXlsx(modeloBytes, 'ES', [], dicEntries, '2026-07')
    const parts = unzipSync(resultado)
    const sheet2 = new TextDecoder().decode(parts['xl/worksheets/sheet2.xml'])

    // Linha de dados começa em r="2" (após o cabeçalho em r="1")
    expect(sheet2).toContain('<row r="2" spans="1:8">')
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

// ---------------------------------------------------------------------------
// Item 49 do TODO — saldo inicial em B4
//
// B4 é o saldo INICIAL do mês (célula livre e vazia no Modelo).
// B5 é o saldo FINAL e é FÓRMULA (`B4+SUM(G9:G1004)` no Modelo 2026-09-28, quando Valor passou
// de H para G) — B4 é o único ponto que o writer pode tocar, e tocar B5 quebraria o Modelo.
// O valor vem de `lerSaldoAnterior` (B5 do .xlsx do mês anterior).
// ---------------------------------------------------------------------------
describe('gerarXlsx — saldo inicial em B4 (item 49)', () => {
  let modeloBytes: Uint8Array
  let modeloParts: Record<string, Uint8Array>
  let sB4: string

  beforeAll(() => {
    modeloBytes = new Uint8Array(readFileSync(FIXTURE_PATH))
    modeloParts = unzipSync(modeloBytes)
    sB4 = estiloNoModelo(modeloParts, 'B4')
  })

  it('TL-49-1: grava o saldo inicial em B4 como célula numérica com o estilo do Modelo', () => {
    const resultado = gerarXlsx(modeloBytes, 'ES', [], [], '2026-06', 1234.56)
    const sheet1 = decodePart(unzipSync(resultado), 'xl/worksheets/sheet1.xml')

    expect(celula(sheet1, 'B4')).toBe(`<c r="B4" s="${sB4}"><v>1234.56</v></c>`)
  })

  it('TL-49-2: saldo negativo é gravado com o sinal preservado', () => {
    const resultado = gerarXlsx(modeloBytes, 'ES', [], [], '2026-06', -87.9)
    const sheet1 = decodePart(unzipSync(resultado), 'xl/worksheets/sheet1.xml')

    expect(celula(sheet1, 'B4')).toBe(`<c r="B4" s="${sB4}"><v>-87.9</v></c>`)
  })

  it('TL-49-3: saldo zero é gravado (0 é valor legítimo, não "ausente")', () => {
    const resultado = gerarXlsx(modeloBytes, 'ES', [], [], '2026-06', 0)
    const sheet1 = decodePart(unzipSync(resultado), 'xl/worksheets/sheet1.xml')

    expect(celula(sheet1, 'B4')).toBe(`<c r="B4" s="${sB4}"><v>0</v></c>`)
  })

  it('TL-49-4: sem saldo (null/omitido) B4 fica em branco, como no Modelo virgem', () => {
    for (const saldo of [null, undefined]) {
      const resultado = gerarXlsx(modeloBytes, 'ES', [], [], '2026-06', saldo)
      const sheet1 = decodePart(unzipSync(resultado), 'xl/worksheets/sheet1.xml')

      expect(celula(sheet1, 'B4')).toBe(`<c r="B4" s="${sB4}"/>`)
    }
  })

  it('TL-49-5: substitui B4 mesmo quando o re-save do Modelo a deixou preenchida', () => {
    // Um re-save do Modelo com valor em B4 vira `<c r="B4" s="…"><v>10</v></c>`;
    // o mesmo endurecimento por regex já aplicado a B3 precisa valer aqui.
    const parts = unzipSync(modeloBytes)
    const sheet1Original = new TextDecoder().decode(parts['xl/worksheets/sheet1.xml'])
    parts['xl/worksheets/sheet1.xml'] = new TextEncoder().encode(
      sheet1Original.replace(`<c r="B4" s="${sB4}"/>`, `<c r="B4" s="${sB4}"><v>10</v></c>`),
    )
    const modeloComB4 = zipSync(parts)

    const resultado = gerarXlsx(modeloComB4, 'ES', [], [], '2026-06', 500)
    const sheet1 = decodePart(unzipSync(resultado), 'xl/worksheets/sheet1.xml')

    expect(celula(sheet1, 'B4')).toBe(`<c r="B4" s="${sB4}"><v>500</v></c>`)
  })

  it('TL-49-6: a fórmula de B5 (saldo final) permanece intacta e soma a coluna Valor', () => {
    const resultado = gerarXlsx(modeloBytes, 'ES', [], [], '2026-06', 1234.56)
    const sheet1 = decodePart(unzipSync(resultado), 'xl/worksheets/sheet1.xml')
    const modeloSheet1 = new TextDecoder().decode(modeloParts['xl/worksheets/sheet1.xml'])

    // A fórmula sai igual à do Modelo, seja qual for a coluna que ele soma…
    const formulaDoModelo = celula(modeloSheet1, 'B5').match(/<f>([^<]*)<\/f>/)?.[1]
    expect(celula(sheet1, 'B5')).toContain(`<f>${formulaDoModelo}</f>`)
    // …e o Modelo precisa somar a coluna Valor (G), não outra: somar a coluna errada
    // deixaria o saldo final sempre igual ao inicial, e `lerSaldoAnterior` propagaria o erro
    // para o mês seguinte.
    expect(formulaDoModelo).toBe('B4+SUM(G9:G1004)')
  })
})

/**
 * Guarda de última linha contra valor não-finito (TL-INF).
 *
 * `celulaNum` interpolava o número cru em `<v>${value}</v>`: um `Infinity`/`NaN` que escapasse
 * das fronteiras de entrada virava `<v>Infinity</v>` no XML — que NÃO é conteúdo numérico válido
 * em OOXML. O Excel não reclama do número: recusa o arquivo inteiro como corrompido, e o usuário
 * só descobre ao abrir o .xlsx já baixado. Falhar alto aqui é melhor do que entregar o arquivo ruim.
 */
describe('gerarXlsx — valor não-finito nunca vira XML', () => {
  let modeloBytes: Uint8Array

  beforeAll(() => {
    modeloBytes = new Uint8Array(readFileSync(FIXTURE_PATH))
  })

  function comValor(valor: number): Lancamento[] {
    return [
      {
        fonte: 'Nubank',
        data: '2026-06-01',
        transcricao: 'L1',
        valor,
        iniciais: 'ES',
        natureza: 'ALM',
        descricao: '',
      },
    ]
  }

  it('TL-INF-07: lançamento com valor Infinity faz a geração falhar em vez de emitir <v>Infinity</v>', () => {
    expect(() => gerarXlsx(modeloBytes, 'ES', comValor(Infinity), [], '2026-06')).toThrow(/não-finito/i)
  })

  it('TL-INF-08: lançamento com valor NaN também faz a geração falhar', () => {
    expect(() => gerarXlsx(modeloBytes, 'ES', comValor(NaN), [], '2026-06')).toThrow(/não-finito/i)
  })

  it('TL-INF-09: saldo inicial não-finito em B4 também faz a geração falhar', () => {
    expect(() => gerarXlsx(modeloBytes, 'ES', [], [], '2026-06', -Infinity)).toThrow(/não-finito/i)
  })
})

/**
 * Bytes estáveis no tempo (TL-MTIME).
 *
 * `zipSync` sem opções carimba `Date.now()` no cabeçalho DOS de cada entrada do zip. O campo
 * guarda os segundos em passos de 2 (`seconds >> 1`), então duas gerações do MESMO insumo saíam
 * byte-idênticas dentro do mesmo balde de 2 s e divergiam em 2 bytes quando o relógio cruzava a
 * fronteira — a origem do flake intermitente de `src/ui/store/__tests__/exportacao.test.ts`, que
 * compara dois .xlsx byte a byte. Medido: 0 bytes de divergência dentro do balde, 2 ao cruzar.
 */
describe('gerarXlsx — bytes estáveis no tempo (TL-MTIME)', () => {
  let modeloBytes: Uint8Array

  beforeAll(() => {
    modeloBytes = new Uint8Array(readFileSync(FIXTURE_PATH))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const LANCAMENTOS: Lancamento[] = [
    { fonte: 'Nubank', data: '2026-06-01', transcricao: 'L1', valor: -10, iniciais: 'ES', natureza: 'ALM', descricao: '' },
  ]

  it('TL-MTIME-01: duas gerações do mesmo insumo cruzando a fronteira de 2 s saem byte-idênticas', () => {
    vi.useFakeTimers()

    // 10:00:01 e 10:00:03 caem em baldes DIFERENTES do campo de 2 s do cabeçalho DOS —
    // é exatamente aqui que o zip carimbado com `Date.now()` divergia.
    vi.setSystemTime(new Date('2026-06-15T10:00:01.000Z'))
    const primeira = gerarXlsx(modeloBytes, 'ES', LANCAMENTOS, [], '2026-06')

    vi.setSystemTime(new Date('2026-06-15T10:00:03.000Z'))
    const segunda = gerarXlsx(modeloBytes, 'ES', LANCAMENTOS, [], '2026-06')

    expect(hashSha256(segunda)).toBe(hashSha256(primeira))
  })

  it('TL-MTIME-02: nem um ano de distância entre as gerações muda um byte', () => {
    vi.useFakeTimers()

    vi.setSystemTime(new Date('2026-06-15T10:00:01.000Z'))
    const primeira = gerarXlsx(modeloBytes, 'ES', LANCAMENTOS, [], '2026-06')

    vi.setSystemTime(new Date('2027-11-02T23:41:59.000Z'))
    const segunda = gerarXlsx(modeloBytes, 'ES', LANCAMENTOS, [], '2026-06')

    expect(hashSha256(segunda)).toBe(hashSha256(primeira))
  })
})

/**
 * Imunidade ao re-save do Modelo (TL-ESTILO).
 *
 * A injeção casava a string literal `<c r="A9" s="42"/>`. O índice de estilo é posição na tabela
 * `cellXfs` do `styles.xml`, e o Excel reescreve essa tabela a cada salvamento: a coluna Fonte foi
 * `s="42"`, depois `s="44"`, depois `s="35"` — três versões do mesmo Modelo. Quando o literal não
 * casa, `String.replace` devolve o XML intacto e NÃO reclama: o .xlsx sai com a grid em branco e
 * ninguém é avisado. Estes dois testes cobrem as duas metades do conserto — preservar o estilo que
 * o arquivo declara, e gritar quando a célula não existe mesmo.
 */
describe('gerarXlsx — imune a renumeração de estilos, alto no que falta (TL-ESTILO)', () => {
  let modeloBytes: Uint8Array
  let modeloParts: Record<string, Uint8Array>

  beforeAll(() => {
    modeloBytes = new Uint8Array(readFileSync(FIXTURE_PATH))
    modeloParts = unzipSync(modeloBytes)
  })

  const LANCAMENTO: Lancamento = {
    id: 1, fonte: 'Nubank', data: '2026-06-01', transcricao: 'Mercado', valor: -42.5,
    iniciais: 'ES', natureza: 'CM', descricao: 'Compras',
  }

  it('TL-ESTILO-1: Modelo salvo com outros índices de estilo continua recebendo os dados', () => {
    // Simula o que o Excel faz num re-save: os mesmos estilos, com outros números.
    const DESLOCAMENTO = 100
    const parts = unzipSync(modeloBytes)
    const sheet1 = new TextDecoder().decode(parts['xl/worksheets/sheet1.xml'])
    const renumerado = sheet1.replace(/<c r="([A-I])(\d+)" s="(\d+)"/g, (_m, col, lin, s) =>
      `<c r="${col}${lin}" s="${Number(s) + DESLOCAMENTO}"`)
    parts['xl/worksheets/sheet1.xml'] = new TextEncoder().encode(renumerado)

    const resultado = gerarXlsx(zipSync(parts), 'ES', [LANCAMENTO], [], '2026-06')
    const gerado = decodePart(unzipSync(resultado), 'xl/worksheets/sheet1.xml')

    // Os dados entraram, e cada célula saiu com o estilo que o arquivo de entrada declarava —
    // o esperado é DERIVADO do Modelo, nunca escrito à mão (seria o mesmo erro que este teste cobre).
    const s = (ref: string) => Number(estiloNoModelo(modeloParts, ref)) + DESLOCAMENTO
    expect(celula(gerado, 'A9')).toBe(`<c r="A9" s="${s('A9')}" t="inlineStr"><is><t>Nubank</t></is></c>`)
    expect(celula(gerado, 'E9')).toBe(`<c r="E9" s="${s('E9')}"><v>6</v></c>`)
    expect(celula(gerado, 'G9')).toBe(`<c r="G9" s="${s('G9')}"><v>-42.5</v></c>`)
    expect(celula(gerado, 'H9')).toBe(`<c r="H9" s="${s('H9')}" t="inlineStr"><is><t>CM</t></is></c>`)
  })

  it('TL-ESTILO-2: célula ausente no Modelo faz a geração falhar em vez de gerar planilha vazia', () => {
    const parts = unzipSync(modeloBytes)
    const sheet1 = new TextDecoder().decode(parts['xl/worksheets/sheet1.xml'])
    // Remove a célula G9 (Valor) — o estrago que passava calado.
    const mutilado = sheet1.replace(/<c r="G9" s="\d+"\/>/, '')
    expect(mutilado).not.toBe(sheet1) // a mutilação precisa ter acontecido
    parts['xl/worksheets/sheet1.xml'] = new TextEncoder().encode(mutilado)

    expect(() => gerarXlsx(zipSync(parts), 'ES', [LANCAMENTO], [], '2026-06')).toThrow(/G9/)
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

// ---------------------------------------------------------------------------
// T07 (spec dicionario-chave-canonica, D17): coluna H (Valor) na aba Dicionario
// ---------------------------------------------------------------------------

describe('gerarSheetDataDicionario — coluna H (Valor)', () => {
  let modeloBytes: Uint8Array

  beforeAll(() => {
    modeloBytes = new Uint8Array(readFileSync(FIXTURE_PATH))
  })

  it('H07-01: emite o título "Valor" em H1', () => {
    const dicEntries: DicEntry[] = [
      { chave: 'X', fonte: 'Nubank', natureza: 'CM', descricao: 'y', iniciais: 'ES', vezes: 1, ambiguo: false },
    ]
    const resultado = gerarXlsx(modeloBytes, 'ES', [], dicEntries, '2026-07')
    const sheet2 = new TextDecoder().decode(unzipSync(resultado)['xl/worksheets/sheet2.xml'])
    expect(sheet2).toContain('<c r="H1" t="inlineStr"><is><t>Valor</t></is></c>')
  })

  it('H07-02: grava o valor como número em H, quando presente', () => {
    const dicEntries: DicEntry[] = [
      {
        chave: 'Autohubservice - Parcela #/4',
        fonte: 'fatura_nubank_cc',
        natureza: 'VC',
        descricao: 'Conserto City',
        iniciais: 'ES',
        vezes: 2,
        ambiguo: false,
        valor: -275,
      },
    ]
    const resultado = gerarXlsx(modeloBytes, 'ES', [], dicEntries, '2026-07')
    const sheet2 = new TextDecoder().decode(unzipSync(resultado)['xl/worksheets/sheet2.xml'])
    expect(sheet2).toContain('<c r="H2"><v>-275</v></c>')
  })

  it('H07-03: D17 — célula H é OMITIDA quando a entrada não tem valor', () => {
    // Omitir (em vez de gravar vazio ou zero) é o que permite ao round-trip provar
    // que ausência sobrevive como ausência, e não vira 0.
    const dicEntries: DicEntry[] = [
      { chave: 'Mercado', fonte: 'Nubank', natureza: 'CM', descricao: 'Compras', iniciais: 'ES', vezes: 3, ambiguo: false },
    ]
    const resultado = gerarXlsx(modeloBytes, 'ES', [], dicEntries, '2026-07')
    const sheet2 = new TextDecoder().decode(unzipSync(resultado)['xl/worksheets/sheet2.xml'])
    expect(sheet2).not.toContain('r="H2"')
    // e a linha continua íntegra até G
    expect(sheet2).toContain('<c r="G2" t="inlineStr"><is><t>false</t></is></c>')
  })

  it('H07-04: valor zero é gravado, não confundido com ausência', () => {
    const dicEntries: DicEntry[] = [
      { chave: 'Y', fonte: 'Nubank', natureza: 'CM', descricao: 'z', iniciais: 'ES', vezes: 1, ambiguo: false, valor: 0 },
    ]
    const resultado = gerarXlsx(modeloBytes, 'ES', [], dicEntries, '2026-07')
    const sheet2 = new TextDecoder().decode(unzipSync(resultado)['xl/worksheets/sheet2.xml'])
    expect(sheet2).toContain('<c r="H2"><v>0</v></c>')
  })
})
