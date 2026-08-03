// ADR: see Docs/specs/redesign-frontend-claude-design.adr.md

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CartaoBancosSuportados } from '../CartaoBancosSuportados'

describe('CartaoBancosSuportados', () => {
  it('TL-07: renderiza o título "Bancos suportados"', () => {
    render(<CartaoBancosSuportados />)

    expect(screen.getByText('Bancos suportados')).toBeInTheDocument()
  })

  it('TL-08: renderiza a linha Nubank com "extrato CSV · fatura CSV"', () => {
    render(<CartaoBancosSuportados />)

    expect(screen.getByText('Nubank')).toBeInTheDocument()
    expect(screen.getByText('extrato CSV · fatura CSV')).toBeInTheDocument()
  })

  it('TL-09: renderiza a linha Itaú com "extrato TXT"', () => {
    render(<CartaoBancosSuportados />)

    expect(screen.getByText('Itaú')).toBeInTheDocument()
    expect(screen.getByText('extrato TXT')).toBeInTheDocument()
  })

  it('TL-10: renderiza a linha Inter com "extrato CSV"', () => {
    render(<CartaoBancosSuportados />)

    const linha = screen.getByText('Inter').closest('.linha-banco')
    expect(linha).toHaveTextContent('extrato CSV')
  })

  it('TL-11: renderiza a linha Banco do Brasil com "extrato CSV"', () => {
    render(<CartaoBancosSuportados />)

    const linha = screen.getByText('Banco do Brasil').closest('.linha-banco')
    expect(linha).toHaveTextContent('extrato CSV')
  })
})
