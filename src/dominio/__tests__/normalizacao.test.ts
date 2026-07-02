// ADR: see Docs/specs/mvp-vertical-nubank.adr.md

import { describe, it, expect } from 'vitest'
import { normalizarChave } from '../normalizacao'

describe('normalizarChave', () => {
  it('TL-01: remove sufixo DD/MM no final da transcrição', () => {
    expect(normalizarChave('PAG BOLETO ENERGIA 12/03')).toBe('PAG BOLETO ENERGIA')
  })

  it('TL-02: não altera transcrição sem sufixo de data', () => {
    expect(normalizarChave('Transferência recebida pelo Pix - Salário')).toBe(
      'Transferência recebida pelo Pix - Salário',
    )
  })

  it('TL-03: retorna string vazia para entrada vazia', () => {
    expect(normalizarChave('')).toBe('')
  })

  it('TL-04: remove sufixo DD/MM/AAAA no final da transcrição', () => {
    expect(normalizarChave('COMPRA 15/06/2025')).toBe('COMPRA')
  })

  it('TL-05: não remove data que não está no final da transcrição', () => {
    expect(normalizarChave('PAG BOLETO 12/03 ENERGIA')).toBe('PAG BOLETO 12/03 ENERGIA')
  })
})
