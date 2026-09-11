// ADR: see Docs/specs/motor-de-pares.adr.md

import { describe, expect, it } from 'vitest'
import { detectarReembolsoAvisos, encontrarPares } from '../pares'
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

  it('TL-38-9: exclui sempre fonte "manual" do casamento (item 38 — a linha inserida na grid nasce do app, como form_vr/form_rendimentos)', () => {
    const manual = lancamento({ id: 1, data: '2026-08-10', valor: 120, fonte: 'manual' })
    const outro = lancamento({ id: 2, data: '2026-08-11', valor: -120 })

    const resultado = encontrarPares([manual, outro], {}, {})

    expect(resultado.pares).toEqual([])
    expect(resultado.ambiguos).toEqual([])
  })

  it('TL-38-10: duas linhas "manual" de valores opostos nunca viram par entre si', () => {
    const saida = lancamento({ id: 1, data: '2026-08-10', valor: -75, fonte: 'manual' })
    const entrada = lancamento({ id: 2, data: '2026-08-10', valor: 75, fonte: 'manual' })

    const resultado = encontrarPares([saida, entrada], {}, {})

    expect(resultado.pares).toEqual([])
    expect(resultado.ambiguos).toEqual([])
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

  it('a função encontrarPares em si não referencia Aviso nem registry — motor puro sem saber o que o par significa', async () => {
    // Nota (Task 2, ADR `motor-de-pares` Decisão 10 — nota de coerência): `pares.ts` passou a
    // hospedar também a política `detectarReembolsoAvisos`, que PRECISA importar `Aviso` de
    // `../types` para construir os avisos que produz. Isso é esperado e conscientemente aceito
    // pelo usuário no gate de Revisão da spec — não é regressão da pureza do motor. O que esta
    // asserção continua garantindo é que a função `encontrarPares` em si (isolada do resto do
    // arquivo) segue sem referenciar `Aviso`; `registry` nunca é importado por nenhuma das duas
    // responsabilidades deste arquivo.
    const fs = await import('node:fs')
    const path = await import('node:path')
    const url = await import('node:url')
    const caminho = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..', 'pares.ts')
    const conteudo = fs.readFileSync(caminho, 'utf-8')
    const linhasDeImport = conteudo.split('\n').filter((linha) => linha.trim().startsWith('import'))

    expect(linhasDeImport.some((linha) => linha.includes('registry'))).toBe(false)

    // Isola só o CORPO da função (da primeira `{` da assinatura até a `}` que fecha o balanço de
    // chaves) — não o arquivo inteiro nem o JSDoc de declarações vizinhas, que legitimamente
    // mencionam `Aviso` (ex.: a política `detectarReembolsoAvisos`, logo abaixo no arquivo).
    const inicioAssinatura = conteudo.indexOf('export function encontrarPares')
    expect(inicioAssinatura).toBeGreaterThan(-1)
    const inicioCorpo = conteudo.indexOf('{', inicioAssinatura)
    let profundidade = 0
    let fimCorpo = inicioCorpo
    for (let i = inicioCorpo; i < conteudo.length; i++) {
      if (conteudo[i] === '{') profundidade++
      if (conteudo[i] === '}') {
        profundidade--
        if (profundidade === 0) {
          fimCorpo = i + 1
          break
        }
      }
    }
    const corpoEncontrarPares = conteudo.slice(inicioCorpo, fimCorpo)

    expect(corpoEncontrarPares.includes('Aviso')).toBe(false)
  })
})

describe('detectarReembolsoAvisos', () => {
  it('par de reembolso (nenhuma perna transferência própria) gera Aviso origem reembolso com os dois ids', () => {
    const positivo = lancamento({ id: 1, data: '2026-08-10', valor: 250, transcricao: 'Devolução João' })
    const negativo = lancamento({ id: 2, data: '2026-08-11', valor: -250, transcricao: 'Pix para João' })

    const avisos = detectarReembolsoAvisos([positivo, negativo], {})

    expect(avisos).toEqual([
      {
        id: 'reembolso-1-2',
        tipo: 'proposta',
        origem: 'reembolso',
        mensagem: expect.any(String),
        alvo: ['1', '2'],
        permanece: [],
        resumo: undefined,
        estado: 'pendente',
        mutacaoProposta: { verbo: 'remover', alvo: [1, 2] },
      },
    ])
  })

  it('não gera aviso quando a perna POSITIVA bate no sinal de transferência própria (D2, basta 1 perna)', () => {
    const positivo = lancamento({ id: 1, data: '2026-08-10', valor: 250, transcricao: 'Pix para mim mesmo' })
    const negativo = lancamento({ id: 2, data: '2026-08-11', valor: -250, transcricao: 'Saque qualquer' })

    const avisos = detectarReembolsoAvisos([positivo, negativo], {}, { ehTransferencia: (l) => l.id === 1 })

    expect(avisos).toEqual([])
  })

  it('não gera aviso quando a perna NEGATIVA bate no sinal de transferência própria (D2, variante do outro lado)', () => {
    const positivo = lancamento({ id: 1, data: '2026-08-10', valor: 250, transcricao: 'Recebimento qualquer' })
    const negativo = lancamento({ id: 2, data: '2026-08-11', valor: -250, transcricao: 'Open Banking' })

    const avisos = detectarReembolsoAvisos([positivo, negativo], {}, { ehTransferencia: (l) => l.id === 2 })

    expect(avisos).toEqual([])
  })

  it('GrupoAmbiguo sem sinal de transferência em nenhum candidato gera Aviso informativo com os candidatos', () => {
    const ancora = lancamento({ id: 1, data: '2026-08-10', valor: 300, transcricao: 'Recebimento X' })
    const candidatoA = lancamento({ id: 2, data: '2026-08-08', valor: -300, transcricao: 'Pagamento A' })
    const candidatoB = lancamento({ id: 3, data: '2026-08-12', valor: -300, transcricao: 'Pagamento B' })

    const avisos = detectarReembolsoAvisos([ancora, candidatoA, candidatoB], {}, { ehTransferencia: () => false })

    expect(avisos).toEqual([
      {
        id: 'reembolso-ambiguo-1',
        tipo: 'informativo',
        origem: 'reembolso',
        mensagem: expect.any(String),
        alvo: [],
        permanece: [],
        estado: 'pendente',
        candidatos: [
          { alvo: '2', resumo: expect.any(String) },
          { alvo: '3', resumo: expect.any(String) },
        ],
      },
    ])
  })

  it('GrupoAmbiguo com sinal de transferência na âncora não gera informativo de reembolso (não-interferência)', () => {
    const ancora = lancamento({ id: 1, data: '2026-08-10', valor: 300, transcricao: 'Open Banking' })
    const candidatoA = lancamento({ id: 2, data: '2026-08-08', valor: -300 })
    const candidatoB = lancamento({ id: 3, data: '2026-08-12', valor: -300 })

    const avisos = detectarReembolsoAvisos(
      [ancora, candidatoA, candidatoB],
      {},
      { ehTransferencia: (l) => l.id === 1 },
    )

    expect(avisos).toEqual([])
  })

  it('GrupoAmbiguo com sinal de transferência em um candidato (não na âncora) também não gera informativo', () => {
    const ancora = lancamento({ id: 1, data: '2026-08-10', valor: 300 })
    const candidatoA = lancamento({ id: 2, data: '2026-08-08', valor: -300, transcricao: 'Open Banking' })
    const candidatoB = lancamento({ id: 3, data: '2026-08-12', valor: -300 })

    const avisos = detectarReembolsoAvisos(
      [ancora, candidatoA, candidatoB],
      {},
      { ehTransferencia: (l) => l.id === 2 },
    )

    expect(avisos).toEqual([])
  })

  it('exclui par cuja perna bate em padrão de auto-sweep (BB Rende Fácil), mesmo com valor exato e dentro da janela (D5)', () => {
    const autoSweep = lancamento({ id: 1, data: '2026-08-10', valor: 500, transcricao: 'BB Rende Fácil' })
    const despesaReal = lancamento({ id: 2, data: '2026-08-11', valor: -500, transcricao: 'Raia Drogasil' })

    const avisos = detectarReembolsoAvisos([autoSweep, despesaReal], {})

    expect(avisos).toEqual([])
  })

  it('gera um Aviso por par quando há múltiplos pares de reembolso independentes', () => {
    const p1 = lancamento({ id: 1, data: '2026-08-10', valor: 100 })
    const n1 = lancamento({ id: 2, data: '2026-08-10', valor: -100 })
    const p2 = lancamento({ id: 3, data: '2026-08-15', valor: 200 })
    const n2 = lancamento({ id: 4, data: '2026-08-16', valor: -200 })

    const avisos = detectarReembolsoAvisos([p1, n1, p2, n2], {})

    expect(avisos.map((a) => a.id)).toEqual(['reembolso-1-2', 'reembolso-3-4'])
    expect(avisos.map((a) => a.mutacaoProposta)).toEqual([
      { verbo: 'remover', alvo: [1, 2] },
      { verbo: 'remover', alvo: [3, 4] },
    ])
  })

  it('retorna array vazio quando não há par nem grupo ambíguo', () => {
    const isolado = lancamento({ id: 1, data: '2026-08-10', valor: 100 })

    const avisos = detectarReembolsoAvisos([isolado], {})

    expect(avisos).toEqual([])
  })

  it('usa detectarTransferenciaInterna real como default quando opcoes.ehTransferencia não é passado', () => {
    const positivo = lancamento({ id: 1, data: '2026-08-10', valor: 400, transcricao: 'Recebimento qualquer' })
    const negativo = lancamento({ id: 2, data: '2026-08-11', valor: -400, transcricao: 'ITAU BLACK' })

    const avisos = detectarReembolsoAvisos([positivo, negativo], {})

    expect(avisos).toEqual([])
  })
})
