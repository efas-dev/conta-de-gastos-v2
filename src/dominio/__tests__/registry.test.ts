// ADR: see Docs/specs/fundacao-operacoes.adr.md

import { describe, it, expect } from 'vitest'
import type { Detector, ContextoDeteccao } from '../registry'
import { detectores, orquestrarDeteccao } from '../registry'
import { detectarValorPendente, detectarPagamentoRecebido, detectarConciliacao } from '../deteccoes'
import { detectarInvestimentoAvisos } from '../investimento'
import { detectarTransferenciaInternaAvisos } from '../transferencia'
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

  it('T06/T07/T07-bis/T4(vr-despesas)/T9(rendimentos) migram/acrescentam 7 detectores (valor-pendente, pagamento-recebido, conciliação, investimento, transferência interna, vr, rendimentos)', () => {
    expect(detectores).toHaveLength(7)
    expect(detectores.map((d) => d.origem)).toContain('investimento')
    expect(detectores.map((d) => d.origem)).toContain('transferencia-interna')
    expect(detectores.map((d) => d.origem)).toContain('vr')
    expect(detectores.map((d) => d.origem)).toContain('rendimentos')
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
  it('contém, nesta ordem, valor-pendente, pagamento-recebido, conciliacao, investimento, transferencia-interna, vr, rendimentos (T07/T07-bis, T4 vr-despesas, T9 rendimentos)', () => {
    expect(detectores.map((d) => d.origem)).toEqual([
      'valor-pendente',
      'pagamento-recebido',
      'conciliacao',
      'investimento',
      'transferencia-interna',
      'vr',
      'rendimentos',
    ])
  })

  it('vr fica posicionado imediatamente após transferencia-interna — penúltimo do array atual (TL-53)', () => {
    const origens = detectores.map((d) => d.origem)
    const indiceTransferencia = origens.indexOf('transferencia-interna')
    const indiceVR = origens.indexOf('vr')
    expect(indiceVR).toBe(indiceTransferencia + 1)
    expect(indiceVR).toBe(origens.length - 2)
  })

  it('rendimentos fica posicionado imediatamente após vr — último do array (T9-RD-03)', () => {
    const origens = detectores.map((d) => d.origem)
    const indiceVR = origens.indexOf('vr')
    const indiceRendimentos = origens.indexOf('rendimentos')
    expect(indiceRendimentos).toBe(indiceVR + 1)
    expect(indiceRendimentos).toBe(origens.length - 1)
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
    const extratoOutro = lancamento({ id: 1, fonte: 'extrato_itau', data: '2026-07-05', transcricao: 'Débito qualquer', valor: -999 })
    const extratoPagamento = lancamento({ id: 2, fonte: 'extrato_itau', data: '2026-07-10', transcricao: 'Pagamento de fatura', valor: -150.32 })
    const faturaA = lancamento({ id: 3, fonte: 'fatura_nubank_cc', data: '2026-06-05', transcricao: 'Item A', valor: -100 })
    const faturaB = lancamento({ id: 4, fonte: 'fatura_nubank_cc', data: '2026-06-10', transcricao: 'Item B', valor: -50.3 })
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
    const faturaA = lancamento({ id: 1, fonte: 'fatura_nubank_cc', data: '2026-06-05', transcricao: 'Item A', valor: -100 })
    const avisos = orquestrarDeteccao([faturaA], detectores, undefined, '2026-07')
    expect(avisos.some((a) => a.origem === 'conciliacao')).toBe(false)
  })

  it('PARIDADE: fixture combinado (valor-pendente + pagamento-recebido + conciliação) produz avisos idênticos ao call-site legado reproduzido passo a passo', () => {
    const extratoDebito = lancamento({ id: 1, fonte: 'extrato_itau', data: '2026-07-03', transcricao: 'Débito qualquer', valor: -999 })
    const extratoPagamento = lancamento({ id: 2, fonte: 'extrato_itau', data: '2026-07-10', transcricao: 'Pagamento de fatura', valor: -150.32 })
    const faturaComum = lancamento({ id: 3, fonte: 'fatura_nubank_cc', data: '2026-06-05', transcricao: 'Compra qualquer', valor: -20 })
    const faturaA = lancamento({ id: 4, fonte: 'fatura_nubank_cc', data: '2026-06-06', transcricao: 'Item A', valor: -100 })
    const faturaB = lancamento({ id: 5, fonte: 'fatura_nubank_cc', data: '2026-06-07', transcricao: 'Item B', valor: -50.3 })
    const faturaValorPendente = lancamento({
      id: 6,
      fonte: 'fatura_nubank_cc',
      data: '2026-06-08',
      transcricao: 'Valor pendente do mês anterior',
      valor: -40,
      origemEspecial: 'valor-pendente',
    })
    const faturaPagamentoRecebido = lancamento({
      id: 7,
      fonte: 'fatura_nubank_cc',
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

    // Filtra às 3 origens desta paridade — o fixture usa "Pagamento de fatura" (extratoPagamento).
    // Até a Task T14, esse texto também casava com `detectarTransferenciaInterna` (padrão genérico
    // `PADROES_INTERNOS`), gerando um aviso extra de `transferencia-interna` sobre a mesma linha.
    // T14 removeu `/Pagamento de fatura/i` de `PADROES_INTERNOS` (decisão de domínio: conciliação,
    // item 26, já é dona dessa linha) — o filtro abaixo é mantido por robustez/clareza de intenção,
    // mas o aviso extra não ocorre mais para este fixture.
    const origensDestaParidade = ['valor-pendente', 'pagamento-recebido', 'conciliacao']
    const avisosNovo = orquestrarDeteccao(todosLancamentos, detectores, undefined, mesRef).filter(
      (a) => origensDestaParidade.includes(a.origem),
    )

    expect(avisosNovo).toEqual(avisosLegado)
  })
})

// ---------------------------------------------------------------------------
// Task 6 (ADR conciliacao-robusta, Decisão 1) — detectarConciliacaoRegistry usa
// classificarFontePorPrefixo (T1) em vez de classificarFonte (heurística por data) para
// decidir fontesFatura/fontesExtrato. Bug motivador: mês-ref desalinhado fazia a heurística
// classificar uma fonte fatura_* como 'extrato', silenciando a conciliação por completo.
// ---------------------------------------------------------------------------

describe('detectores — Task 6 (classificação de conciliação por prefixo, não mais por data)', () => {
  it('TL-D: mês-ref desalinhado com o mês da própria fatura (não anterior) — fatura_* ainda é reconhecida como fatura via prefixo e concilia normalmente (total bate exatamente)', () => {
    // Todas as datas da fonte fatura_nubank_cc caem no PRÓPRIO mesRef (não antes dele) —
    // sob classificarFonte (heurística por data) isso classificaria a fonte como 'extrato'
    // (nenhuma data < mesRef), e a conciliação silenciaria por falta de fontesFatura.
    const faturaA = lancamento({ id: 1, fonte: 'fatura_nubank_cc', data: '2026-06-05', transcricao: 'Item A', valor: -100 })
    const faturaB = lancamento({ id: 2, fonte: 'fatura_nubank_cc', data: '2026-06-10', transcricao: 'Item B', valor: -50.3 })
    const extratoPagamento = lancamento({ id: 3, fonte: 'extrato_itau', data: '2026-06-15', transcricao: 'Pagamento de fatura', valor: -150.3 })
    const mesRef = '2026-06' // igual ao mês da fatura, não anterior — cenário desalinhado (F1)
    const todosLancamentos = [faturaA, faturaB, extratoPagamento]

    // Confirma a premissa do bug: a heurística antiga classificaria fatura_nubank_cc como 'extrato' neste cenário.
    expect(classificarFonte('fatura_nubank_cc', todosLancamentos, mesRef)).toBe('extrato')

    const avisos = orquestrarDeteccao(todosLancamentos, detectores, undefined, mesRef)
    const avisoConciliacao = avisos.find((a) => a.origem === 'conciliacao' && a.tipo === 'proposta')

    expect(avisoConciliacao).toBeDefined()
    expect(avisoConciliacao?.alvo).toEqual(['2']) // índice global de extratoPagamento
    expect(avisoConciliacao?.permanece).toEqual(['0', '1']) // índices globais de faturaA/faturaB
  })

  it('TL-E: mês-ref desalinhado sem casamento exato de total — informativo com candidatos próximos, não silêncio', () => {
    const faturaA = lancamento({ id: 1, fonte: 'fatura_nubank_cc', data: '2026-06-05', transcricao: 'Item A', valor: -100 })
    const faturaB = lancamento({ id: 2, fonte: 'fatura_nubank_cc', data: '2026-06-10', transcricao: 'Item B', valor: -50 })
    // Total da fatura: R$ 150,00. Candidato do extrato a R$ 155,00 — fora da tolerância exata
    // (R$ 0,05), dentro da faixa de proximidade de 10% (R$ 15,00 de margem).
    const extratoProximo = lancamento({ id: 3, fonte: 'extrato_itau', data: '2026-06-15', transcricao: 'Pagamento aproximado', valor: -155 })
    const mesRef = '2026-06' // desalinhado, mesmo cenário de TL-D
    const todosLancamentos = [faturaA, faturaB, extratoProximo]

    const avisos = orquestrarDeteccao(todosLancamentos, detectores, undefined, mesRef)
    const avisoConciliacao = avisos.find((a) => a.origem === 'conciliacao')

    expect(avisoConciliacao).toBeDefined()
    expect(avisoConciliacao?.tipo).toBe('informativo')
    expect(avisoConciliacao?.mutacaoProposta).toBeUndefined()
    expect(avisoConciliacao?.candidatos).toHaveLength(1)
    expect(avisoConciliacao?.candidatos?.[0]?.alvo).toBe('3') // id do lançamento candidato
  })

  it('TL-F: fonte com prefixo desconhecido propaga o Error de classificarFontePorPrefixo sem mascarar', () => {
    const lancamentoInvalido = lancamento({ id: 1, fonte: 'xyz_desconhecido', data: '2026-06-05', valor: -100 })
    expect(() => orquestrarDeteccao([lancamentoInvalido], detectores, undefined, '2026-06')).toThrow(
      /prefixo de fonte desconhecido/,
    )
  })
})

// ---------------------------------------------------------------------------
// Task 2 (spec vr-despesas, ADR Decisão 3) — detectarConciliacaoRegistry exclui fontes `form_vr`
// naturalmente: não são fatura, não são extrato, não entram em nenhum dos dois filtros.
// ---------------------------------------------------------------------------

describe('detectores — Task 2 (spec vr-despesas): conciliação exclui fonte form_vr', () => {
  it('TL-29: lançamentos form_vr presentes ao lado de fatura/extrato reais não entram em fontesFatura/fontesExtrato e a conciliação real não estoura', () => {
    const faturaA = lancamento({ id: 1, fonte: 'fatura_nubank_cc', data: '2026-06-05', transcricao: 'Item A', valor: -100 })
    const extratoPagamento = lancamento({ id: 2, fonte: 'extrato_itau', data: '2026-06-15', transcricao: 'Pagamento de fatura', valor: -100 })
    const vrSaida = lancamento({ id: 3, fonte: 'form_vr', data: '2026-06-30', transcricao: 'Supermercado', valor: -50, natureza: 'Alimentação' })
    const vrEntrada = lancamento({ id: 4, fonte: 'form_vr', data: '2026-06-30', transcricao: 'VR utilizado para despesas familiares', valor: 50, natureza: 'RR' })
    const todosLancamentos = [faturaA, extratoPagamento, vrSaida, vrEntrada]
    const mesRef = '2026-07'

    const avisos = orquestrarDeteccao(todosLancamentos, detectores, undefined, mesRef)
    const avisoConciliacao = avisos.find((a) => a.origem === 'conciliacao' && a.tipo === 'proposta')

    expect(avisoConciliacao).toBeDefined()
    // form_vr não entra nos ids remapeados de fatura nem de extrato — só faturaA (índice 0) e
    // extratoPagamento (índice 1) participam da conciliação.
    expect(avisoConciliacao?.alvo).toEqual(['1'])
    expect(avisoConciliacao?.permanece).toEqual(['0'])
  })

  it('TL-30: lançamentos SOMENTE form_vr (sem fatura/extrato real) não produzem aviso de conciliação e não lançam', () => {
    const vrSaida = lancamento({ id: 1, fonte: 'form_vr', data: '2026-06-30', transcricao: 'Farmácia', valor: -30, natureza: 'Saúde' })
    const vrEntrada = lancamento({ id: 2, fonte: 'form_vr', data: '2026-06-30', transcricao: 'VR utilizado para despesas familiares', valor: 30, natureza: 'RR' })

    expect(() =>
      orquestrarDeteccao([vrSaida, vrEntrada], detectores, undefined, '2026-06'),
    ).not.toThrow()

    const avisos = orquestrarDeteccao([vrSaida, vrEntrada], detectores, undefined, '2026-06')
    expect(avisos.some((a) => a.origem === 'conciliacao')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// T07 — migração de investimento (proposta de remoção completa via mutacaoProposta)
// ---------------------------------------------------------------------------

describe('detectores — T07 (investimento)', () => {
  it('investimento tem escopo "global"', () => {
    const investimento = detectores.find((d) => d.origem === 'investimento')
    expect(investimento?.escopo).toBe('global')
  })

  it('orquestrarDeteccao com o registry real produz o mesmo aviso de investimento que a chamada direta a detectarInvestimentoAvisos (paridade wrapper/orquestrador)', () => {
    const comum = lancamento({ id: 1, fonte: 'Nubank', transcricao: 'Compra qualquer' })
    const aplicacao = lancamento({
      id: 2,
      fonte: 'Nubank',
      transcricao: 'APLICACAO RDB AUTOMATICO',
      valor: -500,
    })
    const todosLancamentos = [comum, aplicacao]

    const avisosDireto = detectarInvestimentoAvisos(todosLancamentos)
    const avisosOrquestrados = orquestrarDeteccao(todosLancamentos, detectores).filter(
      (a) => a.origem === 'investimento',
    )

    expect(avisosOrquestrados).toEqual(avisosDireto)
  })

  it('PARIDADE: aviso de investimento aponta o mesmo id do lançamento independentemente de qual fonte aparece primeiro no array total', () => {
    const extrato = lancamento({ id: 1, fonte: 'Itaú', transcricao: 'Débito extrato' })
    const faturaComum = lancamento({ id: 2, fonte: 'Nubank', transcricao: 'Compra qualquer' })
    const faturaResgate = lancamento({
      id: 3,
      fonte: 'Nubank',
      transcricao: 'RESGATE RDB AUTOMATICO',
      valor: 300,
    })
    const todosLancamentos = [extrato, faturaComum, faturaResgate]

    const avisos = orquestrarDeteccao(todosLancamentos, detectores)
    const avisoInvestimento = avisos.find((a) => a.origem === 'investimento')

    expect(avisoInvestimento?.mutacaoProposta).toEqual({ verbo: 'remover', alvo: [3] })
  })
})

// ---------------------------------------------------------------------------
// T07-bis — migração de transferência interna (proposta de remoção completa via mutacaoProposta)
// ---------------------------------------------------------------------------

describe('detectores — T07-bis (transferência interna)', () => {
  it('transferencia-interna tem escopo "global"', () => {
    const transferenciaInterna = detectores.find((d) => d.origem === 'transferencia-interna')
    expect(transferenciaInterna?.escopo).toBe('global')
  })

  it('orquestrarDeteccao com o registry real produz o mesmo aviso de transferência interna que a chamada direta a detectarTransferenciaInternaAvisos (paridade wrapper/orquestrador)', () => {
    const comum = lancamento({ id: 1, fonte: 'Nubank', transcricao: 'Compra qualquer' })
    const transferencia = lancamento({
      id: 2,
      fonte: 'Nubank',
      transcricao: 'ITAU BLACK pagamento fatura',
      valor: -500,
    })
    const todosLancamentos = [comum, transferencia]

    const avisosDireto = detectarTransferenciaInternaAvisos(todosLancamentos)
    const avisosOrquestrados = orquestrarDeteccao(todosLancamentos, detectores).filter(
      (a) => a.origem === 'transferencia-interna',
    )

    expect(avisosOrquestrados).toEqual(avisosDireto)
  })

  it('orquestrarDeteccao repassa nomeUsuario ao detector de transferência interna via contexto (Pix nominal)', () => {
    const pixNominal = lancamento({
      id: 1,
      fonte: 'Nubank',
      transcricao: 'Transferência enviada pelo Pix - Eduardo Santos',
      valor: -200,
    })

    const avisosSemNome = orquestrarDeteccao([pixNominal], detectores).filter(
      (a) => a.origem === 'transferencia-interna',
    )
    const avisosComNome = orquestrarDeteccao([pixNominal], detectores, 'Eduardo Santos').filter(
      (a) => a.origem === 'transferencia-interna',
    )

    expect(avisosSemNome).toEqual([])
    expect(avisosComNome).toHaveLength(1)
    expect(avisosComNome[0]?.mutacaoProposta).toEqual({ verbo: 'remover', alvo: [1] })
  })

  it('PARIDADE: aviso de transferência interna aponta o mesmo id do lançamento independentemente de qual fonte aparece primeiro no array total', () => {
    // Fixture trocada de "Pagamento de fatura Nubank" p/ "ITAU BLACK pagamento fatura"
    // (Task T14, decisão de domínio 2026-08-04): "Pagamento de fatura" deixou de
    // casar com `detectarTransferenciaInterna` — conciliação (item 26) é dona
    // dessa linha, `/Pagamento de fatura/i` foi removido de `PADROES_INTERNOS`
    // (`../transferencia.ts`) para eliminar a colisão de duas propostas
    // concorrentes sobre o mesmo lançamento. O padrão genérico de fatura sem
    // correlação de conciliação ("ITAU BLACK") continua ativo e serve igualmente
    // ao propósito original deste teste (paridade de id independente de ordem).
    const extrato = lancamento({ id: 1, fonte: 'Itaú', transcricao: 'Débito extrato' })
    const faturaComum = lancamento({ id: 2, fonte: 'Nubank', transcricao: 'Compra qualquer' })
    const faturaTransferencia = lancamento({
      id: 3,
      fonte: 'Nubank',
      transcricao: 'ITAU BLACK pagamento fatura',
      valor: -300,
    })
    const todosLancamentos = [extrato, faturaComum, faturaTransferencia]

    const avisos = orquestrarDeteccao(todosLancamentos, detectores)
    const avisoTransferencia = avisos.find((a) => a.origem === 'transferencia-interna')

    expect(avisoTransferencia?.mutacaoProposta).toEqual({ verbo: 'remover', alvo: [3] })
  })
})

// ---------------------------------------------------------------------------
// Task 4 (spec vr-despesas) — detector 'vr' via orquestrarDeteccao
//
// TL-54 isolado (ver iteração-log, achado da iteração 4 REJEITADO): a agregação de
// orquestrarDeteccao é exercida aqui com um array LOCAL MÍNIMO contendo só a entrada 'vr'
// (extraída de `detectores`, o registry real, apenas para obter o `Detector` já registrado por
// TL-53/T4 — nenhuma chamada abaixo passa `detectores` inteiro, os 6 detectores reais, à
// orquestração). Isso mantém a boundary sob teste restrita a `detectarVR`+`orquestrarDeteccao`,
// sem depender do comportamento combinado dos outros 5 detectores — unit genuíno, não
// integração. A cobertura do registry real com os 6 detectores operando juntos (incluindo 'vr')
// já existe em TL-55 (ordem/posição, sem chamar orquestrarDeteccao) acima, e será revisitada em
// integração/e2e por T8/T9.
// ---------------------------------------------------------------------------

describe('detectores — vr (Task 4, spec vr-despesas)', () => {
  const detectorVR = detectores.find((d) => d.origem === 'vr')!
  const arrayLocalMinimo: Detector[] = [detectorVR]

  it('orquestrarDeteccao, com array local mínimo contendo só o detector vr, inclui exatamente 1 aviso origem "vr" para lancamentos: [] (TL-54)', () => {
    const avisos = orquestrarDeteccao([], arrayLocalMinimo)
    const avisosVR = avisos.filter((a) => a.origem === 'vr')
    expect(avisosVR).toHaveLength(1)
  })

  it('orquestrarDeteccao, mesmo array local mínimo, com lancamentos não vazios, também inclui exatamente 1 aviso origem "vr" (TL-54)', () => {
    const avisos = orquestrarDeteccao(
      [lancamento({ id: 1 }), lancamento({ id: 2, fonte: 'Itaú' })],
      arrayLocalMinimo,
    )
    const avisosVR = avisos.filter((a) => a.origem === 'vr')
    expect(avisosVR).toHaveLength(1)
    expect(avisosVR[0]).toMatchObject({
      origem: 'vr',
      tipo: 'proposta',
      estado: 'pendente',
    })
    expect(avisosVR[0].mutacaoProposta).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Task 9 (spec rendimentos) — detector 'rendimentos' via orquestrarDeteccao
//
// Mesma disciplina de TL-54 (Task 4, spec vr-despesas, acima): a agregação de
// orquestrarDeteccao é exercida aqui com um array LOCAL MÍNIMO contendo só a entrada
// 'rendimentos' (extraída de `detectores`, o registry real, apenas para obter o `Detector` já
// registrado por T9-RD-03) — nenhuma chamada abaixo passa `detectores` inteiro, os 7 detectores
// reais, à orquestração. Isso mantém a boundary sob teste restrita a
// `detectarRendimentos`+`orquestrarDeteccao`, sem depender do comportamento combinado dos outros 6
// detectores — unit genuíno, não integração.
// ---------------------------------------------------------------------------

describe('detectores — rendimentos (Task 9, spec rendimentos)', () => {
  const detectorRendimentos = detectores.find((d) => d.origem === 'rendimentos')!
  const arrayLocalMinimo: Detector[] = [detectorRendimentos]

  it('orquestrarDeteccao, com array local mínimo contendo só o detector rendimentos, inclui exatamente 1 aviso origem "rendimentos" para lancamentos: [] (T9-RD-04)', () => {
    const avisos = orquestrarDeteccao([], arrayLocalMinimo)
    const avisosRendimentos = avisos.filter((a) => a.origem === 'rendimentos')
    expect(avisosRendimentos).toHaveLength(1)
  })

  it('orquestrarDeteccao, mesmo array local mínimo, com lancamentos não vazios, também inclui exatamente 1 aviso origem "rendimentos" (T9-RD-05)', () => {
    const avisos = orquestrarDeteccao(
      [lancamento({ id: 1 }), lancamento({ id: 2, fonte: 'Itaú' })],
      arrayLocalMinimo,
    )
    const avisosRendimentos = avisos.filter((a) => a.origem === 'rendimentos')
    expect(avisosRendimentos).toHaveLength(1)
    expect(avisosRendimentos[0]).toMatchObject({
      origem: 'rendimentos',
      tipo: 'proposta',
      estado: 'pendente',
    })
    expect(avisosRendimentos[0].mutacaoProposta).toBeUndefined()
  })
})
