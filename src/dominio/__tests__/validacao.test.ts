// ADR: see Docs/specs/mvp-vertical-nubank.adr.md
import { describe, it, expect } from 'vitest'
import { validarLinha } from '../validacao'
import type { Lancamento } from '../../types'

/** Lançamento base com todos os campos mínimos preenchidos */
function lancamento(parcial: Partial<Lancamento>): Lancamento {
  return {
    fonte: 'Nubank',
    data: '2024-01-15',
    transcricao: '',
    valor: 0,
    iniciais: 'ES',
    natureza: '',
    descricao: '',
    ...parcial,
  }
}

const NATUREZAS = ['Alimentação', 'Transporte', 'Moradia']

describe('validarLinha', () => {
  describe('natureza vazia com dados na linha', () => {
    it('retorna true quando transcricao está preenchida e natureza está vazia', () => {
      const l = lancamento({ transcricao: 'Mercado', natureza: '' })
      expect(validarLinha(l, NATUREZAS)).toBe(true)
    })

    it('retorna true quando valor é não-zero e natureza está vazia', () => {
      const l = lancamento({ transcricao: '', valor: -50, natureza: '' })
      expect(validarLinha(l, NATUREZAS)).toBe(true)
    })

    it('retorna true quando transcricao e valor estão preenchidos e natureza está vazia', () => {
      const l = lancamento({ transcricao: 'Uber', valor: -15.5, natureza: '' })
      expect(validarLinha(l, NATUREZAS)).toBe(true)
    })
  })

  describe('natureza preenchida mas inválida', () => {
    it('retorna true quando natureza não está em naturezasValidas', () => {
      const l = lancamento({ transcricao: 'Cinema', valor: -30, natureza: 'Lazer' })
      expect(validarLinha(l, NATUREZAS)).toBe(true)
    })

    it('retorna true quando naturezasValidas está vazia e natureza está preenchida', () => {
      const l = lancamento({ transcricao: 'Cinema', valor: -30, natureza: 'Lazer' })
      expect(validarLinha(l, [])).toBe(true)
    })
  })

  describe('linha normal (não precisa de atenção)', () => {
    it('retorna false quando natureza é válida e está dentro de naturezasValidas', () => {
      const l = lancamento({ transcricao: 'iFood', valor: -40, natureza: 'Alimentação' })
      expect(validarLinha(l, NATUREZAS)).toBe(false)
    })

    it('retorna false quando linha não tem dados (transcricao vazia e valor zero) mesmo com natureza vazia', () => {
      const l = lancamento({ transcricao: '', valor: 0, natureza: '' })
      expect(validarLinha(l, NATUREZAS)).toBe(false)
    })
  })
})
