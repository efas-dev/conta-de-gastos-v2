// ADR: see spec/mvp-vertical-nubank.adr.md
import { unzipSync, zipSync } from 'fflate'
import type { Lancamento, DicEntry } from '../../types.js'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * Escapa caracteres especiais XML no conteúdo de texto de células.
 * Necessário para embutir valores como inline strings sem corromper o XML.
 */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Gera o XML de uma célula de string inline.
 * Formato: <c r="REF" [s="STYLE"] t="inlineStr"><is><t>VALUE</t></is></c>
 */
function celulaStr(ref: string, style: string | null, value: string): string {
  const styleAttr = style ? ` s="${style}"` : ''
  return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`
}

/**
 * Gera o XML de uma célula numérica.
 * Formato: <c r="REF" s="STYLE"><v>VALUE</v></c>
 */
function celulaNum(ref: string, style: string, value: number): string {
  return `<c r="${ref}" s="${style}"><v>${value}</v></c>`
}

/**
 * Injeta iniciais em B2 e dados dos lançamentos nas linhas A8:G{7+n} de sheet1.xml.
 *
 * Células do Modelo.xlsx virgem nas linhas de dados (8–503):
 *   A (Fonte):        s="42"  — empty: <c r="An" s="42"/>
 *   B (Data):         s="44"  — empty: <c r="Bn" s="44"/>
 *   C (Transcrição):  s="41"  — empty: <c r="Cn" s="41"/>
 *   D (Iniciais):     s="41"  — empty: <c r="Dn" s="41"/>
 *   E (Natureza):     s="11"  — empty: <c r="En" s="11"/>
 *   F (Descrição):    s="11"  — empty: <c r="Fn" s="11"/>
 *   G (Valor):        s="43"  — empty: <c r="Gn" s="43"/>
 *
 * B2 no Modelo.xlsx virgem: <c r="B2" s="40"/>
 */
function injetarSheet1(xml: string, iniciais: string, lancamentos: Lancamento[]): string {
  let result = xml

  // Injeta iniciais em B2
  result = result.replace(
    '<c r="B2" s="40"/>',
    () => celulaStr('B2', '40', iniciais),
  )

  // Injeta cada lançamento nas linhas 8, 9, 10, ...
  for (let i = 0; i < lancamentos.length; i++) {
    const n = i + 8
    const l = lancamentos[i]

    result = result.replace(
      `<c r="A${n}" s="42"/>`,
      () => celulaStr(`A${n}`, '42', l.fonte),
    )
    result = result.replace(
      `<c r="B${n}" s="44"/>`,
      () => celulaStr(`B${n}`, '44', l.data),
    )
    result = result.replace(
      `<c r="C${n}" s="41"/>`,
      () => celulaStr(`C${n}`, '41', l.transcricao),
    )
    result = result.replace(
      `<c r="D${n}" s="41"/>`,
      () => celulaStr(`D${n}`, '41', l.iniciais),
    )
    result = result.replace(
      `<c r="E${n}" s="11"/>`,
      () => celulaStr(`E${n}`, '11', l.natureza),
    )
    result = result.replace(
      `<c r="F${n}" s="11"/>`,
      () => celulaStr(`F${n}`, '11', l.descricao),
    )
    result = result.replace(
      `<c r="G${n}" s="43"/>`,
      () => celulaNum(`G${n}`, '43', l.valor),
    )
  }

  return result
}

/**
 * Gera o bloco <sheetData> completo para a aba Dicionario com as entradas passadas.
 *
 * Colunas: A=chave, B=fonte, C=natureza, D=descricao, E=iniciais
 * Cada linha começa em 2 (linha 1 é o cabeçalho, mantido pelo Modelo.xlsx).
 */
function gerarSheetDataDicionario(dicEntries: DicEntry[]): string {
  if (dicEntries.length === 0) {
    return '<sheetData/>'
  }

  const rows = dicEntries.map((entry, i) => {
    const n = i + 2
    const cells = [
      celulaStr(`A${n}`, null, entry.chave),
      celulaStr(`B${n}`, null, entry.fonte),
      celulaStr(`C${n}`, null, entry.natureza),
      celulaStr(`D${n}`, null, entry.descricao),
      celulaStr(`E${n}`, null, entry.iniciais),
    ].join('')
    return `<row r="${n}" spans="1:5">${cells}</row>`
  })

  return `<sheetData>${rows.join('')}</sheetData>`
}

/**
 * Substitui <sheetData/> da aba Dicionario pelas entradas geradas.
 */
function injetarDicionario(xml: string, dicEntries: DicEntry[]): string {
  return xml.replace('<sheetData/>', gerarSheetDataDicionario(dicEntries))
}

/**
 * Atualiza o atributo ref em table1.xml para o range correto com n linhas de dados.
 * A tabela tem cabeçalho em linha 7, dados a partir de linha 8:
 * - ref = A7:G{7+n} (mínimo A7:G7 quando n=0, apenas cabeçalho)
 *
 * Substitui TODOS os atributos ref="..." (tabela e autoFilter).
 */
function atualizarRefTabela1(xml: string, n: number): string {
  const ultimaLinha = 7 + n
  return xml.replace(/\bref="[^"]*"/g, () => `ref="A7:G${ultimaLinha}"`)
}

/**
 * Adiciona fullCalcOnLoad="1" ao elemento <calcPr> de workbook.xml.
 * O Modelo.xlsx virgem tem: <calcPr calcId="191029"/>
 * Resultado esperado: <calcPr calcId="191029" fullCalcOnLoad="1"/>
 */
function injetarFullCalcOnLoad(xml: string): string {
  return xml.replace(/<calcPr([^>]*)\/>/, (_match, attrs) => {
    if (attrs.includes('fullCalcOnLoad')) return `<calcPr${attrs}/>`
    return `<calcPr${attrs} fullCalcOnLoad="1"/>`
  })
}

/**
 * Gera um novo arquivo .xlsx por injeção cirúrgica no Modelo.xlsx.
 *
 * Estratégia: descompactar o ZIP com fflate.unzipSync, modificar cirurgicamente
 * apenas as 4 partes declaradas (sheet1.xml, sheet2.xml, table1.xml, workbook.xml),
 * e recompactar com fflate.zipSync. Todas as demais partes passam intactas —
 * seus SHA256 devem ser idênticos ao do Modelo.xlsx original.
 *
 * @param modelo - Bytes do Modelo.xlsx original (lido como Uint8Array)
 * @param iniciais - Iniciais do usuário, gravadas em B2 da aba Extrato
 * @param lancamentos - Lançamentos a injetar a partir da linha A8
 * @param dicEntries - Entradas do dicionário a injetar na aba Dicionario
 * @returns Bytes do .xlsx gerado
 */
export function gerarXlsx(
  modelo: Uint8Array,
  iniciais: string,
  lancamentos: Lancamento[],
  dicEntries: DicEntry[],
): Uint8Array {
  const parts = unzipSync(modelo)

  // 1. Modificar sheet1.xml (aba Extrato): B2 e linhas de dados A8:G{7+n}
  const sheet1Xml = decoder.decode(parts['xl/worksheets/sheet1.xml'])
  parts['xl/worksheets/sheet1.xml'] = encoder.encode(
    injetarSheet1(sheet1Xml, iniciais, lancamentos),
  )

  // 2. Modificar sheet2.xml (aba Dicionario): substituir <sheetData/> com entradas
  const sheet2Xml = decoder.decode(parts['xl/worksheets/sheet2.xml'])
  parts['xl/worksheets/sheet2.xml'] = encoder.encode(
    injetarDicionario(sheet2Xml, dicEntries),
  )

  // 3. Modificar table1.xml: ajustar ref para o número exato de linhas
  const table1Xml = decoder.decode(parts['xl/tables/table1.xml'])
  parts['xl/tables/table1.xml'] = encoder.encode(
    atualizarRefTabela1(table1Xml, lancamentos.length),
  )

  // 4. Modificar workbook.xml: adicionar fullCalcOnLoad="1" em <calcPr>
  const workbookXml = decoder.decode(parts['xl/workbook.xml'])
  parts['xl/workbook.xml'] = encoder.encode(
    injetarFullCalcOnLoad(workbookXml),
  )

  return zipSync(parts)
}
