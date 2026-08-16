// ADR: see Docs/specs/redesign-frontend-claude-design.adr.md

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CartaoDicionario } from '../CartaoDicionario'

describe('CartaoDicionario — estado vazio', () => {
  it('TL-01: renderiza .cartao-dic sem classe "carregado", título e tag .xlsx', () => {
    render(<CartaoDicionario dicionario={null} onCarregar={vi.fn()} />)

    const cartao = screen.getByText('Planilha do mês anterior').closest('.cartao-dic')
    expect(cartao).not.toHaveClass('carregado')
    expect(screen.getByText('Planilha do mês anterior')).toBeInTheDocument()
    expect(screen.getByText('.xlsx')).toBeInTheDocument()
  })

  it('TL-02: renderiza o texto convidando a soltar o .xlsx do mês anterior', () => {
    render(<CartaoDicionario dicionario={null} onCarregar={vi.fn()} />)

    expect(screen.getByText(/lembra como você classificou/i)).toBeInTheDocument()
  })

  it('TL-03: clique no cartão dispara onCarregar', async () => {
    const onCarregar = vi.fn()
    render(<CartaoDicionario dicionario={null} onCarregar={onCarregar} />)

    fireEvent.click(screen.getByRole('button'))

    expect(onCarregar).toHaveBeenCalledTimes(1)
  })

  it('TL-07: cartão vazio expõe role="button" e tabIndex={0} como alvo de teclado', () => {
    render(<CartaoDicionario dicionario={null} onCarregar={vi.fn()} />)

    const cartao = screen.getByRole('button')
    expect(cartao).toHaveAttribute('tabIndex', '0')
  })

  it('TL-08: Enter no cartão vazio dispara onCarregar', () => {
    const onCarregar = vi.fn()
    render(<CartaoDicionario dicionario={null} onCarregar={onCarregar} />)

    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' })

    expect(onCarregar).toHaveBeenCalledTimes(1)
  })

  it('TL-09: Espaço no cartão vazio dispara onCarregar', () => {
    const onCarregar = vi.fn()
    render(<CartaoDicionario dicionario={null} onCarregar={onCarregar} />)

    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' })

    expect(onCarregar).toHaveBeenCalledTimes(1)
  })
})

describe('CartaoDicionario — estado carregado', () => {
  const dicionario = { nome: '2026-05-ES.xlsx', entradas: 214 }

  it('TL-04: .cartao-dic ganha classe "carregado" e exibe o nome recebido', () => {
    render(<CartaoDicionario dicionario={dicionario} onCarregar={vi.fn()} />)

    const cartao = screen.getByText('Planilha do mês anterior').closest('.cartao-dic')
    expect(cartao).toHaveClass('carregado')
    expect(screen.getByText('2026-05-ES.xlsx')).toBeInTheDocument()
  })

  it('TL-05: exibe o número de entradas', () => {
    render(<CartaoDicionario dicionario={dicionario} onCarregar={vi.fn()} />)

    expect(screen.getByText(/214/)).toBeInTheDocument()
  })

  it('TL-06: clique no cartão já carregado NÃO dispara onCarregar', async () => {
    const onCarregar = vi.fn()
    render(<CartaoDicionario dicionario={dicionario} onCarregar={onCarregar} />)

    const cartao = screen.getByText('Planilha do mês anterior').closest('.cartao-dic') as HTMLElement
    fireEvent.click(cartao)

    expect(onCarregar).not.toHaveBeenCalled()
  })

  it('TL-10: cartão carregado não é mais alvo de teclado (sem role="button" nem tabIndex)', () => {
    render(<CartaoDicionario dicionario={dicionario} onCarregar={vi.fn()} />)

    const cartao = screen.getByText('Planilha do mês anterior').closest('.cartao-dic') as HTMLElement
    expect(cartao).not.toHaveAttribute('role', 'button')
    expect(cartao).not.toHaveAttribute('tabIndex')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
