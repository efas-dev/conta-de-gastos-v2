// ADR: see spec/avisos-acionaveis.adr.md

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { CentralDeAvisos } from '../CentralDeAvisos'
import type { Aviso } from '../../../types'

// ---------------------------------------------------------------------------
// Mock do store — mesmo padrão de SplitModal.test.tsx: seletor aplicado a um
// estado mínimo simulado, ações capturadas via vi.fn().
// ---------------------------------------------------------------------------

const mockAplicar = vi.fn()
const mockDesfazer = vi.fn()
const mockDispensar = vi.fn()

let avisosMock: Aviso[] = []

vi.mock('../../store/appStore', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      avisosAcionaveis: { avisos: avisosMock, removidos: {} },
      aplicar: mockAplicar,
      desfazer: mockDesfazer,
      dispensar: mockDispensar,
    }),
}))

function informativo(parcial: Partial<Aviso> = {}): Aviso {
  return {
    id: 'info-1',
    tipo: 'informativo',
    origem: 'valor-pendente',
    mensagem: 'Valor pendente do mês anterior detectado.',
    alvo: [],
    estado: 'pendente',
    ...parcial,
  }
}

function proposta(parcial: Partial<Aviso> = {}): Aviso {
  return {
    id: 'prop-1',
    tipo: 'proposta',
    origem: 'conciliacao',
    mensagem: 'Fatura conciliável com pagamento do extrato.',
    alvo: ['0'],
    estado: 'pendente',
    ...parcial,
  }
}

beforeEach(() => {
  avisosMock = []
  mockAplicar.mockReset()
  mockDesfazer.mockReset()
  mockDispensar.mockReset()
})

describe('CentralDeAvisos — lista vazia', () => {
  it('renderiza null quando avisosAcionaveis.avisos está vazio', () => {
    avisosMock = []
    const { container } = render(<CentralDeAvisos />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('CentralDeAvisos — agrupamento por tipo', () => {
  it('renderiza informativos e propostas em grupos separados', () => {
    avisosMock = [informativo(), proposta()]
    render(<CentralDeAvisos />)

    expect(screen.getByText('Valor pendente do mês anterior detectado.')).toBeInTheDocument()
    expect(screen.getByText('Fatura conciliável com pagamento do extrato.')).toBeInTheDocument()
  })
})

describe('CentralDeAvisos — botões por estado de proposta', () => {
  it('proposta pendente exibe "Aplicar" e "Dispensar"', () => {
    avisosMock = [proposta({ estado: 'pendente' })]
    render(<CentralDeAvisos />)

    expect(screen.getByRole('button', { name: /aplicar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dispensar/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /desfazer/i })).toBeNull()
  })

  it('proposta aplicada exibe "Desfazer" e NÃO exibe "Aplicar"/"Dispensar"', () => {
    avisosMock = [proposta({ estado: 'aplicado' })]
    render(<CentralDeAvisos />)

    expect(screen.getByRole('button', { name: /desfazer/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /aplicar/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /dispensar/i })).toBeNull()
  })

  it('proposta dispensada não exibe nenhum botão de ação', () => {
    avisosMock = [proposta({ estado: 'dispensado' })]
    render(<CentralDeAvisos />)

    expect(screen.queryByRole('button', { name: /aplicar/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /desfazer/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /dispensar/i })).toBeNull()
  })

  it('aviso informativo nunca exibe botões de ação', () => {
    avisosMock = [informativo({ estado: 'pendente' })]
    render(<CentralDeAvisos />)

    expect(screen.queryByRole('button', { name: /aplicar/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /desfazer/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /dispensar/i })).toBeNull()
  })
})

describe('CentralDeAvisos — ações disparam sobre o id correto', () => {
  it('clicar em "Aplicar" chama aplicar(id) com o id do aviso', () => {
    avisosMock = [proposta({ id: 'prop-xyz', estado: 'pendente' })]
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByRole('button', { name: /aplicar/i }))
    expect(mockAplicar).toHaveBeenCalledWith('prop-xyz')
  })

  it('clicar em "Desfazer" chama desfazer(id) com o id do aviso', () => {
    avisosMock = [proposta({ id: 'prop-xyz', estado: 'aplicado' })]
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByRole('button', { name: /desfazer/i }))
    expect(mockDesfazer).toHaveBeenCalledWith('prop-xyz')
  })

  it('clicar em "Dispensar" chama dispensar(id) com o id do aviso', () => {
    avisosMock = [proposta({ id: 'prop-xyz', estado: 'pendente' })]
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByRole('button', { name: /dispensar/i }))
    expect(mockDispensar).toHaveBeenCalledWith('prop-xyz')
  })

  it('com múltiplas propostas, cada botão age apenas sobre o próprio item', () => {
    avisosMock = [
      proposta({ id: 'prop-a', estado: 'pendente', mensagem: 'Proposta A' }),
      proposta({ id: 'prop-b', estado: 'pendente', mensagem: 'Proposta B' }),
    ]
    render(<CentralDeAvisos />)

    const itemB = screen.getByText('Proposta B').closest('li')
    expect(itemB).not.toBeNull()
    fireEvent.click(within(itemB as HTMLElement).getByRole('button', { name: /aplicar/i }))

    expect(mockAplicar).toHaveBeenCalledWith('prop-b')
    expect(mockAplicar).not.toHaveBeenCalledWith('prop-a')
  })
})
