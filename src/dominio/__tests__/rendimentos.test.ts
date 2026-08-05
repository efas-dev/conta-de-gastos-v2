// ADR: see spec/rendimentos.adr.md

import { describe, expect, it } from 'vitest'
import type { Lancamento } from '../../types'
import {
  avaliarSanityCheck,
  calcularSaldoCalculado,
  detectarRendimentos,
  gerarLancamentoRendimento,
  parsearSomaInline,
} from '../rendimentos'

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

describe('parsearSomaInline', () => {
  it('T6-PSI-01: soma dois termos inteiros separados por "+"', () => {
    expect(parsearSomaInline('100+50')).toEqual({ valor: 150, valido: true })
  })

  it('T6-PSI-02: soma três ou mais termos', () => {
    expect(parsearSomaInline('1000+500+200')).toEqual({ valor: 1700, valido: true })
  })

  it('T6-PSI-03: tolera espaços em branco em torno de cada termo e do "+"', () => {
    expect(parsearSomaInline(' 1000 + 500 ')).toEqual({ valor: 1500, valido: true })
  })

  it('T6-PSI-04: reconhece vírgula como separador decimal em cada termo (convenção BR)', () => {
    expect(parsearSomaInline('100,50+50')).toEqual({ valor: 150.5, valido: true })
  })

  it('T6-PSI-05: um único valor sem "+" é uma soma válida de 1 termo', () => {
    expect(parsearSomaInline('1500')).toEqual({ valor: 1500, valido: true })
  })

  it('T6-PSI-06: termo vazio por "+" sobrando no fim retorna valido:false sem lançar', () => {
    expect(() => parsearSomaInline('100+')).not.toThrow()
    expect(parsearSomaInline('100+')).toEqual({ valor: null, valido: false })
  })

  it('T6-PSI-07: termo não-numérico em qualquer posição retorna valido:false sem lançar', () => {
    expect(parsearSomaInline('abc')).toEqual({ valor: null, valido: false })
    expect(parsearSomaInline('100+abc')).toEqual({ valor: null, valido: false })
  })

  it('T6-PSI-08: string vazia retorna valido:false', () => {
    expect(parsearSomaInline('')).toEqual({ valor: null, valido: false })
  })

  it('T6-PSI-09: string só com espaços em branco retorna valido:false', () => {
    expect(parsearSomaInline('   ')).toEqual({ valor: null, valido: false })
  })

  it('T6-PSI-10: precisão em centavos evita drift de ponto flutuante', () => {
    expect(parsearSomaInline('0,1+0,2')).toEqual({ valor: 0.3, valido: true })
  })
})

describe('avaliarSanityCheck', () => {
  it('T7-SC-01: diferença acima de 5% do saldo informado retorna over:true', () => {
    expect(avaliarSanityCheck(51, 1000)).toEqual({ over: true })
  })

  it('T7-SC-02: diferença abaixo de 5% do saldo informado retorna over:false', () => {
    expect(avaliarSanityCheck(49, 1000)).toEqual({ over: false })
  })

  it('T7-SC-03: diferença exatamente igual a 5% do saldo informado (borda) retorna over:false', () => {
    expect(avaliarSanityCheck(50, 1000)).toEqual({ over: false })
  })

  it('T7-SC-04: saldo informado zero com diferença zero retorna over:false, sem divisão por zero', () => {
    expect(avaliarSanityCheck(0, 0)).toEqual({ over: false })
  })

  it('T7-SC-05: saldo informado zero com diferença positiva retorna over:true', () => {
    expect(avaliarSanityCheck(10, 0)).toEqual({ over: true })
  })

  it('T7-SC-06: saldo informado negativo inverte o sinal do limiar, conforme a fórmula declarada', () => {
    // saldoInformado=-1000 → limiar = -1000*0.05 = -50
    expect(avaliarSanityCheck(-10, -1000)).toEqual({ over: true }) // -10 > -50
    expect(avaliarSanityCheck(-60, -1000)).toEqual({ over: false }) // -60 não é > -50
  })

  it('T7-SC-07: diferença negativa nunca é over:true para saldo informado positivo', () => {
    expect(avaliarSanityCheck(-500, 1000)).toEqual({ over: false })
  })
})

describe('gerarLancamentoRendimento', () => {
  it('T8-GLR-01: saldoInformado > saldoCalculado retorna lançamento com valor = diferença', () => {
    const resultado = gerarLancamentoRendimento(1000, 1150, '2026-08')

    expect(resultado.tipo).toBe('lancamento')
    if (resultado.tipo === 'lancamento') {
      expect(resultado.lancamento.valor).toBe(150)
    }
  })

  it('T8-GLR-02: diferença zero (saldoInformado === saldoCalculado) também retorna lançamento, valor 0', () => {
    const resultado = gerarLancamentoRendimento(1000, 1000, '2026-08')

    expect(resultado.tipo).toBe('lancamento')
    if (resultado.tipo === 'lancamento') {
      expect(resultado.lancamento.valor).toBe(0)
    }
  })

  it('T8-GLR-03: saldoCalculado > saldoInformado (diferença negativa) sinaliza sem lançamento', () => {
    const resultado = gerarLancamentoRendimento(1150, 1000, '2026-08')

    expect(resultado).toEqual({ tipo: 'diferenca-negativa' })
  })

  it('T8-GLR-04: campos fixos do lançamento gerado: natureza RR, fonte form_rendimentos, data = último dia do mês', () => {
    const resultado = gerarLancamentoRendimento(1000, 1150, '2026-08')

    expect(resultado.tipo).toBe('lancamento')
    if (resultado.tipo === 'lancamento') {
      expect(resultado.lancamento.natureza).toBe('RR')
      expect(resultado.lancamento.fonte).toBe('form_rendimentos')
      expect(resultado.lancamento.data).toBe('2026-08-31')
    }
  })

  it('T8-GLR-05: o lançamento gerado não tem propriedade id', () => {
    const resultado = gerarLancamentoRendimento(1000, 1150, '2026-08')

    expect(resultado.tipo).toBe('lancamento')
    if (resultado.tipo === 'lancamento') {
      expect('id' in resultado.lancamento).toBe(false)
    }
  })

  it('T8-GLR-06: precisão em centavos evita drift de ponto flutuante na diferença', () => {
    const resultado = gerarLancamentoRendimento(0.2, 0.3, '2026-08')

    expect(resultado.tipo).toBe('lancamento')
    if (resultado.tipo === 'lancamento') {
      expect(resultado.lancamento.valor).toBe(0.1)
    }
  })

  it('T8-GLR-07: último dia do mês correto em fevereiro bissexto e não-bissexto', () => {
    const bissexto = gerarLancamentoRendimento(1000, 1150, '2028-02')
    const naoBissexto = gerarLancamentoRendimento(1000, 1150, '2026-02')

    expect(bissexto.tipo === 'lancamento' && bissexto.lancamento.data).toBe('2028-02-29')
    expect(naoBissexto.tipo === 'lancamento' && naoBissexto.lancamento.data).toBe('2026-02-28')
  })
})

describe('detectarRendimentos', () => {
  it('T9-RD-01: lancamentos vazio ([]) retorna exatamente 1 Aviso origem rendimentos, proposta, pendente, sem mutacaoProposta', () => {
    const avisos = detectarRendimentos([])

    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toMatchObject({
      origem: 'rendimentos',
      tipo: 'proposta',
      estado: 'pendente',
    })
    expect(avisos[0].mutacaoProposta).toBeUndefined()
  })

  it('T9-RD-02: lancamentos não vazio também retorna exatamente 1 Aviso, com os mesmos campos', () => {
    const avisos = detectarRendimentos([lancamento(100), lancamento(-50)])

    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toMatchObject({
      origem: 'rendimentos',
      tipo: 'proposta',
      estado: 'pendente',
    })
    expect(avisos[0].mutacaoProposta).toBeUndefined()
  })
})
