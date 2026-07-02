// ADR: see Docs/specs/parsers-fatura-nubank-extrato-itau.adr.md

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { extratoItau } from '../extrato_itau'

const FIXTURES = join(__dirname, 'fixtures')

function lerFixture(nome: string): string {
  return readFileSync(join(FIXTURES, nome), 'utf-8')
}

describe('extratoItau.aceita', () => {
  it('TL-T5-01: retorna true para conteúdo com padrão dd/mm/yyyy;desc;valor', () => {
    const conteudo = lerFixture('extrato_itau_minus_inline.txt')
    expect(extratoItau.aceita(conteudo)).toBe(true)
  })

  it('TL-T5-02: retorna false para conteúdo sem padrão estrutural (cabeçalho CSV Nubank)', () => {
    const conteudo = 'Data,Valor,Identificador,Descrição\n01/07/2024,-350.00,id1,Mercado'
    expect(extratoItau.aceita(conteudo)).toBe(false)
  })
})

describe('extratoItau.parsear — sinal literal', () => {
  it('TL-T5-03: minus inline (;-350,00) produz valor negativo', () => {
    const conteudo = lerFixture('extrato_itau_minus_inline.txt')
    const { lancamentos } = extratoItau.parsear(conteudo)
    expect(lancamentos).toHaveLength(1)
    expect(lancamentos[0].valor).toBe(-350)
  })

  it('TL-T5-04: crédito sem sinal (;350,00) produz valor positivo', () => {
    const conteudo = lerFixture('extrato_itau_credito_sem_sinal.txt')
    const { lancamentos } = extratoItau.parsear(conteudo)
    expect(lancamentos).toHaveLength(1)
    expect(lancamentos[0].valor).toBe(350)
  })
})

describe('extratoItau.parsear — CRLF', () => {
  it('TL-T5-05: remove CRLF — transcricao não contém \\r', () => {
    const conteudo = lerFixture('extrato_itau_crlf.txt')
    const { lancamentos } = extratoItau.parsear(conteudo)
    expect(lancamentos.length).toBeGreaterThan(0)
    for (const l of lancamentos) {
      expect(l.transcricao).not.toContain('\r')
    }
  })
})

describe('extratoItau.parsear — duplicata', () => {
  it('TL-T5-06: duas linhas idênticas produzem 2 lançamentos distintos (sem deduplicação)', () => {
    const conteudo = lerFixture('extrato_itau_duplicata.txt')
    const { lancamentos } = extratoItau.parsear(conteudo)
    expect(lancamentos).toHaveLength(2)
    expect(lancamentos[0].valor).toBe(lancamentos[1].valor)
    expect(lancamentos[0].transcricao).toBe(lancamentos[1].transcricao)
  })
})

describe('extratoItau.parsear — linhas não estruturais', () => {
  it('TL-T5-07: linha não estrutural é pulada e contada em linhasIgnoradas', () => {
    const conteudo = lerFixture('extrato_itau_linha_nao_estrutural.txt')
    const { lancamentos, linhasIgnoradas } = extratoItau.parsear(conteudo)
    expect(lancamentos).toHaveLength(1)
    expect(linhasIgnoradas).toBe(1)
  })
})

describe('extratoItau.parsear — campos do lançamento', () => {
  it('TL-T5-08: fonte é "extrato_itau" em todos os lançamentos', () => {
    const conteudo = lerFixture('extrato_itau_minus_inline.txt')
    const { lancamentos } = extratoItau.parsear(conteudo)
    expect(lancamentos[0].fonte).toBe('extrato_itau')
  })

  it('TL-T5-09: data dd/mm/yyyy convertida para ISO YYYY-MM-DD', () => {
    const conteudo = lerFixture('extrato_itau_minus_inline.txt')
    const { lancamentos } = extratoItau.parsear(conteudo)
    expect(lancamentos[0].data).toBe('2024-07-01')
  })

  it('TL-T5-10: iniciais, natureza e descricao são strings vazias', () => {
    const conteudo = lerFixture('extrato_itau_minus_inline.txt')
    const { lancamentos } = extratoItau.parsear(conteudo)
    expect(lancamentos[0].iniciais).toBe('')
    expect(lancamentos[0].natureza).toBe('')
    expect(lancamentos[0].descricao).toBe('')
  })

  it('TL-T5-11: transcricao é preenchida com a descrição da linha', () => {
    const conteudo = lerFixture('extrato_itau_minus_inline.txt')
    const { lancamentos } = extratoItau.parsear(conteudo)
    expect(lancamentos[0].transcricao).toBe('Supermercado Sintetico')
  })
})
