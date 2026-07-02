// ADR: see Docs/specs/mvp-vertical-nubank.adr.md

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { extratoNubank, ErroArquivoNaoReconhecido } from '../extrato_nubank'
import { detectar } from '../index'

const FIXTURES = join(__dirname, 'fixtures')

function lerFixture(nome: string): string {
  return readFileSync(join(FIXTURES, nome), 'utf-8')
}

const csvPonto = lerFixture('extrato_nubank_ponto.csv')
const csvVirgula = lerFixture('extrato_nubank_virgula.csv')

// --- TL-01, TL-02, TL-03: aceita() ---

describe('extratoNubank.aceita()', () => {
  it('TL-01: retorna true para CSV com cabeçalho Data,Valor,Identificador,Descrição', () => {
    expect(extratoNubank.aceita('Data,Valor,Identificador,Descrição\n01/03/2026,-150.00,abc123,Desc')).toBe(true)
  })

  it('TL-02: retorna false para CSV com cabeçalho diferente', () => {
    expect(extratoNubank.aceita('Date,Amount,ID,Description\n01/03/2026,-150.00,abc123,Desc')).toBe(false)
  })

  it('TL-03: retorna false para string vazia', () => {
    expect(extratoNubank.aceita('')).toBe(false)
  })
})

// --- TL-04 a TL-09: parsear() com decimal ponto ---

describe('extratoNubank.parsear() — decimal ponto', () => {
  it('TL-04: retorna fonte="extrato_nubank" em todos os lançamentos', () => {
    const { lancamentos } = extratoNubank.parsear(csvPonto)
    expect(lancamentos.length).toBeGreaterThan(0)
    for (const l of lancamentos) {
      expect(l.fonte).toBe('extrato_nubank')
    }
  })

  it('TL-05: mapeia coluna Descrição para transcricao', () => {
    const { lancamentos } = extratoNubank.parsear(csvPonto)
    expect(lancamentos[0].transcricao).toBe('Transferência enviada pelo Pix - João')
  })

  it('TL-06: parseia data de DD/MM/YYYY para YYYY-MM-DD', () => {
    const { lancamentos } = extratoNubank.parsear(csvPonto)
    expect(lancamentos[0].data).toBe('2026-03-01')
    expect(lancamentos[1].data).toBe('2026-03-05')
    expect(lancamentos[2].data).toBe('2026-03-10')
  })

  it('TL-07: parseia valor com separador decimal ponto como número', () => {
    const { lancamentos } = extratoNubank.parsear(csvPonto)
    expect(lancamentos[0].valor).toBe(-150)
    expect(lancamentos[1].valor).toBe(3500)
    expect(lancamentos[2].valor).toBe(-22.5)
  })

  it('TL-09: iniciais, natureza e descricao são strings vazias (sem auto-preenchimento)', () => {
    const { lancamentos } = extratoNubank.parsear(csvPonto)
    for (const l of lancamentos) {
      expect(l.iniciais).toBe('')
      expect(l.natureza).toBe('')
      expect(l.descricao).toBe('')
    }
  })
})

// --- TL-08: parsear() com decimal vírgula ---

describe('extratoNubank.parsear() — decimal vírgula', () => {
  it('TL-08: parseia valor com separador decimal vírgula (campo quoted) como número', () => {
    const { lancamentos } = extratoNubank.parsear(csvVirgula)
    expect(lancamentos[0].valor).toBe(-150.5)
    expect(lancamentos[1].valor).toBe(3500)
    expect(lancamentos[2].valor).toBe(-22.5)
  })
})

// --- TL-10: deduplicação ---

describe('extratoNubank.parsear() — deduplicação', () => {
  it('TL-10: dois registros com mesmo Identificador → apenas um lançamento no resultado', () => {
    const csv = [
      'Data,Valor,Identificador,Descrição',
      '01/03/2026,-150.00,DUP001,Pagamento A',
      '02/03/2026,-200.00,DUP001,Pagamento A duplicado',
      '03/03/2026,-50.00,UNI001,Pagamento único',
    ].join('\n')
    const { lancamentos } = extratoNubank.parsear(csv)
    expect(lancamentos).toHaveLength(2)
    expect(lancamentos.filter(l => l.transcricao === 'Pagamento A')).toHaveLength(1)
  })
})

// --- TL-11, TL-12, TL-13: linhas inválidas ---

describe('extratoNubank.parsear() — linhas inválidas', () => {
  it('TL-11: linha com data malformada é pulada e linhasIgnoradas incrementado', () => {
    const csv = [
      'Data,Valor,Identificador,Descrição',
      '01/03/2026,-150.00,abc123,Pagamento válido',
      'DATA-RUIM,-150.00,abc124,Linha inválida',
    ].join('\n')
    const { lancamentos, linhasIgnoradas } = extratoNubank.parsear(csv)
    expect(lancamentos).toHaveLength(1)
    expect(linhasIgnoradas).toBe(1)
  })

  it('TL-12: fixture ponto retorna linhasIgnoradas = 1', () => {
    const { lancamentos, linhasIgnoradas } = extratoNubank.parsear(csvPonto)
    expect(lancamentos).toHaveLength(3)
    expect(linhasIgnoradas).toBe(1)
  })

  it('TL-13: fixture vírgula retorna linhasIgnoradas = 1', () => {
    const { lancamentos, linhasIgnoradas } = extratoNubank.parsear(csvVirgula)
    expect(lancamentos).toHaveLength(3)
    expect(linhasIgnoradas).toBe(1)
  })
})

// --- TL-14: arquivo não reconhecido ---

describe('extratoNubank.parsear() — arquivo não reconhecido', () => {
  it('TL-14: conteúdo com cabeçalho errado lança ErroArquivoNaoReconhecido', () => {
    const csvErrado = 'Date,Amount,ID,Description\n01/03/2026,-150.00,abc123,Desc'
    expect(() => extratoNubank.parsear(csvErrado)).toThrow(ErroArquivoNaoReconhecido)
  })
})

// --- TL-15, TL-16: index.ts / detectar() ---

describe('detectar()', () => {
  it('TL-15: retorna parser extrato_nubank para CSV com cabeçalho correto', () => {
    const parser = detectar('Data,Valor,Identificador,Descrição\n01/03/2026,-150.00,abc123,Desc')
    expect(parser).toBe(extratoNubank)
  })

  it('TL-16: lança ErroArquivoNaoReconhecido quando nenhum parser reconhece o conteúdo', () => {
    expect(() => detectar('conteúdo desconhecido')).toThrow(ErroArquivoNaoReconhecido)
  })
})
