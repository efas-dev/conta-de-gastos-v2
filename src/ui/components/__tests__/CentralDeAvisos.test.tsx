// ADR: see Docs/specs/avisos-acionaveis.adr.md

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
      avisosAcionaveis: { avisos: avisosMock, removidos: {}, avisoEmInspecao: null },
      lancamentos: [],
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
    permanece: [],
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
    permanece: [],
    estado: 'pendente',
    ...parcial,
  }
}

/** Abre o sheet (botão "Abrir central de avisos") e retorna o botão de toggle. */
function abrirSheet() {
  const botao = screen.getByRole('button', { name: /abrir central de avisos/i })
  fireEvent.click(botao)
  return botao
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

describe('CentralDeAvisos — sheet colapsável (D12)', () => {
  it('começa colapsado por padrão — painel de conteúdo ausente do DOM', () => {
    avisosMock = [proposta()]
    render(<CentralDeAvisos />)

    const botao = screen.getByRole('button', { name: /abrir central de avisos/i })
    expect(botao).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Fatura conciliável com pagamento do extrato.')).toBeNull()
  })

  it('clicar no botão de abrir expande o sheet — painel visível com os avisos', () => {
    avisosMock = [proposta()]
    render(<CentralDeAvisos />)

    abrirSheet()

    expect(screen.getByRole('button', { name: /fechar central de avisos/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByText('Fatura conciliável com pagamento do extrato.')).toBeInTheDocument()
  })

  it('clicar novamente no botão (agora de fechar) colapsa o sheet de volta', () => {
    avisosMock = [proposta()]
    render(<CentralDeAvisos />)

    abrirSheet()
    fireEvent.click(screen.getByRole('button', { name: /fechar central de avisos/i }))

    expect(screen.getByRole('button', { name: /abrir central de avisos/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.queryByText('Fatura conciliável com pagamento do extrato.')).toBeNull()
  })
})

describe('CentralDeAvisos — badge de contagem de pendentes (D15)', () => {
  it('badge exibe a contagem correta de propostas pendentes com avisos mistos', () => {
    avisosMock = [
      informativo(),
      proposta({ id: 'prop-a', estado: 'pendente' }),
      proposta({ id: 'prop-b', estado: 'pendente' }),
      proposta({ id: 'prop-c', estado: 'aplicado' }),
    ]
    render(<CentralDeAvisos />)

    expect(screen.getByLabelText('2 propostas pendentes')).toBeInTheDocument()
  })

  it('badge fica ausente quando não há propostas pendentes', () => {
    avisosMock = [informativo(), proposta({ estado: 'aplicado' })]
    render(<CentralDeAvisos />)

    expect(screen.queryByLabelText(/propostas pendentes/i)).toBeNull()
  })

  it('aviso novo (proposta pendente) atualiza o badge reativamente sem auto-abrir o sheet', () => {
    avisosMock = [proposta({ id: 'prop-a', estado: 'pendente' })]
    const { rerender } = render(<CentralDeAvisos />)

    expect(screen.getByLabelText('1 proposta pendente')).toBeInTheDocument()

    avisosMock = [
      proposta({ id: 'prop-a', estado: 'pendente' }),
      proposta({ id: 'prop-b', estado: 'pendente' }),
    ]
    rerender(<CentralDeAvisos />)

    expect(screen.getByLabelText('2 propostas pendentes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /abrir central de avisos/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })
})

describe('CentralDeAvisos — cada aviso vira card', () => {
  it('renderiza informativos e propostas como cards dentro do painel expandido', () => {
    avisosMock = [informativo(), proposta()]
    render(<CentralDeAvisos />)

    abrirSheet()

    expect(screen.getByText('Valor pendente do mês anterior detectado.')).toBeInTheDocument()
    expect(screen.getByText('Fatura conciliável com pagamento do extrato.')).toBeInTheDocument()
  })
})

describe('CentralDeAvisos — rótulos e ações por estado de proposta (D13, D14)', () => {
  it('proposta pendente exibe "Aprovar" e "Dispensar"', () => {
    avisosMock = [proposta({ estado: 'pendente' })]
    render(<CentralDeAvisos />)
    abrirSheet()

    expect(screen.getByRole('button', { name: /aprovar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dispensar/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /desfazer/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^aplicar$/i })).toBeNull()
  })

  it('clicar em "Aprovar" chama aplicar(id) com o id do aviso', () => {
    avisosMock = [proposta({ id: 'prop-xyz', estado: 'pendente' })]
    render(<CentralDeAvisos />)
    abrirSheet()

    fireEvent.click(screen.getByRole('button', { name: /aprovar/i }))
    expect(mockAplicar).toHaveBeenCalledWith('prop-xyz')
  })

  it('clicar em "Dispensar" chama dispensar(id) com o id do aviso', () => {
    avisosMock = [proposta({ id: 'prop-xyz', estado: 'pendente' })]
    render(<CentralDeAvisos />)
    abrirSheet()

    fireEvent.click(screen.getByRole('button', { name: /dispensar/i }))
    expect(mockDispensar).toHaveBeenCalledWith('prop-xyz')
  })

  it('proposta aplicada exibe "Desfazer" e chama desfazer(id) ao clicar', () => {
    avisosMock = [proposta({ id: 'prop-xyz', estado: 'aplicado' })]
    render(<CentralDeAvisos />)
    abrirSheet()

    const botaoDesfazer = screen.getByRole('button', { name: /desfazer/i })
    expect(botaoDesfazer).toBeInTheDocument()
    fireEvent.click(botaoDesfazer)
    expect(mockDesfazer).toHaveBeenCalledWith('prop-xyz')
  })

  it('proposta dispensada também exibe "Desfazer" e chama desfazer(id) ao clicar (D14)', () => {
    avisosMock = [proposta({ id: 'prop-xyz', estado: 'dispensado' })]
    render(<CentralDeAvisos />)
    abrirSheet()

    const botaoDesfazer = screen.getByRole('button', { name: /desfazer/i })
    expect(botaoDesfazer).toBeInTheDocument()
    fireEvent.click(botaoDesfazer)
    expect(mockDesfazer).toHaveBeenCalledWith('prop-xyz')
  })

  it('aviso informativo nunca exibe botões de ação', () => {
    avisosMock = [informativo({ estado: 'pendente' })]
    render(<CentralDeAvisos />)
    abrirSheet()

    expect(screen.queryByRole('button', { name: /aprovar/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /desfazer/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /dispensar/i })).toBeNull()
  })

  it('com múltiplas propostas, cada botão age apenas sobre o próprio item', () => {
    avisosMock = [
      proposta({ id: 'prop-a', estado: 'pendente', mensagem: 'Proposta A' }),
      proposta({ id: 'prop-b', estado: 'pendente', mensagem: 'Proposta B' }),
    ]
    render(<CentralDeAvisos />)
    abrirSheet()

    const itemB = screen.getByText('Proposta B').closest('li')
    expect(itemB).not.toBeNull()
    fireEvent.click(within(itemB as HTMLElement).getByRole('button', { name: /aprovar/i }))

    expect(mockAplicar).toHaveBeenCalledWith('prop-b')
    expect(mockAplicar).not.toHaveBeenCalledWith('prop-a')
  })
})
