// ADR: see Docs/decisions/spike-geracao-xlsx.adr.md
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import * as path from 'path'
import * as fs from 'fs'
import { extractExtrato, extractDicionario, ExtratoRow, DicionarioRow } from '../src/extract-golden.js'

const WORKTREE_ROOT = path.resolve(import.meta.dirname, '../..')
const GOLDEN_PATH = path.join(WORKTREE_ROOT, 'Modelo_preenchido.xlsx')
const DATASET_PATH = path.join(WORKTREE_ROOT, 'spike/fixtures/dataset.json')

async function loadWorkbook(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(GOLDEN_PATH)
  return wb
}

describe('extractExtrato', () => {
  it('retorna array com exatamente 65 objetos', async () => {
    const wb = await loadWorkbook()
    const extrato = extractExtrato(wb)
    expect(extrato).toHaveLength(65)
  })

  it('cada objeto tem as chaves Fonte, Data, Transcrição, Iniciais, Natureza, Descrição, Valor', async () => {
    const wb = await loadWorkbook()
    const extrato = extractExtrato(wb)
    const chaves: (keyof ExtratoRow)[] = ['Fonte', 'Data', 'Transcrição', 'Iniciais', 'Natureza', 'Descrição', 'Valor']
    for (const row of extrato) {
      for (const chave of chaves) {
        expect(row).toHaveProperty(chave)
      }
    }
  })

  it('Valor é do tipo number em todos os objetos', async () => {
    const wb = await loadWorkbook()
    const extrato = extractExtrato(wb)
    for (const row of extrato) {
      expect(typeof row.Valor).toBe('number')
    }
  })

  it('soma de Valor está dentro de ±0.005 de −6135.05', async () => {
    const wb = await loadWorkbook()
    const extrato = extractExtrato(wb)
    const soma = extrato.reduce((s, r) => s + r.Valor, 0)
    expect(Math.abs(soma - (-6135.05))).toBeLessThanOrEqual(0.005)
  })
})

describe('extractDicionario', () => {
  it('retorna array com exatamente 144 objetos', async () => {
    const wb = await loadWorkbook()
    const dicionario = extractDicionario(wb)
    expect(dicionario).toHaveLength(144)
  })

  it('cada objeto tem as chaves Fonte, Transcrição, Iniciais, Natureza, Descrição, Vezes', async () => {
    const wb = await loadWorkbook()
    const dicionario = extractDicionario(wb)
    const chaves: (keyof DicionarioRow)[] = ['Fonte', 'Transcrição', 'Iniciais', 'Natureza', 'Descrição', 'Vezes']
    for (const row of dicionario) {
      for (const chave of chaves) {
        expect(row).toHaveProperty(chave)
      }
    }
  })
})

describe('dataset.json no disco', () => {
  it('gerarDataset escreve dataset.json sem lançar erro', async () => {
    const { gerarDataset } = await import('../src/extract-golden.js')
    await expect(gerarDataset(GOLDEN_PATH, DATASET_PATH)).resolves.not.toThrow()
    expect(fs.existsSync(DATASET_PATH)).toBe(true)
  })

  it('dataset.json tem estrutura { extrato, dicionario } com contagens corretas', async () => {
    const raw = fs.readFileSync(DATASET_PATH, 'utf-8')
    const dataset = JSON.parse(raw)
    expect(Array.isArray(dataset.extrato)).toBe(true)
    expect(Array.isArray(dataset.dicionario)).toBe(true)
    expect(dataset.extrato).toHaveLength(65)
    expect(dataset.dicionario).toHaveLength(144)
  })
})
