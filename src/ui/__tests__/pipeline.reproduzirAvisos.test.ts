// ADR: see spec/fundacao-operacoes.adr.md

import { describe, expect, it } from 'vitest'
import { reproduzirAvisos } from '../PipelineState'
import { criarAvisosSlice, type StoreComAvisos } from '../store/avisosSlice'
import type { Lancamento } from '../../types'

// Task T09 (ADR `fundacao-operacoes`, Decisão 8): `reproduzirAvisos` é a política completa de
// "produzir" — zerar avisos + re-rodar o registry inteiro. Provada aqui com o registry REAL
// (`src/dominio/registry.ts`, 5 detectores de T05/T06/T07/T07-bis) e com o `avisosSlice` REAL
// (`criarAvisosSlice`), sem mocks — o objetivo é provar a política fim a fim, não a forma de
// um contrato isolado.

let proximoId = 1

function lancamento(parcial: Partial<Lancamento> = {}): Lancamento {
  return {
    id: proximoId++,
    fonte: 'Nubank',
    data: '2025-03-15',
    transcricao: 'Mercado',
    valor: -150,
    iniciais: 'ES',
    natureza: '',
    descricao: '',
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

  return { get, acoes, atualizarLancamentos: (l: Lancamento[]) => (estado = { ...estado, lancamentos: l }) }
}

describe('reproduzirAvisos (T09, ADR Decisão 8 — política de "produzir")', () => {
  it('chama limparAvisos antes de adicionarAvisos — nunca depois', () => {
    const chamadas: string[] = []
    const limparAvisos = () => chamadas.push('limpar')
    const adicionarAvisos = () => chamadas.push('adicionar')

    reproduzirAvisos([], undefined, undefined, limparAvisos, adicionarAvisos)

    expect(chamadas).toEqual(['limpar', 'adicionar'])
  })

  it('roda o registry inteiro (5 detectores) — produz aviso de investimento, não só os 3 legados', () => {
    const l = lancamento({ transcricao: 'APLICACAO RDB', valor: -1000 })
    const { get, acoes } = criarStoreDeTeste([l])

    reproduzirAvisos([l], undefined, undefined, acoes.limparAvisos, acoes.adicionarAvisos)

    const origens = get().avisosAcionaveis.avisos.map((a) => a.origem)
    expect(origens).toContain('investimento')
  })

  it('roda o registry inteiro — produz aviso de transferência interna', () => {
    const l = lancamento({ transcricao: 'Open Banking transferencia', valor: -200 })
    const { get, acoes } = criarStoreDeTeste([l])

    reproduzirAvisos([l], undefined, undefined, acoes.limparAvisos, acoes.adicionarAvisos)

    const origens = get().avisosAcionaveis.avisos.map((a) => a.origem)
    expect(origens).toContain('transferencia-interna')
  })

  it('sem mesRef, conciliação não produz aviso (degradação documentada em T06) mesmo com fatura+extrato', () => {
    const fatura = lancamento({ fonte: 'fatura_nubank_cc', transcricao: 'Compra', valor: -80 })
    const extrato = lancamento({ fonte: 'extrato_itau', transcricao: 'Pagamento de fatura', valor: -80 })
    const { get, acoes } = criarStoreDeTeste([fatura, extrato])

    reproduzirAvisos([fatura, extrato], undefined, undefined, acoes.limparAvisos, acoes.adicionarAvisos)

    const origens = get().avisosAcionaveis.avisos.map((a) => a.origem)
    expect(origens).not.toContain('conciliacao')
  })

  it('upload incremental (teste-chave da DoD): decisões anteriores (aplicado/dispensado) são esquecidas após novo produzir', () => {
    const primeiro = lancamento({ transcricao: 'APLICACAO RDB', valor: -1000 })
    const { get, acoes, atualizarLancamentos } = criarStoreDeTeste([primeiro])

    // 1ª rodada de "produzir": detecta o aviso de investimento + os avisos 'vr' e 'rendimentos'
    // (sempre presentes, ver Task 4 da spec `vr-despesas` e Task 9 da spec `rendimentos` —
    // `detectarVR`/`detectarRendimentos` emitem incondicionalmente, independente do conteúdo de
    // `lancamentos`).
    reproduzirAvisos([primeiro], undefined, undefined, acoes.limparAvisos, acoes.adicionarAvisos)
    const avisosRodada1 = get().avisosAcionaveis.avisos
    expect(avisosRodada1).toHaveLength(3)
    const avisoInvestimentoRodada1 = avisosRodada1.find((a) => a.origem === 'investimento')
    const idRodada1 = avisoInvestimentoRodada1!.id

    // Usuário dispensa a proposta.
    acoes.dispensar(idRodada1)
    expect(get().avisosAcionaveis.avisos.find((a) => a.id === idRodada1)?.estado).toBe('dispensado')

    // Upload incremental: mais um arquivo é adicionado, o usuário aperta "Produzir" de novo.
    const segundo = lancamento({ transcricao: 'RESGATE CDB', valor: 500 })
    const todosLancamentos = [primeiro, segundo]
    atualizarLancamentos(todosLancamentos)

    reproduzirAvisos(todosLancamentos, undefined, undefined, acoes.limparAvisos, acoes.adicionarAvisos)

    const avisosRodada2 = get().avisosAcionaveis.avisos
    // D8: a proposta é redetectada do zero — mesmo que o id determinístico coincida com o
    // da rodada anterior (é derivado de `lancamento.id`, que não muda), a decisão de
    // 'dispensado' NÃO sobrevive: a instância nova nasce 'pendente', não 'dispensado'.
    // Nenhum aviso 'dispensado' remanescente em nenhum lugar da lista.
    expect(avisosRodada2.every((a) => a.estado === 'pendente')).toBe(true)
    expect(avisosRodada2.find((a) => a.id === idRodada1)?.estado).toBe('pendente')
    // A nova detecção roda do zero sobre os DOIS lançamentos — 2 propostas de investimento +
    // 1 aviso 'vr' + 1 aviso 'rendimentos' (ambos sempre presentes, Task 4 spec vr-despesas e
    // Task 9 spec rendimentos).
    expect(avisosRodada2).toHaveLength(4)
    expect(avisosRodada2.map((a) => a.origem)).toEqual([
      'investimento',
      'investimento',
      'vr',
      'rendimentos',
    ])
    // removidos/avisoEmInspecao também resetados pela limpeza.
    expect(get().avisosAcionaveis.removidos).toEqual({})
    expect(get().avisosAcionaveis.avisoEmInspecao).toBeNull()
  })
})
