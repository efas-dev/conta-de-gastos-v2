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
  calcularTemaLinhaComInspecao,
  calcularLinhaAncoraVisual,
  aplicarRevelacaoInspecao,
  indicesEnvolvidos,
  lerVarCSS,
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
    resumo: 'Valor pendente do mês anterior: R$ 100,00 — resíduo da fatura passada, não é gasto do mês',
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
    resumo: 'Pagamento recebido: R$ 100,00 — crédito referente à quitação da fatura anterior, não é gasto do mês',
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

  it('TL-18 (isenção): linha de proposta de remoção (origemEspecial) com natureza vazia NÃO recebe TEMA_ERRO fora da inspeção', () => {
    // valor-pendente/pagamento-recebido entram na grid sem natureza; não devem
    // destacar em pêssego permanentemente — só na inspeção do respectivo aviso.
    const lValorPendente = lancamentoFake({ natureza: '', origemEspecial: 'valor-pendente' })
    expect(
      calcularTemaLinhaComInspecao(lValorPendente, 5, naturezasValidas, undefined),
    ).toBeUndefined()

    const lPagamento = lancamentoFake({ natureza: '', origemEspecial: 'pagamento-recebido' })
    expect(
      calcularTemaLinhaComInspecao(lPagamento, 5, naturezasValidas, undefined),
    ).toBeUndefined()

    // Durante a inspeção (índice no alvoSet), a mesma linha destaca em vermelho vivo.
    expect(calcularTemaLinhaComInspecao(lValorPendente, 2, naturezasValidas, contexto)).toBe(
      TEMA_INSPECAO_SAI,
    )
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

  it('TL-T8-05: retorna TEMA_INSPECAO_SAI para origem valor-pendente (revisão de D11 — T8)', () => {
    const contextoVP = derivarContextoInspecao(avisoValorPendenteFake())
    const l = lancamentoFake({ natureza: 'ALM' })
    expect(calcularTemaLinhaComInspecao(l, 2, naturezasValidas, contextoVP)).toBe(
      TEMA_INSPECAO_SAI,
    )
  })

  it('TL-T8-06: retorna TEMA_INSPECAO_SAI para origem pagamento-recebido (T8)', () => {
    const contextoPR = derivarContextoInspecao(avisoPagamentoRecebidoFake())
    const l = lancamentoFake({ natureza: 'ALM' })
    expect(calcularTemaLinhaComInspecao(l, 2, naturezasValidas, contextoPR)).toBe(
      TEMA_INSPECAO_SAI,
    )
  })

  it('TL-T8-11 (robustez a identidade, D7): linha fora do alvoSet de valor-pendente nunca ganha tema', () => {
    const contextoVP = derivarContextoInspecao(avisoValorPendenteFake())
    const l = lancamentoFake({ natureza: 'ALM' })
    expect(calcularTemaLinhaComInspecao(l, 99, naturezasValidas, contextoVP)).toBeUndefined()
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
      calcularTemaLinhaComInspecao(linhas[posicaoVisual]!, indiceReal, naturezasValidas, contexto),
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
      calcularTemaLinhaComInspecao(linhas[posicaoVisual]!, indiceReal, naturezasValidas, contexto),
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
      calcularTemaLinhaComInspecao(linhas[posicaoVisual]!, indiceReal, naturezasValidas, contexto),
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
  const VARS_TEMA = [
    '--linha-atencao',
    '--linha-transferencia',
    '--linha-investimento',
    '--insp-sai',
    '--insp-fica',
  ]

  afterEach(() => {
    for (const nome of VARS_TEMA) document.documentElement.style.removeProperty(nome)
  })

  it('TL-17: TEMA_ERRO.bgCell reflete --linha-atencao quando definida', () => {
    document.documentElement.style.setProperty('--linha-atencao', '#aaaaaa')
    expect(TEMA_ERRO.bgCell).toBe('#aaaaaa')
  })

  it('TL-18: TEMA_TRANSFERENCIA.bgCell reflete --linha-transferencia quando definida', () => {
    document.documentElement.style.setProperty('--linha-transferencia', '#bbbbbb')
    expect(TEMA_TRANSFERENCIA.bgCell).toBe('#bbbbbb')
  })

  it('TL-19: TEMA_INVESTIMENTO.bgCell reflete --linha-investimento quando definida', () => {
    document.documentElement.style.setProperty('--linha-investimento', '#cccccc')
    expect(TEMA_INVESTIMENTO.bgCell).toBe('#cccccc')
  })

  it('TL-20: TEMA_INSPECAO_SAI.bgCell reflete --insp-sai quando definida', () => {
    document.documentElement.style.setProperty('--insp-sai', '#dddddd')
    expect(TEMA_INSPECAO_SAI.bgCell).toBe('#dddddd')
  })

  it('TL-21: TEMA_INSPECAO_FICA.bgCell reflete --insp-fica quando definida', () => {
    document.documentElement.style.setProperty('--insp-fica', '#eeeeee')
    expect(TEMA_INSPECAO_FICA.bgCell).toBe('#eeeeee')
  })

  it('TL-22 (contrato do fallback): sem a variável definida, bgCell é string vazia — nunca um hex hardcoded substituto', () => {
    expect(TEMA_ERRO.bgCell).toBe('')
    expect(TEMA_TRANSFERENCIA.bgCell).toBe('')
    expect(TEMA_INVESTIMENTO.bgCell).toBe('')
    expect(TEMA_INSPECAO_SAI.bgCell).toBe('')
    expect(TEMA_INSPECAO_FICA.bgCell).toBe('')
  })

  it('TL-23 (regressão, identidade): temas de inspeção continuam referências estáveis usadas por calcularTemaLinhaComInspecao', () => {
    const naturezasValidas = ['ALM']
    const contexto = derivarContextoInspecao(avisoConciliacaoFake())!
    const l = lancamentoFake({ natureza: 'ALM' })
    expect(calcularTemaLinhaComInspecao(l, 2, naturezasValidas, contexto)).toBe(TEMA_INSPECAO_SAI)
  })
})
