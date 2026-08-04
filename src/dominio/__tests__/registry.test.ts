// ADR: see spec/fundacao-operacoes.adr.md

import { describe, it, expect } from 'vitest'
import type { Detector, ContextoDeteccao } from '../registry'
import { detectores, orquestrarDeteccao } from '../registry'
import { detectarValorPendente, detectarPagamentoRecebido, detectarConciliacao } from '../deteccoes'
import { classificarFonte } from '../mes'
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
    expect(lista).toHaveLength(detectores.length + 2)
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

  it('T06 migra 3 detectores (valor-pendente, pagamento-recebido, conciliação); investimento e transferência interna ainda faltam (T07/T07-bis)', () => {
    expect(detectores).toHaveLength(3)
    expect(detectores.map((d) => d.origem)).not.toContain('investimento')
    expect(detectores.map((d) => d.origem)).not.toContain('transferencia-interna')
  })
})

describe('orquestrarDeteccao — detector "global"', () => {
  it('chama detectar exatamente 1 vez para lista vazia', () => {
    let chamadas = 0
    const fakeGlobal: Detector = {
      origem: 'fake-global',
      escopo: 'global',
      detectar: () => {
        chamadas++
        return []
      },
    }
    orquestrarDeteccao([], [fakeGlobal])
    expect(chamadas).toBe(1)
  })

  it('chama detectar exatamente 1 vez para lançamentos de múltiplas fontes, recebendo o array total', () => {
    let chamadas = 0
    let recebido: Lancamento[] = []
    const fakeGlobal: Detector = {
      origem: 'fake-global',
      escopo: 'global',
      detectar: (lancamentos) => {
        chamadas++
        recebido = lancamentos
        return []
      },
    }
    const l1 = lancamento({ id: 1, fonte: 'Nubank' })
    const l2 = lancamento({ id: 2, fonte: 'Itaú' })
    orquestrarDeteccao([l1, l2], [fakeGlobal])
    expect(chamadas).toBe(1)
    expect(recebido).toEqual([l1, l2])
  })
})

describe('orquestrarDeteccao — detector "por-fonte"', () => {
  it('chama detectar 2 vezes para lançamentos de 2 fontes distintas, uma vez por fatia', () => {
    const chamadasPorFonte: Lancamento[][] = []
    const fakePorFonte: Detector = {
      origem: 'fake-por-fonte',
      escopo: 'por-fonte',
      detectar: (lancamentos) => {
        chamadasPorFonte.push(lancamentos)
        return []
      },
    }
    const l1 = lancamento({ id: 1, fonte: 'Nubank' })
    const l2 = lancamento({ id: 2, fonte: 'Itaú' })
    const l3 = lancamento({ id: 3, fonte: 'Nubank' })
    orquestrarDeteccao([l1, l2, l3], [fakePorFonte])
    expect(chamadasPorFonte).toHaveLength(2)
    expect(chamadasPorFonte[0]).toEqual([l1, l3])
    expect(chamadasPorFonte[1]).toEqual([l2])
  })

  it('chama detectar 1 vez para lançamentos de uma única fonte', () => {
    let chamadas = 0
    const fakePorFonte: Detector = {
      origem: 'fake-por-fonte',
      escopo: 'por-fonte',
      detectar: () => {
        chamadas++
        return []
      },
    }
    orquestrarDeteccao([lancamento({ fonte: 'Nubank' })], [fakePorFonte])
    expect(chamadas).toBe(1)
  })

  it('não chama detectar para lista de lançamentos vazia (zero fontes = zero fatias)', () => {
    let chamadas = 0
    const fakePorFonte: Detector = {
      origem: 'fake-por-fonte',
      escopo: 'por-fonte',
      detectar: () => {
        chamadas++
        return []
      },
    }
    orquestrarDeteccao([], [fakePorFonte])
    expect(chamadas).toBe(0)
  })
})

describe('orquestrarDeteccao — detectores mistos e agregação', () => {
  it('chama o detector por-fonte N vezes (uma por fonte) e o global 1 vez', () => {
    let chamadasPorFonte = 0
    let chamadasGlobal = 0
    const fakePorFonte: Detector = {
      origem: 'fake-por-fonte',
      escopo: 'por-fonte',
      detectar: () => {
        chamadasPorFonte++
        return []
      },
    }
    const fakeGlobal: Detector = {
      origem: 'fake-global',
      escopo: 'global',
      detectar: () => {
        chamadasGlobal++
        return []
      },
    }
    const lancamentos = [
      lancamento({ id: 1, fonte: 'Nubank' }),
      lancamento({ id: 2, fonte: 'Itaú' }),
      lancamento({ id: 3, fonte: 'Inter' }),
    ]
    orquestrarDeteccao(lancamentos, [fakePorFonte, fakeGlobal])
    expect(chamadasPorFonte).toBe(3)
    expect(chamadasGlobal).toBe(1)
  })

  it('contexto.todosLancamentos é sempre o array total, não a fatia da chamada (por-fonte e global)', () => {
    const contextosVistos: Lancamento[][] = []
    const fakePorFonte: Detector = {
      origem: 'fake-por-fonte',
      escopo: 'por-fonte',
      detectar: (_lancamentos, contexto) => {
        contextosVistos.push(contexto.todosLancamentos)
        return []
      },
    }
    const fakeGlobal: Detector = {
      origem: 'fake-global',
      escopo: 'global',
      detectar: (_lancamentos, contexto) => {
        contextosVistos.push(contexto.todosLancamentos)
        return []
      },
    }
    const l1 = lancamento({ id: 1, fonte: 'Nubank' })
    const l2 = lancamento({ id: 2, fonte: 'Itaú' })
    orquestrarDeteccao([l1, l2], [fakePorFonte, fakeGlobal])
    expect(contextosVistos).toHaveLength(3) // 2 fatias por-fonte + 1 global
    for (const contexto of contextosVistos) {
      expect(contexto).toEqual([l1, l2])
    }
  })

  it('agrega (concatena, preservando ordem) os Aviso[] retornados por todas as chamadas', () => {
    const avisoDe = (origem: string, id: string): Aviso => ({
      id,
      tipo: 'informativo',
      origem,
      mensagem: `msg-${id}`,
      alvo: [],
      permanece: [],
      estado: 'pendente',
    })
    const fakePorFonte: Detector = {
      origem: 'fake-por-fonte',
      escopo: 'por-fonte',
      detectar: (lancamentos) => [avisoDe('fake-por-fonte', `pf-${lancamentos[0].fonte}`)],
    }
    const fakeGlobal: Detector = {
      origem: 'fake-global',
      escopo: 'global',
      detectar: () => [avisoDe('fake-global', 'g-1')],
    }
    const l1 = lancamento({ id: 1, fonte: 'Nubank' })
    const l2 = lancamento({ id: 2, fonte: 'Itaú' })
    const avisos = orquestrarDeteccao([l1, l2], [fakePorFonte, fakeGlobal])
    expect(avisos.map((a) => a.id)).toEqual(['pf-Nubank', 'pf-Itaú', 'g-1'])
  })

  it('repassa nomeUsuario, quando fornecido, a toda chamada de detectar (por-fonte e global)', () => {
    const nomesVistos: (string | undefined)[] = []
    const fakePorFonte: Detector = {
      origem: 'fake-por-fonte',
      escopo: 'por-fonte',
      detectar: (_lancamentos, contexto) => {
        nomesVistos.push(contexto.nomeUsuario)
        return []
      },
    }
    const fakeGlobal: Detector = {
      origem: 'fake-global',
      escopo: 'global',
      detectar: (_lancamentos, contexto) => {
        nomesVistos.push(contexto.nomeUsuario)
        return []
      },
    }
    orquestrarDeteccao([lancamento({ fonte: 'Nubank' })], [fakePorFonte, fakeGlobal], 'Fulano')
    expect(nomesVistos).toEqual(['Fulano', 'Fulano'])
  })
})

// ---------------------------------------------------------------------------
// T06 — migração de detectarValorPendente/detectarPagamentoRecebido/detectarConciliacao
// ---------------------------------------------------------------------------

describe('detectores — T06 (migração dos 3 detectores legados)', () => {
  it('contém exatamente 3 entradas: valor-pendente, pagamento-recebido, conciliacao', () => {
    expect(detectores.map((d) => d.origem)).toEqual([
      'valor-pendente',
      'pagamento-recebido',
      'conciliacao',
    ])
  })

  it('valor-pendente e pagamento-recebido têm escopo "global" (não "por-fonte")', () => {
    const valorPendente = detectores.find((d) => d.origem === 'valor-pendente')
    const pagamentoRecebido = detectores.find((d) => d.origem === 'pagamento-recebido')
    expect(valorPendente?.escopo).toBe('global')
    expect(pagamentoRecebido?.escopo).toBe('global')
  })

  it('conciliacao tem escopo "global"', () => {
    const conciliacao = detectores.find((d) => d.origem === 'conciliacao')
    expect(conciliacao?.escopo).toBe('global')
  })

  it('valor-pendente: alvo aponta o índice GLOBAL correto mesmo quando a fatura não é a primeira fonte do array total', () => {
    const extrato1 = lancamento({ id: 1, fonte: 'Itaú', transcricao: 'Débito extrato' })
    const extrato2 = lancamento({ id: 2, fonte: 'Itaú', transcricao: 'Outro débito extrato' })
    const faturaComum = lancamento({ id: 3, fonte: 'Nubank', transcricao: 'Compra qualquer' })
    const faturaValorPendente = lancamento({
      id: 4,
      fonte: 'Nubank',
      transcricao: 'Valor pendente do mês anterior',
      valor: -80,
      origemEspecial: 'valor-pendente',
    })
    const todosLancamentos = [extrato1, extrato2, faturaComum, faturaValorPendente]

    const avisos = orquestrarDeteccao(todosLancamentos, detectores)
    const avisoValorPendente = avisos.find((a) => a.origem === 'valor-pendente')

    expect(avisoValorPendente).toBeDefined()
    // índice 3 = posição real de faturaValorPendente em todosLancamentos, não 1
    // (que seria o índice relativo à fatia por fonte 'Nubank': [faturaComum, faturaValorPendente]).
    expect(avisoValorPendente?.alvo).toEqual(['3'])
  })

  it('pagamento-recebido: alvo aponta o índice GLOBAL correto mesmo quando a fatura não é a primeira fonte do array total', () => {
    const extrato1 = lancamento({ id: 1, fonte: 'Itaú', transcricao: 'Débito extrato' })
    const faturaComum = lancamento({ id: 2, fonte: 'Nubank', transcricao: 'Compra qualquer' })
    const faturaPagamentoRecebido = lancamento({
      id: 3,
      fonte: 'Nubank',
      transcricao: 'Pagamento recebido',
      valor: 300,
      origemEspecial: 'pagamento-recebido',
    })
    const todosLancamentos = [extrato1, faturaComum, faturaPagamentoRecebido]

    const avisos = orquestrarDeteccao(todosLancamentos, detectores)
    const avisoPagamentoRecebido = avisos.find((a) => a.origem === 'pagamento-recebido')

    expect(avisoPagamentoRecebido).toBeDefined()
    expect(avisoPagamentoRecebido?.alvo).toEqual(['2'])
  })

  it('conciliacao: com mesRef fornecido, alvo/permanece remapeados para índices globais idênticos ao call-site legado', () => {
    // Mesmo padrão de App.tsx: extrato antes, fatura depois no array total.
    const extratoOutro = lancamento({ id: 1, fonte: 'Itaú', data: '2026-07-05', transcricao: 'Débito qualquer', valor: -999 })
    const extratoPagamento = lancamento({ id: 2, fonte: 'Itaú', data: '2026-07-10', transcricao: 'Pagamento de fatura', valor: -150.32 })
    const faturaA = lancamento({ id: 3, fonte: 'Nubank', data: '2026-06-05', transcricao: 'Item A', valor: -100 })
    const faturaB = lancamento({ id: 4, fonte: 'Nubank', data: '2026-06-10', transcricao: 'Item B', valor: -50.3 })
    const todosLancamentos = [extratoOutro, extratoPagamento, faturaA, faturaB]
    const mesRef = '2026-07' // Nubank (datas de junho) < mesRef → fatura; Itaú (datas de julho) === mesRef → extrato

    const avisos = orquestrarDeteccao(todosLancamentos, detectores, undefined, mesRef)
    const avisoConciliacao = avisos.find((a) => a.origem === 'conciliacao' && a.tipo === 'proposta')

    expect(avisoConciliacao).toBeDefined()
    // alvo: índice global de extratoPagamento (1); permanece: índices globais de faturaA/faturaB (2, 3).
    expect(avisoConciliacao?.alvo).toEqual(['1'])
    expect(avisoConciliacao?.permanece).toEqual(['2', '3'])
  })

  it('conciliacao: sem mesRef no contexto, não produz aviso (degradação sem quebrar)', () => {
    const extrato = lancamento({ id: 1, fonte: 'Itaú', data: '2026-07-10', transcricao: 'Pagamento de fatura', valor: -150.32 })
    const fatura = lancamento({ id: 2, fonte: 'Nubank', data: '2026-06-05', transcricao: 'Item A', valor: -150.3 })
    const avisos = orquestrarDeteccao([extrato, fatura], detectores)
    expect(avisos.some((a) => a.origem === 'conciliacao')).toBe(false)
  })

  it('conciliacao: só há fonte fatura (sem extrato) — não produz aviso, mesmo guard de App.tsx', () => {
    const faturaA = lancamento({ id: 1, fonte: 'Nubank', data: '2026-06-05', transcricao: 'Item A', valor: -100 })
    const avisos = orquestrarDeteccao([faturaA], detectores, undefined, '2026-07')
    expect(avisos.some((a) => a.origem === 'conciliacao')).toBe(false)
  })

  it('PARIDADE: fixture combinado (valor-pendente + pagamento-recebido + conciliação) produz avisos idênticos ao call-site legado reproduzido passo a passo', () => {
    const extratoDebito = lancamento({ id: 1, fonte: 'Itaú', data: '2026-07-03', transcricao: 'Débito qualquer', valor: -999 })
    const extratoPagamento = lancamento({ id: 2, fonte: 'Itaú', data: '2026-07-10', transcricao: 'Pagamento de fatura', valor: -150.32 })
    const faturaComum = lancamento({ id: 3, fonte: 'Nubank', data: '2026-06-05', transcricao: 'Compra qualquer', valor: -20 })
    const faturaA = lancamento({ id: 4, fonte: 'Nubank', data: '2026-06-06', transcricao: 'Item A', valor: -100 })
    const faturaB = lancamento({ id: 5, fonte: 'Nubank', data: '2026-06-07', transcricao: 'Item B', valor: -50.3 })
    const faturaValorPendente = lancamento({
      id: 6,
      fonte: 'Nubank',
      data: '2026-06-08',
      transcricao: 'Valor pendente do mês anterior',
      valor: -40,
      origemEspecial: 'valor-pendente',
    })
    const faturaPagamentoRecebido = lancamento({
      id: 7,
      fonte: 'Nubank',
      data: '2026-06-09',
      transcricao: 'Pagamento recebido',
      valor: 300,
      origemEspecial: 'pagamento-recebido',
    })
    const todosLancamentos = [
      extratoDebito,
      extratoPagamento,
      faturaComum,
      faturaA,
      faturaB,
      faturaValorPendente,
      faturaPagamentoRecebido,
    ]
    const mesRef = '2026-07'

    // Reproduz passo a passo o call-site legado (App.tsx:524-590).
    const avisosLegado: Aviso[] = []
    avisosLegado.push(...detectarValorPendente(todosLancamentos))
    avisosLegado.push(...detectarPagamentoRecebido(todosLancamentos))
    const fontesProduzidas = Array.from(new Set(todosLancamentos.map((l) => l.fonte)))
    const fontesFatura = fontesProduzidas.filter(
      (f) => classificarFonte(f, todosLancamentos, mesRef) === 'fatura',
    )
    const fontesExtrato = fontesProduzidas.filter(
      (f) => classificarFonte(f, todosLancamentos, mesRef) === 'extrato',
    )
    if (fontesFatura.length > 0 && fontesExtrato.length > 0) {
      const lancamentosExtratoTotal = todosLancamentos.filter((l) => fontesExtrato.includes(l.fonte))
      const indicesExtratoNoTotal = todosLancamentos
        .map((l, indice) => ({ l, indice }))
        .filter(({ l }) => fontesExtrato.includes(l.fonte))
        .map(({ indice }) => indice)
      for (const fonteFatura of fontesFatura) {
        const lancamentosDestaFatura = todosLancamentos.filter((l) => l.fonte === fonteFatura)
        const indicesFaturaNoTotal = todosLancamentos
          .map((l, indice) => ({ l, indice }))
          .filter(({ l }) => l.fonte === fonteFatura)
          .map(({ indice }) => indice)
        const avisosConciliacao = detectarConciliacao(lancamentosDestaFatura, lancamentosExtratoTotal)
        const avisosRemapeados = avisosConciliacao.map((aviso) => ({
          ...aviso,
          alvo: aviso.alvo.map((indiceStr) => String(indicesExtratoNoTotal[Number(indiceStr)])),
          permanece: aviso.permanece.map((indiceStr) => String(indicesFaturaNoTotal[Number(indiceStr)])),
        }))
        avisosLegado.push(...avisosRemapeados)
      }
    }

    const avisosNovo = orquestrarDeteccao(todosLancamentos, detectores, undefined, mesRef)

    expect(avisosNovo).toEqual(avisosLegado)
  })
})
