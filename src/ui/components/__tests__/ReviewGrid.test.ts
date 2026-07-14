// ADR: see Docs/specs/grid-revisao.adr.md
// ADR: see spec/grid-ux-filtros.adr.md

/**
 * Testes das funções puras exportadas por ReviewGrid.tsx.
 *
 * ReviewGrid.tsx como componente React não é testável em Vitest sem jsdom
 * montando Glide (que depende de Canvas). O gate da T3 é "nenhum teste de
 * snapshot existente quebrado" (não há snapshots) — as funções puras são
 * testáveis de forma isolada.
 *
 * Test List (Canon TDD — T3):
 * TL-1: medirLarguraHeuristica retorna maxPx quando texto excede o teto
 * TL-2: medirLarguraHeuristica retorna comprimento proporcional abaixo do teto
 * TL-3: calcularLargurasColunas retorna array com mesma quantidade de colunas que colunasBase
 * TL-4: calcularLargurasColunas aplica teto de 320 px em coluna com conteúdo longo
 * TL-5: calcularLargurasColunas retorna largura mínima com array de lancamentos vazio
 * TL-6: ehColunaLeituraApenas retorna true para fonte/data/transcricao; false para demais
 * TL-7: medirLarguraValorContabil mede o formato renderizado (prefixo + número pt-BR, bold)
 * TL-8: calcularLargurasColunas usa a medição contábil na coluna Valor
 */

import { describe, it, expect } from 'vitest'
import {
  medirLarguraHeuristica,
  medirLarguraValorContabil,
  calcularLargurasColunas,
  ehColunaLeituraApenas,
} from '../ReviewGrid'
import type { Lancamento } from '../../../types'

// ---------------------------------------------------------------------------
// Fixture mínima
// ---------------------------------------------------------------------------

function lancamentoFake(overrides: Partial<Lancamento> = {}): Lancamento {
  return {
    fonte: 'Nubank',
    data: '2024-01-15',
    transcricao: 'Descrição padrão',
    iniciais: 'ES',
    natureza: 'Alimentação',
    descricao: 'Almoço',
    valor: -45.5,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// TL-1 e TL-2 — medirLarguraHeuristica
// ---------------------------------------------------------------------------

describe('medirLarguraHeuristica', () => {
  it('TL-1: retorna maxPx quando o texto é longo o suficiente para exceder o teto', () => {
    const textoLongo = 'A'.repeat(200)
    const resultado = medirLarguraHeuristica(textoLongo, 320)
    expect(resultado).toBe(320)
  })

  it('TL-2: retorna largura proporcional quando o texto é curto (abaixo do teto)', () => {
    // "AB" — 2 caracteres; com fator de ~8px/char + padding, deve ser bem menor que 320
    const resultado = medirLarguraHeuristica('AB', 320)
    expect(resultado).toBeGreaterThan(0)
    expect(resultado).toBeLessThan(320)
  })

  it('TL-2b: texto vazio retorna largura mínima positiva', () => {
    const resultado = medirLarguraHeuristica('', 320)
    expect(resultado).toBeGreaterThan(0)
    expect(resultado).toBeLessThan(320)
  })
})

// ---------------------------------------------------------------------------
// TL-3, TL-4, TL-5 — calcularLargurasColunas
// ---------------------------------------------------------------------------

describe('calcularLargurasColunas', () => {
  const colunasBase = [
    { title: 'Fonte', width: 120 },
    { title: 'Data', width: 100 },
    { title: 'Transcrição', width: 240 },
    { title: 'Iniciais', width: 80 },
    { title: 'Natureza', width: 130 },
    { title: 'Descrição', width: 220 },
    { title: 'Valor', width: 110 },
  ]

  it('TL-3: retorna array com a mesma quantidade de colunas que colunasBase', () => {
    const resultado = calcularLargurasColunas([], colunasBase)
    expect(resultado).toHaveLength(colunasBase.length)
  })

  it('TL-4: aplica teto de 320 px mesmo com conteúdo muito longo', () => {
    const lancamentosLongos = [
      lancamentoFake({ transcricao: 'X'.repeat(500), descricao: 'Y'.repeat(500) }),
    ]
    const resultado = calcularLargurasColunas(lancamentosLongos, colunasBase)
    for (const largura of resultado) {
      expect(largura).toBeLessThanOrEqual(320)
    }
  })

  it('TL-5: com array vazio retorna larguras mínimas positivas (ao menos as larguras base)', () => {
    const resultado = calcularLargurasColunas([], colunasBase)
    for (const largura of resultado) {
      expect(largura).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// TL-6 — ehColunaLeituraApenas
// ---------------------------------------------------------------------------

describe('ehColunaLeituraApenas', () => {
  it('TL-6a: retorna true para coluna "fonte"', () => {
    expect(ehColunaLeituraApenas('fonte')).toBe(true)
  })

  it('TL-6b: retorna true para coluna "data"', () => {
    expect(ehColunaLeituraApenas('data')).toBe(true)
  })

  it('TL-6c: retorna true para coluna "transcricao"', () => {
    expect(ehColunaLeituraApenas('transcricao')).toBe(true)
  })

  it('TL-6d: retorna false para coluna "iniciais"', () => {
    expect(ehColunaLeituraApenas('iniciais')).toBe(false)
  })

  it('TL-6e: retorna false para coluna "natureza"', () => {
    expect(ehColunaLeituraApenas('natureza')).toBe(false)
  })

  it('TL-6f: retorna false para coluna "descricao"', () => {
    expect(ehColunaLeituraApenas('descricao')).toBe(false)
  })

  it('TL-6g: retorna false para coluna "valor"', () => {
    expect(ehColunaLeituraApenas('valor')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TL-7 — medirLarguraValorContabil (dívida: valor truncado na auto-largura)
// O drawCell da coluna Valor desenha `-R$` à esquerda e o número pt-BR à
// direita em fonte bold 14px; a medição precisa cobrir esse formato, não o
// número cru de String(valor).
// ---------------------------------------------------------------------------

describe('medirLarguraValorContabil', () => {
  it('TL-7a: valor de 1 dígito cabe acima da largura mínima e abaixo do teto', () => {
    const resultado = medirLarguraValorContabil(-9.9, 320)
    expect(resultado).toBeGreaterThanOrEqual(60)
    expect(resultado).toBeLessThan(320)
  })

  it('TL-7b: valor de 4 dígitos exige mais que a heurística do número cru', () => {
    // Caso real da dívida: -1083.06 renderiza "-R$" + "1.083,06" (bold);
    // a heurística crua sobre "-1083.06" estimava ~100 px e truncava.
    const cru = medirLarguraHeuristica(String(-1083.06), 320)
    const contabil = medirLarguraValorContabil(-1083.06, 320)
    expect(contabil).toBeGreaterThan(cru)
  })

  it('TL-7c: valor de 7 dígitos ainda respeita o teto', () => {
    const resultado = medirLarguraValorContabil(-1234567.89, 320)
    expect(resultado).toBeLessThanOrEqual(320)
  })

  it('TL-7d: valor positivo (prefixo R$) mede menos ou igual ao negativo (prefixo -R$)', () => {
    const positivo = medirLarguraValorContabil(1083.06, 320)
    const negativo = medirLarguraValorContabil(-1083.06, 320)
    expect(positivo).toBeLessThanOrEqual(negativo)
  })
})

// ---------------------------------------------------------------------------
// TL-8 — coluna Valor usa a medição contábil em calcularLargurasColunas
// ---------------------------------------------------------------------------

describe('calcularLargurasColunas — coluna Valor contábil', () => {
  const colunasBase = [
    { title: 'Fonte', width: 120 },
    { title: 'Data', width: 100 },
    { title: 'Transcrição', width: 240 },
    { title: 'Iniciais', width: 80 },
    { title: 'Natureza', width: 130 },
    { title: 'Descrição', width: 220 },
    { title: 'Valor', width: 110 },
  ]
  const IDX_VALOR = 6

  it('TL-8a: com valor de 4 dígitos, a coluna Valor recebe a largura contábil', () => {
    const lancamentos = [lancamentoFake({ valor: -1083.06 })]
    const resultado = calcularLargurasColunas(lancamentos, colunasBase)
    expect(resultado[IDX_VALOR]).toBe(medirLarguraValorContabil(-1083.06, 320))
  })

  it('TL-8b: a largura da coluna Valor é o máximo contábil entre os lançamentos', () => {
    const lancamentos = [
      lancamentoFake({ valor: -9.9 }),
      lancamentoFake({ valor: -10539.61 }),
      lancamentoFake({ valor: 39.9 }),
    ]
    const resultado = calcularLargurasColunas(lancamentos, colunasBase)
    expect(resultado[IDX_VALOR]).toBe(medirLarguraValorContabil(-10539.61, 320))
  })
})
