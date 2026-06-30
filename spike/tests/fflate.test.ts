// ADR: see spec/spike-geracao-xlsx.adr.md
import { describe, it, expect, beforeAll } from 'vitest'
import { unzipSync } from 'fflate'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { assertXmlParity } from './helpers/xml-diff.js'
import { assertDataMatch } from './helpers/golden-checker.js'
// Importação antecipada: o módulo ainda não existe — Red por erro de módulo
import { candidateFflate } from '../src/candidate-fflate.js'
import datasetRaw from '../fixtures/dataset.json' assert { type: 'json' }
import type { Dataset } from '../src/extract-golden.js'

const dataset = datasetRaw as unknown as Dataset

const WORKTREE_ROOT = path.resolve(import.meta.dirname, '../..')
const MODELO_PATH = path.join(WORKTREE_ROOT, 'Modelo.xlsx')
const OUTPUT_PATH = path.resolve(import.meta.dirname, '../output/fflate-output.xlsx')
const REPORT_PATH = path.resolve(import.meta.dirname, '../output/fflate-report.json')
const VIRGEM_PARTS_DIR = path.resolve(import.meta.dirname, '../fixtures/virgem-parts')

describe('candidata fflate', () => {
  beforeAll(async () => {
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
    // Se candidateFflate lançar, beforeAll falha → C1 = fail
    await candidateFflate(MODELO_PATH, OUTPUT_PATH, REPORT_PATH, dataset, VIRGEM_PARTS_DIR)
  })

  it('C1 — executa sem lançar exceção (beforeAll concluiu)', () => {
    // Trivialmente verdadeiro se beforeAll completou sem lançar
    expect(fs.existsSync(OUTPUT_PATH)).toBe(true)
  })

  it('C4 — ref da Tabela1 ajustado para A7:G72', () => {
    const outputZip = new Uint8Array(fs.readFileSync(OUTPUT_PATH))
    const parts = unzipSync(outputZip)
    const table1Bytes = parts['xl/tables/table1.xml']
    expect(table1Bytes).toBeDefined()
    const table1Xml = new TextDecoder().decode(table1Bytes)
    expect(table1Xml).toContain('ref="A7:G72"')
  })

  it('C7 — assertXmlParity passa: diff só muda sheetData de Extrato/Dicionario e ref de Tabela1', () => {
    const outputZip = new Uint8Array(fs.readFileSync(OUTPUT_PATH))
    // Lança Error descritivo se qualquer parte não-autorizada divergir do virgem
    expect(() => assertXmlParity(outputZip, VIRGEM_PARTS_DIR)).not.toThrow()
  })

  it('C8 — assertDataMatch confirma 65 lançamentos, 144 entradas e soma −6135.05', async () => {
    const outputZip = new Uint8Array(fs.readFileSync(OUTPUT_PATH))
    // Lança Error descritivo em caso de divergência — falha o teste
    await assertDataMatch(outputZip, dataset)
  })

  it('relatório JSON contém os 9 critérios C1–C9', () => {
    const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8'))
    for (const c of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9']) {
      expect(report, `relatório deve conter ${c}`).toHaveProperty(c)
    }
  })

  it('relatório contém bundleSizeBytes como número positivo', () => {
    const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8'))
    expect(typeof report.bundleSizeBytes).toBe('number')
    expect(report.bundleSizeBytes).toBeGreaterThan(0)
  })

  it('relatório contém tempoMedioMs como número positivo (C9)', () => {
    const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8'))
    expect(typeof report.tempoMedioMs).toBe('number')
    expect(report.tempoMedioMs).toBeGreaterThan(0)
  })
})
