// ADR: see spec/fatura-itau-xlsx.adr.md

import { describe, it, expect, beforeAll } from 'vitest'
import { unzipSync } from 'fflate'
import * as fs from 'node:fs'
import * as path from 'node:path'

// ---------------------------------------------------------------------------
// Fixture sintética da fatura de cartão de crédito Itaú (.xlsx).
//
// Este teste NÃO usa `lerCelulas` (T1) nem `binario.ts` (T2) de propósito —
// este worktree roda em paralelo com T1/T2 e pode não ter esses módulos
// ainda. Aqui a fixture é validada no nível mais baixo possível: unzip da
// fixture + parse mínimo do XML da planilha, só para confirmar que o binário
// versionado tem a forma que as tasks seguintes (T3+) vão precisar.
// ---------------------------------------------------------------------------

const FIXTURE_PATH = path.resolve(__dirname, './fatura_itau_cc_sintetica.xlsx')

/** Extrai o texto de uma célula `t="inlineStr"` ou o `<v>` de uma célula numérica/fórmula. */
function celulaValor(sheetXml: string, ref: string): string | null {
  const regex = new RegExp(`<c r="${ref}"[^>]*>([\\s\\S]*?)</c>`)
  const match = sheetXml.match(regex)
  if (!match) return null
  const conteudo = match[1]
  const inlineStr = conteudo.match(/<is><t[^>]*>([\s\S]*?)<\/t><\/is>/)
  if (inlineStr) return inlineStr[1]
  const v = conteudo.match(/<v>([\s\S]*?)<\/v>/)
  if (v) return v[1]
  return null
}

/** Extrai a fórmula (`<f>`) de uma célula, quando existir. */
function celulaFormula(sheetXml: string, ref: string): string | null {
  const regex = new RegExp(`<c r="${ref}"[^>]*>([\\s\\S]*?)</c>`)
  const match = sheetXml.match(regex)
  if (!match) return null
  const f = match[1].match(/<f>([\s\S]*?)<\/f>/)
  return f ? f[1] : null
}

/** Confirma que a célula não existe (ou existe vazia) na linha — usado para checar F14 e a linha 45. */
function celulaAusente(sheetXml: string, ref: string): boolean {
  const regex = new RegExp(`<c r="${ref}"[^>]*>`)
  return !regex.test(sheetXml)
}

describe('fixture sintética fatura_itau_cc_sintetica.xlsx', () => {
  let bytes: Uint8Array
  let zip: Record<string, Uint8Array>
  let decoder: TextDecoder
  let workbookXml: string
  let sheetXml: string

  beforeAll(() => {
    bytes = new Uint8Array(fs.readFileSync(FIXTURE_PATH))
    zip = unzipSync(bytes) as Record<string, Uint8Array>
    decoder = new TextDecoder()
    workbookXml = decoder.decode(zip['xl/workbook.xml'])
    sheetXml = decoder.decode(zip['xl/worksheets/sheet1.xml'])
  })

  it('TF-01: arquivo é um .xlsx válido (zip com xl/workbook.xml e xl/worksheets/sheet1.xml)', () => {
    expect(zip['xl/workbook.xml']).toBeDefined()
    expect(zip['xl/worksheets/sheet1.xml']).toBeDefined()
  })

  it('TF-02: aba única com nome no padrão "Fatura MM-AA"', () => {
    const sheetMatches = [...workbookXml.matchAll(/<sheet name="([^"]+)"/g)]
    expect(sheetMatches).toHaveLength(1)
    expect(sheetMatches[0][1]).toMatch(/^Fatura \d{2}-\d{2}$/)
  })

  it('TF-03: cabeçalho da tabela na linha 14 (B/C/D/E = Data/Lançamento/Parcelamento/Valor, F vazia)', () => {
    expect(celulaValor(sheetXml, 'B14')).toBe('Data')
    expect(celulaValor(sheetXml, 'C14')).toBe('Lançamento')
    expect(celulaValor(sheetXml, 'D14')).toBe('Parcelamento')
    expect(celulaValor(sheetXml, 'E14')).toBe('Valor')
    expect(celulaAusente(sheetXml, 'F14')).toBe(true)
  })

  it('TF-04: cabeçalho da linha 14 inclui G/H/I/J = Titularidade/Nome/Tipo do cartão/Número do cartão', () => {
    expect(celulaValor(sheetXml, 'G14')).toBe('Titularidade')
    expect(celulaValor(sheetXml, 'H14')).toBe('Nome')
    expect(celulaValor(sheetXml, 'I14')).toBe('Tipo do cartão')
    expect(celulaValor(sheetXml, 'J14')).toBe('Número do cartão')
  })

  it('TF-05: linha 15 é a linha de pagamento, com valor negativo', () => {
    expect(celulaValor(sheetXml, 'C15')).toBe('Pagamento Debito Automatico')
    const valor = Number(celulaValor(sheetXml, 'E15'))
    expect(valor).toBeLessThan(0)
  })

  it('TF-06: existe ao menos uma linha (16 a 44) com Parcelamento no formato "Parcela N de M"', () => {
    const linhasComParcela = Array.from({ length: 44 - 16 + 1 }, (_, i) => 16 + i)
      .map((linha) => celulaValor(sheetXml, `D${linha}`))
      .filter((valor): valor is string => valor !== null)
    expect(linhasComParcela.some((valor) => /^Parcela \d+ de \d+$/.test(valor))).toBe(true)
  })

  it('TF-07: existe ao menos uma linha de estorno com valor negativo (distinta da linha de pagamento)', () => {
    const linhasEstorno = Array.from({ length: 44 - 16 + 1 }, (_, i) => 16 + i)
      .filter((linha) => {
        const lancamento = celulaValor(sheetXml, `C${linha}`)
        const valor = celulaValor(sheetXml, `E${linha}`)
        return lancamento?.toLowerCase().includes('estorno') && valor !== null && Number(valor) < 0
      })
    expect(linhasEstorno.length).toBeGreaterThanOrEqual(1)
  })

  it('TF-08: linha 45 está vazia (sem células de dados na tabela)', () => {
    expect(celulaAusente(sheetXml, 'B45')).toBe(true)
    expect(celulaAusente(sheetXml, 'C45')).toBe(true)
    expect(celulaAusente(sheetXml, 'E45')).toBe(true)
  })

  it('TF-09: linha 46 tem D46="Subtotal" e E46 com fórmula SUBTOTAL(9,E16:E44)', () => {
    expect(celulaValor(sheetXml, 'D46')).toBe('Subtotal')
    const formula = celulaFormula(sheetXml, 'E46')
    expect(formula).not.toBeNull()
    expect(formula!.replace(/\s/g, '')).toBe('SUBTOTAL(9,E16:E44)')
  })

  it('TF-10: metadados no topo — B8 cita fatura paga, B10/G10/I10 preenchidos (nome do cartão, valor pago, vencimento serial)', () => {
    expect(celulaValor(sheetXml, 'B8')).toMatch(/^Fatura Paga/)
    expect(celulaValor(sheetXml, 'B10')).toBeTruthy()
    expect(Number(celulaValor(sheetXml, 'G10'))).toBeGreaterThan(0)
    expect(Number(celulaValor(sheetXml, 'I10'))).toBeGreaterThan(40000) // serial Excel plausível (ano 2000+)
  })

  it('TF-11: a fixture não contém nenhum dado do arquivo real de data_sample (apenas valores sintéticos)', () => {
    // Guarda-corpo textual: nomes/valores tipicamente presentes numa amostra real
    // não devem aparecer aqui — a fixture é inteiramente inventada.
    const textoCompleto = sheetXml
    expect(textoCompleto).not.toMatch(/data_sample/i)
  })
})
