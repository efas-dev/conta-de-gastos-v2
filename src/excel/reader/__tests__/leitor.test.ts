// ADR: see spec/mvp-vertical-nubank.adr.md

import { describe, it, expect, vi } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { lerDicionario } from '../leitor'
import type { DicEntry } from '../../../types'

// ---------------------------------------------------------------------------
// Helper: cria um .xlsx sintético mínimo com aba "Dicionario"
// ---------------------------------------------------------------------------

/**
 * Constrói um ZIP OOXML mínimo com uma única aba chamada "Dicionario".
 * Cada célula usa `t="inlineStr"` para evitar dependência de sharedStrings.
 *
 * @param linhas  Matriz de strings, primeira linha = cabeçalho, demais = dados.
 *                Para forçar valor numérico (ex.: vezes), passe o número como string;
 *                o helper identifica colunas numéricas pelo cabeçalho.
 */
function criarXlsxDicionario(linhas: (string | number)[][]): Uint8Array {
  const colLetra = (idx: number): string => {
    // idx 0-based → letra(s) A-Z, AA-AZ, etc.
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

    // Linha de cabeçalho: sempre string inline
    if (linhaIdx === 0) {
      return `<c r="${ref}" t="inlineStr"><is><t>${String(valor)}</t></is></c>`
    }

    // Coluna booleana: valor como string inline ("true"/"false")
    if (COLUNAS_BOOLEANAS.has(nomCol)) {
      return `<c r="${ref}" t="inlineStr"><is><t>${String(valor)}</t></is></c>`
    }

    // Coluna numérica: valor numérico sem t
    if (COLUNAS_NUMERICAS.has(nomCol)) {
      return `<c r="${ref}"><v>${String(valor)}</v></c>`
    }

    // Strings: inline
    return `<c r="${ref}" t="inlineStr"><is><t>${String(valor)}</t></is></c>`
  }

  const buildLinhas = (): string =>
    linhas
      .map((linha, li) => {
        const celulas = linha
          .map((val, ci) => buildCelula(val, li, ci))
          .join('')
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

  const zipData = {
    '[Content_Types].xml': strToU8(contentTypesXml),
    '_rels/.rels': strToU8(rootRelsXml),
    'xl/workbook.xml': strToU8(workbookXml),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRelsXml),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml),
  }

  return zipSync(zipData)
}

// ---------------------------------------------------------------------------
// Dados de teste
// ---------------------------------------------------------------------------

const CABECALHO = ['chave', 'fonte', 'natureza', 'descricao', 'iniciais', 'vezes', 'ambiguo']

const LINHAS_DADOS: (string | number)[][] = [
  ['PAG ENERGIA', 'Nubank', 'Moradia', 'Conta de luz', 'ES', 3, 'false'],
  ['MERCADO', 'Nubank', 'Alimentação', 'Supermercado', 'ES', 7, 'false'],
  ['ACADEMIA', 'Nubank', 'Saúde', 'Mensalidade academia', 'ES', 2, 'true'],
]

const LINHAS_FIXTURE = [CABECALHO, ...LINHAS_DADOS]

// ---------------------------------------------------------------------------
// TL-01 a TL-06: happy path — extração correta dos campos
// ---------------------------------------------------------------------------

describe('lerDicionario — happy path', () => {
  const bytes = criarXlsxDicionario(LINHAS_FIXTURE)
  const resultado = lerDicionario(bytes)

  it('TL-01: retorna 3 entradas para fixture com 3 linhas de dados', () => {
    expect(resultado).toHaveLength(3)
  })

  it('TL-02: campo chave correto em cada DicEntry', () => {
    expect(resultado[0].chave).toBe('PAG ENERGIA')
    expect(resultado[1].chave).toBe('MERCADO')
    expect(resultado[2].chave).toBe('ACADEMIA')
  })

  it('TL-03: campo fonte correto em cada DicEntry', () => {
    expect(resultado[0].fonte).toBe('Nubank')
    expect(resultado[1].fonte).toBe('Nubank')
    expect(resultado[2].fonte).toBe('Nubank')
  })

  it('TL-04: campo natureza correto em cada DicEntry', () => {
    expect(resultado[0].natureza).toBe('Moradia')
    expect(resultado[1].natureza).toBe('Alimentação')
    expect(resultado[2].natureza).toBe('Saúde')
  })

  it('TL-05: campo descricao correto em cada DicEntry', () => {
    expect(resultado[0].descricao).toBe('Conta de luz')
    expect(resultado[1].descricao).toBe('Supermercado')
    expect(resultado[2].descricao).toBe('Mensalidade academia')
  })

  it('TL-06: campo iniciais correto em cada DicEntry', () => {
    expect(resultado[0].iniciais).toBe('ES')
    expect(resultado[1].iniciais).toBe('ES')
    expect(resultado[2].iniciais).toBe('ES')
  })
})

// ---------------------------------------------------------------------------
// TL-07: vezes e ambiguo presentes → populados corretamente
// ---------------------------------------------------------------------------

describe('lerDicionario — campos vezes e ambiguo', () => {
  const bytes = criarXlsxDicionario(LINHAS_FIXTURE)
  const resultado = lerDicionario(bytes)

  it('TL-07a: vezes numérico quando presente na planilha', () => {
    expect(resultado[0].vezes).toBe(3)
    expect(resultado[1].vezes).toBe(7)
    expect(resultado[2].vezes).toBe(2)
  })

  it('TL-07b: ambiguo boolean quando presente na planilha', () => {
    expect(resultado[0].ambiguo).toBe(false)
    expect(resultado[1].ambiguo).toBe(false)
    expect(resultado[2].ambiguo).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// TL-08: colunas vezes e ambiguo ausentes → defaults 0 e false
// ---------------------------------------------------------------------------

describe('lerDicionario — defaults quando colunas vezes/ambiguo ausentes', () => {
  const cabecalhoSemOpcional = ['chave', 'fonte', 'natureza', 'descricao', 'iniciais']
  const linhasSemOpcional = [
    cabecalhoSemOpcional,
    ['PAG ENERGIA', 'Nubank', 'Moradia', 'Conta de luz', 'ES'],
  ]
  const bytes = criarXlsxDicionario(linhasSemOpcional)
  const resultado = lerDicionario(bytes)

  it('TL-08a: vezes default 0 quando coluna ausente', () => {
    expect(resultado[0].vezes).toBe(0)
  })

  it('TL-08b: ambiguo default false quando coluna ausente', () => {
    expect(resultado[0].ambiguo).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TL-09 a TL-13: robustez com entradas inválidas
// ---------------------------------------------------------------------------

describe('lerDicionario — robustez com bytes inválidos', () => {
  it('TL-09: bytes inválidos (não ZIP) retorna [] sem lançar exceção', () => {
    const bytesInvalidos = new Uint8Array([0, 1, 2, 3, 99, 88])
    expect(() => lerDicionario(bytesInvalidos)).not.toThrow()
    expect(lerDicionario(bytesInvalidos)).toEqual([])
  })

  it('TL-10: bytes inválidos chama onAviso com mensagem não-vazia', () => {
    const bytesInvalidos = new Uint8Array([0, 1, 2, 3, 99, 88])
    const onAviso = vi.fn()
    lerDicionario(bytesInvalidos, onAviso)
    expect(onAviso).toHaveBeenCalledOnce()
    expect(onAviso.mock.calls[0][0]).toBeTruthy()
  })

  it('TL-11: Uint8Array vazio retorna [] sem lançar exceção', () => {
    expect(() => lerDicionario(new Uint8Array(0))).not.toThrow()
    expect(lerDicionario(new Uint8Array(0))).toEqual([])
  })

  it('TL-12: Uint8Array vazio chama onAviso quando callback fornecido', () => {
    const onAviso = vi.fn()
    lerDicionario(new Uint8Array(0), onAviso)
    expect(onAviso).toHaveBeenCalledOnce()
  })

  it('TL-13: sem callback onAviso não lança exceção com bytes inválidos', () => {
    const bytesInvalidos = new Uint8Array([5, 10, 15])
    expect(() => lerDicionario(bytesInvalidos)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// TL-14: .xlsx sem aba "Dicionario" → [] e onAviso
// ---------------------------------------------------------------------------

describe('lerDicionario — .xlsx sem aba Dicionario', () => {
  it('TL-14: retorna [] e chama onAviso quando aba Dicionario ausente', () => {
    // Cria um xlsx com aba de outro nome
    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Extrato" sheetId="1" r:id="rId1"/>
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
</Types>`

    const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="xl/workbook.xml"/>
</Relationships>`

    const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData/>
</worksheet>`

    const bytes = zipSync({
      '[Content_Types].xml': strToU8(contentTypesXml),
      '_rels/.rels': strToU8(rootRelsXml),
      'xl/workbook.xml': strToU8(workbookXml),
      'xl/_rels/workbook.xml.rels': strToU8(workbookRelsXml),
      'xl/worksheets/sheet1.xml': strToU8(sheetXml),
    })

    const onAviso = vi.fn()
    const resultado = lerDicionario(bytes, onAviso)

    expect(resultado).toEqual([])
    expect(onAviso).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// TL-15: aba Dicionario só com cabeçalho → []
// ---------------------------------------------------------------------------

describe('lerDicionario — aba Dicionario com apenas cabeçalho', () => {
  it('TL-15: retorna [] quando planilha tem só cabeçalho (sem dados)', () => {
    const bytes = criarXlsxDicionario([CABECALHO])
    const resultado = lerDicionario(bytes)
    expect(resultado).toEqual([])
  })
})
