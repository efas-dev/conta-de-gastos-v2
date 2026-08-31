// ADR: see Docs/specs/avisos-acionaveis.adr.md

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { CentralDeAvisos } from '../CentralDeAvisos'
import type { Aviso } from '../../../types'
import * as vrDominio from '../../../dominio/vr'
import * as rendimentosDominio from '../../../dominio/rendimentos'

// TL-93/TL-94 (Task 7-bis): espiona `gerarLancamentosVR` para confirmar qual `mesRef` chega até
// `FormVR`, sem mockar o módulo inteiro (preserva o comportamento real da função pura).
const spyGerarLancamentosVR = vi.spyOn(vrDominio, 'gerarLancamentosVR')

// T11-CA-08: espiona `gerarLancamentoRendimento` para confirmar qual `mesRef` chega até
// `FormRendimentos`, mesmo raciocínio de TL-93 acima.
const spyGerarLancamentoRendimento = vi.spyOn(rendimentosDominio, 'gerarLancamentoRendimento')

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
const mockFocarInspecao = vi.fn()

let avisosMock: Aviso[] = []
let avisoEmInspecaoMock: string | null = null

vi.mock('../../store/appStore', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      avisosAcionaveis: { avisos: avisosMock, removidos: {}, avisoEmInspecao: avisoEmInspecaoMock },
      lancamentos: [],
      saldoAnterior: 0,
      aplicar: mockAplicar,
      desfazer: mockDesfazer,
      dispensar: mockDispensar,
      entrarInspecao: mockEntrarInspecao,
      sairInspecao: mockSairInspecao,
      focarInspecao: mockFocarInspecao,
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
  mockFocarInspecao.mockReset()
  spyGerarLancamentosVR.mockClear()
  spyGerarLancamentoRendimento.mockClear()
})

describe('CentralDeAvisos — lista vazia (TL-13, Task B3)', () => {
  it('renderiza .painel-vazio com duas linhas (o que houve / o que fazer) quando avisosAcionaveis.avisos está vazio', () => {
    avisosMock = []
    const { container } = render(<CentralDeAvisos />)

    const painelVazio = container.querySelector('.painel-vazio')
    expect(painelVazio).toBeInTheDocument()
    expect(painelVazio?.children).toHaveLength(2)
  })

  it('o texto do estado vazio fala em "sugestão", não em "aviso"', () => {
    avisosMock = []
    const { container } = render(<CentralDeAvisos />)

    const texto = container.querySelector('.painel-vazio')?.textContent ?? ''
    expect(texto).toContain('Nenhuma sugestão pendente')
    expect(texto).toMatch(/Novas sugestões aparecem aqui/)
    expect(texto.toLowerCase()).not.toContain('aviso')
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

describe('CentralDeAvisos — rótulos e ações por estado de proposta (TL-07, TL-08, TL5-TL8 Task B3)', () => {
  it('proposta pendente exibe "Aplicar" (classe btn pri mini) e "Dispensar"', () => {
    avisosMock = [proposta({ estado: 'pendente' })]
    render(<CentralDeAvisos />)

    const botaoAplicar = screen.getByRole('button', { name: /^aplicar$/i })
    expect(botaoAplicar).toBeInTheDocument()
    expect(botaoAplicar.className).toBe('btn pri mini')
    expect(screen.getByRole('button', { name: /dispensar/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reverter/i })).toBeNull()
  })

  it('a barra de ações fica alinhada à direita, com "Dispensar" antes de "Aplicar"', () => {
    avisosMock = [proposta({ estado: 'pendente' })]
    const { container } = render(<CentralDeAvisos />)

    const barra = container.querySelector('.card-aviso .acoes-aviso') as HTMLElement
    expect(barra).toBeInTheDocument()
    expect(barra).toHaveStyle({ justifyContent: 'flex-end' })

    const rotulos = Array.from(barra.querySelectorAll('button')).map((b) => b.textContent)
    expect(rotulos).toEqual(['Dispensar', 'Aplicar'])
  })

  it('a barra de ações do informativo também fica alinhada à direita', () => {
    avisosMock = [informativo()]
    const { container } = render(<CentralDeAvisos />)

    const barra = container.querySelector('.card-aviso .acoes-aviso') as HTMLElement
    expect(barra).toHaveStyle({ justifyContent: 'flex-end' })
  })

  it('clicar em "Aplicar" chama aplicar(id) com o id do aviso', () => {
    avisosMock = [proposta({ id: 'prop-xyz', estado: 'pendente' })]
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByRole('button', { name: /^aplicar$/i }))
    expect(mockAplicar).toHaveBeenCalledWith('prop-xyz')
  })

  it('clicar em "Dispensar" chama dispensar(id) com o id do aviso', () => {
    avisosMock = [proposta({ id: 'prop-xyz', estado: 'pendente' })]
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByRole('button', { name: /dispensar/i }))
    expect(mockDispensar).toHaveBeenCalledWith('prop-xyz')
  })

  it('proposta aplicada exibe "Reverter" e chama desfazer(id) ao clicar', () => {
    avisosMock = [proposta({ id: 'prop-xyz', estado: 'aplicado' })]
    render(<CentralDeAvisos />)

    const botaoReverter = screen.getByRole('button', { name: /reverter/i })
    fireEvent.click(botaoReverter)
    expect(mockDesfazer).toHaveBeenCalledWith('prop-xyz')
  })

  it('proposta dispensada também exibe "Reverter" e chama desfazer(id) ao clicar', () => {
    avisosMock = [proposta({ id: 'prop-xyz', estado: 'dispensado' })]
    render(<CentralDeAvisos />)

    const botaoReverter = screen.getByRole('button', { name: /reverter/i })
    fireEvent.click(botaoReverter)
    expect(mockDesfazer).toHaveBeenCalledWith('prop-xyz')
  })

  it('com múltiplas propostas, cada botão age apenas sobre o próprio item', () => {
    avisosMock = [
      proposta({ id: 'prop-a', estado: 'pendente', mensagem: 'Proposta A' }),
      proposta({ id: 'prop-b', estado: 'pendente', mensagem: 'Proposta B' }),
    ]
    render(<CentralDeAvisos />)

    const itemB = screen.getByText('Proposta B').closest('li') as HTMLElement
    fireEvent.click(within(itemB).getByRole('button', { name: /^aplicar$/i }))

    expect(mockAplicar).toHaveBeenCalledWith('prop-b')
    expect(mockAplicar).not.toHaveBeenCalledWith('prop-a')
  })
})

describe('CentralDeAvisos — informativos (TL-09, TL9 Task B3)', () => {
  it('aviso informativo nunca exibe "Aplicar"/"Reverter" — só é dispensável', () => {
    avisosMock = [informativo({ estado: 'pendente' })]
    render(<CentralDeAvisos />)

    expect(screen.queryByRole('button', { name: /^aplicar$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /reverter/i })).toBeNull()
  })

  it('aviso informativo pendente exibe "OK, entendi" e clicar chama dispensar(id)', () => {
    avisosMock = [informativo({ id: 'info-xyz', estado: 'pendente' })]
    render(<CentralDeAvisos />)

    const botaoOk = screen.getByRole('button', { name: /ok, entendi/i })
    fireEvent.click(botaoOk)
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

  /**
   * "Ir para a linha" (resíduo do item 39.1 do TODO). O card é um TOGGLE: clicar nele de novo
   * SAI da inspeção, então não havia como pedir o scroll outra vez depois de rolar a grid à mão
   * sem antes perder o realce. O botão dedicado pede foco sem mexer no estado de inspeção.
   *
   * TL-39c-1: card em inspeção mostra o botão
   * TL-39c-2: card fora de inspeção não mostra
   * TL-39c-3: clicar chama focarInspecao e NÃO sai da inspeção (stopPropagation)
   */
  it('TL-39c-1: card em inspeção mostra o botão "Ir para a linha"', () => {
    avisosMock = [proposta({ id: 'prop-1' })]
    avisoEmInspecaoMock = 'prop-1'
    render(<CentralDeAvisos />)

    expect(screen.getByRole('button', { name: /ir para a linha/i })).toBeInTheDocument()
  })

  it('TL-39c-2: card fora de inspeção não mostra o botão "Ir para a linha"', () => {
    avisosMock = [proposta({ id: 'prop-1' })]
    render(<CentralDeAvisos />)

    expect(screen.queryByRole('button', { name: /ir para a linha/i })).not.toBeInTheDocument()
  })

  it('TL-39c-3: clicar em "Ir para a linha" chama focarInspecao sem sair da inspeção', () => {
    avisosMock = [proposta({ id: 'prop-1' })]
    avisoEmInspecaoMock = 'prop-1'
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByRole('button', { name: /ir para a linha/i }))

    expect(mockFocarInspecao).toHaveBeenCalledTimes(1)
    expect(mockSairInspecao).not.toHaveBeenCalled()
    expect(mockEntrarInspecao).not.toHaveBeenCalled()
  })

  it('clicar em "Aplicar" não dispara o toggle de inspeção (stopPropagation)', () => {
    avisosMock = [proposta({ id: 'prop-1', estado: 'pendente' })]
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByRole('button', { name: /^aplicar$/i }))

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

  it('clicar em "Reverter" não dispara o toggle de inspeção (stopPropagation)', () => {
    avisosMock = [proposta({ id: 'prop-1', estado: 'aplicado' })]
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByRole('button', { name: /reverter/i }))

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

describe('CentralDeAvisos — teclado real no card interativo (TL1-TL4, Task B3)', () => {
  it('TL1: o <li> do card de proposta tem role="button" e tabIndex=0', () => {
    avisosMock = [proposta({ id: 'prop-1' })]
    render(<CentralDeAvisos />)

    const card = screen.getByText('Fatura conciliável com pagamento do extrato.').closest('li') as HTMLElement
    expect(card).toHaveAttribute('role', 'button')
    expect(card).toHaveAttribute('tabIndex', '0')
  })

  it('TL2: Enter no card fora de inspeção chama entrarInspecao(id), igual ao clique', () => {
    avisosMock = [proposta({ id: 'prop-1' })]
    render(<CentralDeAvisos />)

    const card = screen.getByText('Fatura conciliável com pagamento do extrato.').closest('li') as HTMLElement
    fireEvent.keyDown(card, { key: 'Enter' })

    expect(mockEntrarInspecao).toHaveBeenCalledWith('prop-1')
    expect(mockSairInspecao).not.toHaveBeenCalled()
  })

  it('TL3: Espaço no card já em inspeção chama sairInspecao(), igual ao clique', () => {
    avisosMock = [proposta({ id: 'prop-1' })]
    avisoEmInspecaoMock = 'prop-1'
    render(<CentralDeAvisos />)

    const card = screen.getByText('Fatura conciliável com pagamento do extrato.').closest('li') as HTMLElement
    fireEvent.keyDown(card, { key: ' ' })

    expect(mockSairInspecao).toHaveBeenCalled()
    expect(mockEntrarInspecao).not.toHaveBeenCalled()
  })

  it('TL4: outra tecla no card não dispara entrarInspecao nem sairInspecao', () => {
    avisosMock = [proposta({ id: 'prop-1' })]
    render(<CentralDeAvisos />)

    const card = screen.getByText('Fatura conciliável com pagamento do extrato.').closest('li') as HTMLElement
    fireEvent.keyDown(card, { key: 'a' })

    expect(mockEntrarInspecao).not.toHaveBeenCalled()
    expect(mockSairInspecao).not.toHaveBeenCalled()
  })

  it('TL14: Enter com o evento originado no botão "Aplicar" (bubbling) não dispara a ação do card', () => {
    avisosMock = [proposta({ id: 'prop-1' })]
    render(<CentralDeAvisos />)

    const botaoAplicar = screen.getByRole('button', { name: /^aplicar$/i })
    fireEvent.keyDown(botaoAplicar, { key: 'Enter' })

    expect(mockEntrarInspecao).not.toHaveBeenCalled()
    expect(mockSairInspecao).not.toHaveBeenCalled()
  })
})

describe('CentralDeAvisos — avisos vr/rendimentos suprimem o botão afirmativo (TL10-TL12, Task B3)', () => {
  it('TL10: proposta pendente com origem "vr" não renderiza o botão "Aplicar"', () => {
    avisosMock = [
      proposta({ id: 'vr', origem: 'vr', estado: 'pendente', mensagem: 'Registre as despesas pagas com VR neste mês.' }),
    ]
    render(<CentralDeAvisos />)

    expect(screen.queryByRole('button', { name: /^aplicar$/i })).toBeNull()
  })

  it('TL11: proposta pendente com origem "rendimentos" não renderiza o botão "Aplicar"', () => {
    avisosMock = [
      proposta({
        id: 'rendimentos',
        origem: 'rendimentos',
        estado: 'pendente',
        mensagem: 'Informe o saldo real para lançar os rendimentos do mês.',
      }),
    ]
    render(<CentralDeAvisos />)

    expect(screen.queryByRole('button', { name: /^aplicar$/i })).toBeNull()
  })

  it('TL12: proposta pendente com origem "vr" ainda renderiza "Dispensar"', () => {
    avisosMock = [
      proposta({ id: 'vr', origem: 'vr', estado: 'pendente', mensagem: 'Registre as despesas pagas com VR neste mês.' }),
    ]
    render(<CentralDeAvisos />)

    expect(screen.getByRole('button', { name: /dispensar/i })).toBeInTheDocument()
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

describe('CentralDeAvisos — mesRef real chega ao FormVR (TL-93, TL-94, Task 7-bis)', () => {
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

  function preencherEConfirmar() {
    fireEvent.change(screen.getByLabelText('Valor da despesa 1'), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText('Natureza da despesa 1'), { target: { value: 'ALM' } })
    fireEvent.change(screen.getByLabelText('Descrição da despesa 1'), { target: { value: 'Mercado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Efetivar lançamentos' }))
  }

  it('TL-93: com a prop mesRef fornecida (diferente do default), FormVR usa esse mesRef ao gerar os lançamentos', () => {
    avisosMock = [propostaVR()]
    render(<CentralDeAvisos mesRef="2026-03" />)

    fireEvent.click(screen.getByText('Registre as despesas pagas com VR neste mês.'))
    preencherEConfirmar()

    expect(spyGerarLancamentosVR).toHaveBeenCalledWith(expect.any(Array), '2026-03')
  })

  it('TL-94: sem a prop mesRef (compatibilidade retroativa), FormVR usa defaultMes() — comportamento pré-Task 7-bis preservado', () => {
    avisosMock = [propostaVR()]
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByText('Registre as despesas pagas com VR neste mês.'))
    preencherEConfirmar()

    const mesUsado = spyGerarLancamentosVR.mock.calls[0]?.[1]
    expect(mesUsado).toMatch(/^\d{4}-\d{2}$/)
  })
})

describe('CentralDeAvisos — aviso rendimentos abre FormRendimentos em vez do toggle de inspeção (Task 11)', () => {
  function propostaRendimentos(parcial: Partial<Aviso> = {}): Aviso {
    return proposta({
      id: 'rendimentos',
      origem: 'rendimentos',
      mensagem: 'Informe o saldo real para lançar os rendimentos do mês.',
      alvo: [],
      permanece: [],
      ...parcial,
    })
  }

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

  it('T11-CA-01: antes de qualquer clique, form-rendimentos não está no DOM', () => {
    avisosMock = [propostaRendimentos()]
    render(<CentralDeAvisos />)

    expect(screen.queryByTestId('form-rendimentos')).toBeNull()
  })

  it('T11-CA-02: clicar no card do aviso rendimentos faz o FormRendimentos aparecer', () => {
    avisosMock = [propostaRendimentos()]
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByText('Informe o saldo real para lançar os rendimentos do mês.'))

    expect(screen.getByTestId('form-rendimentos')).toBeInTheDocument()
  })

  it('T11-CA-03: clicar no card do aviso rendimentos não chama entrarInspecao nem sairInspecao', () => {
    avisosMock = [propostaRendimentos()]
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByText('Informe o saldo real para lançar os rendimentos do mês.'))

    expect(mockEntrarInspecao).not.toHaveBeenCalled()
    expect(mockSairInspecao).not.toHaveBeenCalled()
  })

  it('T11-CA-04: clicar no card do aviso vr continua abrindo FormVR, não FormRendimentos', () => {
    avisosMock = [propostaVR(), propostaRendimentos()]
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByText('Registre as despesas pagas com VR neste mês.'))

    expect(screen.getByTestId('form-vr')).toBeInTheDocument()
    expect(screen.queryByTestId('form-rendimentos')).toBeNull()
  })

  it('T11-CA-05: clicar em outro aviso (não-rendimentos, não-vr) mantém o toggle de inspeção sem regressão', () => {
    avisosMock = [propostaRendimentos(), proposta({ id: 'prop-1', origem: 'conciliacao' })]
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByText('Fatura conciliável com pagamento do extrato.'))

    expect(mockEntrarInspecao).toHaveBeenCalledWith('prop-1')
    expect(screen.queryByTestId('form-rendimentos')).toBeNull()
  })

  it('T11-CA-06: clicar de novo no card do aviso rendimentos (form já aberto) fecha o form', () => {
    avisosMock = [propostaRendimentos()]
    render(<CentralDeAvisos />)

    const mensagem = screen.getByText('Informe o saldo real para lançar os rendimentos do mês.')
    fireEvent.click(mensagem)
    expect(screen.getByTestId('form-rendimentos')).toBeInTheDocument()

    fireEvent.click(mensagem)
    expect(screen.queryByTestId('form-rendimentos')).toBeNull()
  })

  it('T11-CA-07: com o FormRendimentos aberto, clicar em outro aviso não fecha nem abre form-rendimentos', () => {
    avisosMock = [propostaRendimentos(), proposta({ id: 'prop-1', origem: 'conciliacao' })]
    render(<CentralDeAvisos />)

    fireEvent.click(screen.getByText('Informe o saldo real para lançar os rendimentos do mês.'))
    expect(screen.getByTestId('form-rendimentos')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Fatura conciliável com pagamento do extrato.'))

    expect(screen.getByTestId('form-rendimentos')).toBeInTheDocument()
  })

  it('T11-CA-08: a prop mesRef de CentralDeAvisos chega ao FormRendimentos', () => {
    avisosMock = [propostaRendimentos()]
    render(<CentralDeAvisos mesRef="2026-03" />)

    fireEvent.click(screen.getByText('Informe o saldo real para lançar os rendimentos do mês.'))
    fireEvent.change(screen.getByLabelText('Conta corrente'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lançar rendimento' }))

    expect(spyGerarLancamentoRendimento).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), '2026-03')
  })
})

describe('CentralDeAvisos — distinção "inspecionando" vs "expandido" (Task B16, emenda patches-ui-ux)', () => {
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

  function propostaRendimentos(parcial: Partial<Aviso> = {}): Aviso {
    return proposta({
      id: 'rendimentos',
      origem: 'rendimentos',
      mensagem: 'Informe o saldo real para lançar os rendimentos do mês.',
      alvo: [],
      permanece: [],
      ...parcial,
    })
  }

  it('B16-01: com o FormVR aberto, o card recebe "expandido" e NÃO recebe "inspecionando"', () => {
    avisosMock = [propostaVR()]
    render(<CentralDeAvisos />)

    const mensagem = screen.getByText('Registre as despesas pagas com VR neste mês.')
    fireEvent.click(mensagem)

    const card = mensagem.closest('li') as HTMLElement
    expect(card.className).toContain('expandido')
    expect(card.className).not.toContain('inspecionando')
  })

  it('B16-02: com o FormRendimentos aberto, o card recebe "expandido" e NÃO recebe "inspecionando"', () => {
    avisosMock = [propostaRendimentos()]
    render(<CentralDeAvisos />)

    const mensagem = screen.getByText('Informe o saldo real para lançar os rendimentos do mês.')
    fireEvent.click(mensagem)

    const card = mensagem.closest('li') as HTMLElement
    expect(card.className).toContain('expandido')
    expect(card.className).not.toContain('inspecionando')
  })

  it('B16-03: um card em inspeção (sem form aberto) recebe "inspecionando" e NÃO recebe "expandido"', () => {
    avisosMock = [proposta({ id: 'prop-1' })]
    avisoEmInspecaoMock = 'prop-1'
    render(<CentralDeAvisos />)

    const card = screen.getByText('Fatura conciliável com pagamento do extrato.').closest('li') as HTMLElement
    expect(card.className).toContain('inspecionando')
    expect(card.className).not.toContain('expandido')
  })

  it('B16-04: card resolvido (estado aplicado) continua recebendo "resolvido"', () => {
    avisosMock = [proposta({ id: 'prop-1', estado: 'aplicado' })]
    render(<CentralDeAvisos />)

    const card = screen.getByText('Fatura conciliável com pagamento do extrato.').closest('li') as HTMLElement
    expect(card.className).toContain('resolvido')
  })
})
