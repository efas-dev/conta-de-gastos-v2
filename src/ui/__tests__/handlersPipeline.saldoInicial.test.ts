/**
 * Item 49 do TODO — saldo inicial em B4 do .xlsx gerado.
 *
 * Este arquivo prova o elo que faltava na corrente: `handleGerar` (o handler que o
 * botão "Baixar .xlsx" dispara) precisa repassar o `saldoAnterior` recebido nas deps
 * para `gerarAPartirDosRevisados`. Os demais elos têm prova própria:
 *   - store → `TelaRevisao` → deps: `TelaRevisao.test.tsx` (TL-49-9)
 *   - `gerarAPartirDosRevisados` → `gerarXlsx`: `pipeline.test.ts` (TL-49-7/8)
 *   - `gerarXlsx` → célula B4: `gerador.test.ts` (TL-49-1..6)
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Lancamento } from '../../types'

const { mockGerarAPartirDosRevisados } = vi.hoisted(() => ({
  mockGerarAPartirDosRevisados: vi.fn(() => new Uint8Array([80, 75, 3, 4])),
}))

vi.mock('../PipelineState', async (importOriginal) => {
  const original = await importOriginal<typeof import('../PipelineState')>()
  return {
    ...original,
    gerarAPartirDosRevisados: mockGerarAPartirDosRevisados,
  }
})

import { handleGerar, type DepsHandleGerar } from '../handlersPipeline'

const LANCAMENTO: Lancamento = {
  fonte: 'extrato_nubank',
  data: '2026-06-01',
  transcricao: 'Compra',
  valor: -100,
  iniciais: 'ES',
  natureza: 'ALI',
  descricao: 'Mercado',
}

function criarDeps(overrides: Partial<DepsHandleGerar> = {}): DepsHandleGerar {
  const anchor = document.createElement('a')
  anchor.click = vi.fn()
  return {
    modeloBytes: new Uint8Array([1, 2, 3]),
    lancamentos: [LANCAMENTO],
    iniciais: 'ES',
    dicEntries: [],
    mesEscolhido: '2026-06',
    saldoAnterior: null,
    anchorRef: { current: anchor },
    marcarLimpo: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // jsdom não implementa URL.createObjectURL/revokeObjectURL
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:teste')
  globalThis.URL.revokeObjectURL = vi.fn()
})

describe('handleGerar — saldo inicial (item 49)', () => {
  it('TL-49-10: repassa o saldoAnterior das deps como 6º arg de gerarAPartirDosRevisados', () => {
    handleGerar(criarDeps({ saldoAnterior: 1234.56 }))

    expect(mockGerarAPartirDosRevisados).toHaveBeenCalledOnce()
    const [, , , , , saldoArg] = mockGerarAPartirDosRevisados.mock.calls[0]
    expect(saldoArg).toBe(1234.56)
  })

  it('TL-49-11: sem .xlsx do mês anterior carregado, repassa null', () => {
    handleGerar(criarDeps({ saldoAnterior: null }))

    const [, , , , , saldoArg] = mockGerarAPartirDosRevisados.mock.calls[0]
    expect(saldoArg).toBeNull()
  })
})
