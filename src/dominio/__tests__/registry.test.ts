// ADR: see spec/fundacao-operacoes.adr.md

import { describe, it, expect } from 'vitest'
import type { Detector, ContextoDeteccao } from '../registry'
import { detectores } from '../registry'
import type { Aviso, Lancamento } from '../../types'

function lancamento(overrides: Partial<Lancamento> = {}): Lancamento {
  return {
    id: 1,
    fonte: 'Nubank',
    data: '2026-08-01',
    transcricao: 'Compra teste',
    valor: -10,
    iniciais: 'AB',
    natureza: '',
    descricao: '',
    ...overrides,
  }
}

describe('Detector — contrato', () => {
  it('aceita um detector com escopo "por-fonte"', () => {
    const fake: Detector = {
      origem: 'fake-por-fonte',
      escopo: 'por-fonte',
      detectar: (lancamentos, contexto) => {
        expect(Array.isArray(lancamentos)).toBe(true)
        expect(Array.isArray(contexto.todosLancamentos)).toBe(true)
        return []
      },
    }
    expect(fake.escopo).toBe('por-fonte')
    expect(fake.detectar([], { todosLancamentos: [] })).toEqual([])
  })

  it('aceita um detector com escopo "global"', () => {
    const fake: Detector = {
      origem: 'fake-global',
      escopo: 'global',
      detectar: () => [],
    }
    expect(fake.escopo).toBe('global')
  })

  it('dois detectores fake (por-fonte e global) compõem um array Detector[] junto com o registry', () => {
    const fakePorFonte: Detector = { origem: 'a', escopo: 'por-fonte', detectar: () => [] }
    const fakeGlobal: Detector = { origem: 'b', escopo: 'global', detectar: () => [] }
    const lista: Detector[] = [...detectores, fakePorFonte, fakeGlobal]
    expect(lista).toHaveLength(2)
  })

  it('a função de detecção devolve Aviso[] e recebe lancamentos + contexto sem mutar a entrada', () => {
    const alvo = lancamento({ id: 7, transcricao: 'Pix recebido' })
    const entrada: Lancamento[] = [alvo]
    const copiaAntes = [...entrada]

    const fake: Detector = {
      origem: 'fake-puro',
      escopo: 'global',
      detectar: (lancamentos): Aviso[] =>
        lancamentos
          .filter((l) => l.transcricao.includes('Pix'))
          .map((l) => ({
            id: `fake-${l.id}`,
            tipo: 'informativo',
            origem: 'fake-puro',
            mensagem: `achou ${l.transcricao}`,
            alvo: [],
            permanece: [],
            estado: 'pendente',
          })),
    }

    const avisos = fake.detectar(entrada, { todosLancamentos: entrada })

    expect(avisos).toHaveLength(1)
    expect(avisos[0].id).toBe('fake-7')
    expect(entrada).toEqual(copiaAntes)
  })

  it('contexto.nomeUsuario é opcional — detector fake funciona sem ele', () => {
    const fake: Detector = {
      origem: 'fake-sem-nome',
      escopo: 'por-fonte',
      detectar: (_lancamentos, contexto: ContextoDeteccao) => {
        expect(contexto.nomeUsuario).toBeUndefined()
        return []
      },
    }
    expect(fake.detectar([], { todosLancamentos: [] })).toEqual([])
  })
})

describe('registry — lista de detectores', () => {
  it('exporta detectores como array', () => {
    expect(Array.isArray(detectores)).toBe(true)
  })

  it('nasce vazio nesta task — nenhum detector existente satisfaz o contrato sem migração (T06/T07/T07-bis)', () => {
    expect(detectores).toHaveLength(0)
  })
})
