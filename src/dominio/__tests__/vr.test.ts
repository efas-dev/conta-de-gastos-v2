// ADR: see Docs/specs/vr-despesas.adr.md

import { describe, it, expect } from 'vitest'
import { detectarVR, gerarLancamentosVR } from '../vr'
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

describe('gerarLancamentosVR', () => {
  const despesa1 = { valor: 30, natureza: 'ALM', descricao: 'Almoço' }
  const despesa2 = { valor: 15.5, natureza: 'ALM', descricao: 'Lanche' }
  const despesa3 = { valor: 42.25, natureza: 'TRN', descricao: 'Transporte' }

  it('com N=1 despesa retorna array de tamanho N+1 (TL-56)', () => {
    const resultado = gerarLancamentosVR([despesa1], '2026-08')
    expect(resultado).toHaveLength(2)
  })

  it('com N=3 despesas retorna array de tamanho N+1 (TL-57)', () => {
    const resultado = gerarLancamentosVR([despesa1, despesa2, despesa3], '2026-08')
    expect(resultado).toHaveLength(4)
  })

  it('cada uma das N primeiras entradas tem fonte "form_vr" (TL-58)', () => {
    const resultado = gerarLancamentosVR([despesa1, despesa2], '2026-08')
    expect(resultado[0].fonte).toBe('form_vr')
    expect(resultado[1].fonte).toBe('form_vr')
  })

  it('cada uma das N primeiras entradas tem valor negativo de mesmo módulo do input (TL-59)', () => {
    const resultado = gerarLancamentosVR([despesa1, despesa2], '2026-08')
    expect(resultado[0].valor).toBe(-30)
    expect(resultado[1].valor).toBe(-15.5)
  })

  it('despesa com valor já negativo no input ainda gera saída negativa de mesmo módulo (TL-60)', () => {
    const resultado = gerarLancamentosVR([{ valor: -30, natureza: 'ALM', descricao: 'Almoço' }], '2026-08')
    expect(resultado[0].valor).toBe(-30)
  })

  it('natureza/descricao de cada saída == os valores informados na despesa (TL-61)', () => {
    const resultado = gerarLancamentosVR([despesa1, despesa3], '2026-08')
    expect(resultado[0].natureza).toBe('ALM')
    expect(resultado[0].descricao).toBe('Almoço')
    expect(resultado[1].natureza).toBe('TRN')
    expect(resultado[1].descricao).toBe('Transporte')
  })

  it('todas as N+1 entradas têm a mesma data = último dia de mesRef (TL-62)', () => {
    const resultado = gerarLancamentosVR([despesa1, despesa2, despesa3], '2026-08')
    for (const lancamento of resultado) {
      expect(lancamento.data).toBe('2026-08-31')
    }
  })

  it('a entrada extra tem natureza RR, descricao fixa, fonte form_vr e valor = soma dos módulos (TL-63)', () => {
    const resultado = gerarLancamentosVR([despesa1, despesa2, despesa3], '2026-08')
    const entradaRR = resultado[resultado.length - 1]
    expect(entradaRR.natureza).toBe('RR')
    expect(entradaRR.descricao).toBe('VR utilizado para despesas familiares')
    expect(entradaRR.fonte).toBe('form_vr')
    expect(entradaRR.valor).toBeCloseTo(30 + 15.5 + 42.25, 2)
  })

  it('nenhum dos N+1 objetos retornados tem a chave "id" (TL-64)', () => {
    const resultado = gerarLancamentosVR([despesa1, despesa2], '2026-08')
    for (const lancamento of resultado) {
      expect(lancamento).not.toHaveProperty('id')
    }
  })

  it('despesas: [] retorna array vazio (TL-65)', () => {
    const resultado = gerarLancamentosVR([], '2026-08')
    expect(resultado).toEqual([])
  })

  it('último dia do mesRef correto para meses variados (TL-66)', () => {
    expect(gerarLancamentosVR([despesa1], '2028-02')[0].data).toBe('2028-02-29') // bissexto
    expect(gerarLancamentosVR([despesa1], '2026-02')[0].data).toBe('2026-02-28') // não-bissexto
    expect(gerarLancamentosVR([despesa1], '2026-04')[0].data).toBe('2026-04-30')
    expect(gerarLancamentosVR([despesa1], '2026-01')[0].data).toBe('2026-01-31')
  })

  it('é puro/determinístico: duas chamadas com o mesmo input produzem arrays iguais (TL-67)', () => {
    const a = gerarLancamentosVR([despesa1, despesa2], '2026-08')
    const b = gerarLancamentosVR([despesa1, despesa2], '2026-08')
    expect(a).toEqual(b)
  })
})
