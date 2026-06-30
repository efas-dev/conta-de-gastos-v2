// ADR: see spec/spike-geracao-xlsx.adr.md
import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import { assertXmlParity } from './helpers/xml-diff.js'
import { zipDiff } from './helpers/zip-diff.js'
import { assertDataMatch } from './helpers/golden-checker.js'
import type { Dataset } from '../src/extract-golden.js'

// Caminhos absolutos resolvidos a partir da raiz do worktree
const worktreeRoot = path.resolve(import.meta.dirname, '../..')
const virgemPath = path.join(worktreeRoot, 'Modelo.xlsx')
const virgemDir = path.join(worktreeRoot, 'spike/fixtures/virgem-parts')
const datasetPath = path.join(worktreeRoot, 'spike/fixtures/dataset.json')
const preenchidoPath = path.join(worktreeRoot, 'Modelo_preenchido.xlsx')

// --- Utilitários de fixture ---

function readZip(filePath: string): Uint8Array {
  const buf = fs.readFileSync(filePath)
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}

function makeModifiedZip(
  basePath: string,
  partPath: string,
  modifier: (content: string) => string
): Uint8Array {
  const original = readZip(basePath)
  const parts = unzipSync(original)
  const dec = new TextDecoder()
  const enc = new TextEncoder()
  const modified = { ...parts }
  modified[partPath] = enc.encode(modifier(dec.decode(parts[partPath])))
  return zipSync(modified)
}

// --- virgem-parts/ ---

describe('virgem-parts/', () => {
  it('contém exatamente os caminhos do ZIP virgem', () => {
    const parts = unzipSync(readZip(virgemPath))
    const expectedPaths = Object.keys(parts).sort()
    const actualPaths = (fs.readdirSync(virgemDir, { recursive: true }) as string[])
      .filter(f => !fs.statSync(path.join(virgemDir, f)).isDirectory())
      .map(f => f.replace(/\\/g, '/'))
      .sort()
    expect(actualPaths).toEqual(expectedPaths)
  })

  it('cada arquivo é byte-a-byte idêntico à parte correspondente do ZIP', () => {
    const parts = unzipSync(readZip(virgemPath))
    for (const [partPath, partData] of Object.entries(parts)) {
      const filePath = path.join(virgemDir, partPath)
      const fileData = fs.readFileSync(filePath)
      expect(fileData.length, `tamanho diverge em ${partPath}`).toBe(partData.length)
      for (let i = 0; i < partData.length; i++) {
        if (fileData[i] !== partData[i]) {
          throw new Error(`byte ${i} diverge em ${partPath}`)
        }
      }
    }
  })
})

// --- zipDiff ---

describe('zipDiff', () => {
  it('retorna array vazio quando dois ZIPs são idênticos', () => {
    const zip = readZip(virgemPath)
    expect(zipDiff(zip, zip)).toEqual([])
  })

  it('retorna a parte divergente quando b difere apenas em xl/styles.xml', () => {
    const a = readZip(virgemPath)
    const b = makeModifiedZip(virgemPath, 'xl/styles.xml', (xml) => xml + '<!-- alterado -->')
    const diff = zipDiff(a, b)
    expect(diff).toContain('xl/styles.xml')
    expect(diff.filter(p => p !== 'xl/styles.xml')).toEqual([])
  })
})

// --- assertXmlParity ---

describe('assertXmlParity', () => {
  it('não lança quando candidato é idêntico ao virgem', () => {
    expect(() => assertXmlParity(readZip(virgemPath), virgemDir)).not.toThrow()
  })

  it('não lança quando candidato difere apenas em <sheetData> de sheet1.xml (Extrato)', () => {
    const zip = makeModifiedZip(
      virgemPath,
      'xl/worksheets/sheet1.xml',
      (xml) => xml.replace(
        /<sheetData>[\s\S]*?<\/sheetData>/,
        '<sheetData><row r="8"><c r="A8" t="s"><v>99</v></c></row></sheetData>'
      )
    )
    expect(() => assertXmlParity(zip, virgemDir)).not.toThrow()
  })

  it('não lança quando candidato difere apenas em <sheetData> de sheet2.xml (Dicionario)', () => {
    const zip = makeModifiedZip(
      virgemPath,
      'xl/worksheets/sheet2.xml',
      (xml) => xml.replace(
        /<sheetData>[\s\S]*?<\/sheetData>/,
        '<sheetData><row r="2"><c r="A2" t="s"><v>5</v></c></row></sheetData>'
      )
    )
    expect(() => assertXmlParity(zip, virgemDir)).not.toThrow()
  })

  it('não lança quando candidato difere apenas no atributo ref de table1.xml', () => {
    const zip = makeModifiedZip(
      virgemPath,
      'xl/tables/table1.xml',
      (xml) => xml.replace(/ref="A7:G503"/g, 'ref="A7:G72"')
    )
    expect(() => assertXmlParity(zip, virgemDir)).not.toThrow()
  })

  it('lança Error com nome da parte quando candidato difere em xl/styles.xml', () => {
    const zip = makeModifiedZip(virgemPath, 'xl/styles.xml', (xml) => xml + '<!-- alterado -->')
    expect(() => assertXmlParity(zip, virgemDir)).toThrowError(/xl\/styles\.xml/)
  })

  it('lança Error com nome da parte quando candidato difere em xl/worksheets/sheet3.xml (Naturezas)', () => {
    const zip = makeModifiedZip(
      virgemPath,
      'xl/worksheets/sheet3.xml',
      (xml) => xml.replace('<sheetData>', '<sheetData><!-- alterado -->')
    )
    expect(() => assertXmlParity(zip, virgemDir)).toThrowError(/xl\/worksheets\/sheet3\.xml/)
  })
})

// --- assertDataMatch ---

describe('assertDataMatch', () => {
  let dataset: Dataset

  beforeAll(() => {
    dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8')) as Dataset
  })

  it('não lança quando candidato tem exatamente os 65 lançamentos e soma ≈ −6135.05', async () => {
    // Usa Modelo_preenchido.xlsx como candidato real com os dados do dataset
    const zip = readZip(preenchidoPath)
    await expect(assertDataMatch(zip, dataset)).resolves.toBeUndefined()
  })

  it('lança quando candidato tem número errado de linhas no Extrato', async () => {
    const zip = readZip(virgemPath)
    const reducedDataset: Dataset = {
      extrato: dataset.extrato.slice(0, 64),
      dicionario: dataset.dicionario,
    }
    await expect(assertDataMatch(zip, reducedDataset)).rejects.toThrow()
  })

  it('lança quando candidato tem número errado de linhas no Dicionário', async () => {
    const zip = readZip(virgemPath)
    const reducedDataset: Dataset = {
      extrato: dataset.extrato,
      dicionario: dataset.dicionario.slice(0, 143),
    }
    await expect(assertDataMatch(zip, reducedDataset)).rejects.toThrow()
  })

  it('lança quando soma dos valores diverge de −6135.05 por mais de 0.005', async () => {
    const zip = readZip(virgemPath)
    const alteredDataset: Dataset = {
      extrato: dataset.extrato.map((r, i) =>
        i === 0 ? { ...r, Valor: r.Valor + 1000 } : r
      ),
      dicionario: dataset.dicionario,
    }
    await expect(assertDataMatch(zip, alteredDataset)).rejects.toThrow()
  })
})
