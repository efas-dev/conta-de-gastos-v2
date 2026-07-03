// ADR: see Docs/specs/grid-revisao.adr.md

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SplitModal } from '../SplitModal'
import type { Lancamento } from '../../../types'

const mockAplicarSplit = vi.fn()

vi.mock('../../store/appStore', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ aplicarSplit: mockAplicarSplit }),
}))

const lancamentoDuplo: Lancamento = {
  fonte: 'Nubank',
  data: '2024-01-15',
  transcricao: 'Mercado',
  valor: 100,
  iniciais: 'ES/JF',
  natureza: 'ALI',
  descricao: 'Alimentação',
}

const lancamentoSimples: Lancamento = {
  ...lancamentoDuplo,
  iniciais: 'ES',
}

beforeEach(() => {
  mockAplicarSplit.mockReset()
})

describe('SplitModal — renderização', () => {
  it('TL-01: monta sem erros com iniciais "ES/JF" e indice=0', () => {
    render(
      <SplitModal lancamento={lancamentoDuplo} indice={0} onClose={() => {}} />,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('TL-02: iniciais com "/" produzem dois inputs de alvos editáveis', () => {
    render(
      <SplitModal lancamento={lancamentoDuplo} indice={0} onClose={() => {}} />,
    )
    const inputs = screen.getAllByRole('textbox')
    expect(inputs).toHaveLength(2)
    expect(inputs[0]).toHaveValue('ES')
    expect(inputs[1]).toHaveValue('JF')
  })

  it('TL-03: iniciais sem "/" produzem um único input de alvo', () => {
    render(
      <SplitModal lancamento={lancamentoSimples} indice={0} onClose={() => {}} />,
    )
    const inputs = screen.getAllByRole('textbox')
    expect(inputs).toHaveLength(1)
    expect(inputs[0]).toHaveValue('ES')
  })

  it('TL-10: prévia do rateio exibe valores calculados por ratearSplit', () => {
    render(
      <SplitModal lancamento={lancamentoDuplo} indice={0} onClose={() => {}} />,
    )
    // lancamento.valor = 100, 2 alvos → cada um recebe 50.00
    const celulasValor = screen.getAllByText('50.00')
    expect(celulasValor).toHaveLength(2)
  })
})

describe('SplitModal — edição de alvos', () => {
  it('TL-04: editar o input de iniciais atualiza o valor localmente', () => {
    render(
      <SplitModal lancamento={lancamentoDuplo} indice={0} onClose={() => {}} />,
    )
    const [primeiroInput] = screen.getAllByRole('textbox')
    fireEvent.change(primeiroInput, { target: { value: 'AB' } })
    expect(primeiroInput).toHaveValue('AB')
  })

  it('TL-05: botão "Adicionar alvo" insere nova entrada na lista', () => {
    render(
      <SplitModal lancamento={lancamentoDuplo} indice={0} onClose={() => {}} />,
    )
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    fireEvent.click(screen.getByText('Adicionar alvo'))
    expect(screen.getAllByRole('textbox')).toHaveLength(3)
  })

  it('TL-06: botão de remover exclui o alvo correspondente da lista', () => {
    render(
      <SplitModal lancamento={lancamentoDuplo} indice={0} onClose={() => {}} />,
    )
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    // Remover o primeiro alvo (botão "Remover alvo 1")
    fireEvent.click(screen.getByLabelText('Remover alvo 1'))
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
  })
})

describe('SplitModal — ações dos botões', () => {
  it('TL-07: "Confirmar" chama aplicarSplit com indice e lista de alvos', () => {
    render(
      <SplitModal lancamento={lancamentoDuplo} indice={2} onClose={() => {}} />,
    )
    fireEvent.click(screen.getByText('Confirmar'))
    expect(mockAplicarSplit).toHaveBeenCalledOnce()
    expect(mockAplicarSplit).toHaveBeenCalledWith(2, [
      { iniciais: 'ES' },
      { iniciais: 'JF' },
    ])
  })

  it('TL-08: "Confirmar" chama onClose após aplicarSplit', () => {
    const onClose = vi.fn()
    render(
      <SplitModal lancamento={lancamentoDuplo} indice={0} onClose={onClose} />,
    )
    fireEvent.click(screen.getByText('Confirmar'))
    expect(mockAplicarSplit).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('TL-09: "Cancelar" chama onClose sem chamar aplicarSplit', () => {
    const onClose = vi.fn()
    render(
      <SplitModal lancamento={lancamentoDuplo} indice={0} onClose={onClose} />,
    )
    fireEvent.click(screen.getByText('Cancelar'))
    expect(onClose).toHaveBeenCalledOnce()
    expect(mockAplicarSplit).not.toHaveBeenCalled()
  })
})
