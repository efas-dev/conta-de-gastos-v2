// ADR: see Docs/specs/parsers-fatura-nubank-extrato-itau.adr.md
// Script fora do CI — somente lê e reporta, não conserta.

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { unzipSync } from 'fflate'

const decoder = new TextDecoder()

function erro(msg: string): never {
  process.stderr.write(`[diagnostico-injecao] FALHA: ${msg}\n`)
  process.exit(1)
}

function ok(msg: string): void {
  process.stdout.write(`[diagnostico-injecao] OK: ${msg}\n`)
}

const MODELO_PATH = resolve(process.cwd(), 'Modelo.xlsx')

// Ler o Modelo.xlsx como bytes
let modeloBytes: Uint8Array
try {
  modeloBytes = new Uint8Array(readFileSync(MODELO_PATH))
} catch (e) {
  erro(`Modelo.xlsx não encontrado em ${MODELO_PATH}`)
}

// Descompactar o ZIP
let parts: ReturnType<typeof unzipSync>
try {
  parts = unzipSync(modeloBytes!)
} catch (e) {
  erro('Modelo.xlsx não é um ZIP válido (não é um arquivo .xlsx bem formado)')
}

// --- Âncora 1: xl/worksheets/sheet1.xml deve existir ---
if (!parts!['xl/worksheets/sheet1.xml']) {
  erro('xl/worksheets/sheet1.xml não encontrado no ZIP do Modelo.xlsx')
}

const sheet1Xml = decoder.decode(parts!['xl/worksheets/sheet1.xml'])

// --- Âncora 2: <c r="B2" s="40"/> — célula B2 onde iniciais são injetadas ---
if (!sheet1Xml.includes('<c r="B2" s="40"/>')) {
  erro(
    'Âncora B2 ausente em xl/worksheets/sheet1.xml: esperado <c r="B2" s="40"/> ' +
    '(usada por gerador.ts para injetar iniciais do usuário)',
  )
}

// --- Âncora 3: <c r="A8" s="42"/> — primeira linha de dados (linha 8, coluna Fonte) ---
if (!sheet1Xml.includes('<c r="A8" s="42"/>')) {
  erro(
    'Âncora A8 ausente em xl/worksheets/sheet1.xml: esperado <c r="A8" s="42"/> ' +
    '(usada por gerador.ts como primeira linha do corpo de lançamentos)',
  )
}

ok('sheet1.xml: âncoras B2 e A8 presentes com estilos corretos (s="40" e s="42")')

// --- Âncora 4: xl/worksheets/sheet2.xml (aba Dicionario) deve existir ---
if (!parts!['xl/worksheets/sheet2.xml']) {
  erro('xl/worksheets/sheet2.xml não encontrado no ZIP do Modelo.xlsx (aba Dicionario ausente)')
}

const sheet2Xml = decoder.decode(parts!['xl/worksheets/sheet2.xml'])

// --- Âncora 5: <sheetData/> na aba Dicionario (tag auto-fechada, sem dados) ---
if (!sheet2Xml.includes('<sheetData/>')) {
  erro(
    'Âncora <sheetData/> ausente em xl/worksheets/sheet2.xml: ' +
    'gerador.ts substitui este token para injetar entradas do dicionário; ' +
    'se o Modelo foi salvo com dados, a injeção não ocorrerá',
  )
}

ok('sheet2.xml: <sheetData/> presente (aba Dicionario vazia, pronta para injeção)')

// --- Âncora 6: xl/tables/table1.xml (definição da Tabela1) ---
if (!parts!['xl/tables/table1.xml']) {
  erro('xl/tables/table1.xml não encontrado no ZIP do Modelo.xlsx (Tabela1 ausente)')
}

const table1Xml = decoder.decode(parts!['xl/tables/table1.xml'])

// --- Âncora 7: atributo ref= em table1.xml (range da Tabela1, ajustado por gerador.ts) ---
if (!table1Xml.includes('ref=')) {
  erro(
    'Atributo ref= ausente em xl/tables/table1.xml: ' +
    'gerador.ts usa /\\bref="[^"]*"/g para atualizar o range de Tabela1; ' +
    'sem o atributo, o replace não produz efeito',
  )
}

// --- Âncora 8: nome displayName="Tabela1" em table1.xml ---
if (!table1Xml.includes('displayName="Tabela1"') && !table1Xml.includes('name="Tabela1"')) {
  erro(
    'Tabela1 não encontrada em xl/tables/table1.xml: ' +
    'esperado atributo name="Tabela1" ou displayName="Tabela1"',
  )
}

ok('table1.xml: Tabela1 presente com atributo ref= para ajuste de range')

// --- Âncora 9: xl/workbook.xml deve existir ---
if (!parts!['xl/workbook.xml']) {
  erro('xl/workbook.xml não encontrado no ZIP do Modelo.xlsx')
}

const workbookXml = decoder.decode(parts!['xl/workbook.xml'])

// --- Âncora 10: <calcPr em workbook.xml (para injeção de fullCalcOnLoad) ---
if (!workbookXml.includes('<calcPr')) {
  erro(
    '<calcPr não encontrado em xl/workbook.xml: ' +
    'gerador.ts injeta fullCalcOnLoad="1" neste elemento; ' +
    'se ausente, o Excel não recalcula fórmulas na abertura',
  )
}

ok('workbook.xml: <calcPr presente (fullCalcOnLoad será injetado pelo gerador)')

// --- Todas as âncoras válidas ---
process.stdout.write(
  '\n[diagnostico-injecao] RESULTADO: todas as âncoras do gerador.ts estão presentes e válidas no Modelo.xlsx atual.\n' +
  '[diagnostico-injecao] O commit d62bc68 não quebrou a compatibilidade de injeção cirúrgica.\n',
)
process.exit(0)
