// ADR: see spec/rendimentos.adr.md

import { describe, expect, it } from 'vitest'
import type { Lancamento } from '../../types'
import { calcularSaldoCalculado } from '../rendimentos'

function lancamento(valor: number): Lancamento {
  return {
    id: 1,
    fonte: 'extrato',
    data: '2026-08-01',
    transcricao: 'lançamento de teste',
    valor,
    iniciais: '',
    natureza: '',
    descricao: '',
  }
}

describe('calcularSaldoCalculado', () => {
  it('T5-CSC-01: soma o saldo anterior com lançamentos de sinais mistos (soma algébrica)', () => {
    const lancamentos = [lancamento(100), lancamento(-30), lancamento(50)]

    expect(calcularSaldoCalculado(1000, lancamentos)).toBe(1120)
  })

  it('T5-CSC-02: array de lançamentos vazio retorna exatamente o saldo anterior', () => {
    expect(calcularSaldoCalculado(2500.75, [])).toBe(2500.75)
  })

  it('T5-CSC-03: soma valores decimais que quebrariam em ponto flutuante puro sem drift', () => {
    const lancamentos = [
      lancamento(0.1),
      lancamento(0.2),
      lancamento(0.3),
      lancamento(10.01),
      lancamento(-5.02),
    ]

    // 0.1 + 0.2 já não é exatamente 0.3 em ponto flutuante binário — soma direta em reais
    // acumularia esse drift; centavos inteiros evitam o problema.
    expect(calcularSaldoCalculado(0, lancamentos)).toBeCloseTo(5.59, 10)
    expect(calcularSaldoCalculado(0, lancamentos)).toBe(5.59)
  })

  it('T5-CSC-04: saldo anterior negativo combinado com lançamentos positivos soma algebricamente', () => {
    const lancamentos = [lancamento(200), lancamento(50)]

    expect(calcularSaldoCalculado(-100, lancamentos)).toBe(150)
  })
})
