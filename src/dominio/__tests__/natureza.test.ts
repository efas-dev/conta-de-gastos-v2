/**
 * Testes de `corrigirNatureza` — reconhece a sigla mesmo com caractere acidental
 * (espaço, hífen) e apaga o supérfluo; vale pelas 2 primeiras letras válidas.
 */

import { describe, it, expect } from 'vitest'
import { corrigirNatureza } from '../natureza'

const VALIDAS = ['AL', 'RR', 'IT', 'DL']

describe('corrigirNatureza', () => {
  it('TLN-1: espaço no fim é apagado quando a sigla é válida ("AL " → "AL")', () => {
    expect(corrigirNatureza('AL ', VALIDAS)).toBe('AL')
  })

  it('TLN-2: espaço no meio é apagado ("A L" → "AL")', () => {
    expect(corrigirNatureza('A L', VALIDAS)).toBe('AL')
  })

  it('TLN-3: caixa baixa com espaço vira caixa alta corrigida ("a l " → "AL")', () => {
    expect(corrigirNatureza('a l ', VALIDAS)).toBe('AL')
  })

  it('TLN-4: natureza já válida é devolvida intacta ("IT" → "IT")', () => {
    expect(corrigirNatureza('IT', VALIDAS)).toBe('IT')
  })

  it('TLN-5: valem as 2 primeiras letras válidas ("ALM" → "AL")', () => {
    expect(corrigirNatureza('ALM', VALIDAS)).toBe('AL')
  })

  it('TLN-6: outro caractere acidental (hífen) é apagado ("A-L" → "AL")', () => {
    expect(corrigirNatureza('A-L', VALIDAS)).toBe('AL')
  })

  it('TLN-7: sigla não reconhecida é mantida em caixa alta ("XY" → "XY")', () => {
    expect(corrigirNatureza('xy', VALIDAS)).toBe('XY')
  })

  it('TLN-8: uma única letra (digitação em curso) não é corrigida ("a" → "A")', () => {
    expect(corrigirNatureza('a', VALIDAS)).toBe('A')
  })

  it('TLN-9: nunca trunca uma natureza legítima mais longa que 2 letras', () => {
    // Se o Modelo tiver uma sigla de 3 letras, "ALM" já é válida e NÃO vira "AL".
    expect(corrigirNatureza('ALM', ['ALM', 'AL'])).toBe('ALM')
  })

  it('TLN-10: lista vazia equivale a toUpperCase (comportamento do item 28)', () => {
    expect(corrigirNatureza('Moradia', [])).toBe('MORADIA')
    expect(corrigirNatureza('al', [])).toBe('AL')
  })
})
