// ADR: see spec/vr-despesas.adr.md

import { describe, it, expect } from 'vitest'
import { detectarVR } from '../vr'
import type { Lancamento } from '../../types'

function lancamento(overrides: Partial<Lancamento> = {}): Lancamento {
  return {
    id: 1,
    fonte: 'Nubank',
    data: '2026-08-01',
    transcricao: 'Compra teste',
    valor: -10,
    iniciais: 'AB',
    natureza: '',
    descricao: '',
    ...overrides,
  }
}

describe('detectarVR', () => {
  it('com lancamentos: [] retorna exatamente 1 Aviso (TL-48)', () => {
    const avisos = detectarVR([])
    expect(avisos).toHaveLength(1)
  })

  it('o aviso tem origem "vr", tipo "proposta", estado "pendente" (TL-49)', () => {
    const [aviso] = detectarVR([])
    expect(aviso.origem).toBe('vr')
    expect(aviso.tipo).toBe('proposta')
    expect(aviso.estado).toBe('pendente')
  })

  it('o aviso NÃO tem mutacaoProposta (TL-50)', () => {
    const [aviso] = detectarVR([])
    expect(aviso.mutacaoProposta).toBeUndefined()
  })

  it('com lancamentos não vazios também retorna exatamente 1 aviso, mesmos campos (TL-51)', () => {
    const entrada = [lancamento({ id: 1 }), lancamento({ id: 2, fonte: 'Itaú' })]
    const avisos = detectarVR(entrada)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].origem).toBe('vr')
    expect(avisos[0].tipo).toBe('proposta')
    expect(avisos[0].estado).toBe('pendente')
    expect(avisos[0].mutacaoProposta).toBeUndefined()
  })

  it('é puro/determinístico: duas chamadas com o mesmo input produzem avisos estruturalmente iguais (TL-52)', () => {
    const entrada = [lancamento({ id: 5 })]
    const a = detectarVR(entrada)
    const b = detectarVR(entrada)
    expect(a).toEqual(b)
  })
})
