// ADR: see Docs/specs/dominio-transferencia-investimento-iniciais.adr.md

import { describe, it, expect } from 'vitest'
import type { Lancamento, DicEntry } from '../../types'
import { aprenderDicionario } from '../aprendizado'

import fixtureNovaEntrada from './fixtures/aprendizado/nova-entrada.json'
import fixtureVezesIncrementa from './fixtures/aprendizado/vezes-incrementa.json'
import fixtureAmbiguoNatureza from './fixtures/aprendizado/ambiguo-natureza.json'
import fixtureAmbiguoIniciais from './fixtures/aprendizado/ambiguo-iniciais.json'
import fixtureIsolamento from './fixtures/aprendizado/isolamento-multi-fonte.json'

// Auxiliar para montar Lancamento com campos opcionais em branco
function lancamento(parcial: {
  fonte: string
  data: string
  transcricao: string
  valor: number
  iniciais: string
  natureza: string
  descricao: string
}): Lancamento {
  return parcial
}

describe('aprenderDicionario', () => {
  it('TL-1: lançamento sem entrada prévia cria nova DicEntry com vezes:1 e ambiguo:false', () => {
    const lans = fixtureNovaEntrada.lancamentos.map(lancamento)
    const resultado = aprenderDicionario(lans, [])

    expect(resultado).toHaveLength(1)
    expect(resultado[0]).toEqual(fixtureNovaEntrada.esperado[0])
  })

  it('TL-2: match idêntico incrementa vezes de 1 para 2 sem marcar ambiguo', () => {
    const lans = fixtureVezesIncrementa.lancamentos.map(lancamento)
    const dicAnterior = fixtureVezesIncrementa.dicAnterior as DicEntry[]
    const resultado = aprenderDicionario(lans, dicAnterior)

    expect(resultado).toHaveLength(1)
    expect(resultado[0].vezes).toBe(2)
    expect(resultado[0].ambiguo).toBe(false)
  })

  it('TL-3: natureza diferente com mesma (chave, fonte) marca ambiguo:true', () => {
    const lans = fixtureAmbiguoNatureza.lancamentos.map(lancamento)
    const dicAnterior = fixtureAmbiguoNatureza.dicAnterior as DicEntry[]
    const resultado = aprenderDicionario(lans, dicAnterior)

    expect(resultado).toHaveLength(1)
    expect(resultado[0].ambiguo).toBe(true)
  })

  it('TL-4: descricao diferente com mesma (chave, fonte) marca ambiguo:true', () => {
    const lanDescricaoDiferente: Lancamento = {
      fonte: 'Nubank',
      data: '2025-05-01',
      transcricao: 'PAG BOLETO',
      valor: -300.0,
      iniciais: 'ES',
      natureza: 'Moradia',
      descricao: 'Conta de água',  // diferente da entrada
    }
    const dicAnterior: DicEntry[] = [
      {
        chave: 'PAG BOLETO',
        fonte: 'Nubank',
        natureza: 'Moradia',
        descricao: 'Conta de luz',
        iniciais: 'ES',
        vezes: 1,
        ambiguo: false,
      },
    ]
    const resultado = aprenderDicionario([lanDescricaoDiferente], dicAnterior)

    expect(resultado[0].ambiguo).toBe(true)
  })

  it('TL-5: iniciais diferentes com mesma (chave, fonte) marca ambiguo:true', () => {
    const lans = fixtureAmbiguoIniciais.lancamentos.map(lancamento)
    const dicAnterior = fixtureAmbiguoIniciais.dicAnterior as DicEntry[]
    const resultado = aprenderDicionario(lans, dicAnterior)

    expect(resultado).toHaveLength(1)
    expect(resultado[0].ambiguo).toBe(true)
  })

  it('TL-6: mesma chave em fontes distintas gera duas entradas separadas sem contaminação', () => {
    const lans = fixtureIsolamento.lancamentos.map(lancamento)
    const resultado = aprenderDicionario(lans, [])

    expect(resultado).toHaveLength(2)
    const entradaNubank = resultado.find((e) => e.fonte === 'Nubank')
    const entradaItau = resultado.find((e) => e.fonte === 'Itaú')

    expect(entradaNubank).toBeDefined()
    expect(entradaItau).toBeDefined()
    expect(entradaNubank!.natureza).toBe('Lazer')
    expect(entradaItau!.natureza).toBe('Entretenimento')
    expect(entradaNubank!.ambiguo).toBe(false)
    expect(entradaItau!.ambiguo).toBe(false)
  })

  it('TL-7: transcrição com sufixo de data é normalizada antes do lookup', () => {
    const lanComSufixo: Lancamento = {
      fonte: 'Nubank',
      data: '2025-03-12',
      transcricao: 'PAG BOLETO ENERGIA 12/03',
      valor: -150.0,
      iniciais: 'ES',
      natureza: 'Moradia',
      descricao: 'Conta de luz',
    }
    const dicAnterior: DicEntry[] = [
      {
        chave: 'PAG BOLETO ENERGIA',
        fonte: 'Nubank',
        natureza: 'Moradia',
        descricao: 'Conta de luz',
        iniciais: 'ES',
        vezes: 1,
        ambiguo: false,
      },
    ]
    const resultado = aprenderDicionario([lanComSufixo], dicAnterior)

    // Deve ter encontrado a entrada existente (mesma chave normalizada) e incrementado vezes
    expect(resultado).toHaveLength(1)
    expect(resultado[0].chave).toBe('PAG BOLETO ENERGIA')
    expect(resultado[0].vezes).toBe(2)
  })

  it('TL24-1: lançamento com natureza vazia não é aprendido', () => {
    const lan: Lancamento = {
      fonte: 'Nubank',
      data: '2025-08-01',
      transcricao: 'IFOOD',
      valor: -45.0,
      iniciais: 'ES',
      natureza: '',
      descricao: 'Delivery',
    }
    expect(aprenderDicionario([lan], [])).toHaveLength(0)
  })

  it('TL24-2: lançamento com descrição vazia (ou só espaços) não é aprendido', () => {
    const lan: Lancamento = {
      fonte: 'Nubank',
      data: '2025-08-01',
      transcricao: 'IFOOD',
      valor: -45.0,
      iniciais: 'ES',
      natureza: 'AL',
      descricao: '   ',
    }
    expect(aprenderDicionario([lan], [])).toHaveLength(0)
  })

  it('TL24-3: lançamento incompleto não incrementa vezes nem marca ambíguo em entrada existente', () => {
    const dicAnterior: DicEntry[] = [
      {
        chave: 'IFOOD',
        fonte: 'Nubank',
        natureza: 'AL',
        descricao: 'Delivery',
        iniciais: 'ES',
        vezes: 3,
        ambiguo: false,
      },
    ]
    const lanIncompleto: Lancamento = {
      fonte: 'Nubank',
      data: '2025-08-01',
      transcricao: 'IFOOD',
      valor: -45.0,
      iniciais: 'ES',
      natureza: '',
      descricao: 'Delivery',
    }
    const resultado = aprenderDicionario([lanIncompleto], dicAnterior)

    expect(resultado).toHaveLength(1)
    expect(resultado[0].vezes).toBe(3)
    expect(resultado[0].ambiguo).toBe(false)
  })

  it('TL24-4: entrada herdada com natureza/descrição vazia é filtrada do retorno (round-trip não re-grava)', () => {
    const dicAnterior: DicEntry[] = [
      {
        chave: 'ENTRADA VELHA VAZIA',
        fonte: 'Nubank',
        natureza: '',
        descricao: '',
        iniciais: 'ES',
        vezes: 2,
        ambiguo: false,
      },
      {
        chave: 'SPOTIFY',
        fonte: 'Nubank',
        natureza: 'Lazer',
        descricao: 'Música',
        iniciais: 'ES',
        vezes: 1,
        ambiguo: false,
      },
    ]
    const resultado = aprenderDicionario([], dicAnterior)

    expect(resultado).toHaveLength(1)
    expect(resultado[0].chave).toBe('SPOTIFY')
  })

  it('TL-8: dicAnterior não é mutado pela função', () => {
    const dicAnterior: DicEntry[] = [
      {
        chave: 'SPOTIFY',
        fonte: 'Nubank',
        natureza: 'Lazer',
        descricao: 'Música',
        iniciais: 'ES',
        vezes: 1,
        ambiguo: false,
      },
    ]
    const dicAnteriorOriginal = JSON.parse(JSON.stringify(dicAnterior)) as DicEntry[]
    const lan: Lancamento = {
      fonte: 'Nubank',
      data: '2025-08-01',
      transcricao: 'SPOTIFY',
      valor: -21.9,
      iniciais: 'ES',
      natureza: 'Lazer',
      descricao: 'Música',
    }

    aprenderDicionario([lan], dicAnterior)

    expect(dicAnterior).toEqual(dicAnteriorOriginal)
  })
})
