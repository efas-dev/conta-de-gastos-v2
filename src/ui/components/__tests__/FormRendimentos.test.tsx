// ADR: see Docs/specs/rendimentos.adr.md

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FormRendimentos } from '../FormRendimentos'
import { useAppStore } from '../../store/appStore'
import type { Aviso, Lancamento } from '../../../types'

function avisoRendimentos(parcial: Partial<Aviso> = {}): Aviso {
  return {
    id: 'rendimentos',
    tipo: 'proposta',
    origem: 'rendimentos',
    mensagem: 'Lançar rendimentos do mês? Clique para informar os saldos.',
    alvo: [],
    permanece: [],
    estado: 'pendente',
    ...parcial,
  }
}

function lancamento(parcial: Partial<Lancamento> = {}): Lancamento {
  return {
    id: 1,
    fonte: 'Nubank',
    data: '2026-07-10',
    transcricao: 'Compra',
    valor: 100,
    iniciais: '',
    natureza: 'ALM',
    descricao: '',
    ...parcial,
  }
}

beforeEach(() => {
  useAppStore.setState({
    lancamentos: [],
    saldoAnterior: 1000,
    avisosAcionaveis: { avisos: [avisoRendimentos()], removidos: {}, adicionados: {}, avisoEmInspecao: null },
  })
})

describe('FormRendimentos — estrutura inicial (T10-FR-01)', () => {
  it('renderiza com data-testid="form-rendimentos", campos e lembrete de exemplos', () => {
    render(<FormRendimentos mesRef="2026-07" />)

    expect(screen.getByTestId('form-rendimentos')).toBeInTheDocument()
    expect(screen.getByLabelText('Conta corrente')).toBeInTheDocument()
    expect(screen.getByLabelText('Aplicações')).toBeInTheDocument()
    expect(screen.getByText(/caixinhas/i)).toBeInTheDocument()
    expect(screen.getByText(/porquinhos/i)).toBeInTheDocument()
    expect(screen.getByText(/cofrinhos/i)).toBeInTheDocument()
  })
})

describe('FormRendimentos — CTA "Lançar rendimento" (R3)', () => {
  it('o CTA exibe "Lançar rendimento" mantendo a classe btn pri mini', () => {
    render(<FormRendimentos mesRef="2026-07" />)

    const cta = screen.getByRole('button', { name: 'Lançar rendimento' })
    expect(cta).toHaveClass('btn')
    expect(cta).toHaveClass('pri')
    expect(cta).toHaveClass('mini')
  })
})

describe('FormRendimentos — feedback visual da soma inline (T10-FR-02, T10-FR-03, T10-FR-04)', () => {
  it('mostra feedback verde quando a soma inline é reconhecida como válida', () => {
    render(<FormRendimentos mesRef="2026-07" />)

    const campoAplicacoes = screen.getByLabelText('Aplicações')
    fireEvent.change(campoAplicacoes, { target: { value: '100+50' } })

    expect(campoAplicacoes).toHaveAttribute('data-soma-valida', 'true')
  })

  it('NÃO mostra feedback verde quando a soma inline é malformada', () => {
    render(<FormRendimentos mesRef="2026-07" />)

    const campoAplicacoes = screen.getByLabelText('Aplicações')
    fireEvent.change(campoAplicacoes, { target: { value: '100+' } })

    expect(campoAplicacoes).toHaveAttribute('data-soma-valida', 'false')
  })

  it('campo vazio não mostra feedback verde nem de erro (estado neutro)', () => {
    render(<FormRendimentos mesRef="2026-07" />)

    const campoAplicacoes = screen.getByLabelText('Aplicações')

    expect(campoAplicacoes).toHaveAttribute('data-soma-valida', 'neutro')
  })
})

describe('FormRendimentos — caminho de lançamento, integração com a store real (T10-FR-05, T10-FR-06)', () => {
  it('informado >= calculado dispara aplicar com Mutacao adicionar contendo o RR', () => {
    useAppStore.setState({ lancamentos: [], saldoAnterior: 1000 })
    render(<FormRendimentos mesRef="2026-07" />)

    fireEvent.change(screen.getByLabelText('Conta corrente'), { target: { value: '900' } })
    fireEvent.change(screen.getByLabelText('Aplicações'), { target: { value: '150' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lançar rendimento' }))

    const lancamentos = useAppStore.getState().lancamentos
    expect(lancamentos).toHaveLength(1)
    expect(lancamentos[0].natureza).toBe('RR')
    expect(lancamentos[0].fonte).toBe('form_rendimentos')
    expect(lancamentos[0].valor).toBe(50)

    const aviso = useAppStore.getState().avisosAcionaveis.avisos.find((a) => a.id === 'rendimentos')
    expect(aviso?.estado).toBe('aplicado')
  })

  it('saldo informado inclui os lançamentos existentes no cálculo do saldo calculado', () => {
    useAppStore.setState({
      lancamentos: [lancamento({ id: 1, valor: 200 })],
      saldoAnterior: 1000,
    })
    render(<FormRendimentos mesRef="2026-07" />)

    // saldoCalculado = 1000 + 200 = 1200; informado = 1300 -> diferenca 100
    fireEvent.change(screen.getByLabelText('Conta corrente'), { target: { value: '1300' } })
    fireEvent.change(screen.getByLabelText('Aplicações'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lançar rendimento' }))

    const lancamentos = useAppStore.getState().lancamentos
    const rr = lancamentos.find((l) => l.natureza === 'RR')
    expect(rr?.valor).toBe(100)
  })
})

describe('FormRendimentos — diferença negativa, conciliação manual (T10-FR-07)', () => {
  it('informado < calculado NÃO dispara Mutacao e exibe orientação de conciliação manual', () => {
    useAppStore.setState({ lancamentos: [], saldoAnterior: 1000 })
    render(<FormRendimentos mesRef="2026-07" />)

    fireEvent.change(screen.getByLabelText('Conta corrente'), { target: { value: '800' } })
    fireEvent.change(screen.getByLabelText('Aplicações'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lançar rendimento' }))

    expect(useAppStore.getState().lancamentos).toHaveLength(0)
    expect(
      useAppStore.getState().avisosAcionaveis.avisos.find((a) => a.id === 'rendimentos')?.estado,
    ).toBe('pendente')
    expect(screen.getByRole('alert')).toHaveTextContent(/confira o grid/i)
  })
})

describe('FormRendimentos — sanity check (T10-FR-08, T10-FR-09)', () => {
  it('diferença acima do limiar exibe aviso não-bloqueante e ainda permite lançar', () => {
    useAppStore.setState({ lancamentos: [], saldoAnterior: 1000 })
    render(<FormRendimentos mesRef="2026-07" />)

    // saldoCalculado = 1000; informado = 1200 -> diferenca 200, > 5% de 1200 (60)
    fireEvent.change(screen.getByLabelText('Conta corrente'), { target: { value: '1200' } })
    fireEvent.change(screen.getByLabelText('Aplicações'), { target: { value: '0' } })

    expect(screen.getByText(/excede/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Lançar rendimento' }))
    expect(useAppStore.getState().lancamentos).toHaveLength(1)
  })

  it('diferença dentro do limiar não exibe aviso de excesso', () => {
    useAppStore.setState({ lancamentos: [], saldoAnterior: 1000 })
    render(<FormRendimentos mesRef="2026-07" />)

    // saldoCalculado = 1000; informado = 1010 -> diferenca 10, < 5% de 1010
    fireEvent.change(screen.getByLabelText('Conta corrente'), { target: { value: '1010' } })
    fireEvent.change(screen.getByLabelText('Aplicações'), { target: { value: '0' } })

    expect(screen.queryByText(/excede/i)).toBeNull()
  })
})

describe('FormRendimentos — saldoAnterior null (T10-FR-10)', () => {
  it('bloqueia o submit com mensagem orientando a subir o xlsx do mês anterior', () => {
    useAppStore.setState({ lancamentos: [], saldoAnterior: null })
    render(<FormRendimentos mesRef="2026-07" />)

    fireEvent.change(screen.getByLabelText('Conta corrente'), { target: { value: '900' } })
    fireEvent.change(screen.getByLabelText('Aplicações'), { target: { value: '150' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lançar rendimento' }))

    expect(screen.getByRole('alert')).toHaveTextContent(/mês anterior/i)
    expect(useAppStore.getState().lancamentos).toHaveLength(0)
  })
})

describe('FormRendimentos — validação de conta corrente (T10-FR-11)', () => {
  it('valor não-numérico em conta corrente bloqueia com mensagem de erro, sem crash', () => {
    useAppStore.setState({ lancamentos: [], saldoAnterior: 1000 })
    render(<FormRendimentos mesRef="2026-07" />)

    fireEvent.change(screen.getByLabelText('Conta corrente'), { target: { value: 'abc' } })
    fireEvent.change(screen.getByLabelText('Aplicações'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lançar rendimento' }))

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(useAppStore.getState().lancamentos).toHaveLength(0)
  })
})

describe('FormRendimentos — classes oficiais e placeholders (B1)', () => {
  it('campo "Conta corrente" usa a classe .input e o placeholder "Ex.: 1234,56"', () => {
    render(<FormRendimentos mesRef="2026-07" />)

    const campo = screen.getByLabelText('Conta corrente')
    expect(campo).toHaveClass('input')
    expect(campo).toHaveAttribute('placeholder', 'Ex.: 1234,56')
  })

  it('campo "Aplicações" usa a classe .input e mantém o placeholder "Ex.: 100+50+20"', () => {
    render(<FormRendimentos mesRef="2026-07" />)

    const campo = screen.getByLabelText('Aplicações')
    expect(campo).toHaveClass('input')
    expect(campo).toHaveAttribute('placeholder', 'Ex.: 100+50+20')
  })

  it('os dois campos usam os wrappers .campo e os rótulos usam a classe .rotulo', () => {
    render(<FormRendimentos mesRef="2026-07" />)

    expect(document.querySelectorAll('.campo').length).toBe(2)
    expect(document.querySelectorAll('.rotulo').length).toBe(2)
  })
})

describe('FormRendimentos — variante .input.mini nos campos (R2)', () => {
  it('campo "Conta corrente" mantém .input e ganha .mini', () => {
    render(<FormRendimentos mesRef="2026-07" />)

    const campo = screen.getByLabelText('Conta corrente')
    expect(campo).toHaveClass('input')
    expect(campo).toHaveClass('mini')
  })

  it('campo "Aplicações" mantém .input e ganha .mini', () => {
    render(<FormRendimentos mesRef="2026-07" />)

    const campo = screen.getByLabelText('Aplicações')
    expect(campo).toHaveClass('input')
    expect(campo).toHaveClass('mini')
  })
})

describe('FormRendimentos — divisor sutil no lugar do heading (R1)', () => {
  it('não renderiza o heading "Rendimentos do mês" e renderiza o divisor sutil no lugar', () => {
    const { container } = render(<FormRendimentos mesRef="2026-07" />)

    expect(screen.queryByText('Rendimentos do mês')).toBeNull()
    expect(container.querySelector('.divisor-sutil')).not.toBeNull()
  })
})

describe('FormRendimentos — aviso ausente (T10-FR-12)', () => {
  it('aviso rendimentos ausente na store não lança exceção ao confirmar (best-effort)', () => {
    useAppStore.setState({
      lancamentos: [],
      saldoAnterior: 1000,
      avisosAcionaveis: { avisos: [], removidos: {}, adicionados: {}, avisoEmInspecao: null },
    })
    render(<FormRendimentos mesRef="2026-07" />)

    fireEvent.change(screen.getByLabelText('Conta corrente'), { target: { value: '900' } })
    fireEvent.change(screen.getByLabelText('Aplicações'), { target: { value: '150' } })

    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Lançar rendimento' }))).not.toThrow()
    expect(useAppStore.getState().lancamentos).toHaveLength(0)
  })
})
