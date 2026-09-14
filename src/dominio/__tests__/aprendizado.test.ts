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
    expect(entradaNubank!.natureza).toBe('LAZER')
    expect(entradaItau!.natureza).toBe('ENTRETENIMENTO')
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

  it('TL28-5: natureza casa sem diferenciar caixa — "MORADIA" da grid × "Moradia" herdada incrementa vezes', () => {
    const dicAnterior: DicEntry[] = [
      {
        chave: 'PAG BOLETO',
        fonte: 'Nubank',
        natureza: 'Moradia',
        descricao: 'Conta de luz',
        iniciais: 'ES',
        vezes: 3,
        ambiguo: false,
      },
    ]
    const lan: Lancamento = {
      fonte: 'Nubank',
      data: '2025-05-01',
      transcricao: 'PAG BOLETO',
      valor: -300.0,
      iniciais: 'ES',
      natureza: 'MORADIA',
      descricao: 'Conta de luz',
    }
    const resultado = aprenderDicionario([lan], dicAnterior)

    expect(resultado).toHaveLength(1)
    expect(resultado[0].vezes).toBe(4)
    expect(resultado[0].ambiguo).toBe(false)
  })

  it('TL28-6: natureza é gravada em caixa alta — nas novas entradas e nas herdadas', () => {
    const dicAnterior: DicEntry[] = [
      {
        chave: 'SPOTIFY',
        fonte: 'Nubank',
        natureza: 'lazer',
        descricao: 'Música',
        iniciais: 'ES',
        vezes: 1,
        ambiguo: false,
      },
    ]
    const lanNovo: Lancamento = {
      fonte: 'Nubank',
      data: '2025-08-01',
      transcricao: 'IFOOD',
      valor: -45.0,
      iniciais: 'ES',
      natureza: 'al',
      descricao: 'Delivery',
    }
    const resultado = aprenderDicionario([lanNovo], dicAnterior)

    const herdada = resultado.find((e) => e.chave === 'SPOTIFY')
    const nova = resultado.find((e) => e.chave === 'IFOOD')
    expect(herdada?.natureza).toBe('LAZER')
    expect(nova?.natureza).toBe('AL')
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

// ---------------------------------------------------------------------------
// T05 (spec dicionario-chave-canonica): chave canônica e valor aprendido
// ---------------------------------------------------------------------------

const parcelaClassificada: Lancamento = {
  fonte: 'fatura_nubank_cc',
  data: '2026-05-03',
  transcricao: 'Autohubservice - Parcela 2/4',
  valor: -275,
  iniciais: 'ES',
  natureza: 'VC',
  descricao: 'Conserto City',
}

describe('aprenderDicionario — chave canônica e valor (T05)', () => {
  it('AP-01: grava a chave canônica, não a transcrição literal', () => {
    const [entrada] = aprenderDicionario([parcelaClassificada], [])
    expect(entrada.chave).toBe('Autohubservice - Parcela #/4')
  })

  it('AP-02: grava o valor em chave afrouxada por parcela', () => {
    const [entrada] = aprenderDicionario([parcelaClassificada], [])
    expect(entrada.valor).toBe(-275)
  })

  it('AP-03: D16 — chave NÃO afrouxada não grava valor', () => {
    const comum: Lancamento = {
      ...parcelaClassificada,
      transcricao: 'PAG BOLETO ENERGIA 12/03',
      valor: -150,
    }
    const [entrada] = aprenderDicionario([comum], [])
    expect(entrada.chave).toBe('PAG BOLETO ENERGIA')
    expect(entrada.valor).toBeUndefined()
  })

  it('AP-04: parcela seguinte com mesmo valor incrementa vezes e preserva o valor original', () => {
    const primeira = aprenderDicionario([parcelaClassificada], [])
    const seguinte = { ...parcelaClassificada, transcricao: 'Autohubservice - Parcela 3/4' }
    const dic = aprenderDicionario([seguinte], primeira)

    expect(dic).toHaveLength(1)
    expect(dic[0].vezes).toBe(2)
    expect(dic[0].valor).toBe(-275)
  })

  it('AP-05: D16 — valor fora da tolerância cria entrada nova, não marca ambíguo', () => {
    // Duas compras diferentes do mesmo lojista, ambas em 4x: precisam coexistir.
    const primeira = aprenderDicionario([parcelaClassificada], [])
    const outraCompra = {
      ...parcelaClassificada,
      transcricao: 'Autohubservice - Parcela 1/4',
      valor: -27.12,
      descricao: 'Outra compra',
    }
    const dic = aprenderDicionario([outraCompra], primeira)

    expect(dic).toHaveLength(2)
    expect(dic.some((e) => e.ambiguo)).toBe(false)
    expect(dic.map((e) => e.valor).sort()).toEqual([-275, -27.12].sort())
  })

  it('AP-06: D1 — entrada herdada sem valor é PROMOVIDA, não duplicada', () => {
    const herdada: DicEntry = {
      chave: 'Autohubservice - Parcela #/4',
      fonte: 'fatura_nubank_cc',
      natureza: 'VC',
      descricao: 'Conserto City',
      iniciais: 'ES',
      vezes: 2,
      ambiguo: false,
    }
    const dic = aprenderDicionario([parcelaClassificada], [herdada])

    expect(dic).toHaveLength(1)
    expect(dic[0].valor).toBe(-275)
    expect(dic[0].vezes).toBe(3)
  })

  it('AP-07: padrão divergente na mesma chave e valor continua marcando ambíguo', () => {
    const primeira = aprenderDicionario([parcelaClassificada], [])
    const divergente = { ...parcelaClassificada, descricao: 'Descrição diferente' }
    const dic = aprenderDicionario([divergente], primeira)

    expect(dic).toHaveLength(1)
    expect(dic[0].ambiguo).toBe(true)
  })
})
