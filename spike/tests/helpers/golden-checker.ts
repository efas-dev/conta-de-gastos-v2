// ADR: see spec/spike-geracao-xlsx.adr.md
import ExcelJS from 'exceljs'
import type { Dataset } from '../../src/extract-golden.js'
import { extractExtrato, extractDicionario } from '../../src/extract-golden.js'

/**
 * Verifica que os dados injetados no candidateZip correspondem exatamente
 * ao dataset extraído em T2 (incluindo contagens e soma dos valores do Extrato).
 *
 * Lança Error descritivo em caso de divergência.
 */
export async function assertDataMatch(candidateZip: Uint8Array, dataset: Dataset): Promise<void> {
  const wb = new ExcelJS.Workbook()
  // ExcelJS aceita Buffer diretamente; converte Uint8Array mantendo o offset correto
  const buffer = Buffer.from(
    candidateZip.buffer,
    candidateZip.byteOffset,
    candidateZip.byteLength
  )
  await wb.xlsx.load(buffer)

  const extrato = extractExtrato(wb)
  const dicionario = extractDicionario(wb)

  // Verifica contagens
  if (extrato.length !== dataset.extrato.length) {
    throw new Error(
      `assertDataMatch: Extrato com ${extrato.length} lançamentos; ` +
      `esperado ${dataset.extrato.length}`
    )
  }

  if (dicionario.length !== dataset.dicionario.length) {
    throw new Error(
      `assertDataMatch: Dicionario com ${dicionario.length} entradas; ` +
      `esperado ${dataset.dicionario.length}`
    )
  }

  // Verifica soma dos valores do Extrato (tolerância ±0.005 conforme spec)
  const somaCandidate = extrato.reduce((s, r) => s + r.Valor, 0)
  const somaDataset = dataset.extrato.reduce((s, r) => s + r.Valor, 0)
  if (Math.abs(somaCandidate - somaDataset) > 0.005) {
    throw new Error(
      `assertDataMatch: soma do Extrato = ${somaCandidate.toFixed(4)}; ` +
      `esperado ${somaDataset.toFixed(4)} (dataset). Divergência = ${Math.abs(somaCandidate - somaDataset).toFixed(6)}`
    )
  }

  // Verifica cada lançamento do Extrato
  for (let i = 0; i < extrato.length; i++) {
    const c = extrato[i]
    const d = dataset.extrato[i]
    if (
      c.Fonte !== d.Fonte ||
      c.Transcrição !== d.Transcrição ||
      c.Iniciais !== d.Iniciais ||
      c.Natureza !== d.Natureza ||
      c.Descrição !== d.Descrição ||
      Math.abs(c.Valor - d.Valor) > 0.001
    ) {
      throw new Error(
        `assertDataMatch: Extrato linha ${i + 8} (índice ${i}) diverge do dataset.\n` +
        `  Candidato: ${JSON.stringify(c)}\n` +
        `  Dataset:   ${JSON.stringify(d)}`
      )
    }
  }

  // Verifica cada entrada do Dicionario
  for (let i = 0; i < dicionario.length; i++) {
    const c = dicionario[i]
    const d = dataset.dicionario[i]
    if (
      c.Fonte !== d.Fonte ||
      c.Transcrição !== d.Transcrição ||
      c.Iniciais !== d.Iniciais ||
      c.Natureza !== d.Natureza ||
      c.Descrição !== d.Descrição
    ) {
      throw new Error(
        `assertDataMatch: Dicionario linha ${i + 2} (índice ${i}) diverge do dataset.\n` +
        `  Candidato: ${JSON.stringify(c)}\n` +
        `  Dataset:   ${JSON.stringify(d)}`
      )
    }
  }
}
