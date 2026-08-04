// ADR: see spec/fundacao-operacoes.adr.md

import { describe, expect, it } from 'vitest'
import { criarAvisosSlice, type StoreComAvisos } from '../avisosSlice'
import type { Aviso, Lancamento } from '../../../types'

// Task T09 (ADR `fundacao-operacoes`, Decisão 8): `limparAvisos` é o primitivo genérico que
// materializa a política "zerar avisos por inteiro antes de re-rodar os detectores" — a
// política completa (limpar + re-detectar) é provada por `reproduzirAvisos`
// (`src/ui/__tests__/pipeline.reproduzirAvisos.test.ts`); este arquivo prova o primitivo do
// slice isoladamente.

let proximoIdLancamento = 1

function lancamento(parcial: Partial<Lancamento> = {}): Lancamento {
  return {
    id: proximoIdLancamento++,
    fonte: 'Nubank',
    data: '2025-03-15',
    transcricao: 'Mercado',
    valor: -150,
    iniciais: 'ES',
    natureza: 'Alimentação',
    descricao: 'Supermercado',
    ...parcial,
  }
}

function proposta(parcial: Partial<Aviso> = {}): Aviso {
  return {
    id: 'aviso-1',
    tipo: 'proposta',
    origem: 'conciliacao',
    mensagem: 'Proposta de teste',
    alvo: ['0'],
    permanece: [],
    estado: 'pendente',
    ...parcial,
  }
}

function criarStoreDeTeste(lancamentos: Lancamento[] = []) {
  let estado: StoreComAvisos = {
    lancamentos,
    avisosAcionaveis: { avisos: [], removidos: {}, avisoEmInspecao: null },
  }

  const get = () => estado

  const set = (
    partial: Partial<StoreComAvisos> | ((s: StoreComAvisos) => Partial<StoreComAvisos>),
  ) => {
    const parcial = typeof partial === 'function' ? partial(estado) : partial
    estado = { ...estado, ...parcial }
  }

  const acoes = criarAvisosSlice(set, get)

  return { get, acoes }
}

describe('avisosSlice — limparAvisos (T09, ADR Decisão 8)', () => {
  it('esvazia avisos por inteiro mesmo havendo avisos aplicado/dispensado/pendente', () => {
    const l0 = lancamento({ id: 100 })
    const { get, acoes } = criarStoreDeTeste([l0])

    acoes.adicionarAvisos([
      proposta({ id: 'a1', estado: 'pendente' }),
      proposta({ id: 'a2', estado: 'dispensado' }),
      proposta({ id: 'a3', mutacaoProposta: { verbo: 'remover', alvo: [100] } }),
    ])
    acoes.aplicar('a3')
    expect(get().avisosAcionaveis.avisos).toHaveLength(3)

    acoes.limparAvisos()

    expect(get().avisosAcionaveis.avisos).toEqual([])
  })

  it('esvazia removidos junto com avisos', () => {
    const l0 = lancamento({ id: 200 })
    const { get, acoes } = criarStoreDeTeste([l0])
    acoes.adicionarAvisos([
      proposta({ id: 'a1', mutacaoProposta: { verbo: 'remover', alvo: [200] } }),
    ])
    acoes.aplicar('a1')
    expect(get().avisosAcionaveis.removidos).not.toEqual({})

    acoes.limparAvisos()

    expect(get().avisosAcionaveis.removidos).toEqual({})
  })

  it('encerra avisoEmInspecao, voltando a null', () => {
    const { get, acoes } = criarStoreDeTeste()
    acoes.adicionarAvisos([proposta({ id: 'a1' })])
    acoes.entrarInspecao('a1')
    expect(get().avisosAcionaveis.avisoEmInspecao).toBe('a1')

    acoes.limparAvisos()

    expect(get().avisosAcionaveis.avisoEmInspecao).toBeNull()
  })

  it('é idempotente sobre estado já vazio — não lança, não muda nada', () => {
    const { get, acoes } = criarStoreDeTeste()

    expect(() => acoes.limparAvisos()).not.toThrow()
    expect(get().avisosAcionaveis).toEqual({ avisos: [], removidos: {}, avisoEmInspecao: null })

    acoes.limparAvisos()
    expect(get().avisosAcionaveis).toEqual({ avisos: [], removidos: {}, avisoEmInspecao: null })
  })
})
