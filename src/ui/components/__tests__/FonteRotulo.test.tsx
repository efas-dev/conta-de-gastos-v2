// ADR: see Docs/specs/mes-referencia-ui.adr.md

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

describe('FonteRotulo — migração para className', () => {
  it('TL-12: badge usa className "tag-tipo fatura"/"tag-tipo extrato" em vez de style inline', () => {
    const { rerender } = render(<FonteRotulo fonte="Nubank" tipo="fatura" />)
    let rotulo = screen.getByRole('status')
    expect(rotulo).toHaveClass('tag-tipo', 'fatura')
    expect(rotulo).not.toHaveAttribute('style')

    rerender(<FonteRotulo fonte="Itaú" tipo="extrato" />)
    rotulo = screen.getByRole('status')
    expect(rotulo).toHaveClass('tag-tipo', 'extrato')
    expect(rotulo).not.toHaveAttribute('style')
  })
})

describe('FonteRotulo — rótulo "form_vr" (Task 2, ADR vr-despesas Decisão 3)', () => {
  it('TL-31: renderiza o nome da fonte quando tipo="form_vr", sem erro de tipo/runtime', () => {
    render(<FonteRotulo fonte="VR Agosto" tipo="form_vr" />)
    expect(screen.getByText('VR Agosto')).toBeInTheDocument()
  })

  it('TL-31b: badge de form_vr renderiza texto "form_vr" com className e aria-label distintos de fatura/extrato', () => {
    render(<FonteRotulo fonte="VR Agosto" tipo="form_vr" />)
    const rotulo = screen.getByRole('status')
    expect(rotulo).toHaveTextContent('form_vr')
    expect(rotulo).toHaveClass('tag-tipo', 'form_vr')
    const label = rotulo.getAttribute('aria-label')
    expect(label).not.toBe('tipo fatura')
    expect(label).not.toBe('tipo extrato')
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
