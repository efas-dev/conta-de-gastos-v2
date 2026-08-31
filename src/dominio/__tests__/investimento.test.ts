// ADR: see Docs/specs/dominio-transferencia-investimento-iniciais.adr.md
// ADR: see Docs/specs/fundacao-operacoes.adr.md

import { describe, it, expect } from 'vitest'
import { detectarInvestimento, detectarInvestimentoAvisos } from '../investimento'
import { criarAvisosSlice, type StoreComAvisos } from '../../ui/store/avisosSlice'
import type { Lancamento } from '../../types'

import aplicacaoExplicita from './fixtures/investimento/aplicacao-explicita.json'
import resgateExplicito from './fixtures/investimento/resgate-explicito.json'
import rdbSinalNegativo from './fixtures/investimento/rdb-sinal-negativo.json'
import cdbSinalPositivo from './fixtures/investimento/cdb-sinal-positivo.json'
import conflitoPalavraSinal from './fixtures/investimento/conflito-palavra-sinal.json'
import lancamentoComum from './fixtures/investimento/lancamento-comum.json'

describe('detectarInvestimento', () => {
  /**
   * TL-1, TL-2, TL-3 — Palavra explícita APLICACAO (case-insensitive)
   */
  it('retorna aplicacao quando transcricao contém APLICACAO em maiúsculas (TL-1)', () => {
    const lancamento: Lancamento = { ...(aplicacaoExplicita as Lancamento), transcricao: 'APLICACAO RDB AUTOMATICO' }
    expect(detectarInvestimento(lancamento)).toBe('aplicacao')
  })

  it('retorna aplicacao quando transcricao contém Aplicacao em caixa mista (TL-2)', () => {
    const lancamento: Lancamento = { ...(aplicacaoExplicita as Lancamento), transcricao: 'Aplicacao CDB 03/2024' }
    expect(detectarInvestimento(lancamento)).toBe('aplicacao')
  })

  it('retorna aplicacao quando transcricao contém aplicacao em minúsculas (TL-3)', () => {
    const lancamento: Lancamento = { ...(aplicacaoExplicita as Lancamento), transcricao: 'aplicacao automatica' }
    expect(detectarInvestimento(lancamento)).toBe('aplicacao')
  })

  /**
   * TL-4, TL-5 — Palavra explícita RESGATE (case-insensitive)
   */
  it('retorna resgate quando transcricao contém RESGATE em maiúsculas (TL-4)', () => {
    const lancamento: Lancamento = { ...(resgateExplicito as Lancamento), transcricao: 'RESGATE RDB AUTOMATICO' }
    expect(detectarInvestimento(lancamento)).toBe('resgate')
  })

  it('retorna resgate quando transcricao contém resgate em minúsculas (TL-5)', () => {
    const lancamento: Lancamento = { ...(resgateExplicito as Lancamento), transcricao: 'resgate automatico' }
    expect(detectarInvestimento(lancamento)).toBe('resgate')
  })

  /**
   * TL-6, TL-7 — RDB desambiguado pelo sinal
   */
  it('retorna aplicacao quando transcricao contém RDB e valor é negativo (TL-6)', () => {
    const lancamento: Lancamento = rdbSinalNegativo as Lancamento
    expect(detectarInvestimento(lancamento)).toBe('aplicacao')
  })

  it('retorna resgate quando transcricao contém RDB e valor é positivo (TL-7)', () => {
    const lancamento: Lancamento = { ...(rdbSinalNegativo as Lancamento), valor: 1000.00 }
    expect(detectarInvestimento(lancamento)).toBe('resgate')
  })

  /**
   * TL-8, TL-9 — CDB desambiguado pelo sinal
   */
  it('retorna aplicacao quando transcricao contém CDB e valor é negativo (TL-8)', () => {
    const lancamento: Lancamento = { ...(cdbSinalPositivo as Lancamento), valor: -1000.00 }
    expect(detectarInvestimento(lancamento)).toBe('aplicacao')
  })

  it('retorna resgate quando transcricao contém CDB e valor é positivo (TL-9)', () => {
    const lancamento: Lancamento = cdbSinalPositivo as Lancamento
    expect(detectarInvestimento(lancamento)).toBe('resgate')
  })

  /**
   * TL-10, TL-11 — Conflito palavra×sinal: palavra explícita vence
   */
  it('retorna aplicacao quando APLICACAO e valor positivo — palavra vence sinal (TL-10)', () => {
    const lancamento: Lancamento = conflitoPalavraSinal as Lancamento
    // fixture tem valor positivo (+200) e transcricao com APLICACAO → palavra vence
    expect(detectarInvestimento(lancamento)).toBe('aplicacao')
  })

  it('retorna resgate quando RESGATE e valor negativo — palavra vence sinal (TL-11)', () => {
    const lancamento: Lancamento = { ...(resgateExplicito as Lancamento), valor: -300.00 }
    expect(detectarInvestimento(lancamento)).toBe('resgate')
  })

  /**
   * TL-12, TL-13 — Lançamentos comuns retornam null
   */
  it('retorna null para lançamento sem palavras-chave de investimento (TL-12)', () => {
    const lancamento: Lancamento = lancamentoComum as Lancamento
    expect(detectarInvestimento(lancamento)).toBeNull()
  })

  it('retorna null quando transcricao contém MERCADO (palavra não é investimento) (TL-13)', () => {
    const lancamento: Lancamento = { ...(lancamentoComum as Lancamento), transcricao: 'COMPRA MERCADO LIVRE' }
    expect(detectarInvestimento(lancamento)).toBeNull()
  })
})

/**
 * `detectarInvestimentoAvisos` — Task T07 (ver ADR `fundacao-operacoes`, Decisão 4).
 *
 * Fixtures desta suíte SEMPRE atribuem `id` explicitamente (não reaproveitam os fixtures JSON
 * acima, que não têm `id`): `mutacaoProposta.alvo` é `number[]` de `Lancamento.id`, e o gap de
 * fixtures-sem-id (registrado no iteração-log, Task T03) tornaria o alvo inconsistente se um
 * `id` fosse `undefined`.
 */
function lancamentoComId(overrides: Partial<Lancamento> & { id: number }): Lancamento {
  return {
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

describe('detectarInvestimentoAvisos', () => {
  it('retorna [] quando nenhum lançamento é investimento (TL-14)', () => {
    const lancamentos = [
      lancamentoComId({ id: 1, transcricao: 'Compra mercado' }),
      lancamentoComId({ id: 2, transcricao: 'Uber' }),
    ]
    expect(detectarInvestimentoAvisos(lancamentos)).toEqual([])
  })

  it('gera um Aviso tipo proposta com mutacaoProposta remover [id] para uma aplicação (TL-15)', () => {
    const aplicacao = lancamentoComId({
      id: 42,
      transcricao: 'APLICACAO RDB AUTOMATICO',
      valor: -500,
    })
    const [aviso] = detectarInvestimentoAvisos([aplicacao])

    expect(aviso.tipo).toBe('proposta')
    expect(aviso.origem).toBe('investimento')
    expect(aviso.mutacaoProposta).toEqual({ verbo: 'remover', alvo: [42] })
  })

  it('TL-27: N movimentações geram UM único aviso, mirando todos os ids de uma vez', () => {
    const comum = lancamentoComId({ id: 1, transcricao: 'Compra mercado' })
    const aplicacao1 = lancamentoComId({ id: 2, transcricao: 'APLICACAO CDB', valor: -200 })
    const resgate = lancamentoComId({ id: 3, transcricao: 'RESGATE CDB', valor: 200 })
    const aplicacao2 = lancamentoComId({ id: 4, transcricao: 'APLICACAO RDB', valor: -50 })
    const avisos = detectarInvestimentoAvisos([comum, aplicacao1, resgate, aplicacao2])

    expect(avisos).toHaveLength(1)
    expect(avisos[0].mutacaoProposta).toEqual({ verbo: 'remover', alvo: [2, 3, 4] })
    expect(avisos[0].alvo).toEqual(['2', '3', '4'])
  })

  it('TL-28: a mensagem do aviso agregado conta as movimentações por tipo', () => {
    const avisos = detectarInvestimentoAvisos([
      lancamentoComId({ id: 2, transcricao: 'APLICACAO CDB', valor: -200 }),
      lancamentoComId({ id: 3, transcricao: 'RESGATE CDB', valor: 200 }),
      lancamentoComId({ id: 4, transcricao: 'RESGATE RDB', valor: 50 }),
    ])

    expect(avisos[0].mensagem).toContain('3 movimentações de investimento')
    expect(avisos[0].mensagem).toContain('1 aplicação')
    expect(avisos[0].mensagem).toContain('2 resgates')
  })

  it('TL-29: o resumo agregado soma cada tipo e explica por que a remoção é proposta', () => {
    const avisos = detectarInvestimentoAvisos([
      lancamentoComId({ id: 2, transcricao: 'APLICACAO CDB', valor: -200 }),
      lancamentoComId({ id: 3, transcricao: 'APLICACAO RDB', valor: -1000.5 }),
      lancamentoComId({ id: 4, transcricao: 'RESGATE CDB', valor: 300 }),
    ])

    expect(avisos[0].resumo).toContain('R$ 1.200,50') // soma das aplicações
    expect(avisos[0].resumo).toContain('R$ 300,00') // soma dos resgates
    expect(avisos[0].resumo).toContain('não é gasto nem receita')
  })

  it('TL-30: com uma única movimentação a mensagem mantém a transcrição (sem contagem seca)', () => {
    const avisos = detectarInvestimentoAvisos([
      lancamentoComId({ id: 9, transcricao: 'APLICACAO RDB AUTOMATICO', valor: -500 }),
    ])

    expect(avisos[0].mensagem).toContain('APLICACAO RDB AUTOMATICO')
    expect(avisos[0].mensagem).not.toContain('1 movimentações')
  })

  it('TL-26: mensagem formata o valor em pt-BR, consistente com o resumo do mesmo aviso', () => {
    const aplicacao = lancamentoComId({
      id: 42,
      transcricao: 'APLICACAO RDB AUTOMATICO',
      valor: -4049.2,
    })
    const [aviso] = detectarInvestimentoAvisos([aplicacao])

    expect(aviso.mensagem).toContain('R$ 4.049,20')
    expect(aviso.mensagem).not.toContain('4049.20')
    expect(aviso.resumo).toContain('R$ 4.049,20')
  })

  it('gera um Aviso tipo proposta com mutacaoProposta remover [id] para um resgate (TL-16)', () => {
    const resgate = lancamentoComId({
      id: 43,
      transcricao: 'RESGATE RDB AUTOMATICO',
      valor: 500,
    })
    const [aviso] = detectarInvestimentoAvisos([resgate])

    expect(aviso.tipo).toBe('proposta')
    expect(aviso.origem).toBe('investimento')
    expect(aviso.mutacaoProposta).toEqual({ verbo: 'remover', alvo: [43] })
  })

  it('só lançamentos de investimento entram no alvo — os comuns ficam de fora (TL-17)', () => {
    const comum = lancamentoComId({ id: 1, transcricao: 'Compra mercado' })
    const aplicacao = lancamentoComId({ id: 2, transcricao: 'APLICACAO CDB', valor: -200 })
    const resgate = lancamentoComId({ id: 3, transcricao: 'RESGATE CDB', valor: 200 })
    const avisos = detectarInvestimentoAvisos([comum, aplicacao, resgate])

    expect(avisos[0].mutacaoProposta?.alvo).toEqual([2, 3])
  })

  it('Aviso.alvo (legado) contém o id como string e Aviso.permanece é sempre [] (TL-18)', () => {
    const aplicacao = lancamentoComId({ id: 7, transcricao: 'APLICACAO RDB', valor: -100 })
    const [aviso] = detectarInvestimentoAvisos([aplicacao])

    expect(aviso.alvo).toEqual(['7'])
    expect(aviso.permanece).toEqual([])
  })

  it('Aviso nasce com estado pendente (TL-19)', () => {
    const aplicacao = lancamentoComId({ id: 8, transcricao: 'APLICACAO RDB', valor: -100 })
    const [aviso] = detectarInvestimentoAvisos([aplicacao])

    expect(aviso.estado).toBe('pendente')
  })

  it('mensagem/resumo de aplicação mencionam a transcrição e o valor formatado (TL-20)', () => {
    const aplicacao = lancamentoComId({
      id: 9,
      transcricao: 'APLICACAO RDB AUTOMATICO',
      valor: -1234.56,
    })
    const [aviso] = detectarInvestimentoAvisos([aplicacao])

    expect(aviso.mensagem).toContain('APLICACAO RDB AUTOMATICO')
    // Mensagem e resumo passaram a compartilhar o formato pt-BR (antes a mensagem usava
    // `toFixed(2)`, "1234.56", divergindo do resumo no mesmo card) — ver TL-26.
    expect(aviso.mensagem).toContain('1.234,56')
    expect(aviso.resumo).toContain('1.234,56')
  })

  it('mensagem/resumo de resgate mencionam a transcrição e o valor formatado (TL-21)', () => {
    const resgate = lancamentoComId({
      id: 10,
      transcricao: 'RESGATE RDB AUTOMATICO',
      valor: 1234.56,
    })
    const [aviso] = detectarInvestimentoAvisos([resgate])

    expect(aviso.mensagem).toContain('RESGATE RDB AUTOMATICO')
    expect(aviso.mensagem).toContain('1.234,56')
    expect(aviso.resumo).toContain('1.234,56')
  })

  it('id do Aviso é determinístico — o aviso agregado é sempre um só (TL-22)', () => {
    const aplicacao1 = lancamentoComId({ id: 5, transcricao: 'APLICACAO RDB', valor: -50 })
    const aplicacao2 = lancamentoComId({ id: 6, transcricao: 'APLICACAO RDB', valor: -50 })
    const avisos = detectarInvestimentoAvisos([aplicacao1, aplicacao2])

    expect(avisos).toHaveLength(1)
    expect(avisos[0].id).toBe('investimento')
  })

  it('não altera a marcação de coloração (detectarInvestimento por lançamento continua igual) (TL-23)', () => {
    const aplicacao = lancamentoComId({ id: 11, transcricao: 'APLICACAO RDB', valor: -50 })
    // detectarInvestimentoAvisos não muta o lançamento original nem seu campo `investimento`.
    detectarInvestimentoAvisos([aplicacao])
    expect(detectarInvestimento(aplicacao)).toBe('aplicacao')
    expect(aplicacao.investimento).toBeUndefined()
  })

  /**
   * TL-24 — integração: o Aviso produzido é aplicável/desfazível pelo caminho genérico do
   * avisosSlice (T03), que casa por `Lancamento.id` via `mutacaoProposta`, não por posição.
   * Prova end-to-end de que investimento não precisa de nenhum código específico no slice.
   */
  it('Aviso de investimento é aplicável e desfazível via avisosSlice.aplicar/desfazer (TL-24)', () => {
    const comum = lancamentoComId({ id: 1, transcricao: 'Compra mercado' })
    const aplicacao = lancamentoComId({ id: 2, transcricao: 'APLICACAO RDB AUTOMATICO', valor: -500 })
    const outroComum = lancamentoComId({ id: 3, transcricao: 'Uber' })
    const lancamentos = [comum, aplicacao, outroComum]
    const [aviso] = detectarInvestimentoAvisos([aplicacao])

    let estado: StoreComAvisos = {
      lancamentos,
      avisosAcionaveis: { avisos: [aviso], removidos: {}, avisoEmInspecao: null },
    }
    const get = () => estado
    const set = (
      partial: Partial<StoreComAvisos> | ((s: StoreComAvisos) => Partial<StoreComAvisos>),
    ) => {
      const parcial = typeof partial === 'function' ? partial(estado) : partial
      estado = { ...estado, ...parcial }
    }
    const acoes = criarAvisosSlice(set, get)

    acoes.aplicar(aviso.id)
    expect(get().lancamentos).toEqual([comum, outroComum])
    expect(get().avisosAcionaveis.avisos[0].estado).toBe('aplicado')

    acoes.desfazer(aviso.id)
    expect(get().lancamentos).toEqual([comum, aplicacao, outroComum])
    expect(get().avisosAcionaveis.avisos[0].estado).toBe('pendente')
  })

  /**
   * TL-31 — o mesmo ciclo de TL-24, mas com o aviso AGREGADO mirando várias linhas: uma
   * aprovação tira todas de uma vez e um desfazer devolve todas, nas posições originais.
   */
  it('TL-31: aviso agregado aplica e desfaz as N linhas de uma vez, preservando a ordem', () => {
    const comum = lancamentoComId({ id: 1, transcricao: 'Compra mercado' })
    const aplicacao = lancamentoComId({ id: 2, transcricao: 'APLICACAO RDB', valor: -500 })
    const outroComum = lancamentoComId({ id: 3, transcricao: 'Uber' })
    const resgate = lancamentoComId({ id: 4, transcricao: 'RESGATE CDB', valor: 300 })
    const lancamentos = [comum, aplicacao, outroComum, resgate]
    const [aviso] = detectarInvestimentoAvisos(lancamentos)

    let estado: StoreComAvisos = {
      lancamentos,
      avisosAcionaveis: { avisos: [aviso], removidos: {}, avisoEmInspecao: null },
    }
    const get = () => estado
    const set = (
      partial: Partial<StoreComAvisos> | ((s: StoreComAvisos) => Partial<StoreComAvisos>),
    ) => {
      const parcial = typeof partial === 'function' ? partial(estado) : partial
      estado = { ...estado, ...parcial }
    }
    const acoes = criarAvisosSlice(set, get)

    acoes.aplicar(aviso.id)
    expect(get().lancamentos).toEqual([comum, outroComum])

    acoes.desfazer(aviso.id)
    expect(get().lancamentos).toEqual([comum, aplicacao, outroComum, resgate])
  })
})
