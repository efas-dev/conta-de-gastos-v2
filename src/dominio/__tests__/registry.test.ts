// ADR: see spec/fundacao-operacoes.adr.md

import { describe, it, expect } from 'vitest'
import type { Detector, ContextoDeteccao } from '../registry'
import { detectores, orquestrarDeteccao } from '../registry'
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
