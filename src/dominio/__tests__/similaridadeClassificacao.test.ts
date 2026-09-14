// ADR: see Docs/specs/dicionario-chave-canonica.adr.md

import { describe, it, expect } from 'vitest'
import type { DicEntry, Lancamento } from '../../types'
import {
  detectarClassificacaoPorSimilaridade,
  LIMIAR_SIMILARIDADE,
  similaridade,
} from '../similaridadeClassificacao'

function lancamento(over: Partial<Lancamento> & Pick<Lancamento, 'transcricao' | 'valor'>): Lancamento {
  return {
    id: 1,
    fonte: 'extrato_itau',
    data: '2026-06-10',
    natureza: '',
    descricao: '',
    iniciais: 'ES',
    ...over,
  }
}

function entrada(over: Partial<DicEntry> & Pick<DicEntry, 'chave'>): DicEntry {
  return {
    fonte: 'extrato_itau',
    natureza: 'OT',
    descricao: 'Pensão residentes',
    iniciais: 'ES',
    vezes: 3,
    ambiguo: false,
    valor: 2950,
    ...over,
  }
}

const ctx = (dicEntries: DicEntry[], todos: Lancamento[] = []) => ({
  todosLancamentos: todos,
  dicEntries,
})

// ---------------------------------------------------------------------------
// A métrica em si
// ---------------------------------------------------------------------------

describe('similaridade (T10)', () => {
  it('SIM-01: textos idênticos pontuam 1', () => {
    expect(similaridade('Autohubservice', 'Autohubservice')).toBe(1)
  })

  it('SIM-02: ignora caixa e acentos', () => {
    expect(similaridade('Café Central', 'CAFE CENTRAL')).toBe(1)
  })

  it('SIM-03: reproduz os números medidos nos pares reais', () => {
    // Estes são os números que sustentam a Decisão 21 e precisam ficar registrados
    // em teste: o pior falso positivo pontua MAIS ALTO que uma variação legítima.
    expect(similaridade('PIX TRANSF JOAO AU', 'PIX TRANSF JOAO GU')).toBeCloseTo(0.944, 2)
    expect(similaridade('PIX TRANSF CESAR', 'PIX TRANSF CESAR D')).toBeCloseTo(0.889, 2)
    expect(similaridade('PIX TRANSF MARCELO', 'PIX TRANSF MARCOS')).toBeCloseTo(0.833, 2)
  })
})

// ---------------------------------------------------------------------------
// O detector
// ---------------------------------------------------------------------------

describe('detectarClassificacaoPorSimilaridade — proposta (T10)', () => {
  it('SC-01: propõe quando similaridade E valor corroboram', () => {
    const lan = lancamento({ id: 7, transcricao: 'PIX TRANSF JOAO AUG', valor: 2950 })
    const avisos = detectarClassificacaoPorSimilaridade(
      [lan],
      ctx([entrada({ chave: 'PIX TRANSF JOAO AU' })]),
    )

    expect(avisos).toHaveLength(1)
    expect(avisos[0].tipo).toBe('proposta')
    expect(avisos[0].origem).toBe('classificacao-similaridade')
    expect(avisos[0].mutacaoProposta).toEqual({
      verbo: 'classificar',
      alvo: [7],
      natureza: 'OT',
      descricao: 'Pensão residentes',
      iniciais: 'ES',
    })
  })

  it('SC-02: D21 — similaridade 0,944 NÃO basta quando o valor diverge', () => {
    // O par real: JOAO AU é "Pensão residentes" (R$ 2950) e JOAO GU é "Café" (R$ 56).
    // São pessoas diferentes, e o Itaú trunca ambos em largura fixa. Este é o teste
    // que documenta por que o limiar textual não é a trava de segurança.
    const lan = lancamento({ id: 9, transcricao: 'PIX TRANSF JOAO GU', valor: -56 })
    const avisos = detectarClassificacaoPorSimilaridade(
      [lan],
      ctx([entrada({ chave: 'PIX TRANSF JOAO AU', valor: 2950 })]),
    )
    expect(avisos).toEqual([])
  })

  it('SC-03: nunca auto-preenche — o lançamento sai intocado', () => {
    const lan = lancamento({ id: 7, transcricao: 'PIX TRANSF JOAO AUG', valor: 2950 })
    detectarClassificacaoPorSimilaridade([lan], ctx([entrada({ chave: 'PIX TRANSF JOAO AU' })]))
    expect(lan.natureza).toBe('')
    expect(lan.descricao).toBe('')
  })

  it('SC-04: entrada sem valor gravado nunca gera proposta', () => {
    // Sem valor não há corroboração possível, e o limiar sozinho não protege (D21).
    const lan = lancamento({ id: 7, transcricao: 'PIX TRANSF JOAO AUG', valor: 2950 })
    const avisos = detectarClassificacaoPorSimilaridade(
      [lan],
      ctx([entrada({ chave: 'PIX TRANSF JOAO AU', valor: undefined })]),
    )
    expect(avisos).toEqual([])
  })

  it('SC-05: abaixo do limiar não propõe, mesmo com valor idêntico', () => {
    const lan = lancamento({ id: 7, transcricao: 'PIX TRANSF MARCELO', valor: 2950 })
    const avisos = detectarClassificacaoPorSimilaridade(
      [lan],
      ctx([entrada({ chave: 'PIX TRANSF MARCOS', valor: 2950 })]),
    )
    expect(avisos).toEqual([])
  })

  it('SC-06: lançamento já classificado é ignorado', () => {
    const lan = lancamento({
      id: 7,
      transcricao: 'PIX TRANSF JOAO AUG',
      valor: 2950,
      natureza: 'GO',
      descricao: 'Já classificado',
    })
    const avisos = detectarClassificacaoPorSimilaridade(
      [lan],
      ctx([entrada({ chave: 'PIX TRANSF JOAO AU' })]),
    )
    expect(avisos).toEqual([])
  })

  it('SC-07: casamento exato não vira proposta — o enriquecimento já resolveu', () => {
    const lan = lancamento({ id: 7, transcricao: 'PIX TRANSF JOAO AU', valor: 2950 })
    const avisos = detectarClassificacaoPorSimilaridade(
      [lan],
      ctx([entrada({ chave: 'PIX TRANSF JOAO AU' })]),
    )
    expect(avisos).toEqual([])
  })

  it('SC-08: fonte diferente nunca corrobora', () => {
    const lan = lancamento({ id: 7, transcricao: 'PIX TRANSF JOAO AUG', valor: 2950 })
    const avisos = detectarClassificacaoPorSimilaridade(
      [lan],
      ctx([entrada({ chave: 'PIX TRANSF JOAO AU', fonte: 'extrato_nubank' })]),
    )
    expect(avisos).toEqual([])
  })

  it('SC-09: entrada ambígua nunca é proposta', () => {
    const lan = lancamento({ id: 7, transcricao: 'PIX TRANSF JOAO AUG', valor: 2950 })
    const avisos = detectarClassificacaoPorSimilaridade(
      [lan],
      ctx([entrada({ chave: 'PIX TRANSF JOAO AU', ambiguo: true })]),
    )
    expect(avisos).toEqual([])
  })

  it('SC-10: dois candidatos igualmente plausíveis não geram proposta', () => {
    // Na dúvida, cala: propor uma das duas seria chutar, e chutar é o erro que a spec elimina.
    const lan = lancamento({ id: 7, transcricao: 'PIX TRANSF JOAO AUG', valor: 2950 })
    const avisos = detectarClassificacaoPorSimilaridade(
      [lan],
      ctx([
        entrada({ chave: 'PIX TRANSF JOAO AU', descricao: 'Pensão residentes' }),
        entrada({ chave: 'PIX TRANSF JOAO AUX', descricao: 'Outra coisa' }),
      ]),
    )
    expect(avisos).toEqual([])
  })

  it('SC-11: chave curta demais não entra no filtro de candidatos', () => {
    const lan = lancamento({ id: 7, transcricao: 'Lbg', valor: 2950 })
    const avisos = detectarClassificacaoPorSimilaridade(
      [lan],
      ctx([entrada({ chave: 'Lbf', valor: 2950 })]),
    )
    expect(avisos).toEqual([])
  })

  it('SC-12: sem dicionário no contexto, não propõe nada', () => {
    const lan = lancamento({ id: 7, transcricao: 'PIX TRANSF JOAO AUG', valor: 2950 })
    expect(detectarClassificacaoPorSimilaridade([lan], { todosLancamentos: [lan] })).toEqual([])
  })

  it('SC-13: o limiar publicado é 0,90', () => {
    expect(LIMIAR_SIMILARIDADE).toBe(0.9)
  })
})
