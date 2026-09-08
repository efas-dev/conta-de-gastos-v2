// ADR: see Docs/specs/motor-de-pares.adr.md

import { describe, expect, it } from 'vitest'
import { encontrarPares } from '../pares'
import type { Lancamento } from '../../types'

/** Constrói um `Lancamento` de teste com os campos mínimos, sobrescrevendo o que for dado. */
function lancamento(overrides: Partial<Lancamento> & Pick<Lancamento, 'id' | 'data' | 'valor'>): Lancamento {
  return {
    fonte: 'Nubank',
    transcricao: 'Lançamento de teste',
    iniciais: 'XX',
    natureza: '',
    descricao: '',
    ...overrides,
  }
}

describe('encontrarPares', () => {
  it('casa uma perna positiva com uma perna negativa de mesmo valor absoluto dentro da janela', () => {
    const positivo = lancamento({ id: 1, data: '2026-08-10', valor: 150.5 })
    const negativo = lancamento({ id: 2, data: '2026-08-12', valor: -150.5 })

    const resultado = encontrarPares([positivo, negativo], {}, {})

    expect(resultado.pares).toEqual([{ positivo, negativo, distanciaDias: 2 }])
    expect(resultado.ambiguos).toEqual([])
  })

  it('ainda casa um candidato a exatamente 7 dias de distância (borda inclusiva da janela)', () => {
    const positivo = lancamento({ id: 1, data: '2026-08-01', valor: 80 })
    const negativo = lancamento({ id: 2, data: '2026-08-08', valor: -80 })

    const resultado = encontrarPares([positivo, negativo], {}, {})

    expect(resultado.pares).toEqual([{ positivo, negativo, distanciaDias: 7 }])
  })

  it('não casa um candidato a 8 dias de distância (fora da janela de 7 dias — D4)', () => {
    const positivo = lancamento({ id: 1, data: '2026-08-01', valor: 80 })
    const negativo = lancamento({ id: 2, data: '2026-08-09', valor: -80 })

    const resultado = encontrarPares([positivo, negativo], {}, {})

    expect(resultado.pares).toEqual([])
    expect(resultado.ambiguos).toEqual([])
  })

  it('elege o candidato de menor distância quando há dois candidatos com distâncias diferentes', () => {
    const positivo = lancamento({ id: 1, data: '2026-08-10', valor: 200 })
    const maisProximo = lancamento({ id: 2, data: '2026-08-11', valor: -200 })
    const maisDistante = lancamento({ id: 3, data: '2026-08-14', valor: -200 })

    const resultado = encontrarPares([positivo, maisProximo, maisDistante], {}, {})

    expect(resultado.pares).toEqual([{ positivo, negativo: maisProximo, distanciaDias: 1 }])
    expect(resultado.ambiguos).toEqual([])
  })

  it('empate exato de distância entre dois candidatos vira GrupoAmbiguo, sem formar par (D7/D9)', () => {
    const positivo = lancamento({ id: 1, data: '2026-08-10', valor: 300 })
    const candidatoA = lancamento({ id: 2, data: '2026-08-08', valor: -300 })
    const candidatoB = lancamento({ id: 3, data: '2026-08-12', valor: -300 })

    const resultado = encontrarPares([positivo, candidatoA, candidatoB], {}, {})

    expect(resultado.pares).toEqual([])
    expect(resultado.ambiguos).toEqual([
      { ancora: positivo, candidatos: [candidatoA, candidatoB], distanciaDias: 2 },
    ])
  })

  it('não casa pernas com 1 centavo de diferença, mesmo dentro da janela (D8, tolerância zero)', () => {
    const positivo = lancamento({ id: 1, data: '2026-08-10', valor: 100 })
    const negativo = lancamento({ id: 2, data: '2026-08-11', valor: -100.01 })

    const resultado = encontrarPares([positivo, negativo], {}, {})

    expect(resultado.pares).toEqual([])
    expect(resultado.ambiguos).toEqual([])
  })

  it('exclui lançamento cuja transcrição bate em opcoes.padroesExcluidos, mesmo com par de valor exato (D5/D17)', () => {
    const autoSweep = lancamento({ id: 1, data: '2026-08-10', valor: 500, transcricao: 'BB Rende Fácil' })
    const despesaReal = lancamento({ id: 2, data: '2026-08-11', valor: -500, transcricao: 'Raia Drogasil' })

    const resultado = encontrarPares([autoSweep, despesaReal], {}, { padroesExcluidos: [/BB Rende Fácil/i] })

    expect(resultado.pares).toEqual([])
    expect(resultado.ambiguos).toEqual([])
  })

  it('não exclui nada quando opcoes.padroesExcluidos não é passado (parâmetro, não constante hardcoded)', () => {
    const autoSweep = lancamento({ id: 1, data: '2026-08-10', valor: 500, transcricao: 'BB Rende Fácil' })
    const despesaReal = lancamento({ id: 2, data: '2026-08-11', valor: -500, transcricao: 'Raia Drogasil' })

    const resultado = encontrarPares([autoSweep, despesaReal], {}, {})

    expect(resultado.pares).toEqual([{ positivo: autoSweep, negativo: despesaReal, distanciaDias: 1 }])
  })

  it('exclui sempre fonte form_vr do casamento, mesmo sem padroesExcluidos declarado (D14, fixo)', () => {
    const manual = lancamento({ id: 1, data: '2026-08-10', valor: 120, fonte: 'form_vr' })
    const outro = lancamento({ id: 2, data: '2026-08-11', valor: -120 })

    const resultado = encontrarPares([manual, outro], {}, {})

    expect(resultado.pares).toEqual([])
    expect(resultado.ambiguos).toEqual([])
  })

  it('exclui sempre fonte form_rendimentos do casamento (D14, fixo)', () => {
    const manual = lancamento({ id: 1, data: '2026-08-10', valor: 120, fonte: 'form_rendimentos' })
    const outro = lancamento({ id: 2, data: '2026-08-11', valor: -120 })

    const resultado = encontrarPares([manual, outro], {}, {})

    expect(resultado.pares).toEqual([])
  })

  it('lançamento de valor 0 nunca entra em par (D13: nenhuma perna é estritamente positiva nem negativa)', () => {
    const zero = lancamento({ id: 1, data: '2026-08-10', valor: 0 })
    const positivo = lancamento({ id: 2, data: '2026-08-10', valor: 0.0 })
    const outroPositivo = lancamento({ id: 3, data: '2026-08-11', valor: 50 })
    const outroNegativo = lancamento({ id: 4, data: '2026-08-11', valor: -50 })

    const resultado = encontrarPares([zero, positivo, outroPositivo, outroNegativo], {}, {})

    expect(resultado.pares).toEqual([{ positivo: outroPositivo, negativo: outroNegativo, distanciaDias: 0 }])
  })

  it('cada lançamento entra em no máximo um par: consumido num par não sobra como candidato de outro', () => {
    const p1 = lancamento({ id: 1, data: '2026-08-10', valor: 400 })
    const n1 = lancamento({ id: 2, data: '2026-08-10', valor: -400 })
    const p2 = lancamento({ id: 3, data: '2026-08-12', valor: 400 })

    // n1 casa com p1 na distância 0 (mais próxima, sem empate) e é consumido. p2 só teria n1
    // como candidato (distância 2), mas n1 já foi consumido pelo par com p1 — p2 fica sem par,
    // sem que isso gere ambiguidade (a decisão de n1 já estava resolvida antes de p2 competir).
    const resultado = encontrarPares([p1, n1, p2], {}, {})

    expect(resultado.pares).toEqual([{ positivo: p1, negativo: n1, distanciaDias: 0 }])
    expect(resultado.ambiguos).toEqual([])
  })

  it('não muta os lançamentos recebidos nem o array de entrada (pureza)', () => {
    const positivo = lancamento({ id: 1, data: '2026-08-10', valor: 90 })
    const negativo = lancamento({ id: 2, data: '2026-08-11', valor: -90 })
    const entrada = [positivo, negativo]
    const copiaPositivo = { ...positivo }
    const copiaNegativo = { ...negativo }

    encontrarPares(entrada, {}, {})

    expect(entrada).toEqual([positivo, negativo])
    expect(positivo).toEqual(copiaPositivo)
    expect(negativo).toEqual(copiaNegativo)
  })

  it('não importa Aviso nem registry — motor puro sem saber o que o par significa', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const url = await import('node:url')
    const caminho = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..', 'pares.ts')
    const conteudo = fs.readFileSync(caminho, 'utf-8')
    const linhasDeImport = conteudo.split('\n').filter((linha) => linha.trim().startsWith('import'))

    expect(linhasDeImport.some((linha) => linha.includes('Aviso'))).toBe(false)
    expect(linhasDeImport.some((linha) => linha.includes('registry'))).toBe(false)
  })
})
