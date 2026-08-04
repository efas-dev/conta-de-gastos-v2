// ADR: see Docs/specs/avisos-acionaveis.adr.md

import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../appStore'
import { estadoInicialAvisos } from '../avisosSlice'
import type { Aviso, Lancamento } from '../../../types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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
    id: 'proposta-1',
    tipo: 'proposta',
    origem: 'conciliacao',
    mensagem: 'Fatura conciliada com pagamento no extrato',
    alvo: ['1'],
    estado: 'pendente',
    ...parcial,
  }
}

function resetarStore(lancamentos: Lancamento[]): void {
  useAppStore.setState({
    lancamentos,
    avisosAcionaveis: estadoInicialAvisos,
  })
}

// ---------------------------------------------------------------------------
// Integração: ciclo completo via useAppStore (Zustand real, não mock)
// ---------------------------------------------------------------------------

describe('avisosSlice — integração com useAppStore', () => {
  beforeEach(() => {
    resetarStore([lancamento({ transcricao: 'Item 0' }), lancamento({ transcricao: 'Item 1' })])
  })

  it('cobre o ciclo completo: adicionarAvisos → aplicar → desfazer → dispensar', () => {
    const store = useAppStore

    // adicionarAvisos
    store.getState().adicionarAvisos([proposta()])
    expect(store.getState().avisosAcionaveis.avisos).toHaveLength(1)
    expect(store.getState().avisosAcionaveis.avisos[0].estado).toBe('pendente')

    // aplicar
    store.getState().aplicar('proposta-1')
    expect(store.getState().lancamentos).toHaveLength(1)
    expect(store.getState().lancamentos[0].transcricao).toBe('Item 0')
    expect(store.getState().avisosAcionaveis.avisos[0].estado).toBe('aplicado')

    // desfazer
    store.getState().desfazer('proposta-1')
    expect(store.getState().lancamentos).toHaveLength(2)
    expect(store.getState().lancamentos.map((l) => l.transcricao)).toEqual(['Item 0', 'Item 1'])
    expect(store.getState().avisosAcionaveis.avisos[0].estado).toBe('pendente')

    // dispensar
    store.getState().dispensar('proposta-1')
    expect(store.getState().avisosAcionaveis.avisos[0].estado).toBe('dispensado')
    // dispensar não altera lancamentos
    expect(store.getState().lancamentos).toHaveLength(2)
  })

  it('mantém o array avisos legado (string[]) intacto — coexistência sem colisão', () => {
    useAppStore.getState().adicionarAvisos([proposta()])
    useAppStore.getState().addAviso('aviso legado de linha ignorada')

    expect(useAppStore.getState().avisos).toEqual(['aviso legado de linha ignorada'])
    expect(useAppStore.getState().avisosAcionaveis.avisos).toHaveLength(1)
  })

  it('aplicar/desfazer não geram entrada no histórico de undo do grid', () => {
    useAppStore.getState().adicionarAvisos([proposta()])
    useAppStore.getState().aplicar('proposta-1')

    expect(useAppStore.getState().historico).toHaveLength(0)
  })
})
