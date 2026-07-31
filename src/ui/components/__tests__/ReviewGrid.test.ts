// ADR: see Docs/specs/grid-revisao.adr.md
// ADR: see Docs/specs/grid-ux-filtros.adr.md

/**
 * Testes das funções puras exportadas por ReviewGrid.tsx.
 *
 * ReviewGrid.tsx como componente React não é testável em Vitest sem jsdom
 * montando Glide (que depende de Canvas). O gate da T3 é "nenhum teste de
 * snapshot existente quebrado" (não há snapshots) — as funções puras são
 * testáveis de forma isolada.
 *
 * Test List (Canon TDD — T3):
 * TL-1: medirLarguraHeuristica retorna maxPx quando texto excede o teto
 * TL-2: medirLarguraHeuristica retorna comprimento proporcional abaixo do teto
 * TL-3: calcularLargurasColunas retorna array com mesma quantidade de colunas que colunasBase
 * TL-4: calcularLargurasColunas aplica teto de 320 px em coluna com conteúdo longo
 * TL-5: calcularLargurasColunas retorna largura mínima com array de lancamentos vazio
 * TL-6: ehColunaLeituraApenas retorna true para fonte/data/transcricao; false para demais
 * TL-7: medirLarguraValorContabil mede o formato renderizado (prefixo + número pt-BR, bold)
 * TL-8: calcularLargurasColunas usa a medição contábil na coluna Valor
 */

import { describe, it, expect } from 'vitest'
import {
  medirLarguraHeuristica,
  medirLarguraValorContabil,
  calcularLargurasColunas,
  ehColunaLeituraApenas,
  proximaCelulaAposTab,
  derivarContextoInspecao,
  calcularTemaLinhaComInspecao,
  calcularLinhaAncoraVisual,
  aplicarRevelacaoInspecao,
  indicesEnvolvidos,
  TEMA_INSPECAO_SAI,
  TEMA_INSPECAO_FICA,
  TEMA_ERRO,
  TEMA_TRANSFERENCIA,
  TEMA_INVESTIMENTO,
} from '../ReviewGrid'
import type { Lancamento, Aviso } from '../../../types'

// ---------------------------------------------------------------------------
// Fixture mínima
// ---------------------------------------------------------------------------

function lancamentoFake(overrides: Partial<Lancamento> = {}): Lancamento {
  return {
    fonte: 'Nubank',
    data: '2024-01-15',
    transcricao: 'Descrição padrão',
    iniciais: 'ES',
    natureza: 'Alimentação',
    descricao: 'Almoço',
    valor: -45.5,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// TL-1 e TL-2 — medirLarguraHeuristica
// ---------------------------------------------------------------------------

describe('medirLarguraHeuristica', () => {
  it('TL-1: retorna maxPx quando o texto é longo o suficiente para exceder o teto', () => {
    const textoLongo = 'A'.repeat(200)
    const resultado = medirLarguraHeuristica(textoLongo, 320)
    expect(resultado).toBe(320)
  })

  it('TL-2: retorna largura proporcional quando o texto é curto (abaixo do teto)', () => {
    // "AB" — 2 caracteres; com fator de ~8px/char + padding, deve ser bem menor que 320
    const resultado = medirLarguraHeuristica('AB', 320)
    expect(resultado).toBeGreaterThan(0)
    expect(resultado).toBeLessThan(320)
  })

  it('TL-2b: texto vazio retorna largura mínima positiva', () => {
    const resultado = medirLarguraHeuristica('', 320)
    expect(resultado).toBeGreaterThan(0)
    expect(resultado).toBeLessThan(320)
  })
})

// ---------------------------------------------------------------------------
// TL-3, TL-4, TL-5 — calcularLargurasColunas
// ---------------------------------------------------------------------------

describe('calcularLargurasColunas', () => {
  const colunasBase = [
    { title: 'Fonte', width: 120 },
    { title: 'Data', width: 100 },
    { title: 'Transcrição', width: 240 },
    { title: 'Iniciais', width: 80 },
    { title: 'Natureza', width: 130 },
    { title: 'Descrição', width: 220 },
    { title: 'Valor', width: 110 },
  ]

  it('TL-3: retorna array com a mesma quantidade de colunas que colunasBase', () => {
    const resultado = calcularLargurasColunas([], colunasBase)
    expect(resultado).toHaveLength(colunasBase.length)
  })

  it('TL-4: aplica teto de 320 px mesmo com conteúdo muito longo', () => {
    const lancamentosLongos = [
      lancamentoFake({ transcricao: 'X'.repeat(500), descricao: 'Y'.repeat(500) }),
    ]
    const resultado = calcularLargurasColunas(lancamentosLongos, colunasBase)
    for (const largura of resultado) {
      expect(largura).toBeLessThanOrEqual(320)
    }
  })

  it('TL-5: com array vazio retorna larguras mínimas positivas (ao menos as larguras base)', () => {
    const resultado = calcularLargurasColunas([], colunasBase)
    for (const largura of resultado) {
      expect(largura).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// TL-6 — ehColunaLeituraApenas
// ---------------------------------------------------------------------------

describe('ehColunaLeituraApenas', () => {
  it('TL-6a: retorna true para coluna "fonte"', () => {
    expect(ehColunaLeituraApenas('fonte')).toBe(true)
  })

  it('TL-6b: retorna true para coluna "data"', () => {
    expect(ehColunaLeituraApenas('data')).toBe(true)
  })

  it('TL-6c: retorna true para coluna "transcricao"', () => {
    expect(ehColunaLeituraApenas('transcricao')).toBe(true)
  })

  it('TL-6d: retorna false para coluna "iniciais"', () => {
    expect(ehColunaLeituraApenas('iniciais')).toBe(false)
  })

  it('TL-6e: retorna false para coluna "natureza"', () => {
    expect(ehColunaLeituraApenas('natureza')).toBe(false)
  })

  it('TL-6f: retorna false para coluna "descricao"', () => {
    expect(ehColunaLeituraApenas('descricao')).toBe(false)
  })

  it('TL-6g: retorna false para coluna "valor"', () => {
    expect(ehColunaLeituraApenas('valor')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TL-7 — medirLarguraValorContabil (dívida: valor truncado na auto-largura)
// O drawCell da coluna Valor desenha `-R$` à esquerda e o número pt-BR à
// direita em fonte bold 14px; a medição precisa cobrir esse formato, não o
// número cru de String(valor).
// ---------------------------------------------------------------------------

describe('medirLarguraValorContabil', () => {
  it('TL-7a: valor de 1 dígito cabe acima da largura mínima e abaixo do teto', () => {
    const resultado = medirLarguraValorContabil(-9.9, 320)
    expect(resultado).toBeGreaterThanOrEqual(60)
    expect(resultado).toBeLessThan(320)
  })

  it('TL-7b: valor de 4 dígitos exige mais que a heurística do número cru', () => {
    // Caso real da dívida: -1083.06 renderiza "-R$" + "1.083,06" (bold);
    // a heurística crua sobre "-1083.06" estimava ~100 px e truncava.
    const cru = medirLarguraHeuristica(String(-1083.06), 320)
    const contabil = medirLarguraValorContabil(-1083.06, 320)
    expect(contabil).toBeGreaterThan(cru)
  })

  it('TL-7c: valor de 7 dígitos ainda respeita o teto', () => {
    const resultado = medirLarguraValorContabil(-1234567.89, 320)
    expect(resultado).toBeLessThanOrEqual(320)
  })

  it('TL-7d: valor positivo (prefixo R$) mede menos ou igual ao negativo (prefixo -R$)', () => {
    const positivo = medirLarguraValorContabil(1083.06, 320)
    const negativo = medirLarguraValorContabil(-1083.06, 320)
    expect(positivo).toBeLessThanOrEqual(negativo)
  })
})

// ---------------------------------------------------------------------------
// TL-8 — coluna Valor usa a medição contábil em calcularLargurasColunas
// ---------------------------------------------------------------------------

describe('calcularLargurasColunas — coluna Valor contábil', () => {
  const colunasBase = [
    { title: 'Fonte', width: 120 },
    { title: 'Data', width: 100 },
    { title: 'Transcrição', width: 240 },
    { title: 'Iniciais', width: 80 },
    { title: 'Natureza', width: 130 },
    { title: 'Descrição', width: 220 },
    { title: 'Valor', width: 110 },
  ]
  const IDX_VALOR = 6

  it('TL-8a: com valor de 4 dígitos, a coluna Valor recebe a largura contábil', () => {
    const lancamentos = [lancamentoFake({ valor: -1083.06 })]
    const resultado = calcularLargurasColunas(lancamentos, colunasBase)
    expect(resultado[IDX_VALOR]).toBe(medirLarguraValorContabil(-1083.06, 320))
  })

  it('TL-8b: a largura da coluna Valor é o máximo contábil entre os lançamentos', () => {
    const lancamentos = [
      lancamentoFake({ valor: -9.9 }),
      lancamentoFake({ valor: -10539.61 }),
      lancamentoFake({ valor: 39.9 }),
    ]
    const resultado = calcularLargurasColunas(lancamentos, colunasBase)
    expect(resultado[IDX_VALOR]).toBe(medirLarguraValorContabil(-10539.61, 320))
  })
})

// ---------------------------------------------------------------------------
// TL-9 — proximaCelulaAposTab: navegação em zigue-zague no fluxo de revisão
// (decisão humana de 2026-07-15: Tab na Descrição vai para Iniciais da linha
// de baixo, em vez da célula Valor ao lado)
// ---------------------------------------------------------------------------

describe('proximaCelulaAposTab', () => {
  const COL_INICIAIS = 3
  const COL_NATUREZA = 4
  const COL_DESCRICAO = 5

  it('TL-9a: na Descrição, vai para Iniciais da linha de baixo', () => {
    expect(proximaCelulaAposTab(COL_DESCRICAO, 2, 10)).toEqual([COL_INICIAIS, 3])
  })

  it('TL-9b: na Descrição da última linha, permanece na célula (não há linha de baixo)', () => {
    expect(proximaCelulaAposTab(COL_DESCRICAO, 9, 10)).toEqual([COL_DESCRICAO, 9])
  })

  it('TL-9c: nas demais colunas, vai para a célula à direita na mesma linha', () => {
    expect(proximaCelulaAposTab(COL_INICIAIS, 2, 10)).toEqual([COL_NATUREZA, 2])
    expect(proximaCelulaAposTab(COL_NATUREZA, 2, 10)).toEqual([COL_DESCRICAO, 2])
  })

  it('TL-9d: na última coluna (Valor), permanece na célula', () => {
    const COL_VALOR = 6
    expect(proximaCelulaAposTab(COL_VALOR, 2, 10)).toEqual([COL_VALOR, 2])
  })
})

// ---------------------------------------------------------------------------
// Fixtures — Task T4 (inspeção de conciliação)
// ---------------------------------------------------------------------------

function avisoConciliacaoFake(overrides: Partial<Aviso> = {}): Aviso {
  return {
    id: 'aviso-1',
    tipo: 'proposta',
    origem: 'conciliacao',
    mensagem: 'Proposta de conciliação',
    alvo: ['2'],
    permanece: ['0', '1'],
    resumo: 'somatório da fatura R$ 150,00 ↔ pagamento R$ 150,00, diferença ≤ R$ 0,05',
    estado: 'pendente',
    ...overrides,
  }
}

function avisoValorPendenteFake(overrides: Partial<Aviso> = {}): Aviso {
  return {
    id: 'aviso-2',
    tipo: 'proposta',
    origem: 'valor-pendente',
    mensagem: 'Valor pendente',
    alvo: [],
    permanece: [],
    resumo: undefined,
    estado: 'pendente',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// TL-1 a TL-3 — derivarContextoInspecao
// ---------------------------------------------------------------------------

describe('derivarContextoInspecao', () => {
  it('TL-1: retorna alvoSet/permaneceSet quando o aviso existe e origem é conciliacao', () => {
    const contexto = derivarContextoInspecao(avisoConciliacaoFake())
    expect(contexto).toBeDefined()
    expect(contexto?.alvoSet.has('2')).toBe(true)
    expect(contexto?.permaneceSet.has('0')).toBe(true)
    expect(contexto?.permaneceSet.has('1')).toBe(true)
  })

  it('TL-2: retorna undefined quando não há aviso em inspeção', () => {
    expect(derivarContextoInspecao(undefined)).toBeUndefined()
  })

  it('TL-3 (não-efeito, D11): retorna undefined para aviso de origem valor-pendente', () => {
    expect(derivarContextoInspecao(avisoValorPendenteFake())).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// TL-4 a TL-8 — calcularTemaLinhaComInspecao
// ---------------------------------------------------------------------------

describe('calcularTemaLinhaComInspecao', () => {
  const naturezasValidas = ['ALM', 'TRN']
  const contexto = derivarContextoInspecao(avisoConciliacaoFake())!

  it('TL-4: retorna TEMA_INSPECAO_SAI quando o índice real está em alvoSet', () => {
    const l = lancamentoFake({ natureza: 'ALM' })
    expect(calcularTemaLinhaComInspecao(l, 2, naturezasValidas, contexto)).toBe(TEMA_INSPECAO_SAI)
  })

  it('TL-5: retorna TEMA_INSPECAO_FICA quando o índice real está em permaneceSet', () => {
    const l = lancamentoFake({ natureza: 'ALM' })
    expect(calcularTemaLinhaComInspecao(l, 0, naturezasValidas, contexto)).toBe(TEMA_INSPECAO_FICA)
  })

  it('TL-6 (precedência, D4): tema de inspeção vence erro/transferência/investimento', () => {
    const lErro = lancamentoFake({ natureza: '' }) // natureza vazia -> normalmente TEMA_ERRO
    expect(calcularTemaLinhaComInspecao(lErro, 2, naturezasValidas, contexto)).toBe(
      TEMA_INSPECAO_SAI,
    )

    const lTransferencia = lancamentoFake({ transferenciaInterna: true })
    expect(
      calcularTemaLinhaComInspecao(lTransferencia, 0, naturezasValidas, contexto),
    ).toBe(TEMA_INSPECAO_FICA)

    const lInvestimento = lancamentoFake({ investimento: 'aplicacao' })
    expect(
      calcularTemaLinhaComInspecao(lInvestimento, 2, naturezasValidas, contexto),
    ).toBe(TEMA_INSPECAO_SAI)
  })

  it('TL-7 (regressão): sem contexto de inspeção, delega para calcularTemaLinha', () => {
    const lErro = lancamentoFake({ natureza: '' })
    expect(calcularTemaLinhaComInspecao(lErro, 5, naturezasValidas, undefined)).toBe(TEMA_ERRO)

    const lTransferencia = lancamentoFake({ transferenciaInterna: true })
    expect(
      calcularTemaLinhaComInspecao(lTransferencia, 5, naturezasValidas, undefined),
    ).toBe(TEMA_TRANSFERENCIA)

    const lInvestimento = lancamentoFake({ investimento: 'resgate' })
    expect(
      calcularTemaLinhaComInspecao(lInvestimento, 5, naturezasValidas, undefined),
    ).toBe(TEMA_INVESTIMENTO)

    const lNormal = lancamentoFake({ natureza: 'ALM' })
    expect(
      calcularTemaLinhaComInspecao(lNormal, 5, naturezasValidas, undefined),
    ).toBeUndefined()
  })

  it('TL-8 (robustez a ordenação/filtro por identidade, D7): casa pelo índice real, não pela posição', () => {
    const l = lancamentoFake({ natureza: 'ALM' })
    // A mesma linha (índice real 2) continua TEMA_INSPECAO_SAI independentemente
    // de "onde" ela apareceria numa lista reordenada — a função não recebe posição
    // visual, só o índice real, provando que o casamento é por identidade.
    expect(calcularTemaLinhaComInspecao(l, 2, naturezasValidas, contexto)).toBe(TEMA_INSPECAO_SAI)
    // Um índice real que não está nem em alvo nem em permanece nunca ganha tema de inspeção,
    // mesmo que fosse a "primeira linha visível" após reordenação.
    expect(calcularTemaLinhaComInspecao(l, 99, naturezasValidas, contexto)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// TL-9 e TL-10 — calcularLinhaAncoraVisual
// ---------------------------------------------------------------------------

describe('calcularLinhaAncoraVisual', () => {
  it('TL-9 (auto-scroll, D3): retorna a posição visual do índice-âncora (alvo[0]) sob ordenação ativa', () => {
    // mapaIndiceVisualReal fora de ordem simula ordenação ativa: posição visual 0 -> índice real 2
    const mapaIndiceVisualReal = [2, 0, 1]
    const aviso = avisoConciliacaoFake({ alvo: ['2'] })
    expect(calcularLinhaAncoraVisual(mapaIndiceVisualReal, aviso)).toBe(0)
  })

  it('TL-10 (não-efeito, D11): retorna undefined para aviso de origem valor-pendente', () => {
    const mapaIndiceVisualReal = [0, 1, 2]
    expect(
      calcularLinhaAncoraVisual(mapaIndiceVisualReal, avisoValorPendenteFake()),
    ).toBeUndefined()
  })

  it('TL-10b (guarda): retorna undefined quando não há aviso em inspeção', () => {
    expect(calcularLinhaAncoraVisual([0, 1, 2], undefined)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// TL-11 e TL-12 — aplicarRevelacaoInspecao
// ---------------------------------------------------------------------------

describe('aplicarRevelacaoInspecao', () => {
  const lancamentos = [
    lancamentoFake({ transcricao: 'Fatura item A' }), // índice real 0
    lancamentoFake({ transcricao: 'Fatura item B' }), // índice real 1
    lancamentoFake({ transcricao: 'Pagamento fatura' }), // índice real 2
  ]

  it('TL-11 (revelação de linha oculta, D8): inclui linha envolvida ausente do filtro ativo', () => {
    // Filtro ativo oculta o índice real 1 ("fica"): só 0 e 2 estão visíveis.
    const lancamentosVisiveis = [lancamentos[0], lancamentos[2]]
    const mapaIndiceVisualReal = [0, 2]
    const indicesReaisEnvolvidos = [0, 1, 2] // alvo=[2] + permanece=[0,1]

    const resultado = aplicarRevelacaoInspecao(
      lancamentos,
      lancamentosVisiveis,
      mapaIndiceVisualReal,
      indicesReaisEnvolvidos,
    )

    expect(resultado.mapa).toContain(1)
    expect(resultado.linhas).toContain(lancamentos[1])
    expect(resultado.linhas).toHaveLength(3)
  })

  it('TL-12 (desfazer revelação ao sair, D8): sem índices envolvidos, retorna a visão original intacta', () => {
    const lancamentosVisiveis = [lancamentos[0], lancamentos[2]]
    const mapaIndiceVisualReal = [0, 2]

    const resultado = aplicarRevelacaoInspecao(
      lancamentos,
      lancamentosVisiveis,
      mapaIndiceVisualReal,
      [],
    )

    expect(resultado.linhas).toBe(lancamentosVisiveis)
    expect(resultado.mapa).toBe(mapaIndiceVisualReal)
  })
})

// ---------------------------------------------------------------------------
// TL-13 e TL-14 — pipeline de integração slice→grid (composição de funções puras)
// Camada [integration] per Playbook 1: ReviewGrid.tsx (componente Glide/Canvas)
// não é montável em jsdom (ver cabeçalho do arquivo); a integração provada aqui
// é a composição real das funções puras que o componente invoca em runtime.
// ---------------------------------------------------------------------------

describe('pipeline de inspeção (integração slice -> grid)', () => {
  const naturezasValidas = ['ALM']
  const lancamentos = [
    lancamentoFake({ transcricao: 'Fatura item A', natureza: 'ALM' }), // real 0 = fica
    lancamentoFake({ transcricao: 'Fatura item B', natureza: 'ALM' }), // real 1 = fica
    lancamentoFake({ transcricao: 'Pagamento fatura', natureza: 'ALM' }), // real 2 = sai
  ]

  it('TL-13: conciliação em inspeção — sai/fica corretos, linha fica revelada', () => {
    const aviso = avisoConciliacaoFake({ alvo: ['2'], permanece: ['0', '1'] })

    // Filtro ativo oculta o índice real 1.
    const lancamentosVisiveis = [lancamentos[0], lancamentos[2]]
    const mapaIndiceVisualReal = [0, 2]

    const contexto = derivarContextoInspecao(aviso)
    const envolvidos = indicesEnvolvidos(aviso)
    const { linhas, mapa } = aplicarRevelacaoInspecao(
      lancamentos,
      lancamentosVisiveis,
      mapaIndiceVisualReal,
      envolvidos,
    )

    const temasPorLinha = mapa.map((indiceReal, posicaoVisual) =>
      calcularTemaLinhaComInspecao(linhas[posicaoVisual]!, indiceReal, naturezasValidas, contexto),
    )

    expect(mapa).toEqual([0, 2, 1])
    expect(temasPorLinha[0]).toBe(TEMA_INSPECAO_FICA) // real 0
    expect(temasPorLinha[1]).toBe(TEMA_INSPECAO_SAI) // real 2
    expect(temasPorLinha[2]).toBe(TEMA_INSPECAO_FICA) // real 1, revelado

    expect(calcularLinhaAncoraVisual(mapa, aviso)).toBe(1)
  })

  it('TL-14 (não-efeito, D11): valor-pendente em inspeção não altera tema, revelação nem âncora', () => {
    const aviso = avisoValorPendenteFake()

    const lancamentosVisiveis = [lancamentos[0], lancamentos[2]]
    const mapaIndiceVisualReal = [0, 2]

    const contexto = derivarContextoInspecao(aviso)
    const envolvidos = indicesEnvolvidos(aviso)
    const { linhas, mapa } = aplicarRevelacaoInspecao(
      lancamentos,
      lancamentosVisiveis,
      mapaIndiceVisualReal,
      envolvidos,
    )

    expect(linhas).toBe(lancamentosVisiveis)
    expect(mapa).toBe(mapaIndiceVisualReal)

    const temasPorLinha = mapa.map((indiceReal, posicaoVisual) =>
      calcularTemaLinhaComInspecao(linhas[posicaoVisual]!, indiceReal, naturezasValidas, contexto),
    )
    expect(temasPorLinha.every((t) => t === undefined)).toBe(true)

    expect(calcularLinhaAncoraVisual(mapa, aviso)).toBeUndefined()
  })
})
