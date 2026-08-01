// ADR: see Docs/specs/avisos-acionaveis.adr.md

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { produzirLancamentos } from '../PipelineState'
import type { Aviso } from '../../types'

// Teste de integração — Task 5 (DoD: "teste de integração cobrindo o pipeline completo
// com fatura sintética"). Sem mocks de `detectar`, `enriquecerLancamento` nem das
// detecções de `src/dominio/deteccoes.ts` (T3, já mergeada) — exercita o caminho real
// parser → enriquecimento → detecções → callback `adicionarAvisos`.
//
// Reconciliado na Task T9 do spec `inspecao-proposta-conciliacao` (D18): o rewire de
// `produzirLancamentos` (T9) passou a chamar `detectarValorPendente`/`detectarPagamentoRecebido`
// sobre `lancamentosComFlags` em vez de `excluidosPendentes` — desde T6/T7 (emenda pós-inspeção,
// D16/D17) o parser não exclui mais essas linhas: elas entram em `lancamentos` como
// lançamentos normais e viram propostas de remoção acionáveis (`alvo` aponta o índice real).
//
// Fixture reaproveitada de T2 (`fatura_nubank_avisos_pendentes.csv`): dados sintéticos,
// sem qualquer valor de data_sample/ (Decisão 7 do ADR avisos-acionaveis).

const FIXTURES = join(__dirname, '../../parsers/__tests__/fixtures')

function lerFixture(nome: string): string {
  return readFileSync(join(FIXTURES, nome), 'utf-8')
}

describe('produzirLancamentos — pipeline completo com fatura sintética (integração T5/T9)', () => {
  const csvAvisosPendentes = lerFixture('fatura_nubank_avisos_pendentes.csv')

  it('despacha propostas de valor-pendente e pagamento-recebido via adicionarAvisos, sem chamar detectarConciliacao (sem extrato)', () => {
    const avisosCapturados: Aviso[] = []

    const resultado = produzirLancamentos(csvAvisosPendentes, [], 'ES', undefined, [], (avisos) => {
      avisosCapturados.push(...avisos)
    })

    // Task T7 do spec `inspecao-proposta-conciliacao` (D16/D17): valor-pendente e
    // pagamento-recebido viram propostas de remoção acionáveis, uma para cada linha
    // marcada com `origemEspecial` na fatura sintética.
    const origens = avisosCapturados.map((a) => a.origem)
    expect(origens).toContain('valor-pendente')
    expect(origens).toContain('pagamento-recebido')
    expect(avisosCapturados).toHaveLength(2)

    const avisoValorPendente = avisosCapturados.find((a) => a.origem === 'valor-pendente')
    expect(avisoValorPendente).toMatchObject({ tipo: 'proposta', estado: 'pendente' })
    expect(avisoValorPendente?.alvo).not.toEqual([]) // aponta o índice real da linha (D16)
    expect(avisoValorPendente?.resumo).toBeDefined()
    expect(avisoValorPendente?.mensagem).toMatch(/valor pendente do mês anterior/i)

    const avisoPagamentoRecebido = avisosCapturados.find((a) => a.origem === 'pagamento-recebido')
    expect(avisoPagamentoRecebido).toMatchObject({ tipo: 'proposta', estado: 'pendente' })
    expect(avisoPagamentoRecebido?.alvo).not.toEqual([])

    // Rewire T9 (D18): a linha deixou de ser excluída no parse (T6) — "Pagamento
    // recebido" e "Valor pendente" agora entram em `lancamentos` como lançamentos
    // normais, junto com multa e IOF de atraso.
    const transcricoes = resultado.lancamentos.map((l) => l.transcricao)
    expect(transcricoes).toContain('Valor pendente do mês anterior')
    expect(transcricoes).toContain('Pagamento recebido')
    expect(transcricoes).toContain('Multa por fatura atrasada')
    expect(transcricoes).toContain('IOF por fatura atrasada')
  })

  it('inclui também aviso de conciliação quando lancamentosExtrato conciliável é fornecido', () => {
    const avisosCapturados: Aviso[] = []

    // Somatório do subconjunto multa 15.00 + IOF 8.50 + Loja Exemplo 60.00 = 83.50 —
    // `detectarConciliacao` acha esse casamento via fallback de subconjunto mesmo com
    // "Pagamento recebido"/"Valor pendente" presentes em `lancamentosComFlags` (o
    // casamento do somatório TOTAL não bate, cai no fallback de subset-sum que
    // encontra exatamente o trio multa+IOF+loja — comportamento herdado de T5,
        // fora do escopo de T9: nenhuma mudança em `detectarConciliacao`).
    const lancamentosExtrato = [
      {
        fonte: 'extrato',
        data: '2024-06-10',
        transcricao: 'Pagamento de fatura',
        valor: -83.5,
        iniciais: '',
        natureza: '',
        descricao: '',
      },
    ]

    produzirLancamentos(csvAvisosPendentes, [], 'ES', undefined, lancamentosExtrato, (avisos) => {
      avisosCapturados.push(...avisos)
    })

    const origens = avisosCapturados.map((a) => a.origem)
    expect(origens).toContain('valor-pendente')
    expect(origens).toContain('pagamento-recebido')
    expect(origens).toContain('conciliacao')

    const avisoConciliacao = avisosCapturados.find((a) => a.origem === 'conciliacao')
    expect(avisoConciliacao?.tipo).toBe('proposta')
  })

  it('inclui um Aviso informativo dispensável de "linhas ignoradas" quando o CSV tem linha malformada (T9, D18)', () => {
    // Fixture com fatura sintética válida + uma linha malformada (menos de 3 colunas)
    // acrescentada manualmente — reaproveita o mesmo padrão de
    // `fatura_nubank.test.ts` (TL-T4-13: "linha com menos de 3 colunas → linhasIgnoradas === 1").
    const csvComLinhaMalformada = `${csvAvisosPendentes}\n2024-06-06,incompleta`

    const avisosCapturados: Aviso[] = []
    const resultado = produzirLancamentos(csvComLinhaMalformada, [], 'ES', undefined, [], (avisos) => {
      avisosCapturados.push(...avisos)
    })

    expect(resultado.avisos).toHaveLength(1)
    expect(resultado.avisos[0]).toMatch(/1 linha ignorada/i)

    const avisoLinhasIgnoradas = avisosCapturados.find((a) => a.origem === 'linhas-ignoradas')
    expect(avisoLinhasIgnoradas).toMatchObject({ tipo: 'informativo', estado: 'pendente' })
    expect(avisoLinhasIgnoradas?.mensagem).toMatch(/1 linha ignorada/i)
  })
})
