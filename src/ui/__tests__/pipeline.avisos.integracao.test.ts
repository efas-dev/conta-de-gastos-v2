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
// Revisado na Task T11 (correção de bug multi-arquivo achado na validação visual): as duas
// detecções deixaram de rodar dentro de `produzirLancamentos` — que processa a sublista
// per-arquivo, gerando `alvo` relativo a ela, nunca ao array total — e passaram para
// `App.tsx` (`handleProduzir`), que as roda sobre `todosLancamentos` já concatenado (mesmo
// padrão de `detectarConciliacao`). `produzirLancamentos` agora só despacha `detectarConciliacao`
// (quando `lancamentosExtrato` é fornecido) e os avisos informativos migrados — ver
// `App.valorPendenteOffset.test.tsx` para a cobertura do fluxo real via `App.tsx`.
//
// Fixture reaproveitada de T2 (`fatura_nubank_avisos_pendentes.csv`): dados sintéticos,
// sem qualquer valor de data_sample/ (Decisão 7 do ADR avisos-acionaveis).

const FIXTURES = join(__dirname, '../../parsers/__tests__/fixtures')

function lerFixture(nome: string): string {
  return readFileSync(join(FIXTURES, nome), 'utf-8')
}

describe('produzirLancamentos — pipeline completo com fatura sintética (integração T5/T9)', () => {
  const csvAvisosPendentes = lerFixture('fatura_nubank_avisos_pendentes.csv')

  it('NÃO despacha propostas de valor-pendente/pagamento-recebido (rewire T11) — só entrega as linhas em resultado.lancamentos', () => {
    const avisosCapturados: Aviso[] = []

    const resultado = produzirLancamentos(csvAvisosPendentes, [], 'ES', undefined, [], (avisos) => {
      avisosCapturados.push(...avisos)
    })

    // Task T11 do spec `inspecao-proposta-conciliacao`: a detecção de valor-pendente/
    // pagamento-recebido saiu de `produzirLancamentos` (que processa a sublista
    // per-arquivo, e geraria `alvo` relativo a ela) — o call-site real
    // (`App.tsx`/`handleProduzir`) agora as detecta sobre o array total já concatenado.
    const origens = avisosCapturados.map((a) => a.origem)
    expect(origens).not.toContain('valor-pendente')
    expect(origens).not.toContain('pagamento-recebido')
    expect(avisosCapturados).toHaveLength(0)

    // Rewire T6 (D16/D17): a linha deixou de ser excluída no parse — "Pagamento
    // recebido" e "Valor pendente" continuam entrando em `lancamentos` como
    // lançamentos normais, junto com multa e IOF de atraso; só a EMISSÃO da proposta
    // saiu daqui.
    const transcricoes = resultado.lancamentos.map((l) => l.transcricao)
    expect(transcricoes).toContain('Valor pendente do mês anterior')
    expect(transcricoes).toContain('Pagamento recebido')
    expect(transcricoes).toContain('Multa por fatura atrasada')
    expect(transcricoes).toContain('IOF por fatura atrasada')
  })

  it('inclui aviso de conciliação quando lancamentosExtrato conciliável é fornecido (detectarValorPendente/PagamentoRecebido seguem fora daqui, T11)', () => {
    const avisosCapturados: Aviso[] = []

    // Somatório do subconjunto multa 15.00 + IOF 8.50 + Loja Exemplo 60.00 = 83.50 —
    // `detectarConciliacao` acha esse casamento via fallback de subconjunto mesmo com
    // "Pagamento recebido"/"Valor pendente" presentes em `lancamentosComFlags` (o
    // casamento do somatório TOTAL não bate, cai no fallback de subset-sum que
    // encontra exatamente o trio multa+IOF+loja — comportamento herdado de T5,
        // fora do escopo de T9/T11: nenhuma mudança em `detectarConciliacao`).
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
    expect(origens).not.toContain('valor-pendente')
    expect(origens).not.toContain('pagamento-recebido')
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
