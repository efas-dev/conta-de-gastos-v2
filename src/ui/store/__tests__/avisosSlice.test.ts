// ADR: see Docs/specs/avisos-acionaveis.adr.md

import { describe, expect, it, vi } from 'vitest'
import {
  criarAvisosSlice,
  estadoInicialAvisos,
  type StoreComAvisos,
} from '../avisosSlice'
import type { Aviso, Lancamento } from '../../../types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function lancamento(parcial: Partial<Lancamento> = {}): Lancamento {
  return {
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
    estado: 'pendente',
    ...parcial,
  }
}

function informativo(parcial: Partial<Aviso> = {}): Aviso {
  return {
    id: 'aviso-info',
    tipo: 'informativo',
    origem: 'valor-pendente',
    mensagem: 'Aviso informativo de teste',
    alvo: [],
    estado: 'pendente',
    ...parcial,
  }
}

// ---------------------------------------------------------------------------
// Store de teste mínimo — implementa StoreComAvisos com set/get reais
// ---------------------------------------------------------------------------

function criarStoreDeTeste(lancamentos: Lancamento[] = []) {
  let estado: StoreComAvisos = {
    lancamentos,
    avisosAcionaveis: { avisos: [], removidos: {} },
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

describe('avisosSlice', () => {
  describe('adicionarAvisos', () => {
    it('adiciona avisos ao estado do slice em modo append', () => {
      const { get, acoes } = criarStoreDeTeste()
      acoes.adicionarAvisos([proposta({ id: 'a1' })])
      acoes.adicionarAvisos([proposta({ id: 'a2' })])

      expect(get().avisosAcionaveis.avisos.map((a) => a.id)).toEqual(['a1', 'a2'])
    })

    it('parte de estadoInicialAvisos vazio', () => {
      expect(estadoInicialAvisos).toEqual({ avisos: [], removidos: {} })
    })
  })

  describe('aplicar', () => {
    it('remove de lancamentos os itens cujos índices estão em alvo e marca o aviso como aplicado', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const { get, acoes } = criarStoreDeTeste([l0, l1])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['0'] })])

      acoes.aplicar('a1')

      expect(get().lancamentos).toEqual([l1])
      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('aplicado')
    })

    it('é idempotente — chamar aplicar duas vezes não remove nada de novo nem duplica remoção', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const { get, acoes } = criarStoreDeTeste([l0, l1])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['0'] })])

      acoes.aplicar('a1')
      acoes.aplicar('a1')

      expect(get().lancamentos).toEqual([l1])
      expect(get().avisosAcionaveis.removidos['a1']).toHaveLength(1)
    })

    it('não tem efeito em aviso do tipo informativo', () => {
      const l0 = lancamento()
      const { get, acoes } = criarStoreDeTeste([l0])
      acoes.adicionarAvisos([informativo({ id: 'info-1', alvo: ['0'] })])

      acoes.aplicar('info-1')

      expect(get().lancamentos).toEqual([l0])
      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'info-1')?.estado).toBe('pendente')
    })

    it('não tem efeito em aviso inexistente', () => {
      const l0 = lancamento()
      const { get, acoes } = criarStoreDeTeste([l0])

      acoes.aplicar('nao-existe')

      expect(get().lancamentos).toEqual([l0])
    })
  })

  describe('desfazer', () => {
    it('restaura os lançamentos removidos nas posições originais', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const l2 = lancamento({ transcricao: 'Item 2' })
      const { get, acoes } = criarStoreDeTeste([l0, l1, l2])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['1'] })])

      acoes.aplicar('a1')
      expect(get().lancamentos).toEqual([l0, l2])

      acoes.desfazer('a1')

      expect(get().lancamentos).toEqual([l0, l1, l2])
    })

    it('volta o estado do aviso de aplicado para pendente', () => {
      const l0 = lancamento()
      const { get, acoes } = criarStoreDeTeste([l0])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['0'] })])

      acoes.aplicar('a1')
      acoes.desfazer('a1')

      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('pendente')
    })

    it('é idempotente — desfazer em aviso que não está aplicado não tem efeito', () => {
      const l0 = lancamento()
      const { get, acoes } = criarStoreDeTeste([l0])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['0'] })])

      acoes.desfazer('a1')

      expect(get().lancamentos).toEqual([l0])
      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('pendente')
    })

    it('aplicar novamente após desfazer volta a remover (não fica travado)', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const { get, acoes } = criarStoreDeTeste([l0, l1])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['0'] })])

      acoes.aplicar('a1')
      acoes.desfazer('a1')
      acoes.aplicar('a1')

      expect(get().lancamentos).toEqual([l1])
      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('aplicado')
    })
  })

  describe('dispensar', () => {
    it('marca aviso pendente como dispensado sem alterar lancamentos', () => {
      const l0 = lancamento()
      const { get, acoes } = criarStoreDeTeste([l0])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['0'] })])

      acoes.dispensar('a1')

      expect(get().lancamentos).toEqual([l0])
      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('dispensado')
    })

    it('não tem efeito em aviso que não está pendente', () => {
      const l0 = lancamento()
      const { get, acoes } = criarStoreDeTeste([l0])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['0'] })])

      acoes.aplicar('a1')
      acoes.dispensar('a1')

      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('aplicado')
    })
  })

  describe('zero-retenção (D0 do ADR)', () => {
    it('nenhuma ação do slice chama localStorage', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
      const l0 = lancamento()
      const { acoes } = criarStoreDeTeste([l0])

      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['0'] })])
      acoes.aplicar('a1')
      acoes.desfazer('a1')
      acoes.dispensar('a1')

      expect(setItemSpy).not.toHaveBeenCalled()
      setItemSpy.mockRestore()
    })
  })
})
