// ADR: see Docs/specs/refino-ui-revisao-v2.adr.md

/**
 * Teste de integração — Task M2 (spec `refino-ui-revisao-v2`), exigido pela frase F16 e pela
 * Decisão 8 do ADR (os 4 casos de borda do grupo de saldos).
 *
 * Diferente de `ToolbarRevisao.test.tsx` (que mocka `../../store/appStore` inteiro), este arquivo
 * renderiza `ToolbarRevisao` com o `useAppStore` REAL (Zustand, sem mock) e `calcularSaldoCalculado`
 * REAL (sem mock, `src/dominio/rendimentos.ts`) — prova ponta a ponta que a leitura de `saldoAnterior`
 * do store e o cálculo do saldo calculado funcionam integrados, sem duplo-mock escondendo uma
 * quebra de contrato entre o componente e o domínio. Mesmo padrão já estabelecido por
 * `TelaImportacao.saldoAnterior.integration.test.tsx` (spec `rendimentos`).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { ToolbarRevisao } from '../ToolbarRevisao'
import { useAppStore } from '../../store/appStore'
import { estadoInicialAvisos } from '../../store/avisosSlice'
import type { Lancamento } from '../../../types'

function lan(overrides: Partial<Lancamento>): Lancamento {
  return {
    fonte: 'Nubank',
    data: '2024-01-01',
    transcricao: 'Compra',
    valor: -100,
    iniciais: 'ES',
    natureza: 'Alimentação',
    descricao: '',
    ...overrides,
  }
}

function resetarStore(): void {
  useAppStore.setState({
    lancamentos: [],
    naturezasValidas: [],
    sujo: false,
    saldoAnterior: null,
    avisosAcionaveis: estadoInicialAvisos,
  })
}

beforeEach(() => {
  resetarStore()
})

describe('ToolbarRevisao — integração real do grupo de saldos (Task M2, F16, ADR Decisão 8)', () => {
  it('(a) saldoAnterior null no store real: grupo .saldos inteiro é omitido', () => {
    useAppStore.setState({ saldoAnterior: null, lancamentos: [lan({ valor: 500 })] })

    const { container } = render(<ToolbarRevisao />)

    expect(container.querySelector('.saldos')).toBeFalsy()
  })

  it('(b) saldoAnterior definido + sem lançamentos: calculado real (via calcularSaldoCalculado) = anterior', () => {
    useAppStore.setState({ saldoAnterior: 777.5, lancamentos: [] })

    const { container } = render(<ToolbarRevisao />)

    const grupo = container.querySelector('.saldos') as HTMLElement
    const valorFmt = (777.5).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const ocorrencias = grupo.textContent!.split(valorFmt).length - 1
    expect(ocorrencias).toBe(2) // aparece em "Saldo ant." e em "Calculado"
  })

  it('(c) saldoAnterior + lançamentos reais resultando em calculado negativo: cor var(--terracota)', () => {
    useAppStore.setState({
      saldoAnterior: 100,
      lancamentos: [lan({ valor: -300 })],
    })

    const { container } = render(<ToolbarRevisao />)

    const spans = container.querySelectorAll('.saldos span')
    const calculadoSpan = spans[1] as HTMLElement
    expect(calculadoSpan.style.color).toBe('var(--terracota)')
    expect(calculadoSpan.textContent).toContain('-R$')
  })

  it('(d) saldoAnterior + lançamentos reais resultando em calculado positivo: cor padrão, sem terracota', () => {
    useAppStore.setState({
      saldoAnterior: 100,
      lancamentos: [lan({ valor: 300 })],
    })

    const { container } = render(<ToolbarRevisao />)

    const spans = container.querySelectorAll('.saldos span')
    const calculadoSpan = spans[1] as HTMLElement
    expect(calculadoSpan.style.color).not.toBe('var(--terracota)')
  })
})
