// ADR: see spec/vr-despesas.adr.md

import { describe, it, expect } from 'vitest'
import { gerarLancamentosVR } from '../vr'
import { detectores, orquestrarDeteccao } from '../registry'
import { detectarDesalinhamentoMes } from '../mes'
import { atribuirIds, reiniciarContadorIds } from '../../parsers/idSerial'
import type { Lancamento } from '../../types'

function lancamento(overrides: Partial<Lancamento> = {}): Lancamento {
  return {
    id: 1,
    fonte: 'Nubank',
    data: '2026-06-01',
    transcricao: 'Compra teste',
    valor: -10,
    iniciais: 'AB',
    natureza: '',
    descricao: '',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Task 8 (spec vr-despesas) — integração ponta a ponta: lote REAL de
// `gerarLancamentosVR` (T5) atravessando o pipeline REAL de detecção
// (`orquestrarDeteccao`/`detectores`, T2/T4) e o cross-check de desalinhamento
// (T2). Diferente de `registry.test.ts` TL-29/TL-30 e `mes.test.ts` TL-25..28
// (que usam fixtures `form_vr` escritas à mão), aqui os lançamentos vêm de
// `gerarLancamentosVR` real, com ids reais atribuídos por `atribuirIds` — o
// mesmo mecanismo que `avisosSlice.aplicar` usa em produção.
// ---------------------------------------------------------------------------

describe('Task 8 — form_vr real (gerarLancamentosVR) atravessando o pipeline de detecção', () => {
  it('TL-I1: lote real de VR misturado a fatura/extrato reais não entra em fontesFatura/fontesExtrato e não estoura orquestrarDeteccao', () => {
    reiniciarContadorIds()

    const faturaA = lancamento({ fonte: 'fatura_nubank_cc', data: '2026-06-05', transcricao: 'Item A', valor: -100 })
    const extratoPagamento = lancamento({ fonte: 'extrato_itau', data: '2026-06-15', transcricao: 'Pagamento de fatura', valor: -100 })
    const [faturaComId, extratoComId] = atribuirIds([faturaA, extratoPagamento].map(({ id: _id, ...resto }) => resto))

    const despesas = [
      { valor: 30, natureza: 'Alimentação', descricao: 'Almoço' },
      { valor: 20, natureza: 'Transporte', descricao: 'Uber' },
    ]
    const loteVRSemId = gerarLancamentosVR(despesas, '2026-06')
    const loteVR = atribuirIds(loteVRSemId)

    const todosLancamentos = [faturaComId, extratoComId, ...loteVR]
    const mesRef = '2026-07'

    expect(() => orquestrarDeteccao(todosLancamentos, detectores, undefined, mesRef)).not.toThrow()

    const avisos = orquestrarDeteccao(todosLancamentos, detectores, undefined, mesRef)
    const avisoConciliacao = avisos.find((a) => a.origem === 'conciliacao' && a.tipo === 'proposta')

    expect(avisoConciliacao).toBeDefined()
    const idsVR = new Set(loteVR.map((l) => String(l.id)))
    for (const idAlvo of avisoConciliacao?.alvo ?? []) {
      expect(idsVR.has(idAlvo)).toBe(false)
    }
    for (const idPermanece of avisoConciliacao?.permanece ?? []) {
      expect(idsVR.has(idPermanece)).toBe(false)
    }
  })

  it('TL-I2: lote real de VR sozinho (sem fatura/extrato) não produz aviso de conciliação e não estoura', () => {
    reiniciarContadorIds()

    const despesas = [{ valor: 45, natureza: 'Saúde', descricao: 'Farmácia' }]
    const loteVR = atribuirIds(gerarLancamentosVR(despesas, '2026-06'))

    expect(() => orquestrarDeteccao(loteVR, detectores, undefined, '2026-06')).not.toThrow()

    const avisos = orquestrarDeteccao(loteVR, detectores, undefined, '2026-06')
    expect(avisos.some((a) => a.origem === 'conciliacao')).toBe(false)
  })

  it('TL-I3: detectarDesalinhamentoMes ignora a fonte form_vr de um lote real, mesmo com mesRef deliberadamente divergente', () => {
    reiniciarContadorIds()

    const despesas = [{ valor: 12, natureza: 'Lazer', descricao: 'Cinema' }]
    // mesRef do lote gerado é 2026-06 (data automática = último dia); testamos com um mesRef bem
    // diferente para garantir que a heurística por data nunca chega a rodar.
    const loteVR = atribuirIds(gerarLancamentosVR(despesas, '2026-06'))

    expect(detectarDesalinhamentoMes('form_vr', loteVR, '2020-01')).toEqual([])
  })

  it('TL-I4: orquestrarDeteccao com um lote real de VR presente ainda produz exatamente 1 aviso origem "vr", sem interferir nos demais', () => {
    reiniciarContadorIds()

    const faturaA = lancamento({ fonte: 'fatura_nubank_cc', data: '2026-06-05', valor: -80 })
    const [faturaComId] = atribuirIds([faturaA].map(({ id: _id, ...resto }) => resto))
    const loteVR = atribuirIds(gerarLancamentosVR([{ valor: 10, natureza: 'X', descricao: 'Y' }], '2026-06'))

    const avisos = orquestrarDeteccao([faturaComId, ...loteVR], detectores, undefined, '2026-07')

    const avisosVR = avisos.filter((a) => a.origem === 'vr')
    expect(avisosVR).toHaveLength(1)
    expect(avisosVR[0].tipo).toBe('proposta')
    expect(avisosVR[0].estado).toBe('pendente')
  })
})
