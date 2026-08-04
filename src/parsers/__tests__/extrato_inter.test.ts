/**
 * Testes do parser de extrato do Banco Inter (CSV separado por `;`).
 *
 * Formato de referência (arquivo real em data_sample/, git-ignored):
 * preâmbulo de 4 linhas (título, conta, período, saldo) + linha vazia +
 * header `Data Lançamento;Histórico;Descrição;Valor;Saldo` + linhas de dados
 * `dd/mm/aaaa;histórico;descrição;valor-br;saldo-br` em ordem decrescente.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, beforeEach } from 'vitest'
import { extratoInter } from '../extrato_inter'
import { extratoItau } from '../extrato_itau'
import { detectar } from '../index'
import { reiniciarContadorIds } from '../idSerial'

const FIXTURES = join(__dirname, 'fixtures')

function lerFixture(nome: string): string {
  return readFileSync(join(FIXTURES, nome), 'utf-8')
}

describe('extratoInter.aceita', () => {
  it('TL-INT-01: retorna true para extrato Inter com header Data Lançamento;Histórico;...', () => {
    expect(extratoInter.aceita(lerFixture('extrato_inter_normal.csv'))).toBe(true)
  })

  it('TL-INT-02: retorna false para CSV do extrato Nubank (separador vírgula)', () => {
    const conteudo = 'Data,Valor,Identificador,Descrição\n01/07/2024,-350.00,id1,Mercado'
    expect(extratoInter.aceita(conteudo)).toBe(false)
  })

  it('TL-INT-03: retorna false para extrato Itaú TXT (3 campos, sem header)', () => {
    expect(extratoInter.aceita(lerFixture('extrato_itau_minus_inline.txt'))).toBe(false)
  })

  it('TL-INT-04: guarda de não-colisão — extratoItau NÃO aceita o extrato Inter', () => {
    // Uma linha de dados do Inter casa o regex estrutural do Itaú (com o saldo no
    // lugar do valor); só não colide porque o preâmbulo ocupa as 5 linhas examinadas.
    // Este teste trava essa premissa — se quebrar, a ordem em parsers[] é a defesa.
    expect(extratoItau.aceita(lerFixture('extrato_inter_normal.csv'))).toBe(false)
  })
})

describe('extratoInter.parsear', () => {
  it('TL-INT-05: parseia as 4 linhas de dados com fonte extrato_inter e data ISO', () => {
    const { lancamentos } = extratoInter.parsear(lerFixture('extrato_inter_normal.csv'))
    expect(lancamentos).toHaveLength(4)
    expect(lancamentos[0].fonte).toBe('extrato_inter')
    expect(lancamentos[0].data).toBe('2026-07-30')
    expect(lancamentos[3].data).toBe('2026-07-28')
  })

  it('TL-INT-06: valor pt-BR com milhar e minus (−1.400,00) vira -1400; crédito fica positivo', () => {
    const { lancamentos } = extratoInter.parsear(lerFixture('extrato_inter_normal.csv'))
    expect(lancamentos[1].valor).toBe(-1400)
    expect(lancamentos[2].valor).toBe(20)
  })

  it('TL-INT-07: transcrição junta histórico e descrição com " - ", sem espaços sobrando', () => {
    const { lancamentos } = extratoInter.parsear(lerFixture('extrato_inter_normal.csv'))
    // "Pix enviado " no arquivo vem com espaço à direita — o trim é obrigatório
    expect(lancamentos[1].transcricao).toBe('Pix enviado - Fulano De Tal Exemplo')
  })

  it('TL-INT-08: o saldo da última coluna NÃO vaza para o valor', () => {
    const { lancamentos } = extratoInter.parsear(lerFixture('extrato_inter_normal.csv'))
    // Linha 1: valor 504,92 / saldo 56,46 — o valor certo é o da 4ª coluna
    expect(lancamentos[0].valor).toBe(504.92)
  })

  it('TL-INT-09: preâmbulo e header contam como linhasIgnoradas (5); linha vazia não conta', () => {
    const { linhasIgnoradas } = extratoInter.parsear(lerFixture('extrato_inter_normal.csv'))
    expect(linhasIgnoradas).toBe(5)
  })
})

describe('detectar — registro do parser Inter', () => {
  it('TL-INT-10: detectar() roteia o extrato Inter para o extratoInter', () => {
    expect(detectar(lerFixture('extrato_inter_normal.csv'))).toBe(extratoInter)
  })
})

describe('extratoInter.parsear() — id serial de nascimento', () => {
  beforeEach(() => {
    reiniciarContadorIds()
  })

  it('TL-INT-11: atribui id sequencial e único a cada lançamento retornado', () => {
    const { lancamentos } = extratoInter.parsear(lerFixture('extrato_inter_normal.csv'))
    expect(lancamentos.map(l => l.id)).toEqual(lancamentos.map((_, i) => i + 1))
  })
})
