// ADR: see Docs/specs/injecao-xlsx-mes-referencia.adr.md
// ADR: see Docs/specs/dicionario-ponta-a-ponta.adr.md
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
 *
 * Valor vazio → célula **genuinamente em branco** (`<c r="REF" s="STYLE"/>`),
 * igual ao Modelo virgem. Uma célula com string vazia inline (`<is><t></t></is>`)
 * é tratada pelo Excel como valor `""` (não-branco), o que quebra a formatação
 * condicional (a regra `$E="" ...` / `ISBLANK`) e funções como `COUNTA`.
 */
function celulaStr(ref: string, style: string | null, value: string): string {
  const styleAttr = style ? ` s="${style}"` : ''
  if (value === '') {
    return `<c r="${ref}"${styleAttr}/>`
  }
  return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`
}

/**
 * Gera o XML de uma célula numérica.
 * Formato: <c r="REF" [s="STYLE"]><v>VALUE</v></c>
 * Quando style é null, omite o atributo s (célula sem estilo explícito).
 */
function celulaNum(ref: string, style: string | null, value: number): string {
  const styleAttr = style ? ` s="${style}"` : ''
  return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`
}

/**
 * Injeta iniciais em B2, mês de referência em B3, e dados dos lançamentos
 * nas linhas A9:H{8+n} de sheet1.xml — layout Modelo 483f420.
 *
 * Células do Modelo.xlsx virgem (483f420) nas linhas de dados (9–504):
 *   A (Fonte):        s="42"  — empty: <c r="An" s="42"/>
 *   B (Data):         s="44"  — empty: <c r="Bn" s="44"/>
 *   C (Transcrição):  s="41"  — empty: <c r="Cn" s="41"/>
 *   D (Ref.):         s="41"  — empty: <c r="Dn" s="41"/> — recebe mesReferencia literal
 *   E (Iniciais):     s="41"  — empty: <c r="En" s="41"/>
 *   F (Natureza):     s="11"  — empty: <c r="Fn" s="11"/>
 *   G (Descrição):    s="11"  — empty: <c r="Gn" s="11"/>
 *   H (Valor):        s="43"  — empty: <c r="Hn" s="43"/>
 *
 * B2 no Modelo.xlsx virgem: <c r="B2" s="40"/>
 * B3 no Modelo.xlsx virgem: <c r="B3" s="45" t="s"><v>89</v></c>
 *
 * Estilos derivados empiricamente do Modelo 483f420 via inspeção de
 * xl/worksheets/sheet1.xml no ZIP da fixture.
 */
function injetarSheet1(
  xml: string,
  iniciais: string,
  lancamentos: Lancamento[],
  mesReferencia: string,
): string {
  let result = xml

  // Injeta iniciais em B2
  result = result.replace(
    '<c r="B2" s="40"/>',
    () => celulaStr('B2', '40', iniciais),
  )

  // Injeta mês de referência em B3 (substitui a shared string do Modelo por inlineStr)
  result = result.replace(
    '<c r="B3" s="45" t="s"><v>89</v></c>',
    () => celulaStr('B3', '45', mesReferencia),
  )

  // Injeta cada lançamento nas linhas 9, 10, 11, ... (n = i + 9)
  for (let i = 0; i < lancamentos.length; i++) {
    const n = i + 9
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
      () => celulaStr(`D${n}`, '41', mesReferencia),
    )
    result = result.replace(
      `<c r="E${n}" s="41"/>`,
      () => celulaStr(`E${n}`, '41', l.iniciais),
    )
    result = result.replace(
      `<c r="F${n}" s="11"/>`,
      () => celulaStr(`F${n}`, '11', l.natureza),
    )
    result = result.replace(
      `<c r="G${n}" s="11"/>`,
      () => celulaStr(`G${n}`, '11', l.descricao),
    )
    result = result.replace(
      `<c r="H${n}" s="43"/>`,
      () => celulaNum(`H${n}`, '43', l.valor),
    )
  }

  return result
}

/**
 * Títulos amigáveis da aba Dicionario, escritos na linha 1.
 * Ordem: Chave, Fonte, Natureza, Descrição, Iniciais, Vezes, Ambíguo
 */
const TITULOS_DICIONARIO = ['Chave', 'Fonte', 'Natureza', 'Descrição', 'Iniciais', 'Vezes', 'Ambíguo']

/**
 * Letras de coluna para as 7 colunas da aba Dicionario.
 */
const COLUNAS_DICIONARIO = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

/**
 * Gera o bloco <sheetData> completo para a aba Dicionario com as entradas passadas.
 *
 * Linha 1: cabeçalho com títulos amigáveis (Chave, Fonte, Natureza, Descrição, Iniciais, Vezes, Ambíguo).
 * Linhas 2+: dados de cada entrada.
 * Colunas: A=chave, B=fonte, C=natureza, D=descricao, E=iniciais, F=vezes (num), G=ambiguo (str)
 */
function gerarSheetDataDicionario(dicEntries: DicEntry[]): string {
  if (dicEntries.length === 0) {
    return '<sheetData/>'
  }

  // Linha 1: cabeçalho com os 7 títulos amigáveis
  const cabecalhoCells = TITULOS_DICIONARIO.map((titulo, i) =>
    celulaStr(`${COLUNAS_DICIONARIO[i]}1`, null, titulo),
  ).join('')
  const cabecalho = `<row r="1" spans="1:7">${cabecalhoCells}</row>`

  // Linhas de dados a partir de n=2
  const rows = dicEntries.map((entry, i) => {
    const n = i + 2
    const cells = [
      celulaStr(`A${n}`, null, entry.chave),
      celulaStr(`B${n}`, null, entry.fonte),
      celulaStr(`C${n}`, null, entry.natureza),
      celulaStr(`D${n}`, null, entry.descricao),
      celulaStr(`E${n}`, null, entry.iniciais),
      celulaNum(`F${n}`, null, entry.vezes),
      celulaStr(`G${n}`, null, entry.ambiguo ? 'true' : 'false'),
    ].join('')
    return `<row r="${n}" spans="1:7">${cells}</row>`
  })

  return `<sheetData>${cabecalho}${rows.join('')}</sheetData>`
}

/**
 * Substitui <sheetData/> da aba Dicionario pelas entradas geradas.
 */
function injetarDicionario(xml: string, dicEntries: DicEntry[]): string {
  return xml.replace('<sheetData/>', gerarSheetDataDicionario(dicEntries))
}

/**
 * Atualiza o atributo ref em table1.xml para o range correto com n linhas de dados.
 * A tabela tem cabeçalho em linha 8, dados a partir de linha 9 — layout Modelo 483f420:
 * - ref = A8:H{8+n} (mínimo A8:H8 quando n=0, apenas cabeçalho)
 *
 * Substitui TODOS os atributos ref="..." (tabela e autoFilter).
 */
function atualizarRefTabela1(xml: string, n: number): string {
  const ultimaLinha = 8 + n
  return xml.replace(/\bref="[^"]*"/g, () => `ref="A8:H${ultimaLinha}"`)
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
 * @param lancamentos - Lançamentos a injetar a partir da linha A9
 * @param dicEntries - Entradas do dicionário a injetar na aba Dicionario
 * @param mesReferencia - Mês de referência no formato YYYY-MM, gravado em B3 (obrigatório)
 * @returns Bytes do .xlsx gerado
 */
export function gerarXlsx(
  modelo: Uint8Array,
  iniciais: string,
  lancamentos: Lancamento[],
  dicEntries: DicEntry[],
  mesReferencia: string,
): Uint8Array {
  if (mesReferencia.trim() === '') {
    throw new Error('mesReferencia é obrigatório')
  }

  const parts = unzipSync(modelo)

  // 1. Modificar sheet1.xml (aba Extrato): B2, B3 e linhas de dados A9:H{8+n}
  const sheet1Xml = decoder.decode(parts['xl/worksheets/sheet1.xml'])
  parts['xl/worksheets/sheet1.xml'] = encoder.encode(
    injetarSheet1(sheet1Xml, iniciais, lancamentos, mesReferencia),
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
