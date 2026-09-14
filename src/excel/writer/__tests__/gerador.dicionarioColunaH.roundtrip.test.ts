// ADR: see Docs/specs/dicionario-chave-canonica.adr.md

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gerarXlsx } from '../gerador.js'
import { lerDicionario } from '../../reader/leitor.js'
import type { DicEntry } from '../../../types.js'

const FIXTURE_PATH = resolve(__dirname, 'fixtures/Modelo.xlsx')

/**
 * T09 da spec `dicionario-chave-canonica` — frente 1 das quatro camadas de prova (Decisão 10).
 *
 * Escrever e reler é o único lugar onde a retrocompatibilidade da coluna H realmente se prova: o
 * writer sozinho mostra que o XML saiu certo, o reader sozinho mostra que um XML montado à mão
 * entra certo, e nenhum dos dois garante que os dois lados concordam.
 *
 * O caso que mais importa aqui é a ausência sobreviver como ausência. `undefined` e `0` têm
 * significados opostos nesta spec — um é "não sei o valor desta entrada", o outro é um valor
 * legítimo — e um round-trip que converta o primeiro no segundo faria a trava de valor rejeitar
 * silenciosamente todas as parcelas herdadas.
 */
describe('round-trip da coluna Valor (T09)', () => {
  let modeloBytes: Uint8Array

  beforeAll(() => {
    modeloBytes = new Uint8Array(readFileSync(FIXTURE_PATH))
  })

  /** Escreve o dicionário num .xlsx e lê de volta o que sobreviveu. */
  function roundTrip(dicEntries: DicEntry[]): DicEntry[] {
    return lerDicionario(gerarXlsx(modeloBytes, 'ES', [], dicEntries, '2026-07'))
  }

  it('RT-01: valor gravado sobrevive ao ciclo completo', () => {
    const [lida] = roundTrip([
      {
        chave: 'Autohubservice - Parcela #/4',
        fonte: 'fatura_nubank_cc',
        natureza: 'VC',
        descricao: 'Conserto City',
        iniciais: 'ES',
        vezes: 2,
        ambiguo: false,
        valor: -275,
      },
    ])
    expect(lida.valor).toBe(-275)
  })

  it('RT-02: ausência sobrevive como ausência, NÃO vira zero', () => {
    const [lida] = roundTrip([
      {
        chave: 'Mercado Extra',
        fonte: 'Nubank',
        natureza: 'CM',
        descricao: 'Comestíveis',
        iniciais: 'ES',
        vezes: 3,
        ambiguo: false,
      },
    ])
    expect(lida.valor).toBeUndefined()
  })

  it('RT-03: valor zero sobrevive como zero, NÃO vira ausência', () => {
    const [lida] = roundTrip([
      {
        chave: 'Estorno - Parcela #/2',
        fonte: 'fatura_nubank_cc',
        natureza: 'OT',
        descricao: 'Estorno integral',
        iniciais: 'ES',
        vezes: 1,
        ambiguo: false,
        valor: 0,
      },
    ])
    expect(lida.valor).toBe(0)
  })

  it('RT-04: valor fracionário preserva os centavos', () => {
    const [lida] = roundTrip([
      {
        chave: 'Mercadolivre*10produt - Parcela #/4',
        fonte: 'fatura_nubank_cc',
        natureza: 'MT',
        descricao: 'Fluido acendedor oratório',
        iniciais: 'ES',
        vezes: 2,
        ambiguo: false,
        valor: -27.12,
      },
    ])
    expect(lida.valor).toBe(-27.12)
  })

  it('RT-05: duas compras na mesma chave canônica sobrevivem separadas', () => {
    // Se o round-trip as fundisse, a trava de valor perderia o dado que a sustenta.
    const base = {
      chave: 'Mercadolivre*10produt - Parcela #/4',
      fonte: 'fatura_nubank_cc',
      natureza: 'MT',
      iniciais: 'ES',
      vezes: 1,
      ambiguo: false,
    }
    const lidas = roundTrip([
      { ...base, descricao: 'Inceticidas', valor: -55.4 },
      { ...base, descricao: 'Fluido acendedor oratório', valor: -27.12 },
    ])

    expect(lidas).toHaveLength(2)
    expect(lidas.map((e) => e.valor).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([-55.4, -27.12])
    expect(lidas.some((e) => e.ambiguo)).toBe(false)
  })

  it('RT-06: dicionário sem valor algum faz o ciclo inteiro sem perder entradas', () => {
    const semValor: DicEntry[] = [
      { chave: 'A', fonte: 'Nubank', natureza: 'CM', descricao: 'x', iniciais: 'ES', vezes: 1, ambiguo: false },
      { chave: 'B', fonte: 'Nubank', natureza: 'GO', descricao: 'y', iniciais: 'ES', vezes: 2, ambiguo: false },
    ]
    const lidas = roundTrip(semValor)

    expect(lidas).toHaveLength(2)
    expect(lidas.every((e) => e.valor === undefined)).toBe(true)
  })

  it('RT-07: os demais campos continuam intactos após a extensão do schema', () => {
    const [lida] = roundTrip([
      {
        chave: 'PIX TRANSF CESAR',
        fonte: 'extrato_itau',
        natureza: 'DL',
        descricao: 'Ajuda Familiar',
        iniciais: 'ES',
        vezes: 7,
        ambiguo: true,
      },
    ])
    expect(lida).toMatchObject({
      chave: 'PIX TRANSF CESAR',
      fonte: 'extrato_itau',
      natureza: 'DL',
      descricao: 'Ajuda Familiar',
      iniciais: 'ES',
      vezes: 7,
      ambiguo: true,
    })
  })
})
