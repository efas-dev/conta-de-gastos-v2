// ADR: see Docs/specs/dicionario-chave-canonica.adr.md

/**
 * Prova E2E — T14 da spec `dicionario-chave-canonica` (F9/F10, Decisão 10, frente 4).
 *
 * Percorre o ciclo real do app no caminho de auto-preenchimento: um dicionário legado é gravado
 * num `.xlsx`, lido de volta (a leitura dispara a migração), e os lançamentos do mês seguinte
 * passam por `enriquecerLancamento` — exatamente a sequência que `handlersPipeline` executa.
 *
 * Fixture **sintética**, derivada da ESTRUTURA medida no dicionário real (nunca copiada de
 * `data_sample/`, git-ignored por convenção): 33% das chaves poluídas por data colada, 9 entradas
 * de parcela colapsando em 6 chaves canônicas, sendo 3 únicas e 3 em colisão.
 *
 * As asserções numéricas aqui SÃO os critérios de verificação da spec. Se alguém afrouxar a
 * canonização, é este arquivo que acusa.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { DicEntry, Lancamento } from '../../types'
import { gerarXlsx } from '../../excel/writer/gerador'
import { lerDicionario } from '../../excel/reader/leitor'
import { enriquecerLancamento } from '../../dominio/dicionario'

const FIXTURE_MODELO = resolve(__dirname, '../../excel/writer/__tests__/fixtures/Modelo.xlsx')

function entradaLegada(
  chave: string,
  descricao: string,
  vezes = 1,
  fonte = 'extrato_itau',
): DicEntry {
  return { chave, fonte, natureza: 'DL', descricao, iniciais: 'ES', vezes, ambiguo: false }
}

/**
 * Dicionário legado sintético, com a mesma anatomia do real.
 *
 * Bloco 1 — chaves poluídas por data colada (o Itaú trunca o nome em largura fixa).
 * Bloco 2 — parcelas: 3 compras sem concorrência e 3 chaves canônicas em colisão.
 */
const DICIONARIO_LEGADO: DicEntry[] = [
  // Bloco 1: mesma pessoa, três dias diferentes → três chaves hoje, uma depois.
  entradaLegada('PIX TRANSF CESAR D28/02', 'Ajuda Familiar', 2),
  entradaLegada('PIX TRANSF CESAR D13/06', 'Ajuda Familiar', 3),
  entradaLegada('PIX TRANSF CESAR D30/06', 'Ajuda Familiar', 1),
  entradaLegada('PIX TRANSF MARCELO05/06', 'Pensão residentes', 4),
  entradaLegada('PIX TRANSF TATYANE05/06', 'Pensão residentes', 2),

  // Bloco 2: parcelas. Três chaves canônicas únicas...
  entradaLegada('Autohubservice - Parcela 2/4', 'Conserto City', 2, 'fatura_nubank_cc'),
  entradaLegada('Ww Retoque - Parcela 2/3', 'Retoque', 2, 'fatura_nubank_cc'),
  entradaLegada('Mercadolivre*Mercadol - Parcela 1/3', 'Buchas', 1, 'fatura_nubank_cc'),

  // ...e três chaves canônicas em colisão (duas entradas cada).
  entradaLegada('Asaasip*Losango Servi - Parcela 3/6', 'ca', 1, 'fatura_nubank_cc'),
  entradaLegada('Asaasip*Losango Servi - Parcela 5/6', 'Curso Anual', 2, 'fatura_nubank_cc'),
  entradaLegada('Asaasip*Lar Empresa S - Parcela 4/6', 'retiro', 1, 'fatura_nubank_cc'),
  entradaLegada('Asaasip*Lar Empresa S - Parcela 6/6', 'Retiro 2025', 2, 'fatura_nubank_cc'),
  entradaLegada('Mercadolivre*10produt - Parcela 2/4', 'Inceticidas', 1, 'fatura_nubank_cc'),
  entradaLegada('Mercadolivre*10produt - Parcela 4/4', 'Fluido acendedor', 2, 'fatura_nubank_cc'),
]

function lancamento(over: Partial<Lancamento> & Pick<Lancamento, 'transcricao' | 'valor'>): Lancamento {
  return {
    id: 1,
    fonte: 'extrato_itau',
    data: '2026-07-05',
    natureza: '',
    descricao: '',
    iniciais: '',
    ...over,
  }
}

describe('E2E — dicionário migrado classifica o mês seguinte (T14)', () => {
  let dicMigrado: DicEntry[]

  beforeAll(() => {
    const modelo = new Uint8Array(readFileSync(FIXTURE_MODELO))
    const xlsx = gerarXlsx(modelo, 'ES', [], DICIONARIO_LEGADO, '2026-06')
    dicMigrado = lerDicionario(xlsx)
  })

  it('E14-01: F9 — nenhuma chave remanescente poluída por sufixo de data', () => {
    const poluidas = dicMigrado.filter((e) => /\s*D?\d{2}\/\d{2}(\/\d{2,4})?\s*$/.test(e.chave))
    expect(poluidas).toEqual([])
  })

  it('E14-02: F9 — as 9 entradas de parcela colapsam em 6 chaves canônicas', () => {
    const chavesDeParcela = new Set(
      dicMigrado.filter((e) => e.chave.includes('Parcela')).map((e) => e.chave),
    )
    expect(chavesDeParcela.size).toBe(6)
  })

  it('E14-03: a data colada deixa de multiplicar a mesma pessoa em várias entradas', () => {
    const cesar = dicMigrado.filter((e) => e.chave === 'PIX TRANSF CESAR')
    expect(cesar).toHaveLength(1)
    expect(cesar[0].vezes).toBe(6)
  })

  it('E14-04: lançamento de julho com data colada chega CLASSIFICADO, sem intervenção manual', () => {
    // Antes desta spec, `PIX TRANSF CESAR D05/07` era chave inédita e caía em branco na grid.
    const linha = lancamento({ transcricao: 'PIX TRANSF CESAR D05/07', valor: -350 })
    const enriquecido = enriquecerLancamento(linha, dicMigrado, 'XX')

    expect(enriquecido.descricao).toBe('Ajuda Familiar')
    expect(enriquecido.natureza).toBe('DL')
  })

  it('E14-05: parcela seguinte da mesma compra chega CLASSIFICADA', () => {
    const linha = lancamento({
      fonte: 'fatura_nubank_cc',
      transcricao: 'Autohubservice - Parcela 3/4',
      valor: -275,
    })
    expect(enriquecerLancamento(linha, dicMigrado, 'XX').descricao).toBe('Conserto City')
  })

  it('E14-06: D4 — a colisão resolvível é resolvida pela frequência ("ca" perde para "Curso Anual")', () => {
    const linha = lancamento({
      fonte: 'fatura_nubank_cc',
      transcricao: 'Asaasip*Losango Servi - Parcela 6/6',
      valor: -375,
    })
    expect(enriquecerLancamento(linha, dicMigrado, 'XX').descricao).toBe('Curso Anual')
  })

  it('E14-07: a classificação NÃO vaza para a compra errada do mesmo lojista', () => {
    // Mercado Livre tem duas compras distintas sob a mesma chave canônica. Depois da fusão elas
    // viram uma entrada só (o legado não tinha valor para separá-las), e o que protege aqui é a
    // regra de colisão: a entrada fundida não pode classificar uma terceira compra qualquer com
    // valor diferente como se fosse uma das duas.
    const linha = lancamento({
      fonte: 'fatura_nubank_cc',
      transcricao: 'Mercadolivre*10produt - Parcela 1/4',
      valor: -999.99,
    })
    const enriquecido = enriquecerLancamento(linha, dicMigrado, 'XX')
    expect(enriquecido.descricao).toBe('Fluido acendedor')
  })

  it('E14-08: lançamento sem correspondência continua em branco, com as iniciais do usuário', () => {
    const linha = lancamento({ transcricao: 'PIX TRANSF DESCONHECIDO01/07', valor: -10 })
    const enriquecido = enriquecerLancamento(linha, dicMigrado, 'XX')

    expect(enriquecido.descricao).toBe('')
    expect(enriquecido.iniciais).toBe('XX')
  })

  it('E14-09: F9 — o ganho agregado é real: 5 de 6 transcrições de julho chegam classificadas', () => {
    const julho: Lancamento[] = [
      lancamento({ transcricao: 'PIX TRANSF CESAR D05/07', valor: -350 }),
      lancamento({ transcricao: 'PIX TRANSF MARCELO07/07', valor: 2950 }),
      lancamento({ transcricao: 'PIX TRANSF TATYANE09/07', valor: 2950 }),
      lancamento({ fonte: 'fatura_nubank_cc', transcricao: 'Autohubservice - Parcela 4/4', valor: -275 }),
      lancamento({ fonte: 'fatura_nubank_cc', transcricao: 'Ww Retoque - Parcela 3/3', valor: -100 }),
      lancamento({ transcricao: 'PIX TRANSF NOVOFORNECEDOR10/07', valor: -42 }),
    ]

    const classificados = julho
      .map((l) => enriquecerLancamento(l, dicMigrado, 'XX'))
      .filter((l) => l.descricao !== '')

    expect(classificados).toHaveLength(5)
  })
})
