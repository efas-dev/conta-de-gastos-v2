// ADR: see Docs/specs/mvp-vertical-nubank.adr.md

import { describe, it, expect, vi } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { lerDicionario, lerNaturezas, ehDicionario, lerIniciais } from '../leitor'
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

// ---------------------------------------------------------------------------
// lerNaturezas — fixture real Modelo.xlsx
// ---------------------------------------------------------------------------

const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../writer/__tests__/fixtures/Modelo.xlsx',
)

describe('lerNaturezas — fixture Modelo.xlsx (happy path)', () => {
  const bytes = new Uint8Array(fs.readFileSync(FIXTURE_PATH))
  const naturezas = lerNaturezas(bytes)

  it('TN-01: retorna array não-vazio', () => {
    expect(naturezas.length).toBeGreaterThan(0)
  })

  it('TN-02: retorna exatamente 30 itens (B3:B32 preenchidas no Modelo)', () => {
    expect(naturezas).toHaveLength(30)
  })

  it('TN-03: primeiro valor é "RR" (célula B3 do Modelo)', () => {
    expect(naturezas[0]).toBe('RR')
  })

  it('TN-04: último valor é "IT" (célula B32 do Modelo)', () => {
    expect(naturezas[29]).toBe('IT')
  })
})

// ---------------------------------------------------------------------------
// lerNaturezas — robustez
// ---------------------------------------------------------------------------

describe('lerNaturezas — robustez com entradas inválidas', () => {
  it('TN-05: bytes vazios retorna []', () => {
    expect(lerNaturezas(new Uint8Array(0))).toEqual([])
  })

  it('TN-06: bytes inválidos (não-ZIP) retorna [] sem lançar exceção', () => {
    const bytesInvalidos = new Uint8Array([0, 1, 2, 3, 99, 88])
    expect(() => lerNaturezas(bytesInvalidos)).not.toThrow()
    expect(lerNaturezas(bytesInvalidos)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// lerNaturezas — .xlsx sem aba Naturezas
// ---------------------------------------------------------------------------

describe('lerNaturezas — .xlsx sem aba Naturezas', () => {
  it('TN-07: retorna [] quando aba Naturezas ausente', () => {
    // Reusa a helper de Dicionario que só tem aba "Dicionario"
    const bytes = criarXlsxDicionario([CABECALHO, ...LINHAS_DADOS])
    expect(lerNaturezas(bytes)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Helper: cria .xlsx com aba "Extrato" contendo B2 com valor opcional
// ---------------------------------------------------------------------------

function criarXlsxComExtrato(valorB2: string | null): Uint8Array {
  // Constrói sheetData: sempre inclui linha 1 (placeholder) e linha 2 (B2)
  const b2Cell = valorB2 !== null
    ? `<c r="B2" t="inlineStr"><is><t>${valorB2}</t></is></c>`
    : ''
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>Mês</t></is></c></row>
    <row r="2">${b2Cell}</row>
  </sheetData>
</worksheet>`

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
  <Default Extension="xml" ContentType="application/xml"/>
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
// ehDicionario — Test List T1-ED-01 a T1-ED-04
// ---------------------------------------------------------------------------

describe('ehDicionario — .xlsx com aba Dicionario legível', () => {
  it('T1-ED-01: retorna true para .xlsx com aba Dicionario legível', () => {
    const bytes = criarXlsxDicionario(LINHAS_FIXTURE)
    expect(ehDicionario(bytes)).toBe(true)
  })
})

describe('ehDicionario — .xlsx sem aba Dicionario', () => {
  it('T1-ED-02: retorna false para .xlsx sem aba Dicionario', () => {
    const bytes = criarXlsxComExtrato('ES')
    expect(ehDicionario(bytes)).toBe(false)
  })
})

describe('ehDicionario — bytes inválidos', () => {
  it('T1-ED-03: retorna false para bytes não-ZIP sem lançar exceção', () => {
    const bytesInvalidos = new Uint8Array([0, 1, 2, 3])
    expect(() => ehDicionario(bytesInvalidos)).not.toThrow()
    expect(ehDicionario(bytesInvalidos)).toBe(false)
  })

  it('T1-ED-04: retorna false para Uint8Array vazio', () => {
    expect(ehDicionario(new Uint8Array(0))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// lerIniciais — Test List T1-LI-01 a T1-LI-04
// ---------------------------------------------------------------------------

describe('lerIniciais — aba Extrato com B2 preenchida', () => {
  it('T1-LI-01: retorna a string de B2 quando preenchida', () => {
    const bytes = criarXlsxComExtrato('ES')
    expect(lerIniciais(bytes)).toBe('ES')
  })

  it('T1-LI-02: retorna null quando B2 está vazia (célula ausente na linha)', () => {
    const bytes = criarXlsxComExtrato(null)
    expect(lerIniciais(bytes)).toBeNull()
  })
})

describe('lerIniciais — aba Extrato ausente', () => {
  it('T1-LI-03: retorna null quando não há aba Extrato', () => {
    // .xlsx com aba Dicionario mas sem Extrato
    const bytes = criarXlsxDicionario(LINHAS_FIXTURE)
    expect(lerIniciais(bytes)).toBeNull()
  })
})

describe('lerIniciais — bytes inválidos', () => {
  it('T1-LI-04: retorna null para bytes não-ZIP sem lançar exceção', () => {
    const bytesInvalidos = new Uint8Array([0, 1, 2, 3])
    expect(() => lerIniciais(bytesInvalidos)).not.toThrow()
    expect(lerIniciais(bytesInvalidos)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// lerDicionario — normalização de acentos e caixa (T1-NA-01 a T1-NA-03)
// ---------------------------------------------------------------------------

describe('lerDicionario — normalização de acentos NFD no cabeçalho', () => {
  it('T1-NA-01: reconhece coluna "Descrição" (com acento) e popula descricao', () => {
    // Cabeçalho com acentos amigáveis, como o writer vai exportar após T2
    const cabecalhoComAcento = ['Chave', 'Fonte', 'Natureza', 'Descrição', 'Iniciais', 'Vezes', 'Ambíguo']
    const linhas = [
      cabecalhoComAcento,
      ['PAG LUZ', 'Nubank', 'Moradia', 'Conta de energia', 'ES', 1, 'false'],
    ]
    const bytes = criarXlsxDicionario(linhas)
    const resultado = lerDicionario(bytes)
    expect(resultado).toHaveLength(1)
    expect(resultado[0].descricao).toBe('Conta de energia')
    expect(resultado[0].chave).toBe('PAG LUZ')
  })

  it('T1-NA-02: normaliza MAIÚSCULAS no cabeçalho (CHAVE → chave)', () => {
    const cabecalhoMaiusculo = ['CHAVE', 'FONTE', 'NATUREZA', 'DESCRICAO', 'INICIAIS', 'VEZES', 'AMBIGUO']
    const linhas = [
      cabecalhoMaiusculo,
      ['MERCADO', 'Nubank', 'Alimentação', 'Super', 'ES', 2, 'false'],
    ]
    const bytes = criarXlsxDicionario(linhas)
    const resultado = lerDicionario(bytes)
    expect(resultado).toHaveLength(1)
    expect(resultado[0].chave).toBe('MERCADO')
  })

  it('T1-NA-03: compatibilidade retro com cabeçalho sem acento (descricao → descricao)', () => {
    // Dicionários exportados antes desta spec: coluna "descricao" sem acento
    const cabecalhoSemAcento = ['chave', 'fonte', 'natureza', 'descricao', 'iniciais', 'vezes', 'ambiguo']
    const linhas = [
      cabecalhoSemAcento,
      ['SUPERMERCADO', 'Nubank', 'Alimentação', 'Compras do mês', 'ES', 5, 'true'],
    ]
    const bytes = criarXlsxDicionario(linhas)
    const resultado = lerDicionario(bytes)
    expect(resultado).toHaveLength(1)
    expect(resultado[0].descricao).toBe('Compras do mês')
    expect(resultado[0].ambiguo).toBe(true)
  })
})
