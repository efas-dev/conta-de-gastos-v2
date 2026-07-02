// ADR: see Docs/specs/dominio-transferencia-investimento-iniciais.adr.md

import { describe, it, expect } from 'vitest'
import { detectarTransferenciaInterna } from '../transferencia'
import {
  lancamentoOpenBanking,
  lancamentoPagFatura,
  lancamentoItauBlack,
  lancamentoPixNominalMatch,
  lancamentoPixNominalNoMatch,
  lancamentoComum,
  lancamentoPixNominalCaseInsensitive,
  lancamentoTranscricaoVazia,
} from './fixtures/transferencia'

describe('detectarTransferenciaInterna', () => {
  describe('padrões genéricos de palavras-chave', () => {
    it('retorna true para transcrição com "Open Banking" (TL-1)', () => {
      expect(detectarTransferenciaInterna(lancamentoOpenBanking)).toBe(true)
    })

    it('retorna true para "Pagamento de fatura" (TL-2)', () => {
      expect(detectarTransferenciaInterna(lancamentoPagFatura)).toBe(true)
    })

    it('retorna true para "ITAU BLACK" (TL-3)', () => {
      expect(detectarTransferenciaInterna(lancamentoItauBlack)).toBe(true)
    })
  })

  describe('Pix nominal com nomeUsuario', () => {
    it('retorna true quando nomeUsuario está presente e casa com a transcrição (TL-4)', () => {
      expect(detectarTransferenciaInterna(lancamentoPixNominalMatch, 'Eduardo Santos')).toBe(true)
    })

    it('retorna false quando nomeUsuario presente mas transcrição não contém o nome (TL-5)', () => {
      expect(detectarTransferenciaInterna(lancamentoPixNominalNoMatch, 'Eduardo Santos')).toBe(false)
    })

    it('retorna false quando nomeUsuario ausente — não infere transferência (TL-6)', () => {
      expect(detectarTransferenciaInterna(lancamentoPixNominalMatch)).toBe(false)
    })

    it('comparação de nome é case-insensitive (TL-8)', () => {
      expect(detectarTransferenciaInterna(lancamentoPixNominalCaseInsensitive, 'Eduardo Santos')).toBe(true)
    })
  })

  describe('lançamentos que devem retornar false', () => {
    it('retorna false para lançamento comum sem palavras-chave (TL-7)', () => {
      expect(detectarTransferenciaInterna(lancamentoComum)).toBe(false)
    })

    it('retorna false para transcrição vazia (TL-9)', () => {
      expect(detectarTransferenciaInterna(lancamentoTranscricaoVazia)).toBe(false)
    })
  })
})
