// ADR: see spec/inspecao-proposta-conciliacao.adr.md

/**
 * Teste de integração — Task T5 (prova final, spec `inspecao-proposta-conciliacao`).
 *
 * Fecha a lacuna deixada explícita pelo precedente da Task T4
 * (`src/ui/components/__tests__/ReviewGrid.test.ts`, describe "pipeline de inspeção
 * (integração slice -> grid)", TL-13/TL-14): lá o `Aviso` usado era fabricado à mão
 * (`avisoConciliacaoFake`/`avisoValorPendenteFake`). Aqui o `Aviso` nasce de ações REAIS
 * do `avisosSlice` sobre o `useAppStore` real (Zustand, sem mock) — `entrarInspecao`,
 * `sairInspecao`, `aplicar`, `dispensar`, `desfazer` — provando a integração ponta a
 * ponta entre o slice e (a) as funções puras de derivação que `ReviewGrid.tsx` invoca
 * em runtime e (b) o card real de `CentralDeAvisos.tsx`.
 *
 * `ReviewGrid.tsx` como componente React (Glide/Canvas) não é montável em jsdom — mesma
 * restrição já registrada em `ReviewGrid.test.ts` e no ADR (Decisão 6: integração
 * slice↔grid + validação visual manual, nunca asserção de pixel). A prova de "tema
 * correto na linha certa" e "auto-scroll disparado" aqui usa como proxy as mesmas
 * funções puras que o componente consome em `getRowThemeOverride`/`useEffect`
 * (`derivarContextoInspecao`, `calcularTemaLinhaComInspecao`, `calcularLinhaAncoraVisual`,
 * `indicesEnvolvidos`) — mas agora alimentadas pelo estado real do store, não por fakes.
 *
 * Test List (Playbook 1 — ver iteração-log da Task T5):
 * 1. Real slice: entrarInspecao(conciliação) -> tema sai/fica corretos por linha real.
 * 2. Mesmo cenário -> calcularLinhaAncoraVisual aponta a posição correta (proxy do scroll).
 * 3. Real slice + render real de CentralDeAvisos -> resumo visível no card em inspeção.
 * 4. Real slice: entrarInspecao(valor-pendente) -> destaque "sai" na linha real da grid (D16,
 *    revisão de T8 sobre o item original desta lista, que testava o não-efeito de D11/T4).
 * 5. sairInspecao() real limpa o destaque (contexto volta a undefined).
 * 6. aplicar() real sobre o aviso inspecionado encerra a inspeção automaticamente.
 * 7. dispensar() real sobre o aviso inspecionado encerra a inspeção automaticamente.
 * 8. Badge (via render real de CentralDeAvisos) reflete contagem real em cenário misto.
 * 9. Ponta a ponta com store real: Aprovar remove `alvo` de `lancamentos`; Desfazer restaura;
 *    Dispensar não toca `lancamentos`; Desfazer-de-dispensa volta a pendente sem alterar `lancamentos`.
 *
 * Test List (Playbook 1 — Task T10, emenda pós-inspeção, D16/D17/D18):
 * 10. Real slice: entrarInspecao(pagamento-recebido) -> destaque "sai" na linha real da grid,
 *     simétrico ao item 4 (valor-pendente) — nunca provado em integração ponta a ponta antes.
 * 11. Real slice: calcularLinhaAncoraVisual aponta a posição real da linha valor-pendente/
 *     pagamento-recebido em inspeção (auto-scroll estendido, T8).
 * 12. Real slice: aplicar() sobre proposta de valor-pendente remove a linha-alvo real de
 *     `state.lancamentos` (Aprovar remove, D16).
 * 13. Real slice: aplicar() sobre proposta de pagamento-recebido remove a linha-alvo real de
 *     `state.lancamentos` (Aprovar remove, D16/D17).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { useAppStore } from '../store/appStore'
import { estadoInicialAvisos } from '../store/avisosSlice'
import { CentralDeAvisos } from '../components/CentralDeAvisos'
import { PainelLateral } from '../components/PainelLateral'
import {
  derivarContextoInspecao,
  calcularTemaLinhaComInspecao,
  calcularLinhaAncoraVisual,
  indicesEnvolvidos,
  TEMA_INSPECAO_SAI,
  TEMA_INSPECAO_FICA,
} from '../components/ReviewGrid'
import type { Aviso, Lancamento } from '../../types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function lancamento(parcial: Partial<Lancamento> = {}): Lancamento {
  return {
    fonte: 'Nubank',
    data: '2025-03-15',
    transcricao: 'Item',
    valor: -150,
    iniciais: 'ES',
    natureza: 'Alimentação',
    descricao: '',
    ...parcial,
  }
}

/** 3 lançamentos: real 0/1 = fica (fatura), real 2 = sai (extrato). */
function lancamentosBase(): Lancamento[] {
  return [
    lancamento({ transcricao: 'Fatura item A' }),
    lancamento({ transcricao: 'Fatura item B' }),
    lancamento({ transcricao: 'Pagamento fatura' }),
  ]
}

function avisoConciliacao(parcial: Partial<Aviso> = {}): Aviso {
  return {
    id: 'conciliacao-1',
    tipo: 'proposta',
    origem: 'conciliacao',
    mensagem: 'Fatura conciliada com pagamento no extrato',
    alvo: ['2'],
    permanece: ['0', '1'],
    resumo: 'somatório da fatura R$ 150,00 ↔ pagamento R$ 150,00, diferença ≤ R$ 0,05',
    estado: 'pendente',
    ...parcial,
  }
}

function avisoValorPendente(parcial: Partial<Aviso> = {}): Aviso {
  return {
    id: 'valor-pendente-1',
    tipo: 'proposta',
    origem: 'valor-pendente',
    mensagem: 'Valor pendente do mês anterior detectado.',
    alvo: [],
    permanece: [],
    resumo: undefined,
    estado: 'pendente',
    ...parcial,
  }
}

/** Aviso de pagamento-recebido (T7/D17) — mesmo formato de valor-pendente, origem gêmea. */
function avisoPagamentoRecebido(parcial: Partial<Aviso> = {}): Aviso {
  return {
    id: 'pagamento-recebido-1',
    tipo: 'proposta',
    origem: 'pagamento-recebido',
    mensagem: 'Pagamento recebido detectado.',
    alvo: [],
    permanece: [],
    resumo: undefined,
    estado: 'pendente',
    ...parcial,
  }
}

function resetarStore(lancamentos: Lancamento[] = []): void {
  useAppStore.setState({ lancamentos, avisosAcionaveis: estadoInicialAvisos })
}

/** Deriva o estado de inspeção do store real, no formato que ReviewGrid.tsx consome. */
function derivarEstadoInspecao() {
  const { avisos, avisoEmInspecao } = useAppStore.getState().avisosAcionaveis
  const aviso = avisos.find((a) => a.id === avisoEmInspecao)
  return {
    aviso,
    contexto: derivarContextoInspecao(aviso),
    envolvidos: indicesEnvolvidos(aviso),
  }
}

beforeEach(() => {
  resetarStore()
})

// ---------------------------------------------------------------------------
// 1-2, 5: inspeção de conciliação — tema e âncora, com estado real do slice
// ---------------------------------------------------------------------------

describe('inspeção de conciliação — slice real -> derivação de tema/âncora da grid', () => {
  it('T5-1: entrarInspecao real produz tema sai/fica corretos por linha real', () => {
    resetarStore(lancamentosBase())
    useAppStore.getState().adicionarAvisos([avisoConciliacao()])
    useAppStore.getState().entrarInspecao('conciliacao-1')

    const { aviso, contexto } = derivarEstadoInspecao()
    expect(aviso?.id).toBe('conciliacao-1')

    const lancamentos = useAppStore.getState().lancamentos
    const temas = lancamentos.map((l, indiceReal) =>
      calcularTemaLinhaComInspecao(indiceReal, contexto),
    )

    expect(temas[0]).toBe(TEMA_INSPECAO_FICA)
    expect(temas[1]).toBe(TEMA_INSPECAO_FICA)
    expect(temas[2]).toBe(TEMA_INSPECAO_SAI)
  })

  it('T5-2: calcularLinhaAncoraVisual aponta a posição visual da linha "sai" (proxy do auto-scroll)', () => {
    resetarStore(lancamentosBase())
    useAppStore.getState().adicionarAvisos([avisoConciliacao()])
    useAppStore.getState().entrarInspecao('conciliacao-1')

    const { aviso } = derivarEstadoInspecao()
    // Sem filtro/ordenação ativos: mapa identidade [0,1,2].
    expect(calcularLinhaAncoraVisual([0, 1, 2], aviso)).toBe(2)
  })

  it('T5-5: sairInspecao() real limpa o destaque — nenhuma linha recebe tema de inspeção', () => {
    resetarStore(lancamentosBase())
    useAppStore.getState().adicionarAvisos([avisoConciliacao()])
    useAppStore.getState().entrarInspecao('conciliacao-1')
    useAppStore.getState().sairInspecao()

    const { contexto, envolvidos } = derivarEstadoInspecao()
    expect(contexto).toBeUndefined()
    expect(envolvidos).toEqual([])

    const lancamentos = useAppStore.getState().lancamentos
    const temas = lancamentos.map((l, indiceReal) =>
      calcularTemaLinhaComInspecao(indiceReal, contexto),
    )
    expect(temas.every((t) => t === undefined)).toBe(true)
  })

  it('T5-6: aplicar() sobre o aviso inspecionado encerra a inspeção automaticamente', () => {
    resetarStore(lancamentosBase())
    useAppStore.getState().adicionarAvisos([avisoConciliacao()])
    useAppStore.getState().entrarInspecao('conciliacao-1')
    expect(useAppStore.getState().avisosAcionaveis.avisoEmInspecao).toBe('conciliacao-1')

    useAppStore.getState().aplicar('conciliacao-1')

    expect(useAppStore.getState().avisosAcionaveis.avisoEmInspecao).toBeNull()
    const { contexto } = derivarEstadoInspecao()
    expect(contexto).toBeUndefined()
  })

  it('T5-7: dispensar() sobre o aviso inspecionado encerra a inspeção automaticamente', () => {
    resetarStore(lancamentosBase())
    useAppStore.getState().adicionarAvisos([avisoConciliacao()])
    useAppStore.getState().entrarInspecao('conciliacao-1')

    useAppStore.getState().dispensar('conciliacao-1')

    expect(useAppStore.getState().avisosAcionaveis.avisoEmInspecao).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 4, 10, 11: inspeção de valor-pendente/pagamento-recebido — destaque "sai" estendido
// à grid (D16/D17, revisão de T8 sobre o não-efeito original de D11/T4)
// ---------------------------------------------------------------------------

describe('inspeção de valor-pendente/pagamento-recebido — slice real -> destaque "sai" na grid (D16/D17)', () => {
  it('T10-4: entrarInspecao real sobre valor-pendente com alvo real produz TEMA_INSPECAO_SAI na linha real e âncora de scroll definida', () => {
    resetarStore(lancamentosBase())
    useAppStore.getState().adicionarAvisos([avisoValorPendente({ alvo: ['1'] })])
    useAppStore.getState().entrarInspecao('valor-pendente-1')

    const { aviso, contexto, envolvidos } = derivarEstadoInspecao()
    expect(aviso?.id).toBe('valor-pendente-1')
    expect(contexto).not.toBeUndefined()
    expect(envolvidos).toEqual([1])

    const lancamentos = useAppStore.getState().lancamentos
    const temas = lancamentos.map((l, indiceReal) =>
      calcularTemaLinhaComInspecao(indiceReal, contexto),
    )
    expect(temas[0]).toBeUndefined()
    expect(temas[1]).toBe(TEMA_INSPECAO_SAI)
    expect(temas[2]).toBeUndefined()
    // Papel único "sai" (D10): nenhuma linha ganha TEMA_INSPECAO_FICA (permanece vazio).
    expect(temas.every((t) => t !== TEMA_INSPECAO_FICA)).toBe(true)
  })

  it('T10-11: calcularLinhaAncoraVisual aponta a posição visual real da linha de valor-pendente em inspeção (auto-scroll estendido, T8)', () => {
    resetarStore(lancamentosBase())
    useAppStore.getState().adicionarAvisos([avisoValorPendente({ alvo: ['1'] })])
    useAppStore.getState().entrarInspecao('valor-pendente-1')

    const { aviso } = derivarEstadoInspecao()
    expect(calcularLinhaAncoraVisual([0, 1, 2], aviso)).toBe(1)
  })

  it('T10-10: entrarInspecao real sobre pagamento-recebido com alvo real produz TEMA_INSPECAO_SAI na linha real (simétrico a valor-pendente)', () => {
    resetarStore(lancamentosBase())
    useAppStore.getState().adicionarAvisos([avisoPagamentoRecebido({ alvo: ['0'] })])
    useAppStore.getState().entrarInspecao('pagamento-recebido-1')

    const { aviso, contexto, envolvidos } = derivarEstadoInspecao()
    expect(aviso?.id).toBe('pagamento-recebido-1')
    expect(envolvidos).toEqual([0])

    const lancamentos = useAppStore.getState().lancamentos
    const temas = lancamentos.map((l, indiceReal) =>
      calcularTemaLinhaComInspecao(indiceReal, contexto),
    )
    expect(temas[0]).toBe(TEMA_INSPECAO_SAI)
    expect(temas[1]).toBeUndefined()
    expect(temas[2]).toBeUndefined()
    expect(calcularLinhaAncoraVisual([0, 1, 2], aviso)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 12, 13: Aprovar remove a linha real de valor-pendente/pagamento-recebido (D16/D17)
// ---------------------------------------------------------------------------

describe('CentralDeAvisos conectado ao store real — Aprovar remove a linha real de valor-pendente/pagamento-recebido (D16/D17)', () => {
  it('T10-12: aplicar() real sobre proposta de valor-pendente remove a linha-alvo de state.lancamentos', () => {
    resetarStore(lancamentosBase())
    useAppStore.getState().adicionarAvisos([avisoValorPendente({ alvo: ['1'] })])

    useAppStore.getState().aplicar('valor-pendente-1')

    expect(useAppStore.getState().lancamentos.map((l) => l.transcricao)).toEqual([
      'Fatura item A',
      'Pagamento fatura',
    ])
    expect(useAppStore.getState().avisosAcionaveis.avisos[0].estado).toBe('aplicado')
  })

  it('T10-13: aplicar() real sobre proposta de pagamento-recebido remove a linha-alvo de state.lancamentos', () => {
    resetarStore(lancamentosBase())
    useAppStore.getState().adicionarAvisos([avisoPagamentoRecebido({ alvo: ['0'] })])

    useAppStore.getState().aplicar('pagamento-recebido-1')

    expect(useAppStore.getState().lancamentos.map((l) => l.transcricao)).toEqual([
      'Fatura item B',
      'Pagamento fatura',
    ])
    expect(useAppStore.getState().avisosAcionaveis.avisos[0].estado).toBe('aplicado')
  })
})

// ---------------------------------------------------------------------------
// 3, 8: render real de CentralDeAvisos conectado ao store real — resumo e badge
// ---------------------------------------------------------------------------

describe('CentralDeAvisos conectado ao store real — resumo em inspeção e badge de contagem', () => {
  it('T5-3: resumo do aviso em inspeção fica visível no card (render real)', () => {
    resetarStore(lancamentosBase())
    useAppStore.getState().adicionarAvisos([avisoConciliacao()])
    useAppStore.getState().entrarInspecao('conciliacao-1')

    render(<CentralDeAvisos />)

    expect(screen.getByLabelText('Papel: sai')).toBeInTheDocument()
    expect(screen.getByLabelText('Papel: fica')).toBeInTheDocument()
    expect(screen.getByLabelText('Resumo da regra')).toHaveTextContent(/somatório da fatura/i)
  })

  it('T5-4b: card de valor-pendente em inspeção não mostra papel "fica" nem resumo', () => {
    resetarStore(lancamentosBase())
    useAppStore.getState().adicionarAvisos([avisoValorPendente()])
    useAppStore.getState().entrarInspecao('valor-pendente-1')

    render(<CentralDeAvisos />)

    expect(screen.getByLabelText('Papel: sai')).toBeInTheDocument()
    expect(screen.queryByLabelText('Papel: fica')).toBeNull()
    expect(screen.queryByLabelText('Resumo da regra')).toBeNull()
  })

  it('T5-8: badge reflete a contagem real de propostas pendentes em cenário misto', () => {
    // T5 migrou o badge de contagem do toggle antigo de `CentralDeAvisos` para a
    // aba "Avisos" de `PainelLateral` (D15 do ADR `inspecao-proposta-conciliacao`,
    // ver `iteracao-log`, Task T5) — a asserção passa a exercitar `PainelLateral`,
    // que é quem hoje consome `selecionarContagemPendentes` (`PainelLateral.tsx`).
    resetarStore(lancamentosBase())
    useAppStore.getState().adicionarAvisos([
      avisoConciliacao({ id: 'a', estado: 'pendente' }),
      avisoValorPendente({ id: 'b', estado: 'pendente' }),
      avisoConciliacao({ id: 'c', estado: 'aplicado', mensagem: 'Outra proposta aplicada' }),
    ])

    render(<PainelLateral aba="avisos" setAba={() => {}} naturezas={[]} />)

    expect(screen.getByLabelText('2 propostas pendentes')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 9: Aprovar/Dispensar/Desfazer ponta a ponta com store real, incluindo
// desfazer-de-dispensa (D14 do ADR).
// ---------------------------------------------------------------------------

describe('CentralDeAvisos conectado ao store real — Aprovar/Dispensar/Desfazer ponta a ponta (D14)', () => {
  it('T5-9a: Aprovar remove o lançamento-alvo; Desfazer restaura na posição original', () => {
    resetarStore(lancamentosBase())
    useAppStore.getState().adicionarAvisos([avisoConciliacao()])

    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByRole('button', { name: /^aplicar$/i }))
    expect(useAppStore.getState().lancamentos.map((l) => l.transcricao)).toEqual([
      'Fatura item A',
      'Fatura item B',
    ])
    expect(useAppStore.getState().avisosAcionaveis.avisos[0].estado).toBe('aplicado')

    fireEvent.click(screen.getByRole('button', { name: /reverter/i }))
    expect(useAppStore.getState().lancamentos.map((l) => l.transcricao)).toEqual([
      'Fatura item A',
      'Fatura item B',
      'Pagamento fatura',
    ])
    expect(useAppStore.getState().avisosAcionaveis.avisos[0].estado).toBe('pendente')
  })

  it('T5-9b: Dispensar não altera lancamentos; Desfazer-de-dispensa volta a pendente sem restaurar nada', () => {
    resetarStore(lancamentosBase())
    useAppStore.getState().adicionarAvisos([avisoConciliacao()])

    render(<CentralDeAvisos />)

    const lancamentosAntes = useAppStore.getState().lancamentos

    fireEvent.click(screen.getByRole('button', { name: /dispensar/i }))
    expect(useAppStore.getState().avisosAcionaveis.avisos[0].estado).toBe('dispensado')
    expect(useAppStore.getState().lancamentos).toBe(lancamentosAntes)

    fireEvent.click(screen.getByRole('button', { name: /reverter/i }))
    expect(useAppStore.getState().avisosAcionaveis.avisos[0].estado).toBe('pendente')
    expect(useAppStore.getState().lancamentos).toBe(lancamentosAntes)
  })
})
