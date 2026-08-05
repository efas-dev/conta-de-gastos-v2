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
const mockEntrarInspecao = vi.fn((id: string) => {
  avisoEmInspecaoMock = id
})
const mockSairInspecao = vi.fn(() => {
  avisoEmInspecaoMock = null
})

let avisosMock: Aviso[] = []
let avisoEmInspecaoMock: string | null = null

vi.mock('../../store/appStore', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      avisosAcionaveis: { avisos: avisosMock, removidos: {}, avisoEmInspecao: avisoEmInspecaoMock },
      lancamentos: [],
      aplicar: mockAplicar,
      desfazer: mockDesfazer,
      dispensar: mockDispensar,
      entrarInspecao: mockEntrarInspecao,
      sairInspecao: mockSairInspecao,
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

beforeEach(() => {
  avisosMock = []
  avisoEmInspecaoMock = null
  mockAplicar.mockReset()
  mockDesfazer.mockReset()
  mockDispensar.mockReset()
  mockEntrarInspecao.mockReset().mockImplementation((id: string) => {
    avisoEmInspecaoMock = id
  })
  mockSairInspecao.mockReset().mockImplementation(() => {
    avisoEmInspecaoMock = null
  })
})

describe('CentralDeAvisos — lista vazia (TL-05)', () => {
  it('renderiza null quando avisosAcionaveis.avisos está vazio', () => {
    avisosMock = []
    const { container } = render(<CentralDeAvisos />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('CentralDeAvisos — conteúdo puro, sem toggle/overlay (TL-06, TL-12)', () => {
  it('renderiza informativos e propostas como cards diretamente, sem clique em toggle', () => {
    avisosMock = [informativo(), proposta()]
    render(<CentralDeAvisos />)

    expect(screen.queryByRole('button', { name: /abrir central de avisos/i })).toBeNull()
    expect(screen.getByText('Valor pendente do mês anterior detectado.')).toBeInTheDocument()
    expect(screen.getByText('Fatura conciliável com pagamento do extrato.')).toBeInTheDocument()
  })

  it('cada aviso usa a classe .card-aviso', () => {
    avisosMock = [informativo(), proposta()]
    const { container } = render(<CentralDeAvisos />)
    expect(container.querySelectorAll('.card-aviso')).toHaveLength(2)
  })
})

describe('CentralDeAvisos — rótulos e ações por estado de proposta (TL-07, TL-08)', () => {
  it('proposta pendente exibe "Aprovar" e "Dispensar"', () => {
    avisosMock = [proposta({ estado: 'pendente' })]
    render(<CentralDeAvisos />)

    expect(screen.getByRole('button', { name: /aprovar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dispensar/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /desfazer/i })).toBeNull()
  })

  it('clicar em "Aprovar" chama aplicar(id) com o id do aviso', () => {
    avisosMock = [proposta({ id: 'prop-xyz', estado: 'pendente' })]
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByRole('button', { name: /aprovar/i }))
    expect(mockAplicar).toHaveBeenCalledWith('prop-xyz')
  })

  it('clicar em "Dispensar" chama dispensar(id) com o id do aviso', () => {
    avisosMock = [proposta({ id: 'prop-xyz', estado: 'pendente' })]
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByRole('button', { name: /dispensar/i }))
    expect(mockDispensar).toHaveBeenCalledWith('prop-xyz')
  })

  it('proposta aplicada exibe "Desfazer" e chama desfazer(id) ao clicar', () => {
    avisosMock = [proposta({ id: 'prop-xyz', estado: 'aplicado' })]
    render(<CentralDeAvisos />)

    const botaoDesfazer = screen.getByRole('button', { name: /desfazer/i })
    fireEvent.click(botaoDesfazer)
    expect(mockDesfazer).toHaveBeenCalledWith('prop-xyz')
  })

  it('proposta dispensada também exibe "Desfazer" e chama desfazer(id) ao clicar', () => {
    avisosMock = [proposta({ id: 'prop-xyz', estado: 'dispensado' })]
    render(<CentralDeAvisos />)

    const botaoDesfazer = screen.getByRole('button', { name: /desfazer/i })
    fireEvent.click(botaoDesfazer)
    expect(mockDesfazer).toHaveBeenCalledWith('prop-xyz')
  })

  it('com múltiplas propostas, cada botão age apenas sobre o próprio item', () => {
    avisosMock = [
      proposta({ id: 'prop-a', estado: 'pendente', mensagem: 'Proposta A' }),
      proposta({ id: 'prop-b', estado: 'pendente', mensagem: 'Proposta B' }),
    ]
    render(<CentralDeAvisos />)

    const itemB = screen.getByText('Proposta B').closest('li') as HTMLElement
    fireEvent.click(within(itemB).getByRole('button', { name: /aprovar/i }))

    expect(mockAplicar).toHaveBeenCalledWith('prop-b')
    expect(mockAplicar).not.toHaveBeenCalledWith('prop-a')
  })
})

describe('CentralDeAvisos — informativos (TL-09)', () => {
  it('aviso informativo nunca exibe "Aprovar"/"Desfazer" — só é dispensável', () => {
    avisosMock = [informativo({ estado: 'pendente' })]
    render(<CentralDeAvisos />)

    expect(screen.queryByRole('button', { name: /aprovar/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /desfazer/i })).toBeNull()
  })

  it('aviso informativo pendente exibe "Dispensar" e clicar chama dispensar(id)', () => {
    avisosMock = [informativo({ id: 'info-xyz', estado: 'pendente' })]
    render(<CentralDeAvisos />)

    const botaoDispensar = screen.getByRole('button', { name: /dispensar/i })
    fireEvent.click(botaoDispensar)
    expect(mockDispensar).toHaveBeenCalledWith('info-xyz')
  })

  it('aviso informativo dispensado não aparece mais na seção "Informativos"', () => {
    avisosMock = [informativo({ id: 'info-xyz', estado: 'dispensado' })]
    render(<CentralDeAvisos />)

    expect(screen.queryByText('Valor pendente do mês anterior detectado.')).toBeNull()
  })
})

describe('CentralDeAvisos — modo inspeção (TL-10, TL-11)', () => {
  it('clicar no corpo do card de uma proposta fora de inspeção chama entrarInspecao(id)', () => {
    avisosMock = [proposta({ id: 'prop-1' })]
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByText('Fatura conciliável com pagamento do extrato.'))

    expect(mockEntrarInspecao).toHaveBeenCalledWith('prop-1')
    expect(mockSairInspecao).not.toHaveBeenCalled()
  })

  it('clicar novamente no card já em inspeção chama sairInspecao()', () => {
    avisosMock = [proposta({ id: 'prop-1' })]
    avisoEmInspecaoMock = 'prop-1'
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByText('Fatura conciliável com pagamento do extrato.'))

    expect(mockSairInspecao).toHaveBeenCalled()
    expect(mockEntrarInspecao).not.toHaveBeenCalled()
  })

  it('clicar em "Aprovar" não dispara o toggle de inspeção (stopPropagation)', () => {
    avisosMock = [proposta({ id: 'prop-1', estado: 'pendente' })]
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByRole('button', { name: /aprovar/i }))

    expect(mockAplicar).toHaveBeenCalledWith('prop-1')
    expect(mockEntrarInspecao).not.toHaveBeenCalled()
    expect(mockSairInspecao).not.toHaveBeenCalled()
  })

  it('clicar em "Dispensar" não dispara o toggle de inspeção (stopPropagation)', () => {
    avisosMock = [proposta({ id: 'prop-1', estado: 'pendente' })]
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByRole('button', { name: /dispensar/i }))

    expect(mockDispensar).toHaveBeenCalledWith('prop-1')
    expect(mockEntrarInspecao).not.toHaveBeenCalled()
    expect(mockSairInspecao).not.toHaveBeenCalled()
  })

  it('clicar em "Desfazer" não dispara o toggle de inspeção (stopPropagation)', () => {
    avisosMock = [proposta({ id: 'prop-1', estado: 'aplicado' })]
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByRole('button', { name: /desfazer/i }))

    expect(mockDesfazer).toHaveBeenCalledWith('prop-1')
    expect(mockEntrarInspecao).not.toHaveBeenCalled()
    expect(mockSairInspecao).not.toHaveBeenCalled()
  })

  it('em inspeção, proposta de conciliação mostra os 2 papéis (sai + fica)', () => {
    avisosMock = [
      proposta({ id: 'prop-1', origem: 'conciliacao', alvo: ['0'], permanece: ['1', '2'] }),
    ]
    avisoEmInspecaoMock = 'prop-1'
    render(<CentralDeAvisos />)

    expect(screen.getByLabelText('Papel: sai')).toBeInTheDocument()
    expect(screen.getByLabelText('Papel: fica')).toBeInTheDocument()
  })

  it('em inspeção, proposta de valor-pendente mostra só o papel "sai", sem bloco de "fica"', () => {
    avisosMock = [
      proposta({
        id: 'prop-1',
        origem: 'valor-pendente',
        alvo: [],
        permanece: [],
        mensagem: 'Valor pendente detectado como proposta.',
      }),
    ]
    avisoEmInspecaoMock = 'prop-1'
    render(<CentralDeAvisos />)

    expect(screen.getByLabelText('Papel: sai')).toBeInTheDocument()
    expect(screen.queryByLabelText('Papel: fica')).toBeNull()
  })

  it('renderiza aviso.resumo quando presente, em modo inspeção', () => {
    avisosMock = [
      proposta({
        id: 'prop-1',
        resumo: 'somatório da fatura R$ 100,00 ↔ pagamento R$ 100,00, diferença ≤ R$ 0,05',
      }),
    ]
    avisoEmInspecaoMock = 'prop-1'
    render(<CentralDeAvisos />)

    expect(screen.getByLabelText('Resumo da regra')).toHaveTextContent(/somatório da fatura/i)
  })

  it('não renderiza bloco de resumo quando resumo é undefined', () => {
    avisosMock = [proposta({ id: 'prop-1', resumo: undefined })]
    avisoEmInspecaoMock = 'prop-1'
    render(<CentralDeAvisos />)

    expect(screen.queryByLabelText('Resumo da regra')).toBeNull()
  })

  it('card fora do modo inspeção não mostra papéis nem resumo', () => {
    avisosMock = [proposta({ id: 'prop-1', resumo: 'algum resumo', permanece: ['1'] })]
    render(<CentralDeAvisos />)

    expect(screen.queryByLabelText('Papel: sai')).toBeNull()
    expect(screen.queryByLabelText('Papel: fica')).toBeNull()
    expect(screen.queryByLabelText('Resumo da regra')).toBeNull()
  })

  it('card de uma proposta não mostra papéis/resumo quando OUTRO aviso está em inspeção', () => {
    avisosMock = [
      proposta({ id: 'prop-a', resumo: 'resumo de A', permanece: ['1'], mensagem: 'Proposta A' }),
      proposta({ id: 'prop-b', resumo: 'resumo de B', permanece: ['2'], mensagem: 'Proposta B' }),
    ]
    avisoEmInspecaoMock = 'prop-b'
    render(<CentralDeAvisos />)

    const itemA = screen.getByText('Proposta A').closest('li') as HTMLElement
    const itemB = screen.getByText('Proposta B').closest('li') as HTMLElement

    expect(within(itemA).queryByLabelText('Papel: sai')).toBeNull()
    expect(within(itemA).queryByLabelText('Resumo da regra')).toBeNull()
    expect(within(itemB).getByLabelText('Papel: sai')).toBeInTheDocument()
    expect(within(itemB).getByLabelText('Resumo da regra')).toHaveTextContent('resumo de B')
  })
})

describe('CentralDeAvisos — aviso VR abre FormVR em vez do toggle de inspeção (TL-80 a TL-85, Task 7)', () => {
  function propostaVR(parcial: Partial<Aviso> = {}): Aviso {
    return proposta({
      id: 'vr',
      origem: 'vr',
      mensagem: 'Registre as despesas pagas com VR neste mês.',
      alvo: [],
      permanece: [],
      ...parcial,
    })
  }

  it('TL-80: antes de qualquer clique, form-vr não está no DOM', () => {
    avisosMock = [propostaVR()]
    render(<CentralDeAvisos />)

    expect(screen.queryByTestId('form-vr')).toBeNull()
  })

  it('TL-81: clicar no card do aviso VR faz o FormVR aparecer', () => {
    avisosMock = [propostaVR()]
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByText('Registre as despesas pagas com VR neste mês.'))

    expect(screen.getByTestId('form-vr')).toBeInTheDocument()
  })

  it('TL-82: clicar no card do aviso VR não chama entrarInspecao nem sairInspecao', () => {
    avisosMock = [propostaVR()]
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByText('Registre as despesas pagas com VR neste mês.'))

    expect(mockEntrarInspecao).not.toHaveBeenCalled()
    expect(mockSairInspecao).not.toHaveBeenCalled()
  })

  it('TL-83: clicar em outro aviso continua chamando entrarInspecao, e form-vr não aparece (regressão)', () => {
    avisosMock = [propostaVR(), proposta({ id: 'prop-1', origem: 'conciliacao' })]
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByText('Fatura conciliável com pagamento do extrato.'))

    expect(mockEntrarInspecao).toHaveBeenCalledWith('prop-1')
    expect(screen.queryByTestId('form-vr')).toBeNull()
  })

  it('TL-84: clicar de novo no card do aviso VR (form já aberto) fecha o form', () => {
    avisosMock = [propostaVR()]
    render(<CentralDeAvisos />)

    const mensagem = screen.getByText('Registre as despesas pagas com VR neste mês.')
    fireEvent.click(mensagem)
    expect(screen.getByTestId('form-vr')).toBeInTheDocument()

    fireEvent.click(mensagem)
    expect(screen.queryByTestId('form-vr')).toBeNull()
  })

  it('TL-85: com o form VR aberto, clicar em outro aviso não fecha nem abre form-vr', () => {
    avisosMock = [propostaVR(), proposta({ id: 'prop-1', origem: 'conciliacao' })]
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByText('Registre as despesas pagas com VR neste mês.'))
    expect(screen.getByTestId('form-vr')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Fatura conciliável com pagamento do extrato.'))

    expect(screen.getByTestId('form-vr')).toBeInTheDocument()
  })
})
