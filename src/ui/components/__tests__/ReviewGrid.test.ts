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

import { describe, it, expect, afterEach } from 'vitest'
import {
  medirLarguraHeuristica,
  medirLarguraValorContabil,
  calcularLargurasColunas,
  ehColunaLeituraApenas,
  proximaCelulaAposTab,
  derivarContextoInspecao,
  derivarTooltipTranscricao,
  calcularTemaLinhaComInspecao,
  calcularLinhaAncoraVisual,
  aplicarRevelacaoInspecao,
  indicesEnvolvidos,
  lerVarCSS,
  TEMA_INSPECAO_SAI,
  TEMA_INSPECAO_FICA,
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

/**
 * A partir de T7 (ADR `inspecao-proposta-conciliacao`, D16/D17), `detectarValorPendente`/
 * `detectarPagamentoRecebido` localizam a linha real em `lancamentos` e populam `alvo` com o
 * índice real dessa linha — `alvo: []` (contrato de T2/D10) foi revisto. `permanece` continua
 * sempre `[]` (papel único "sai", sem contraparte "fica").
 */
function avisoValorPendenteFake(overrides: Partial<Aviso> = {}): Aviso {
  return {
    id: 'aviso-2',
    tipo: 'proposta',
    origem: 'valor-pendente',
    mensagem: 'Valor pendente',
    alvo: ['2'],
    permanece: [],
    resumo: 'Valor pendente do mês anterior: R$ 100,00. É o que ficou em aberto na fatura passada.',
    estado: 'pendente',
    ...overrides,
  }
}

/** Análoga a `avisoValorPendenteFake`, para a origem `'pagamento-recebido'` (T7/D17). */
function avisoPagamentoRecebidoFake(overrides: Partial<Aviso> = {}): Aviso {
  return {
    id: 'aviso-3',
    tipo: 'proposta',
    origem: 'pagamento-recebido',
    mensagem: 'Pagamento recebido',
    alvo: ['2'],
    permanece: [],
    resumo: 'Pagamento recebido: R$ 100,00. É a quitação da fatura anterior.',
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

  // Correção 2026-08-16. Duas falhas empilhadas impediam o realce nessas origens: elas estavam
  // fora de ORIGENS_COM_EFEITO_GRID, e o `alvo` delas carrega `Lancamento.id` (não índice
  // posicional, como em conciliação), então a comparação nunca casaria mesmo depois de incluí-las.
  it('TL-FIX-01: contexto de transferência interna compara por id, não por índice', () => {
    const aviso = avisoConciliacaoFake({ origem: 'transferencia-interna', alvo: ['77'], permanece: [] })
    const contexto = derivarContextoInspecao(aviso)
    expect(contexto).toBeDefined()
    expect(contexto?.porId).toBe(true)
    // linha na posição 0 cujo lançamento tem id 77 → realce "sai"
    expect(calcularTemaLinhaComInspecao(0, contexto, 77)).toBe(TEMA_INSPECAO_SAI)
    // a mesma posição, com outro lançamento, não é realçada
    expect(calcularTemaLinhaComInspecao(0, contexto, 78)).toBeUndefined()
    // e o índice 77 sem o id correspondente também não — o que provava o bug antigo
    expect(calcularTemaLinhaComInspecao(77, contexto, 5)).toBeUndefined()
  })

  it('TL-FIX-02: aviso agregado de investimento realça todas as suas linhas por id', () => {
    const aviso = avisoConciliacaoFake({ origem: 'investimento', alvo: ['4', '11'], permanece: [] })
    const contexto = derivarContextoInspecao(aviso)
    expect(contexto?.porId).toBe(true)
    expect(calcularTemaLinhaComInspecao(0, contexto, 4)).toBe(TEMA_INSPECAO_SAI)
    expect(calcularTemaLinhaComInspecao(1, contexto, 11)).toBe(TEMA_INSPECAO_SAI)
    expect(calcularTemaLinhaComInspecao(2, contexto, 9)).toBeUndefined()
  })

  it('TL-FIX-03: conciliação segue comparando por índice posicional', () => {
    const contexto = derivarContextoInspecao(avisoConciliacaoFake())
    expect(contexto?.porId).toBe(false)
    // alvo ['2'] é posição 2 — o id do lançamento é irrelevante nesta convenção
    expect(calcularTemaLinhaComInspecao(2, contexto, 999)).toBe(TEMA_INSPECAO_SAI)
    expect(calcularTemaLinhaComInspecao(0, contexto, 999)).toBe(TEMA_INSPECAO_FICA)
  })

  it('TL-FIX-04: indicesEnvolvidos traduz id para posição nas origens id-based', () => {
    const aviso = avisoConciliacaoFake({ origem: 'investimento', alvo: ['77', '99'], permanece: [] })
    const lancamentos = [
      { id: 50 }, { id: 77 }, { id: 12 }, { id: 99 },
    ] as unknown as Parameters<typeof indicesEnvolvidos>[1]
    expect(indicesEnvolvidos(aviso, lancamentos)).toEqual([1, 3])
  })

  it('TL-FIX-05: id sem lançamento correspondente é descartado, nunca vira NaN', () => {
    const aviso = avisoConciliacaoFake({ origem: 'investimento', alvo: ['77', '404'], permanece: [] })
    const lancamentos = [{ id: 77 }] as unknown as Parameters<typeof indicesEnvolvidos>[1]
    expect(indicesEnvolvidos(aviso, lancamentos)).toEqual([0])
  })

  it('TL-FIX-06: origens que criam lançamentos (vr, rendimentos) seguem sem efeito no grid', () => {
    expect(derivarContextoInspecao(avisoConciliacaoFake({ origem: 'vr' }))).toBeUndefined()
    expect(derivarContextoInspecao(avisoConciliacaoFake({ origem: 'rendimentos' }))).toBeUndefined()
    expect(derivarContextoInspecao(avisoConciliacaoFake({ origem: 'desalinhamento-mes' }))).toBeUndefined()
  })

  it('TL-3 (revisão de D11 — T8): retorna alvoSet/permaneceSet(vazio) para origem valor-pendente', () => {
    const contexto = derivarContextoInspecao(avisoValorPendenteFake())
    expect(contexto).toBeDefined()
    expect(contexto?.alvoSet.has('2')).toBe(true)
    expect(contexto?.permaneceSet.size).toBe(0)
  })

  it('TL-T8-02: retorna alvoSet/permaneceSet(vazio) para origem pagamento-recebido', () => {
    const contexto = derivarContextoInspecao(avisoPagamentoRecebidoFake())
    expect(contexto).toBeDefined()
    expect(contexto?.alvoSet.has('2')).toBe(true)
    expect(contexto?.permaneceSet.size).toBe(0)
  })

  it('TL-T8-04 (regressão): retorna undefined para origem desconhecida', () => {
    expect(
      derivarContextoInspecao(avisoConciliacaoFake({ origem: 'outra-origem-qualquer' })),
    ).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// TL-4 a TL-8 — calcularTemaLinhaComInspecao
// ---------------------------------------------------------------------------

describe('calcularTemaLinhaComInspecao', () => {
  const contexto = derivarContextoInspecao(avisoConciliacaoFake())!

  it('TL-4: retorna TEMA_INSPECAO_SAI quando o índice real está em alvoSet', () => {
    expect(calcularTemaLinhaComInspecao(2, contexto)).toBe(TEMA_INSPECAO_SAI)
  })

  it('TL-5: retorna TEMA_INSPECAO_FICA quando o índice real está em permaneceSet', () => {
    expect(calcularTemaLinhaComInspecao(0, contexto)).toBe(TEMA_INSPECAO_FICA)
  })

  it('TL-7 (aposentadoria do realce permanente): sem contexto de inspeção, NENHUMA linha recebe tema', () => {
    // Antes desta mudança, linhas com natureza vazia, transferência própria ou
    // investimento ganhavam cor permanente. O realce agora significa só "esta linha
    // faz parte do aviso em inspeção", então fora da inspeção o tema é sempre undefined.
    expect(calcularTemaLinhaComInspecao(5, undefined)).toBeUndefined()
  })

  it('TL-8b: índice fora do contexto não recebe tema mesmo com inspeção ativa', () => {
    expect(calcularTemaLinhaComInspecao(99, contexto)).toBeUndefined()
  })


  it('TL-T8-05: retorna TEMA_INSPECAO_SAI para origem valor-pendente (revisão de D11 — T8)', () => {
    const contextoVP = derivarContextoInspecao(avisoValorPendenteFake())
    expect(calcularTemaLinhaComInspecao(2, contextoVP)).toBe(
      TEMA_INSPECAO_SAI,
    )
  })

  it('TL-T8-06: retorna TEMA_INSPECAO_SAI para origem pagamento-recebido (T8)', () => {
    const contextoPR = derivarContextoInspecao(avisoPagamentoRecebidoFake())
    expect(calcularTemaLinhaComInspecao(2, contextoPR)).toBe(
      TEMA_INSPECAO_SAI,
    )
  })

  it('TL-T8-11 (robustez a identidade, D7): linha fora do alvoSet de valor-pendente nunca ganha tema', () => {
    const contextoVP = derivarContextoInspecao(avisoValorPendenteFake())
    expect(calcularTemaLinhaComInspecao(99, contextoVP)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// TL-T8-07/08 — indicesEnvolvidos
// ---------------------------------------------------------------------------

describe('indicesEnvolvidos', () => {
  it('TL-T8-07: retorna só alvo (sem permanece) para valor-pendente/pagamento-recebido', () => {
    expect(indicesEnvolvidos(avisoValorPendenteFake())).toEqual([2])
    expect(indicesEnvolvidos(avisoPagamentoRecebidoFake())).toEqual([2])
  })

  it('TL-T8-08 (regressão): retorna a união alvo+permanece para conciliacao', () => {
    expect(indicesEnvolvidos(avisoConciliacaoFake({ alvo: ['2'], permanece: ['0', '1'] }))).toEqual(
      [2, 0, 1],
    )
  })

  it('TL-T8-08b (guarda): retorna [] para origem desconhecida/sem aviso', () => {
    expect(indicesEnvolvidos(undefined)).toEqual([])
    expect(indicesEnvolvidos(avisoConciliacaoFake({ origem: 'outra-origem' }))).toEqual([])
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

  it('TL-10 (revisão de D11 — T8): retorna a posição visual do alvo para origem valor-pendente', () => {
    const mapaIndiceVisualReal = [0, 1, 2]
    expect(calcularLinhaAncoraVisual(mapaIndiceVisualReal, avisoValorPendenteFake())).toBe(2)
  })

  it('TL-T8-09: retorna a posição visual do alvo para origem pagamento-recebido', () => {
    const mapaIndiceVisualReal = [0, 1, 2]
    expect(calcularLinhaAncoraVisual(mapaIndiceVisualReal, avisoPagamentoRecebidoFake())).toBe(2)
  })

  it('TL-10b (guarda): retorna undefined quando não há aviso em inspeção', () => {
    expect(calcularLinhaAncoraVisual([0, 1, 2], undefined)).toBeUndefined()
  })

  it('TL-T8-10 (regressão, guarda): retorna undefined para origem desconhecida', () => {
    const aviso = avisoConciliacaoFake({ origem: 'outra-origem', alvo: ['2'] })
    expect(calcularLinhaAncoraVisual([0, 1, 2], aviso)).toBeUndefined()
  })

  it('TL-39a-1: origem por id traduz o alvo antes de procurar a posição visual', () => {
    // `transferencia-interna` grava `Lancamento.id` em `alvo` (ver ORIGENS_ALVO_POR_ID). Sem a
    // tradução, `Number('7')` casaria com a POSIÇÃO 7 e o scroll iria para a linha errada.
    const lancamentos = [
      lancamentoFake({ id: 5, transcricao: 'Linha A' }), // índice real 0
      lancamentoFake({ id: 7, transcricao: 'Transferência' }), // índice real 1
      lancamentoFake({ id: 9, transcricao: 'Linha C' }), // índice real 2
    ]
    const aviso = avisoConciliacaoFake({ origem: 'transferencia-interna', alvo: ['7'] })

    expect(calcularLinhaAncoraVisual([0, 1, 2], aviso, lancamentos)).toBe(1)
  })

  it('TL-39a-2: origem por id continua achando a linha sob ordenação ativa', () => {
    const lancamentos = [
      lancamentoFake({ id: 5, transcricao: 'Linha A' }),
      lancamentoFake({ id: 7, transcricao: 'Aplicação' }),
      lancamentoFake({ id: 9, transcricao: 'Linha C' }),
    ]
    const aviso = avisoConciliacaoFake({ origem: 'investimento', alvo: ['7'] })

    // Ordenação ativa: posição visual 0 -> índice real 2, posição 2 -> índice real 1.
    expect(calcularLinhaAncoraVisual([2, 0, 1], aviso, lancamentos)).toBe(2)
  })

  it('TL-39a-3: origem por id sem lançamento correspondente devolve undefined', () => {
    const lancamentos = [lancamentoFake({ id: 5, transcricao: 'Linha A' })]
    const aviso = avisoConciliacaoFake({ origem: 'investimento', alvo: ['404'] })

    expect(calcularLinhaAncoraVisual([0], aviso, lancamentos)).toBeUndefined()
  })

  it('TL-39a-4: origem posicional ignora os lançamentos e segue usando o índice', () => {
    const lancamentos = [
      lancamentoFake({ id: 5, transcricao: 'Linha A' }),
      lancamentoFake({ id: 7, transcricao: 'Linha B' }),
      lancamentoFake({ id: 9, transcricao: 'Pagamento' }),
    ]
    const aviso = avisoConciliacaoFake({ alvo: ['2'] })

    expect(calcularLinhaAncoraVisual([0, 1, 2], aviso, lancamentos)).toBe(2)
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

  it('TL-B9-01 (regressão, D9): anexa linhasOcultas ao FINAL de lancamentosVisiveis, sem suspender filtro/ordenação', () => {
    // lancamentosVisiveis já reflete filtro+ordenação ativos: só os índices reais 2 e 0,
    // NESSA ordem (ordenação ativa que não corresponde à ordem natural dos índices).
    const lancamentosVisiveis = [lancamentos[2], lancamentos[0]]
    const mapaIndiceVisualReal = [2, 0]
    // Índice real 1 é o único envolvido ausente do filtro ativo.
    const indicesReaisEnvolvidos = [0, 1, 2]

    const resultado = aplicarRevelacaoInspecao(
      lancamentos,
      lancamentosVisiveis,
      mapaIndiceVisualReal,
      indicesReaisEnvolvidos,
    )

    // A ordem/filtro de lancamentosVisiveis não é alterada — os 2 primeiros elementos do
    // resultado são exatamente lancamentosVisiveis, na mesma ordem (nunca suspensos).
    expect(resultado.linhas.slice(0, lancamentosVisiveis.length)).toEqual(lancamentosVisiveis)
    // A linha oculta (índice real 1) é ANEXADA ao final, não inserida no meio nem no início.
    expect(resultado.linhas).toEqual([...lancamentosVisiveis, lancamentos[1]])
    expect(resultado.mapa).toEqual([...mapaIndiceVisualReal, 1])
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
      calcularTemaLinhaComInspecao(indiceReal, contexto),
    )

    expect(mapa).toEqual([0, 2, 1])
    expect(temasPorLinha[0]).toBe(TEMA_INSPECAO_FICA) // real 0
    expect(temasPorLinha[1]).toBe(TEMA_INSPECAO_SAI) // real 2
    expect(temasPorLinha[2]).toBe(TEMA_INSPECAO_FICA) // real 1, revelado

    expect(calcularLinhaAncoraVisual(mapa, aviso)).toBe(1)
  })

  it('TL-14 (revisão de D11 — T8): valor-pendente em inspeção destaca "sai" e revela a linha oculta', () => {
    // Linha-alvo (índice real 1) oculta pelo filtro ativo — só 0 e 2 estão visíveis.
    const aviso = avisoValorPendenteFake({ alvo: ['1'] })

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

    // A linha oculta foi revelada (anexada ao final).
    expect(mapa).toEqual([0, 2, 1])
    expect(linhas).toContain(lancamentos[1])

    const temasPorLinha = mapa.map((indiceReal, posicaoVisual) =>
      calcularTemaLinhaComInspecao(indiceReal, contexto),
    )
    expect(temasPorLinha[0]).toBeUndefined() // real 0, fora do alvo
    expect(temasPorLinha[1]).toBeUndefined() // real 2, fora do alvo
    expect(temasPorLinha[2]).toBe(TEMA_INSPECAO_SAI) // real 1, revelado — papel único "sai"
    // Nenhuma linha ganha o papel "fica" — permanece[] é sempre vazio para esta origem.
    expect(temasPorLinha).not.toContain(TEMA_INSPECAO_FICA)

    expect(calcularLinhaAncoraVisual(mapa, aviso)).toBe(2)
  })

  it('TL-T8-12: pagamento-recebido em inspeção destaca "sai" na linha correta (sem revelação necessária)', () => {
    const aviso = avisoPagamentoRecebidoFake({ alvo: ['2'] })

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

    expect(mapa).toEqual([0, 2])

    const temasPorLinha = mapa.map((indiceReal, posicaoVisual) =>
      calcularTemaLinhaComInspecao(indiceReal, contexto),
    )
    expect(temasPorLinha[0]).toBeUndefined()
    expect(temasPorLinha[1]).toBe(TEMA_INSPECAO_SAI)

    expect(calcularLinhaAncoraVisual(mapa, aviso)).toBe(1)
  })

  it('TL-T8-13 (regressão): conciliação em inspeção continua com os 2 papéis (sai+fica) inalterada', () => {
    const aviso = avisoConciliacaoFake({ alvo: ['2'], permanece: ['0', '1'] })

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
      calcularTemaLinhaComInspecao(indiceReal, contexto),
    )

    expect(mapa).toEqual([0, 2, 1])
    expect(temasPorLinha[0]).toBe(TEMA_INSPECAO_FICA)
    expect(temasPorLinha[1]).toBe(TEMA_INSPECAO_SAI)
    expect(temasPorLinha[2]).toBe(TEMA_INSPECAO_FICA)
    expect(calcularLinhaAncoraVisual(mapa, aviso)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Test List — Task T2 (re-tematização: TEMA_GRID e os 5 overrides leem
// variáveis CSS de :root, definidas em T1, em vez de hex hardcoded)
//
// TL-15: lerVarCSS retorna o valor computado quando a variável está definida
//        no elemento raiz (leitura real da CSSOM).
// TL-16: lerVarCSS retorna string vazia (sem lançar) quando a variável não
//        está definida — contrato do fallback em jsdom.
// TL-17 a TL-21: TEMA_ERRO/TEMA_TRANSFERENCIA/TEMA_INVESTIMENTO/
//        TEMA_INSPECAO_SAI/TEMA_INSPECAO_FICA refletem, via `.bgCell`, a
//        variável CSS correspondente quando definida em document.documentElement.
// TL-22: sem a variável definida, `.bgCell` é string vazia — nunca cai para
//        um hex hardcoded como substituto.
// TL-23: identidade referencial dos temas preservada (regressão dos testes
//        de precedência via `toBe` em calcularTemaLinhaComInspecao).
// ---------------------------------------------------------------------------

describe('lerVarCSS (Task T2)', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--teste-cor-t2')
  })

  it('TL-15: retorna o valor computado quando a variável está definida no elemento raiz', () => {
    document.documentElement.style.setProperty('--teste-cor-t2', '#123456')
    expect(lerVarCSS('--teste-cor-t2')).toBe('#123456')
  })

  it('TL-16: retorna string vazia (sem lançar) quando a variável não está definida', () => {
    expect(lerVarCSS('--variavel-inexistente-t2')).toBe('')
  })
})

describe('temas de linha leem variáveis CSS de :root (Task T2)', () => {
  // Os temas `--linha-*` (atenção/transferência/investimento) saíram junto com o
  // realce permanente aposentado em 2026-08-09; restaram só os da inspeção.
  const VARS_TEMA = ['--insp-sai-bg', '--insp-fica-bg']

  afterEach(() => {
    for (const nome of VARS_TEMA) document.documentElement.style.removeProperty(nome)
  })

  // Fix de contraste (2026-08-04): o fundo da linha usa a variante PÁLIDA -bg
  // (legível), não a saturada `--insp-sai`/`--insp-fica` (reservada a acentos).
  it('TL-20: TEMA_INSPECAO_SAI.bgCell reflete --insp-sai-bg (fundo pálido legível)', () => {
    document.documentElement.style.setProperty('--insp-sai-bg', '#dddddd')
    expect(TEMA_INSPECAO_SAI.bgCell).toBe('#dddddd')
  })

  it('TL-21: TEMA_INSPECAO_FICA.bgCell reflete --insp-fica-bg (fundo pálido legível)', () => {
    document.documentElement.style.setProperty('--insp-fica-bg', '#eeeeee')
    expect(TEMA_INSPECAO_FICA.bgCell).toBe('#eeeeee')
  })

  it('TL-22 (contrato do fallback): sem a variável definida, bgCell é string vazia — nunca um hex hardcoded substituto', () => {
    expect(TEMA_INSPECAO_SAI.bgCell).toBe('')
    expect(TEMA_INSPECAO_FICA.bgCell).toBe('')
  })

  it('TL-23 (regressão, identidade): temas de inspeção continuam referências estáveis usadas por calcularTemaLinhaComInspecao', () => {
    const contexto = derivarContextoInspecao(avisoConciliacaoFake())!
    expect(calcularTemaLinhaComInspecao(2, contexto)).toBe(TEMA_INSPECAO_SAI)
  })
})

/**
 * Tooltip da coluna Transcrição — a célula trunca o texto no canvas e o usuário
 * precisava ver a transcrição inteira. `derivarTooltipTranscricao` é a parte pura:
 * decide SE há tooltip e ONDE ancorá-lo, a partir do item sob o cursor.
 *
 * TL-TT-1: célula de Transcrição com texto → tooltip ancorado nos bounds da célula
 * TL-TT-2: outra coluna → null
 * TL-TT-3: cabeçalho (row < 0) → null
 * TL-TT-4: transcrição vazia / só espaços → null
 * TL-TT-5: linha inexistente → null
 * TL-TT-6: bounds ausente → null
 */
describe('derivarTooltipTranscricao', () => {
  const bounds = { x: 120, y: 300, width: 320, height: 40 }
  const lancamentos = [
    lancamentoFake({ transcricao: 'PIX ENVIADO CP :12345678 FULANO DE TAL LTDA 07/07' }),
    lancamentoFake({ transcricao: '   ' }),
  ]

  it('TL-TT-1: célula de Transcrição com texto devolve o texto integral ancorado na célula', () => {
    const t = derivarTooltipTranscricao([2, 0], bounds, lancamentos)
    expect(t).not.toBeNull()
    expect(t!.texto).toBe('PIX ENVIADO CP :12345678 FULANO DE TAL LTDA 07/07')
    expect(t!.x).toBe(120)
    expect(t!.y).toBe(300)
    expect(t!.alturaCelula).toBe(40)
  })

  it('TL-TT-2: qualquer outra coluna não gera tooltip', () => {
    for (const col of [0, 1, 3, 4, 5, 6]) {
      expect(derivarTooltipTranscricao([col, 0], bounds, lancamentos)).toBeNull()
    }
  })

  it('TL-TT-3: cabeçalho (row negativo) não gera tooltip', () => {
    expect(derivarTooltipTranscricao([2, -1], bounds, lancamentos)).toBeNull()
  })

  it('TL-TT-4: transcrição só com espaços não gera tooltip', () => {
    expect(derivarTooltipTranscricao([2, 1], bounds, lancamentos)).toBeNull()
  })

  it('TL-TT-5: linha fora da lista não gera tooltip', () => {
    expect(derivarTooltipTranscricao([2, 99], bounds, lancamentos)).toBeNull()
  })

  it('TL-TT-6: sem bounds não há onde ancorar → null', () => {
    expect(derivarTooltipTranscricao([2, 0], undefined, lancamentos)).toBeNull()
  })
})
