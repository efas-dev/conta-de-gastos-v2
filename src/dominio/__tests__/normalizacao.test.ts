// ADR: see Docs/specs/mvp-vertical-nubank.adr.md

import { describe, it, expect } from 'vitest'
import { normalizarChave, normalizarParaBusca } from '../normalizacao'

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

  // TL-T5-07: regressão — normalizarChave preserva caixa e acentos (não foi alterada por T1)
  it('TL-06: preserva caixa original e acentos — não faz normalização além de remover data', () => {
    expect(normalizarChave('Café da Manhã')).toBe('Café da Manhã')
  })
})

// ---------------------------------------------------------------------------
// normalizarParaBusca — regressão T1 (thin wrapper adicionado em T1)
// ---------------------------------------------------------------------------

describe('normalizarParaBusca', () => {
  // TL-T5-06: converte para minúsculas e remove acentos
  it('REG-01: converte para minúsculas', () => {
    expect(normalizarParaBusca('PADARIA CENTRAL')).toBe('padaria central')
  })

  it('REG-02: remove acentos', () => {
    expect(normalizarParaBusca('Café')).toBe('cafe')
  })

  it('REG-03: combina remoção de data + minúsculas + sem acentos', () => {
    expect(normalizarParaBusca('PAG BOLETO ENERGIA 12/03')).toBe('pag boleto energia')
  })

  it('REG-04: string vazia retorna string vazia', () => {
    expect(normalizarParaBusca('')).toBe('')
  })
})
