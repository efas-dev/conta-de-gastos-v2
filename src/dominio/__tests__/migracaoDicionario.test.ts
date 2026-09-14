// ADR: see Docs/specs/dicionario-chave-canonica.adr.md

import { describe, it, expect } from 'vitest'
import type { DicEntry } from '../../types'
import { migrarDicionario } from '../migracaoDicionario'

/** Constrói uma entrada com os campos obrigatórios preenchidos, para os testes ficarem legíveis. */
function entrada(over: Partial<DicEntry> & Pick<DicEntry, 'chave'>): DicEntry {
  return {
    fonte: 'extrato_itau',
    natureza: 'DL',
    descricao: 'Ajuda Familiar',
    iniciais: 'ES',
    vezes: 1,
    ambiguo: false,
    ...over,
  }
}

describe('migrarDicionario — canonização das chaves (T06)', () => {
  it('MG-01: canoniza chave poluída por data colada', () => {
    const dic = migrarDicionario([entrada({ chave: 'PIX TRANSF CESAR D28/02' })])
    expect(dic[0].chave).toBe('PIX TRANSF CESAR')
  })

  it('MG-02: canoniza chave de parcela preservando o total', () => {
    const dic = migrarDicionario([
      entrada({ chave: 'Autohubservice - Parcela 2/4', fonte: 'fatura_nubank_cc' }),
    ])
    expect(dic[0].chave).toBe('Autohubservice - Parcela #/4')
  })

  it('MG-03: entradas que só diferiam pelo token variável colapsam numa chave só', () => {
    const dic = migrarDicionario([
      entrada({ chave: 'PIX TRANSF CESAR D28/02' }),
      entrada({ chave: 'PIX TRANSF CESAR D13/06' }),
      entrada({ chave: 'PIX TRANSF CESAR D30/06' }),
    ])
    expect(dic).toHaveLength(1)
  })
})

describe('migrarDicionario — fusão e desempate (T06, D4)', () => {
  it('MG-04: padrões idênticos fundem somando as contagens', () => {
    const dic = migrarDicionario([
      entrada({ chave: 'PIX TRANSF CESAR D28/02', vezes: 2 }),
      entrada({ chave: 'PIX TRANSF CESAR D13/06', vezes: 3 }),
    ])
    expect(dic).toHaveLength(1)
    expect(dic[0].vezes).toBe(5)
    expect(dic[0].ambiguo).toBe(false)
  })

  it('MG-05: na divergência, o padrão mais frequente vence e não marca ambíguo', () => {
    // Caso real: "ca"(1) vs "Curso Anual"(2) — o primeiro é abreviação digitada às pressas.
    const dic = migrarDicionario([
      entrada({ chave: 'Losango - Parcela 3/6', descricao: 'ca', vezes: 1 }),
      entrada({ chave: 'Losango - Parcela 5/6', descricao: 'Curso Anual', vezes: 2 }),
    ])
    expect(dic).toHaveLength(1)
    expect(dic[0].descricao).toBe('Curso Anual')
    expect(dic[0].ambiguo).toBe(false)
  })

  it('MG-06: empate NÃO cria ambíguo — vence o primeiro da ordem do arquivo (D4 revista)', () => {
    // Caso real: "Reembolso Spotify"(1) vs "Spotify"(1). A regra anterior marcava ambíguo aqui, e
    // isso transformava casamentos exatos em dúvidas — regressão medida no app (ver JSDoc do
    // módulo). Agora funde e escolhe, de forma estável.
    const dic = migrarDicionario([
      entrada({ chave: 'PIX TRANSF Alexand06/03', descricao: 'Reembolso Spotify', vezes: 1 }),
      entrada({ chave: 'PIX TRANSF Alexand06/05', descricao: 'Spotify', vezes: 1 }),
    ])
    expect(dic).toHaveLength(1)
    expect(dic[0].ambiguo).toBe(false)
    expect(dic[0].descricao).toBe('Reembolso Spotify')
    expect(dic[0].vezes).toBe(2)
  })

  it('MG-06b: o desempate é estável — a mesma entrada migra sempre para o mesmo resultado', () => {
    const entradas = [
      entrada({ chave: 'Autohubservice - Parcela 2/4', descricao: 'Consero City', vezes: 2, fonte: 'fatura_nubank_cc' }),
      entrada({ chave: 'Autohubservice - Parcela 3/4', descricao: 'Conserto City', vezes: 2, fonte: 'fatura_nubank_cc' }),
    ]
    const a = migrarDicionario(entradas)
    const b = migrarDicionario(entradas)
    expect(a[0].descricao).toBe(b[0].descricao)
    expect(a[0].ambiguo).toBe(false)
  })

  it('MG-06c: a canonização não pode piorar o que já casava — empate continua classificando', () => {
    // Invariante que a regressão do app expôs: antes desta correção, este grupo virava ambíguo e
    // uma linha que casava exato deixava de ser classificada.
    const dic = migrarDicionario([
      entrada({ chave: 'Autohubservice - Parcela 2/4', descricao: 'Consero City', vezes: 2, fonte: 'fatura_nubank_cc' }),
      entrada({ chave: 'Autohubservice - Parcela 3/4', descricao: 'Conserto City', vezes: 2, fonte: 'fatura_nubank_cc' }),
    ])
    expect(dic.some((e) => e.ambiguo)).toBe(false)
    expect(dic[0].descricao).not.toBe('')
  })

  it('MG-07: entrada já ambígua permanece ambígua após a fusão', () => {
    const dic = migrarDicionario([entrada({ chave: 'PIX TRANSF CESAR D28/02', ambiguo: true })])
    expect(dic[0].ambiguo).toBe(true)
  })
})

describe('migrarDicionario — valor como discriminante (T06, D1)', () => {
  it('MG-08: entradas de mesma chave canônica com valores distintos NÃO fundem', () => {
    // São duas compras diferentes do mesmo lojista, ambas em 4x.
    const dic = migrarDicionario([
      entrada({
        chave: 'Mercadolivre*10produt - Parcela 2/4',
        fonte: 'fatura_nubank_cc',
        descricao: 'Inceticidas',
        valor: -55.4,
      }),
      entrada({
        chave: 'Mercadolivre*10produt - Parcela 4/4',
        fonte: 'fatura_nubank_cc',
        descricao: 'Fluido acendedor oratório',
        valor: -27.12,
      }),
    ])
    expect(dic).toHaveLength(2)
    expect(dic.some((e) => e.ambiguo)).toBe(false)
  })

  it('MG-09: fontes diferentes nunca fundem, mesmo com chave idêntica', () => {
    const dic = migrarDicionario([
      entrada({ chave: 'PIX TRANSF CESAR D28/02', fonte: 'extrato_itau' }),
      entrada({ chave: 'PIX TRANSF CESAR D13/06', fonte: 'extrato_nubank' }),
    ])
    expect(dic).toHaveLength(2)
  })
})

describe('migrarDicionario — robustez (T06)', () => {
  it('MG-10: entrada incompleta é descartada, como no aprendizado', () => {
    const dic = migrarDicionario([
      entrada({ chave: 'PIX TRANSF EDUARDO07/03', natureza: '', descricao: '' }),
      entrada({ chave: 'PIX TRANSF EDUARDO05/05', natureza: 'OT', descricao: 'DESCONSIDERAR' }),
    ])
    expect(dic).toHaveLength(1)
    expect(dic[0].descricao).toBe('DESCONSIDERAR')
  })

  it('MG-11: é idempotente — migrar o resultado da migração não muda nada', () => {
    const original = [
      entrada({ chave: 'PIX TRANSF CESAR D28/02', vezes: 2 }),
      entrada({ chave: 'PIX TRANSF CESAR D13/06', vezes: 3 }),
    ]
    const umaVez = migrarDicionario(original)
    expect(migrarDicionario(umaVez)).toEqual(umaVez)
  })

  it('MG-12: não muta o array recebido', () => {
    const original = [entrada({ chave: 'PIX TRANSF CESAR D28/02' })]
    const copia = structuredClone(original)
    migrarDicionario(original)
    expect(original).toEqual(copia)
  })

  it('MG-13: dicionário vazio devolve vazio', () => {
    expect(migrarDicionario([])).toEqual([])
  })

  it('MG-14: preserva a caixa original da natureza — normalizar mudaria o contrato de lerDicionario', () => {
    const dic = migrarDicionario([entrada({ chave: 'PIX TRANSF CESAR D28/02', natureza: 'dl' })])
    expect(dic[0].natureza).toBe('dl')
  })

  it('MG-15: a fusão ignora caixa da natureza — "Moradia" e "MORADIA" não geram ambíguo falso', () => {
    const dic = migrarDicionario([
      entrada({ chave: 'PIX TRANSF CESAR D28/02', natureza: 'Moradia', vezes: 1 }),
      entrada({ chave: 'PIX TRANSF CESAR D13/06', natureza: 'MORADIA', vezes: 2 }),
    ])
    expect(dic).toHaveLength(1)
    expect(dic[0].ambiguo).toBe(false)
    expect(dic[0].vezes).toBe(3)
  })
})
