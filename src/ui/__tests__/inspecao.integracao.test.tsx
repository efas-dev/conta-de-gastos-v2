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
 * 4. Real slice: entrarInspecao(valor-pendente) -> nenhum efeito de tema/scroll; sem resumo/fica no card.
 * 5. sairInspecao() real limpa o destaque (contexto volta a undefined).
 * 6. aplicar() real sobre o aviso inspecionado encerra a inspeção automaticamente.
 * 7. dispensar() real sobre o aviso inspecionado encerra a inspeção automaticamente.
 * 8. Badge (via render real de CentralDeAvisos) reflete contagem real em cenário misto.
 * 9. Ponta a ponta com store real: Aprovar remove `alvo` de `lancamentos`; Desfazer restaura;
 *    Dispensar não toca `lancamentos`; Desfazer-de-dispensa volta a pendente sem alterar `lancamentos`.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { useAppStore } from '../store/appStore'
import { estadoInicialAvisos } from '../store/avisosSlice'
import { CentralDeAvisos } from '../components/CentralDeAvisos'
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

function abrirSheet(): void {
  fireEvent.click(screen.getByRole('button', { name: /abrir central de avisos/i }))
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
      calcularTemaLinhaComInspecao(l, indiceReal, [], contexto),
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
      calcularTemaLinhaComInspecao(l, indiceReal, ['Alimentação'], contexto),
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
// 4: inspeção de valor-pendente — ausência de efeito na grid (D11)
// ---------------------------------------------------------------------------

describe('inspeção de valor-pendente — slice real -> ausência de efeito na grid (D11)', () => {
  it('T5-4: entrarInspecao real sobre valor-pendente não produz tema nem âncora de scroll', () => {
    resetarStore(lancamentosBase())
    useAppStore.getState().adicionarAvisos([avisoValorPendente()])
    useAppStore.getState().entrarInspecao('valor-pendente-1')

    const { aviso, contexto, envolvidos } = derivarEstadoInspecao()
    expect(aviso?.id).toBe('valor-pendente-1')
    expect(contexto).toBeUndefined()
    expect(envolvidos).toEqual([])

    const lancamentos = useAppStore.getState().lancamentos
    const temas = lancamentos.map((l, indiceReal) =>
      calcularTemaLinhaComInspecao(l, indiceReal, ['Alimentação'], contexto),
    )
    expect(temas.every((t) => t === undefined)).toBe(true)
    expect(calcularLinhaAncoraVisual([0, 1, 2], aviso)).toBeUndefined()
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
    abrirSheet()

    expect(screen.getByLabelText('Papel: sai')).toBeInTheDocument()
    expect(screen.getByLabelText('Papel: fica')).toBeInTheDocument()
    expect(screen.getByLabelText('Resumo da regra')).toHaveTextContent(/somatório da fatura/i)
  })

  it('T5-4b: card de valor-pendente em inspeção não mostra papel "fica" nem resumo', () => {
    resetarStore(lancamentosBase())
    useAppStore.getState().adicionarAvisos([avisoValorPendente()])
    useAppStore.getState().entrarInspecao('valor-pendente-1')

    render(<CentralDeAvisos />)
    abrirSheet()

    expect(screen.getByLabelText('Papel: sai')).toBeInTheDocument()
    expect(screen.queryByLabelText('Papel: fica')).toBeNull()
    expect(screen.queryByLabelText('Resumo da regra')).toBeNull()
  })

  it('T5-8: badge reflete a contagem real de propostas pendentes em cenário misto', () => {
    resetarStore(lancamentosBase())
    useAppStore.getState().adicionarAvisos([
      avisoConciliacao({ id: 'a', estado: 'pendente' }),
      avisoValorPendente({ id: 'b', estado: 'pendente' }),
      avisoConciliacao({ id: 'c', estado: 'aplicado', mensagem: 'Outra proposta aplicada' }),
    ])

    render(<CentralDeAvisos />)

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
    abrirSheet()

    fireEvent.click(screen.getByRole('button', { name: /aprovar/i }))
    expect(useAppStore.getState().lancamentos.map((l) => l.transcricao)).toEqual([
      'Fatura item A',
      'Fatura item B',
    ])
    expect(useAppStore.getState().avisosAcionaveis.avisos[0].estado).toBe('aplicado')

    fireEvent.click(screen.getByRole('button', { name: /desfazer/i }))
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
    abrirSheet()

    const lancamentosAntes = useAppStore.getState().lancamentos

    fireEvent.click(screen.getByRole('button', { name: /dispensar/i }))
    expect(useAppStore.getState().avisosAcionaveis.avisos[0].estado).toBe('dispensado')
    expect(useAppStore.getState().lancamentos).toBe(lancamentosAntes)

    fireEvent.click(screen.getByRole('button', { name: /desfazer/i }))
    expect(useAppStore.getState().avisosAcionaveis.avisos[0].estado).toBe('pendente')
    expect(useAppStore.getState().lancamentos).toBe(lancamentosAntes)
  })
})
