// ADR: see spec/vr-despesas.adr.md

import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../appStore'
import { estadoInicialAvisos } from '../avisosSlice'
import { detectarVR, gerarLancamentosVR } from '../../../dominio/vr'
import { atribuirIds, reiniciarContadorIds } from '../../../parsers/idSerial'
import type { Aviso, Lancamento, Mutacao } from '../../../types'

// ---------------------------------------------------------------------------
// Task 8 (spec vr-despesas) — integração ponta a ponta do verbo 'adicionar':
// aviso REAL de `detectarVR` (T4), lançamentos REAIS de `gerarLancamentosVR`
// (T5), aplicados/desfeitos pelo `avisosSlice` REAL (T3) via `useAppStore`
// (Zustand real, não mock). Diferente de `avisosSlice.test.ts`
// ("mutação 'adicionar'", TL-41..45), que usa uma fixture `despesaSemId`
// escrita à mão para simular a forma de saída de `gerarLancamentosVR`.
//
// O lançamento pré-existente da grid usa o MESMO contador serial
// (`atribuirIds`) que `avisosSlice.aplicar` usa para os lançamentos do VR —
// como em produção, onde todo `Lancamento.id` vem de um único contador de
// sessão — para que a prova de "casamento estrito por id" (TL-S3) não
// dependa de dois espaços de id artificialmente distintos.
function lancamento(parcial: Partial<Lancamento> = {}): Lancamento {
  const [comId] = atribuirIds([
    {
      fonte: 'Nubank',
      data: '2025-03-15',
      transcricao: 'Mercado',
      valor: -150,
      iniciais: 'ES',
      natureza: 'Alimentação',
      descricao: 'Supermercado',
      ...parcial,
    },
  ])
  return comId
}

function resetarStore(lancamentos: Lancamento[]): void {
  useAppStore.setState({
    lancamentos,
    avisosAcionaveis: estadoInicialAvisos,
  })
}

function avisoVRComLote(despesas: { valor: number; natureza: string; descricao: string }[], mesRef: string): Aviso {
  const [avisoBase] = detectarVR([])
  const lancamentosVR = gerarLancamentosVR(despesas, mesRef)
  const mutacaoProposta: Mutacao = { verbo: 'adicionar', lancamentos: lancamentosVR }
  return { ...avisoBase, mutacaoProposta }
}

describe('avisosSlice — Task 8: integração ponta a ponta do verbo "adicionar" (VR real)', () => {
  beforeEach(() => {
    reiniciarContadorIds()
    resetarStore([lancamento({ transcricao: 'Item pré-existente' })])
  })

  it('TL-S1: aplicar insere N+1 lançamentos reais (gerarLancamentosVR) com ids seriais novos e marca o aviso "vr" aplicado', () => {
    const despesas = [
      { valor: 30, natureza: 'Alimentação', descricao: 'Almoço' },
      { valor: 15, natureza: 'Transporte', descricao: 'Uber' },
    ]
    useAppStore.getState().adicionarAvisos([avisoVRComLote(despesas, '2026-06')])

    useAppStore.getState().aplicar('vr')

    const estado = useAppStore.getState()
    expect(estado.lancamentos).toHaveLength(4) // 1 pré-existente + 2 saídas + 1 entrada RR
    const novos = estado.lancamentos.slice(1)
    expect(novos.every((l) => l.fonte === 'form_vr')).toBe(true)
    expect(novos.every((l) => typeof l.id === 'number')).toBe(true)
    const idsUnicos = new Set(novos.map((l) => l.id))
    expect(idsUnicos.size).toBe(3)
    expect(estado.avisosAcionaveis.avisos.find((a) => a.id === 'vr')?.estado).toBe('aplicado')
  })

  it('TL-S2: desfazer remove exatamente os N+1 ids inseridos e devolve o aviso "vr" a pendente', () => {
    const despesas = [{ valor: 20, natureza: 'Saúde', descricao: 'Farmácia' }]
    useAppStore.getState().adicionarAvisos([avisoVRComLote(despesas, '2026-06')])

    useAppStore.getState().aplicar('vr')
    expect(useAppStore.getState().lancamentos).toHaveLength(3) // 1 pré-existente + 1 saída + 1 entrada RR

    useAppStore.getState().desfazer('vr')

    const estado = useAppStore.getState()
    expect(estado.lancamentos).toHaveLength(1)
    expect(estado.lancamentos[0].transcricao).toBe('Item pré-existente')
    expect(estado.avisosAcionaveis.avisos.find((a) => a.id === 'vr')?.estado).toBe('pendente')
  })

  it('TL-S3: casamento estrito por id — um lançamento extra inserido entre aplicar e desfazer sobrevive intacto', () => {
    const despesas = [{ valor: 50, natureza: 'Lazer', descricao: 'Cinema' }]
    useAppStore.getState().adicionarAvisos([avisoVRComLote(despesas, '2026-06')])

    useAppStore.getState().aplicar('vr')
    expect(useAppStore.getState().lancamentos).toHaveLength(3) // 1 pré-existente + 1 saída + 1 entrada RR

    // Simula outra ação do usuário na grid: inserir manualmente um lançamento não relacionado ao VR.
    const extra = lancamento({ transcricao: 'Inserido manualmente entre aplicar e desfazer' })
    useAppStore.setState((state) => ({ lancamentos: [...state.lancamentos, extra] }))
    expect(useAppStore.getState().lancamentos).toHaveLength(4)

    useAppStore.getState().desfazer('vr')

    const estado = useAppStore.getState()
    expect(estado.lancamentos).toHaveLength(2) // 1 pré-existente + o extra — os 2 do VR saíram
    expect(estado.lancamentos.some((l) => l.id === extra.id)).toBe(true)
    expect(estado.lancamentos.every((l) => l.fonte !== 'form_vr')).toBe(true)
    expect(estado.avisosAcionaveis.avisos.find((a) => a.id === 'vr')?.estado).toBe('pendente')
  })
})
