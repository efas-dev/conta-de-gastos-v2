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
// Fixture reaproveitada de T2 (`fatura_nubank_avisos_pendentes.csv`): dados sintéticos,
// sem qualquer valor de data_sample/ (Decisão 7 do ADR avisos-acionaveis).

const FIXTURES = join(__dirname, '../../parsers/__tests__/fixtures')

function lerFixture(nome: string): string {
  return readFileSync(join(FIXTURES, nome), 'utf-8')
}

describe('produzirLancamentos — pipeline completo com fatura sintética (integração T5)', () => {
  const csvAvisosPendentes = lerFixture('fatura_nubank_avisos_pendentes.csv')

  it('despacha um aviso de proposta de valor pendente via adicionarAvisos, sem chamar detectarConciliacao (sem extrato)', () => {
    const avisosCapturados: Aviso[] = []

    const resultado = produzirLancamentos(csvAvisosPendentes, [], 'ES', undefined, [], (avisos) => {
      avisosCapturados.push(...avisos)
    })

    expect(avisosCapturados).toHaveLength(1)
    // Task T2 do spec `inspecao-proposta-conciliacao` (D10 do ADR): valor-pendente
    // promovido de `tipo:'informativo'` para `tipo:'proposta'` acionável, `alvo: []`.
    expect(avisosCapturados[0]).toMatchObject({
      tipo: 'proposta',
      origem: 'valor-pendente',
      alvo: [],
      estado: 'pendente',
    })
    expect(avisosCapturados[0].resumo).toBeUndefined()
    expect(avisosCapturados[0].mensagem).toMatch(/valor pendente do mês anterior/i)

    // "Pagamento recebido" e "Valor pendente" saem em excluidosPendentes — não entram
    // em lancamentos; multa e IOF de atraso permanecem (regressão de T2).
    const transcricoes = resultado.lancamentos.map((l) => l.transcricao)
    expect(transcricoes).not.toContain('Valor pendente do mês anterior')
    expect(transcricoes).not.toContain('Pagamento recebido')
    expect(transcricoes).toContain('Multa por fatura atrasada')
    expect(transcricoes).toContain('IOF por fatura atrasada')
  })

  it('inclui também aviso de conciliação quando lancamentosExtrato conciliável é fornecido', () => {
    const avisosCapturados: Aviso[] = []

    // Somatório da fatura sintética (multa 15.00 + IOF 8.50 + Loja Exemplo 60.00) = 83.50.
    // Extrato com um "Pagamento de fatura" de -83.50 concilia dentro da tolerância de R$ 0,05.
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
    expect(origens).toContain('conciliacao')

    const avisoConciliacao = avisosCapturados.find((a) => a.origem === 'conciliacao')
    expect(avisoConciliacao?.tipo).toBe('proposta')
  })
})
