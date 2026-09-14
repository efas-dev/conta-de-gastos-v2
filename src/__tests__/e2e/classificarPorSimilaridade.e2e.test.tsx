// ADR: see spec/dicionario-chave-canonica.adr.md

/**
 * Prova E2E — T15 da spec `dicionario-chave-canonica` (F8/F10, Decisão 10, frente 4).
 *
 * Percorre o caminho da PROPOSTA de ponta a ponta, com o array `detectores` de produção: o
 * detector emite, a deduplicação do registry deixa passar, o store aplica e a linha chega
 * classificada na grid — e o desfazer devolve tudo ao estado anterior.
 *
 * O teste que mais importa aqui é o E15-05: o par real `JOAO AU` × `JOAO GU` (Pensão residentes
 * contra Café) tem similaridade textual de 0,944, acima do limiar, e mesmo assim NÃO pode gerar
 * proposta, porque o valor diverge. É a prova executável de que o limiar é filtro e o valor é
 * trava (Decisão 21).
 *
 * Fixture sintética, nunca copiada de `data_sample/`.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type { Aviso, DicEntry, Lancamento } from '../../types'
import { detectores, orquestrarDeteccao } from '../../dominio/registry'
import { useAppStore } from '../../ui/store/appStore'
import { estadoInicialAvisos } from '../../ui/store/avisosSlice'

function lancamento(over: Partial<Lancamento> & Pick<Lancamento, 'id' | 'transcricao' | 'valor'>): Lancamento {
  return {
    fonte: 'fatura_nubank_cc',
    data: '2026-07-05',
    natureza: '',
    descricao: '',
    iniciais: 'ES',
    ...over,
  }
}

function entrada(over: Partial<DicEntry> & Pick<DicEntry, 'chave'>): DicEntry {
  return {
    fonte: 'fatura_nubank_cc',
    natureza: 'VC',
    descricao: 'Conserto City',
    iniciais: 'ES',
    vezes: 3,
    ambiguo: false,
    valor: -275,
    ...over,
  }
}

/** Roda o registry de produção e devolve só as propostas de classificação. */
function propostas(lancamentos: Lancamento[], dicEntries: DicEntry[]): Aviso[] {
  return orquestrarDeteccao(lancamentos, detectores, undefined, undefined, dicEntries).filter(
    (a) => a.origem === 'classificacao-similaridade',
  )
}

describe('E2E — proposta de classificação por similaridade (T15)', () => {
  beforeEach(() => {
    useAppStore.setState({ lancamentos: [], avisosAcionaveis: { ...estadoInicialAvisos } })
  })

  it('E15-01: o detector de produção emite a proposta quando texto e valor corroboram', () => {
    const linha = lancamento({ id: 7, transcricao: 'Autohubservicee - Parcela 3/4', valor: -275 })
    const avisos = propostas([linha], [entrada({ chave: 'Autohubservice - Parcela #/4' })])

    expect(avisos).toHaveLength(1)
    expect(avisos[0].tipo).toBe('proposta')
  })

  it('E15-02: aceitar a proposta preenche a linha na grid', () => {
    const linha = lancamento({ id: 7, transcricao: 'Autohubservicee - Parcela 3/4', valor: -275 })
    const avisos = propostas([linha], [entrada({ chave: 'Autohubservice - Parcela #/4' })])

    useAppStore.setState({
      lancamentos: [linha],
      avisosAcionaveis: { ...estadoInicialAvisos, avisos },
    })
    useAppStore.getState().aplicar(avisos[0].id)

    const [naGrid] = useAppStore.getState().lancamentos
    expect(naGrid.natureza).toBe('VC')
    expect(naGrid.descricao).toBe('Conserto City')
  })

  it('E15-03: desfazer devolve a linha ao estado não classificado', () => {
    const linha = lancamento({ id: 7, transcricao: 'Autohubservicee - Parcela 3/4', valor: -275 })
    const avisos = propostas([linha], [entrada({ chave: 'Autohubservice - Parcela #/4' })])

    useAppStore.setState({
      lancamentos: [linha],
      avisosAcionaveis: { ...estadoInicialAvisos, avisos },
    })
    useAppStore.getState().aplicar(avisos[0].id)
    useAppStore.getState().desfazer(avisos[0].id)

    const [naGrid] = useAppStore.getState().lancamentos
    expect(naGrid.natureza).toBe('')
    expect(naGrid.descricao).toBe('')
  })

  it('E15-04: enquanto a proposta não é aceita, a grid permanece intocada', () => {
    const linha = lancamento({ id: 7, transcricao: 'Autohubservicee - Parcela 3/4', valor: -275 })
    propostas([linha], [entrada({ chave: 'Autohubservice - Parcela #/4' })])
    expect(linha.natureza).toBe('')
  })

  it('E15-05: D21 — similaridade 0,944 com valor divergente NÃO gera proposta', () => {
    // `PIX TRANSF JOAO AU` é Pensão residentes (R$ 2950); `PIX TRANSF JOAO GU` é Café (R$ 56).
    // Pessoas diferentes, truncadas em largura fixa pelo Itaú. Se algum dia este teste ficar
    // vermelho, o app passou a classificar pensão como café.
    const linha = lancamento({
      id: 9,
      fonte: 'extrato_itau',
      transcricao: 'PIX TRANSF JOAO GU',
      valor: -56,
    })
    const dic = [
      entrada({
        chave: 'PIX TRANSF JOAO AU',
        fonte: 'extrato_itau',
        natureza: 'OT',
        descricao: 'Pensão residentes',
        valor: 2950,
      }),
    ]
    expect(propostas([linha], dic)).toEqual([])
  })

  it('E15-06: sem dicionário carregado, o registry não emite proposta alguma', () => {
    const linha = lancamento({ id: 7, transcricao: 'Autohubservicee - Parcela 3/4', valor: -275 })
    expect(propostas([linha], [])).toEqual([])
  })

  it('E15-07: linha já classificada pelo dicionário não vira proposta', () => {
    const linha = lancamento({
      id: 7,
      transcricao: 'Autohubservicee - Parcela 3/4',
      valor: -275,
      natureza: 'VC',
      descricao: 'Conserto City',
    })
    expect(propostas([linha], [entrada({ chave: 'Autohubservice - Parcela #/4' })])).toEqual([])
  })
})
