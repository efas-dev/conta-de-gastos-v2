// ADR: see spec/mes-referencia-ui.adr.md

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FonteRotulo } from '../FonteRotulo'

describe('FonteRotulo — rótulo "fatura"', () => {
  it('TL6-1: renderiza o texto "fatura" quando tipo="fatura"', () => {
    render(<FonteRotulo fonte="Nubank" tipo="fatura" />)
    expect(screen.getByText('fatura')).toBeInTheDocument()
  })

  it('TL6-3: renderiza o nome da fonte quando tipo="fatura"', () => {
    render(<FonteRotulo fonte="Nubank" tipo="fatura" />)
    expect(screen.getByText('Nubank')).toBeInTheDocument()
  })
})

describe('FonteRotulo — rótulo "extrato"', () => {
  it('TL6-2: renderiza o texto "extrato" quando tipo="extrato"', () => {
    render(<FonteRotulo fonte="Itaú" tipo="extrato" />)
    expect(screen.getByText('extrato')).toBeInTheDocument()
  })

  it('TL6-4: renderiza o nome da fonte quando tipo="extrato"', () => {
    render(<FonteRotulo fonte="Itaú" tipo="extrato" />)
    expect(screen.getByText('Itaú')).toBeInTheDocument()
  })
})

describe('FonteRotulo — discriminação visual', () => {
  it('TL6-5: fatura e extrato têm aria-label distintos', () => {
    const { rerender } = render(<FonteRotulo fonte="Nubank" tipo="fatura" />)
    const rotulo1 = screen.getByRole('status')
    const label1 = rotulo1.getAttribute('aria-label')

    rerender(<FonteRotulo fonte="Nubank" tipo="extrato" />)
    const rotulo2 = screen.getByRole('status')
    const label2 = rotulo2.getAttribute('aria-label')

    expect(label1).not.toBe(label2)
  })
})
