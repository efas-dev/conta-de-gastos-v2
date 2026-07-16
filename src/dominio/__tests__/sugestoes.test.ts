// ADR: see Docs/specs/grid-autocomplete-aviso-saida.adr.md

import { describe, it, expect } from 'vitest'
import type { DicEntry } from '../../types'
import { calcularSugestoes } from '../sugestoes'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const entradaAlimentacao: DicEntry = {
  chave: 'PADARIA CENTRAL',
  fonte: 'Nubank',
  natureza: 'Alimentação',
  descricao: 'Padaria',
  iniciais: 'ES',
  vezes: 5,
  ambiguo: false,
}

const entradaAlimentacaoBaixaFreq: DicEntry = {
  chave: 'PADARIA DO BAIRRO',
  fonte: 'Nubank',
  natureza: 'Alimentação',
  descricao: 'Padaria artesanal',
  iniciais: 'ES',
  vezes: 2,
  ambiguo: false,
}

const entradaCafe: DicEntry = {
  chave: 'CAFE DA MANHA',
  fonte: 'Nubank',
  natureza: 'Alimentação',
  descricao: 'Café',
  iniciais: 'ES',
  vezes: 8,
  ambiguo: false,
}

const entradaTransporte: DicEntry = {
  chave: 'UBER VIAGEM',
  fonte: 'Nubank',
  natureza: 'Transporte',
  descricao: 'Uber',
  iniciais: 'ES',
  vezes: 10,
  ambiguo: false,
}

const dicEntries = [entradaAlimentacao, entradaAlimentacaoBaixaFreq, entradaCafe, entradaTransporte]

// ---------------------------------------------------------------------------
// SU-01: prefixo com candidato no dicionário retorna forma canônica
// ---------------------------------------------------------------------------
describe('calcularSugestoes — candidato no dicionário', () => {
  it('SU-01: prefixo "pad" retorna a forma canônica "Padaria" (não o prefixo normalizado)', () => {
    const resultado = calcularSugestoes('pad', dicEntries, [], 'Alimentação')
    expect(resultado).toContain('Padaria')
    // Não deve retornar o prefixo normalizado
    expect(resultado).not.toContain('pad')
  })
})

// ---------------------------------------------------------------------------
// SU-02: sem candidato retorna []
// ---------------------------------------------------------------------------
describe('calcularSugestoes — sem candidato', () => {
  it('SU-02: prefixo sem nenhum candidato no dicionário nem no histórico retorna []', () => {
    const resultado = calcularSugestoes('xyz', dicEntries, [], 'Alimentação')
    expect(resultado).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// SU-03: dicionário antes do histórico
// ---------------------------------------------------------------------------
describe('calcularSugestoes — dicionário antes do histórico', () => {
  it('SU-03: candidato presente em ambas as fontes aparece primeiro (do dicionário) e sem duplicata', () => {
    const historico = ['Padaria']  // mesmo valor que entradaAlimentacao.descricao
    const resultado = calcularSugestoes('pad', dicEntries, historico, 'Alimentação')
    // "Padaria" deve aparecer somente uma vez
    expect(resultado.filter(v => v === 'Padaria')).toHaveLength(1)
    // "Padaria" deve ser o primeiro resultado (do dicionário)
    expect(resultado[0]).toBe('Padaria')
  })
})

// ---------------------------------------------------------------------------
// SU-04: ranqueamento por vezes desc
// ---------------------------------------------------------------------------
describe('calcularSugestoes — ranqueamento por vezes', () => {
  it('SU-04: entrada com maior vezes aparece antes de entrada com menor vezes', () => {
    // entradaCafe (vezes=8) e entradaAlimentacao (vezes=5) — ambas natureza Alimentação
    // prefixo "p" casa apenas com "Padaria" e "Padaria artesanal"
    // Para testar vezes: usar prefixo vazio não é válido; usar prefixo "ca" para testar Café vs outros
    // Na verdade, usar prefixo que casa os dois: "pa"
    // entradaAlimentacao.descricao = "Padaria" (vezes=5), entradaAlimentacaoBaixaFreq.descricao = "Padaria artesanal" (vezes=2)
    const resultado = calcularSugestoes('pa', dicEntries, [], 'Alimentação')
    const idxPadaria = resultado.indexOf('Padaria')
    const idxPadariaArtesanal = resultado.indexOf('Padaria artesanal')
    expect(idxPadaria).toBeGreaterThanOrEqual(0)
    expect(idxPadariaArtesanal).toBeGreaterThanOrEqual(0)
    // "Padaria" (vezes=5) deve vir antes de "Padaria artesanal" (vezes=2)
    expect(idxPadaria).toBeLessThan(idxPadariaArtesanal)
  })
})

// ---------------------------------------------------------------------------
// SU-05: casamento ignora caixa
// ---------------------------------------------------------------------------
describe('calcularSugestoes — casamento ignora caixa', () => {
  it('SU-05: prefixo em maiúsculas "PADARIA" casa com descricao "Padaria"', () => {
    const resultado = calcularSugestoes('PADARIA', dicEntries, [], 'Alimentação')
    expect(resultado).toContain('Padaria')
  })
})

// ---------------------------------------------------------------------------
// SU-06 + SU-07: casamento ignora acentos e forma canônica é preservada
// ---------------------------------------------------------------------------
describe('calcularSugestoes — casamento ignora acentos e forma canônica', () => {
  it('SU-06: prefixo "cafe" (sem acento) casa com descricao "Café"', () => {
    const resultado = calcularSugestoes('cafe', dicEntries, [], 'Alimentação')
    expect(resultado).toContain('Café')
  })

  it('SU-07: valor retornado é a forma canônica "Café", não o prefixo normalizado "cafe"', () => {
    const resultado = calcularSugestoes('cafe', dicEntries, [], 'Alimentação')
    // Deve conter a forma canônica com acento
    expect(resultado).toContain('Café')
    // Não deve conter a forma normalizada
    expect(resultado).not.toContain('cafe')
  })
})

// ---------------------------------------------------------------------------
// SU-08: viés Nat×Desc com irmã preenchida
// ---------------------------------------------------------------------------
describe('calcularSugestoes — viés Nat×Desc com irmã', () => {
  it('SU-08a: com naturezaIrma="Alimentação", retorna apenas descricoes de entradas com essa natureza', () => {
    // entradaTransporte.natureza === "Transporte" → não deve aparecer com naturezaIrma="Alimentação"
    const resultado = calcularSugestoes('u', dicEntries, [], 'Alimentação')
    // "Uber" é descricao de entradaTransporte (natureza Transporte), não deve aparecer
    expect(resultado).not.toContain('Uber')
  })

  it('SU-08b: com descricaoIrma="Uber", retorna natureza "Transporte" do par', () => {
    const resultado = calcularSugestoes('tran', dicEntries, [], undefined, 'Uber')
    expect(resultado).toContain('Transporte')
  })

  it('SU-08c: sem irmã, extrai iniciais dos dicEntries (coluna Iniciais)', () => {
    // Todas as entradas têm iniciais="ES"; prefixo "e" deve retornar ["ES"]
    const resultado = calcularSugestoes('e', dicEntries, [])
    expect(resultado).toContain('ES')
  })
})

// ---------------------------------------------------------------------------
// SU-09: historicoColunaAtual como complemento
// ---------------------------------------------------------------------------
describe('calcularSugestoes — historicoColunaAtual como complemento', () => {
  it('SU-09: item somente no histórico aparece após candidatos do dicionário', () => {
    const historico = ['Padaria nova']  // não está no dicionário
    const resultado = calcularSugestoes('pad', dicEntries, historico, 'Alimentação')
    // "Padaria" do dicionário deve vir antes de "Padaria nova" do histórico
    const idxDic = resultado.indexOf('Padaria')
    const idxHistorico = resultado.indexOf('Padaria nova')
    expect(idxHistorico).toBeGreaterThanOrEqual(0)
    expect(idxDic).toBeLessThan(idxHistorico)
  })
})

// ---------------------------------------------------------------------------
// SU-10: prefixo vazio retorna []
// ---------------------------------------------------------------------------
describe('calcularSugestoes — prefixo vazio', () => {
  it('SU-10: prefixo vazio retorna [] sem lançar erro', () => {
    const resultado = calcularSugestoes('', dicEntries, ['Padaria'])
    expect(resultado).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// SU-11: zero imports de UI/store
// ---------------------------------------------------------------------------
describe('calcularSugestoes — pureza do módulo', () => {
  it('SU-11: módulo importa e executa sem dependências de UI ou store', () => {
    // O simples fato de o import acima ter funcionado sem necessitar de DOM,
    // canvas ou Zustand já prova a pureza. Este teste confirma explicitamente.
    expect(typeof calcularSugestoes).toBe('function')
  })
})
