// ADR: see Docs/specs/fatura-itau-xlsx.adr.md

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ResultadoParse } from '../../types'
import type { ParserBinario } from '../binario'
import { parsersBinarios } from '../binario'
import { detectar, ErroArquivoNaoReconhecido } from '../index'
import { faturaNumbank } from '../fatura_nubank'
import { aceita as aceitaFaturaItauCc } from '../fatura_itau_cc'

function lerFixtureBytes(...segmentos: string[]): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.resolve(__dirname, ...segmentos)))
}

describe('parsersBinarios — registry irmão de parsers, sobre bytes', () => {
  describe('TL-T13-01: parsersBinarios contém fatura_itau_cc registrado', () => {
    it('o array deixa de estar vazio: contém um parser cujo aceita() é o de fatura_itau_cc', () => {
      expect(parsersBinarios).toHaveLength(1)
      expect(parsersBinarios[0].aceita).toBe(aceitaFaturaItauCc)
    })
  })

  describe('TL-T13-02: roteamento por parsersBinarios reconhece a fixture de fatura Itaú', () => {
    it('parsersBinarios.some(p => p.aceita(bytes)) é true para os bytes da fixture compartilhada', () => {
      const bytes = lerFixtureBytes('./fixtures/fatura_itau_cc_sintetica.xlsx')
      expect(parsersBinarios.some((p) => p.aceita(bytes))).toBe(true)
    })

    it('parsersBinarios.some(p => p.aceita(bytes)) é false para uma fixture de texto (não-.xlsx)', () => {
      const bytes = lerFixtureBytes('./fixtures/extrato_itau_crlf.txt')
      expect(parsersBinarios.some((p) => p.aceita(bytes))).toBe(false)
    })
  })

  describe('TL-T2-02: interface ParserBinario aceita implementação sobre Uint8Array', () => {
    it('aceita() e parsear() de um mock satisfazem o contrato e podem ser registrados no array', () => {
      const resultadoMock: ResultadoParse = {
        lancamentos: [],
        linhasIgnoradas: 0,
        excluidosPendentes: [],
      }
      const mock: ParserBinario = {
        aceita(bytes: Uint8Array): boolean {
          return bytes.length > 0
        },
        parsear(): ResultadoParse {
          return resultadoMock
        },
      }

      parsersBinarios.push(mock)

      expect(mock.aceita(new Uint8Array([1, 2, 3]))).toBe(true)
      expect(mock.aceita(new Uint8Array([]))).toBe(false)
      expect(mock.parsear(new Uint8Array([1]))).toBe(resultadoMock)

      parsersBinarios.pop()
    })
  })

  describe('TL-T2-03: ResultadoParse de ParserBinario reaproveita o tipo de ../../types', () => {
    it('o retorno de parsear() tem o mesmo formato usado pelos parsers de texto', () => {
      const mock: ParserBinario = {
        aceita: () => true,
        parsear: () => ({ lancamentos: [], linhasIgnoradas: 0, excluidosPendentes: [] }),
      }

      const resultado = mock.parsear(new Uint8Array())

      expect(resultado).toHaveProperty('lancamentos')
      expect(resultado).toHaveProperty('linhasIgnoradas')
      expect(resultado).toHaveProperty('excluidosPendentes')
    })
  })

  describe('TL-T2-04: src/parsers/index.ts permanece com comportamento inalterado', () => {
    it('detectar() continua reconhecendo o contrato de texto (Parser sobre string) sem alteração', () => {
      const conteudo = 'date,title,amount\n2024-01-01,Mercado,10.00'
      expect(detectar(conteudo)).toBe(faturaNumbank)
    })

    it('detectar() continua lançando ErroArquivoNaoReconhecido para conteúdo desconhecido', () => {
      expect(() => detectar('lixo,arbitrario\n1,2')).toThrow(ErroArquivoNaoReconhecido)
    })
  })
})
