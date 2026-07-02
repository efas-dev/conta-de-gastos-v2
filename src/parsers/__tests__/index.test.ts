// ADR: see Docs/specs/parsers-fatura-nubank-extrato-itau.adr.md

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { detectar, ErroArquivoNaoReconhecido } from '../index'
import { extratoNubank } from '../extrato_nubank'
import { faturaNumbank } from '../fatura_nubank'
import { extratoItau } from '../extrato_itau'

const FIXTURES = join(__dirname, 'fixtures')

function lerFixture(nome: string): string {
  return readFileSync(join(FIXTURES, nome), 'utf-8')
}

describe('detectar() — integração dos três parsers', () => {
  describe('TL-T6-01: extrato Nubank reconhecido', () => {
    it('retorna extratoNubank para fixture extrato_nubank_ponto.csv', () => {
      const conteudo = lerFixture('extrato_nubank_ponto.csv')
      const parser = detectar(conteudo)
      expect(parser).toBe(extratoNubank)
    })
  })

  describe('TL-T6-02: fatura Nubank reconhecida', () => {
    it('retorna faturaNumbank para fixture fatura_nubank_normal.csv', () => {
      const conteudo = lerFixture('fatura_nubank_normal.csv')
      const parser = detectar(conteudo)
      expect(parser).toBe(faturaNumbank)
    })
  })

  describe('TL-T6-03: extrato Itaú reconhecido', () => {
    it('retorna extratoItau para fixture extrato_itau_minus_inline.txt', () => {
      const conteudo = lerFixture('extrato_itau_minus_inline.txt')
      const parser = detectar(conteudo)
      expect(parser).toBe(extratoItau)
    })
  })

  describe('TL-T6-04: conteúdo não reconhecido lança ErroArquivoNaoReconhecido', () => {
    it('lança ErroArquivoNaoReconhecido para conteúdo arbitrário', () => {
      const conteudo = 'formato,desconhecido,sem,match\n1,2,3,4'
      expect(() => detectar(conteudo)).toThrow(ErroArquivoNaoReconhecido)
    })
  })

  describe('TL-T6-05: fatura Nubank com vírgula decimal', () => {
    it('retorna faturaNumbank para fixture fatura_nubank_quoted_virgula.csv', () => {
      const conteudo = lerFixture('fatura_nubank_quoted_virgula.csv')
      const parser = detectar(conteudo)
      expect(parser).toBe(faturaNumbank)
    })
  })

  describe('TL-T6-06: extrato Itaú com CRLF', () => {
    it('retorna extratoItau para fixture extrato_itau_crlf.txt', () => {
      const conteudo = lerFixture('extrato_itau_crlf.txt')
      const parser = detectar(conteudo)
      expect(parser).toBe(extratoItau)
    })
  })
})
