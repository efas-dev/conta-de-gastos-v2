/**
 * Testes do decodificador de CSV com fallback de encoding (UTF-8 → Windows-1252).
 *
 * Motivação: o Banco do Brasil exporta extratos em ISO-8859-1; `File.text()`
 * assume UTF-8 e corromperia os acentos. Ver `decodificar.ts`.
 */

import { describe, it, expect } from 'vitest'
import { decodificarCsv } from '../decodificar'

describe('decodificarCsv', () => {
  it('TL-DEC-01: decodifica UTF-8 (acentos multibyte) corretamente', () => {
    const bytes = new TextEncoder().encode('Saída, Transferência, Cartão')
    expect(decodificarCsv(bytes)).toBe('Saída, Transferência, Cartão')
  })

  it('TL-DEC-02: cai para Windows-1252 quando os bytes não são UTF-8 válido', () => {
    // "Saída" em latin-1: í = 0xED (byte alto inválido como líder UTF-8)
    const bytes = new Uint8Array([0x53, 0x61, 0xed, 0x64, 0x61])
    expect(decodificarCsv(bytes)).toBe('Saída')
  })

  it('TL-DEC-03: ç e demais acentos latin-1 (BB) decodificam corretamente', () => {
    // "Lançamento" em latin-1: ç = 0xE7
    const bytes = new Uint8Array([
      0x4c, 0x61, 0x6e, 0xe7, 0x61, 0x6d, 0x65, 0x6e, 0x74, 0x6f,
    ])
    expect(decodificarCsv(bytes)).toBe('Lançamento')
  })

  it('TL-DEC-04: ASCII puro é idêntico pelos dois caminhos', () => {
    const bytes = new TextEncoder().encode('Data,Valor,Descricao')
    expect(decodificarCsv(bytes)).toBe('Data,Valor,Descricao')
  })
})
