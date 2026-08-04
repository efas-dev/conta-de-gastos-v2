// ADR: see spec/fundacao-operacoes.adr.md

import { describe, it, expect, beforeEach } from 'vitest'
import { atribuirIds, reiniciarContadorIds } from '../idSerial'

describe('atribuirIds()', () => {
  beforeEach(() => {
    reiniciarContadorIds()
  })

  it('TL-01: atribui ids sequenciais crescentes a partir de 1', () => {
    const base = [{ valor: 'a' }, { valor: 'b' }, { valor: 'c' }]
    const resultado = atribuirIds(base)
    expect(resultado.map(l => l.id)).toEqual([1, 2, 3])
  })

  it('TL-02: contador continua a sequência entre chamadas sucessivas (serial por sessão, nunca reinicia sozinho)', () => {
    const primeiraLeva = atribuirIds([{ valor: 'a' }, { valor: 'b' }])
    const segundaLeva = atribuirIds([{ valor: 'c' }])
    expect(primeiraLeva.map(l => l.id)).toEqual([1, 2])
    expect(segundaLeva.map(l => l.id)).toEqual([3])
  })

  it('TL-03: reiniciarContadorIds() reseta o contador para 1 (uso restrito a isolamento de teste)', () => {
    atribuirIds([{ valor: 'a' }, { valor: 'b' }])
    reiniciarContadorIds()
    const resultado = atribuirIds([{ valor: 'c' }])
    expect(resultado.map(l => l.id)).toEqual([1])
  })

  it('TL-10: ids nunca são recalculados — chamar atribuirIds novamente sobre lançamentos já atribuídos preserva o id original em vez de sobrescrever', () => {
    const primeiraLeva = atribuirIds([{ valor: 'a' }])
    const idOriginal = primeiraLeva[0].id
    const segundaLeva = atribuirIds([{ valor: 'b' }])
    expect(primeiraLeva[0].id).toBe(idOriginal)
    expect(segundaLeva[0].id).not.toBe(idOriginal)
  })

  it('TL-11: buracos na numeração após remoção simulada são preservados (sem reindexação)', () => {
    const lista = atribuirIds([{ valor: 'a' }, { valor: 'b' }, { valor: 'c' }])
    const [primeiro, , terceiro] = lista
    const posRemocao = lista.filter(l => l.id !== primeiro.id)
    expect(posRemocao.map(l => l.id)).toEqual([2, terceiro.id])
    expect(posRemocao.map(l => l.id)).not.toEqual([1, 2])
  })
})
