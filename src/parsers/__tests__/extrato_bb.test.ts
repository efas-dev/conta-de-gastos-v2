/**
 * Testes do parser de extrato do Banco do Brasil (CSV separado por vírgula,
 * campos entre aspas, exportado em ISO-8859-1).
 *
 * Formato de referência (arquivo real em data_sample/bb/, git-ignored):
 * header `"Data","Lançamento","Detalhes","N° documento","Valor","Tipo Lançamento"`
 * + linhas de dados; linhas de saldo ("Saldo Anterior", "Saldo do dia" com data
 * 00/00/0000, "S A L D O") têm o campo Tipo vazio e não são lançamentos.
 * Fixtures em UTF-8 (a decodificação latin-1 é coberta por decodificar.test.ts).
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { extratoBb } from '../extrato_bb'
import { detectar } from '../index'

const FIXTURES = join(__dirname, 'fixtures')

function lerFixture(nome: string): string {
  return readFileSync(join(FIXTURES, nome), 'utf-8')
}

describe('extratoBb.aceita', () => {
  it('TL-BB-01: aceita o header quoted do Banco do Brasil', () => {
    expect(extratoBb.aceita(lerFixture('extrato_bb_conta_corrente.csv'))).toBe(true)
  })

  it('TL-BB-02: rejeita o extrato Nubank (header sem aspas, colunas diferentes)', () => {
    const conteudo = 'Data,Valor,Identificador,Descrição\n01/07/2026,-350.00,id1,Mercado'
    expect(extratoBb.aceita(conteudo)).toBe(false)
  })

  it('TL-BB-03: rejeita a fatura Nubank (header date,title,amount)', () => {
    expect(extratoBb.aceita('date,title,amount\n2026-07-01,Mercado,50.00')).toBe(false)
  })
})

describe('extratoBb.parsear', () => {
  it('TL-BB-04: materializa só os lançamentos, ignorando linhas de saldo', () => {
    const { lancamentos } = extratoBb.parsear(lerFixture('extrato_bb_conta_corrente.csv'))
    // 4 movimentos: transferência recebida, pix enviado, rende fácil, compra cartão.
    // Saldo Anterior / Saldo do dia / S A L D O são descartados.
    expect(lancamentos).toHaveLength(4)
    expect(lancamentos.every((l) => l.fonte === 'extrato_bb')).toBe(true)
  })

  it('TL-BB-05: data DD/MM/YYYY vira ISO; sinal do valor é preservado', () => {
    const { lancamentos } = extratoBb.parsear(lerFixture('extrato_bb_conta_corrente.csv'))
    expect(lancamentos[0].data).toBe('2026-07-01')
    expect(lancamentos[0].valor).toBe(1000) // Entrada, positivo
    expect(lancamentos[1].valor).toBe(-1500) // Saída, negativo
    expect(lancamentos[3].valor).toBe(-84.79)
  })

  it('TL-BB-06: transcrição junta Lançamento e Detalhes; prefixo de data/hora removido', () => {
    const { lancamentos } = extratoBb.parsear(lerFixture('extrato_bb_conta_corrente.csv'))
    // "01/07 13:33 LOJA EXEMPLO LTDA" → remove o prefixo "01/07 13:33 "
    expect(lancamentos[1].transcricao).toBe('Pix - Enviado - LOJA EXEMPLO LTDA')
  })

  it('TL-BB-07: Detalhes sem prefixo de data/hora fica intacto', () => {
    const { lancamentos } = extratoBb.parsear(lerFixture('extrato_bb_conta_corrente.csv'))
    // "Rende Facil" não tem prefixo dd/mm hh:mm
    expect(lancamentos[2].transcricao).toBe('BB Rende Fácil - Rende Facil')
  })

  it('TL-BB-08: Detalhes vazio → transcrição é só o Lançamento', () => {
    const { lancamentos } = extratoBb.parsear(lerFixture('extrato_bb_conta_salario.csv'))
    expect(lancamentos).toHaveLength(2)
    expect(lancamentos[0].transcricao).toBe('Transferência enviada')
    expect(lancamentos[1].transcricao).toBe('Recebimento de Proventos')
  })

  it('TL-BB-09: header + linhas de saldo contam como linhasIgnoradas', () => {
    const { linhasIgnoradas } = extratoBb.parsear(lerFixture('extrato_bb_conta_corrente.csv'))
    // header(1) + Saldo Anterior + Saldo do dia + S A L D O = 4
    expect(linhasIgnoradas).toBe(4)
  })

  it('TL-BB-10: excluidosPendentes é vazio (BB não tem valor pendente/pagamento recebido)', () => {
    const { excluidosPendentes } = extratoBb.parsear(lerFixture('extrato_bb_conta_corrente.csv'))
    expect(excluidosPendentes).toEqual([])
  })
})

describe('detectar — registro do parser BB', () => {
  it('TL-BB-11: detectar() roteia o extrato BB para o extratoBb', () => {
    expect(detectar(lerFixture('extrato_bb_conta_corrente.csv'))).toBe(extratoBb)
  })
})
