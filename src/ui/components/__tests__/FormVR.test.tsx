// ADR: see spec/vr-despesas.adr.md

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FormVR } from '../FormVR'
import { useAppStore } from '../../store/appStore'
import type { Aviso } from '../../../types'

function avisoVR(parcial: Partial<Aviso> = {}): Aviso {
  return {
    id: 'vr',
    tipo: 'proposta',
    origem: 'vr',
    mensagem: 'Despesas da casa pagas com vale-refeição? Clique para lançar.',
    alvo: [],
    permanece: [],
    estado: 'pendente',
    ...parcial,
  }
}

beforeEach(() => {
  useAppStore.setState({
    lancamentos: [],
    avisosAcionaveis: { avisos: [avisoVR()], removidos: {}, adicionados: {}, avisoEmInspecao: null },
  })
})

function preencherDespesa(indice: number, valor: string, natureza: string, descricao: string) {
  fireEvent.change(screen.getByLabelText(`Valor da despesa ${indice}`), { target: { value: valor } })
  fireEvent.change(screen.getByLabelText(`Natureza da despesa ${indice}`), { target: { value: natureza } })
  fireEvent.change(screen.getByLabelText(`Descrição da despesa ${indice}`), { target: { value: descricao } })
}

describe('FormVR — estrutura inicial (TL-68)', () => {
  it('renderiza com data-testid="form-vr" e 1 linha de despesa vazia por padrão', () => {
    render(<FormVR mesRef="2026-07" />)

    expect(screen.getByTestId('form-vr')).toBeInTheDocument()
    expect(screen.getByLabelText('Valor da despesa 1')).toHaveValue('')
    expect(screen.getByLabelText('Natureza da despesa 1')).toHaveValue('')
    expect(screen.getByLabelText('Descrição da despesa 1')).toHaveValue('')
  })
})

describe('FormVR — adicionar/remover linhas (TL-69, TL-70)', () => {
  it('clicar em "Adicionar despesa" acrescenta uma nova linha vazia', () => {
    render(<FormVR mesRef="2026-07" />)

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar despesa' }))

    expect(screen.getByLabelText('Valor da despesa 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Valor da despesa 2')).toBeInTheDocument()
  })

  it('clicar no botão de remover uma linha remove exatamente aquela despesa, preservando as demais', () => {
    render(<FormVR mesRef="2026-07" />)

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar despesa' }))
    preencherDespesa(1, '10', 'ALM', 'Mercado')
    preencherDespesa(2, '20', 'TRN', 'Ônibus')

    fireEvent.click(screen.getByRole('button', { name: 'Remover despesa 1' }))

    expect(screen.getByLabelText('Valor da despesa 1')).toHaveValue('20')
    expect(screen.getByLabelText('Natureza da despesa 1')).toHaveValue('TRN')
    expect(screen.getByLabelText('Descrição da despesa 1')).toHaveValue('Ônibus')
    expect(screen.queryByLabelText('Valor da despesa 2')).toBeNull()
  })
})

describe('FormVR — caminho válido, integração com a store real (TL-71, TL-72, TL-73, TL-79)', () => {
  it('1 despesa válida e confirmar insere N+1=2 lançamentos novos na store', () => {
    render(<FormVR mesRef="2026-07" />)

    preencherDespesa(1, '150', 'ALM', 'Mercado do mês')
    fireEvent.click(screen.getByRole('button', { name: 'Efetivar lançamentos' }))

    const lancamentos = useAppStore.getState().lancamentos
    expect(lancamentos).toHaveLength(2)
    expect(lancamentos.filter((l) => l.fonte === 'form_vr')).toHaveLength(2)
    expect(lancamentos.some((l) => l.natureza === 'RR' && l.valor === 150)).toBe(true)
    expect(lancamentos.some((l) => l.natureza === 'ALM' && l.valor === -150)).toBe(true)
  })

  it('3 despesas válidas e confirmar insere N+1=4 lançamentos', () => {
    render(<FormVR mesRef="2026-07" />)

    preencherDespesa(1, '10', 'ALM', 'Mercado')
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar despesa' }))
    preencherDespesa(2, '20', 'TRN', 'Ônibus')
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar despesa' }))
    preencherDespesa(3, '30', 'LAZ', 'Cinema')

    fireEvent.click(screen.getByRole('button', { name: 'Efetivar lançamentos' }))

    expect(useAppStore.getState().lancamentos).toHaveLength(4)
  })

  it('após confirmar com sucesso, o aviso vr fica estado "aplicado"', () => {
    render(<FormVR mesRef="2026-07" />)

    preencherDespesa(1, '150', 'ALM', 'Mercado do mês')
    fireEvent.click(screen.getByRole('button', { name: 'Efetivar lançamentos' }))

    const aviso = useAppStore.getState().avisosAcionaveis.avisos.find((a) => a.id === 'vr')
    expect(aviso?.estado).toBe('aplicado')
  })

  it('após aplicação bem-sucedida, o formulário volta a exibir 1 linha vazia', () => {
    render(<FormVR mesRef="2026-07" />)

    preencherDespesa(1, '150', 'ALM', 'Mercado do mês')
    fireEvent.click(screen.getByRole('button', { name: 'Efetivar lançamentos' }))

    expect(screen.getByLabelText('Valor da despesa 1')).toHaveValue('')
    expect(screen.queryByLabelText('Valor da despesa 2')).toBeNull()
  })
})

describe('FormVR — classes oficiais (B1)', () => {
  it('os três campos por despesa (valor, natureza, descrição) usam a classe .input', () => {
    render(<FormVR mesRef="2026-07" />)

    expect(screen.getByLabelText('Valor da despesa 1')).toHaveClass('input')
    expect(screen.getByLabelText('Natureza da despesa 1')).toHaveClass('input')
    expect(screen.getByLabelText('Descrição da despesa 1')).toHaveClass('input')
  })
})

describe('FormVR — CTA com verbo específico (V5)', () => {
  it('o CTA principal chama-se "Efetivar lançamentos" e mantém a classe btn pri mini', () => {
    render(<FormVR mesRef="2026-07" />)

    const cta = screen.getByRole('button', { name: 'Efetivar lançamentos' })
    expect(cta).toHaveClass('btn', 'pri', 'mini')
  })
})

describe('FormVR — variante .input.mini (V4)', () => {
  it('os três campos por despesa (valor, natureza, descrição) mantêm .input e ganham .mini', () => {
    render(<FormVR mesRef="2026-07" />)

    expect(screen.getByLabelText('Valor da despesa 1')).toHaveClass('input')
    expect(screen.getByLabelText('Valor da despesa 1')).toHaveClass('mini')
    expect(screen.getByLabelText('Natureza da despesa 1')).toHaveClass('input')
    expect(screen.getByLabelText('Natureza da despesa 1')).toHaveClass('mini')
    expect(screen.getByLabelText('Descrição da despesa 1')).toHaveClass('input')
    expect(screen.getByLabelText('Descrição da despesa 1')).toHaveClass('mini')
  })
})

describe('FormVR — divisor sutil no lugar do heading (V3)', () => {
  it('não renderiza mais o texto do heading "Despesas pagas com VR"', () => {
    render(<FormVR mesRef="2026-07" />)

    expect(screen.queryByText('Despesas pagas com VR')).toBeNull()
  })

  it('renderiza um divisor sutil (.divisor-sutil) no lugar do heading removido', () => {
    const { container } = render(<FormVR mesRef="2026-07" />)

    expect(container.querySelector('.divisor-sutil')).not.toBeNull()
  })
})

describe('FormVR — layout .despesa (V1)', () => {
  it('o <li> de cada despesa usa a classe .despesa', () => {
    const { container } = render(<FormVR mesRef="2026-07" />)

    const li = container.querySelector('li')
    expect(li).toHaveClass('despesa')
  })

  it('dentro do <li>, a descrição vem antes de valor e natureza no DOM', () => {
    render(<FormVR mesRef="2026-07" />)

    const descricao = screen.getByLabelText('Descrição da despesa 1')
    const valor = screen.getByLabelText('Valor da despesa 1')
    const natureza = screen.getByLabelText('Natureza da despesa 1')

    // DOCUMENT_POSITION_FOLLOWING (4) indica que o nó comparado vem depois do nó de referência.
    expect(descricao.compareDocumentPosition(valor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(descricao.compareDocumentPosition(natureza) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('FormVR — botão de remover compacto (V2)', () => {
  it('o botão de remover usa a classe .desp-x, não mais "btn sec mini"', () => {
    render(<FormVR mesRef="2026-07" />)

    const botaoRemover = screen.getByRole('button', { name: 'Remover despesa 1' })
    expect(botaoRemover).toHaveClass('desp-x')
    expect(botaoRemover).not.toHaveClass('btn')
  })

  it('o botão de remover não expõe mais o texto "Remover", só o símbolo ×', () => {
    render(<FormVR mesRef="2026-07" />)

    expect(screen.queryByText('Remover')).toBeNull()
    const botaoRemover = screen.getByRole('button', { name: 'Remover despesa 1' })
    expect(botaoRemover).toHaveTextContent('×')
  })

  it('cada linha tem um aria-label dinâmico distinto por índice', () => {
    render(<FormVR mesRef="2026-07" />)

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar despesa' }))

    expect(screen.getByRole('button', { name: 'Remover despesa 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remover despesa 2' })).toBeInTheDocument()
  })
})

describe('FormVR — caminhos inválidos, sem crash (TL-74, TL-75, TL-76, TL-77, TL-78)', () => {
  it('formulário vazio (0 despesas) bloqueia com mensagem de erro e não insere lançamento', () => {
    render(<FormVR mesRef="2026-07" />)

    fireEvent.click(screen.getByRole('button', { name: 'Remover despesa 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Efetivar lançamentos' }))

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(useAppStore.getState().lancamentos).toHaveLength(0)
    expect(useAppStore.getState().avisosAcionaveis.avisos.find((a) => a.id === 'vr')?.estado).toBe('pendente')
  })

  it('valor <= 0 bloqueia com mensagem de erro', () => {
    render(<FormVR mesRef="2026-07" />)

    preencherDespesa(1, '0', 'ALM', 'Mercado')
    fireEvent.click(screen.getByRole('button', { name: 'Efetivar lançamentos' }))

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(useAppStore.getState().lancamentos).toHaveLength(0)
  })

  it('valor não-numérico bloqueia com mensagem de erro', () => {
    render(<FormVR mesRef="2026-07" />)

    preencherDespesa(1, 'abc', 'ALM', 'Mercado')
    fireEvent.click(screen.getByRole('button', { name: 'Efetivar lançamentos' }))

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(useAppStore.getState().lancamentos).toHaveLength(0)
  })

  it('natureza vazia (só espaços) bloqueia com mensagem de erro', () => {
    render(<FormVR mesRef="2026-07" />)

    preencherDespesa(1, '10', '   ', 'Mercado')
    fireEvent.click(screen.getByRole('button', { name: 'Efetivar lançamentos' }))

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(useAppStore.getState().lancamentos).toHaveLength(0)
  })

  it('descrição vazia (só espaços) bloqueia com mensagem de erro', () => {
    render(<FormVR mesRef="2026-07" />)

    preencherDespesa(1, '10', 'ALM', '   ')
    fireEvent.click(screen.getByRole('button', { name: 'Efetivar lançamentos' }))

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(useAppStore.getState().lancamentos).toHaveLength(0)
  })

  it('aviso vr ausente na store não lança exceção ao confirmar (best-effort)', () => {
    useAppStore.setState({
      lancamentos: [],
      avisosAcionaveis: { avisos: [], removidos: {}, adicionados: {}, avisoEmInspecao: null },
    })
    render(<FormVR mesRef="2026-07" />)

    preencherDespesa(1, '10', 'ALM', 'Mercado')

    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Efetivar lançamentos' }))).not.toThrow()
    expect(useAppStore.getState().lancamentos).toHaveLength(0)
  })
})
