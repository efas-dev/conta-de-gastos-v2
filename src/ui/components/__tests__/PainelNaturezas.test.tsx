// ADR: see Docs/specs/colinha-naturezas.adr.md

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PainelNaturezas } from '../PainelNaturezas'
import type { NaturezaRica } from '../../../types'

const naturezasFicticias: NaturezaRica[] = [
  { sigla: 'ALM', nome: 'Alimentação', descricao: 'Gastos com comida e restaurantes' },
  { sigla: 'TRN', nome: 'Transporte', descricao: 'Ônibus, metrô, táxi e afins' },
  { sigla: 'EDU', nome: 'Educação', descricao: 'Cursos, livros e mensalidades' },
]

describe('PainelNaturezas — lista vazia (TL-01)', () => {
  it('com naturezas vazia, o componente renderiza null (sem toggle, sem aside)', () => {
    const { container } = render(<PainelNaturezas naturezas={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('PainelNaturezas — conteúdo puro (TL-02, TL-03)', () => {
  it('com naturezas não-vazia, renderiza os itens diretamente, sem toggle', () => {
    render(<PainelNaturezas naturezas={naturezasFicticias} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('ALM')).toBeInTheDocument()
  })

  it('renderiza sigla, nome e descrição de cada entrada, na ordem recebida', () => {
    render(<PainelNaturezas naturezas={naturezasFicticias} />)

    const siglas = screen.getAllByText(/^(ALM|TRN|EDU)$/)
    expect(siglas[0]).toHaveTextContent('ALM')
    expect(siglas[1]).toHaveTextContent('TRN')
    expect(siglas[2]).toHaveTextContent('EDU')

    expect(screen.getByText('Alimentação')).toBeInTheDocument()
    expect(screen.getByText('Transporte')).toBeInTheDocument()
    expect(screen.getByText('Educação')).toBeInTheDocument()

    expect(screen.getByText('Gastos com comida e restaurantes')).toBeInTheDocument()
    expect(screen.getByText('Ônibus, metrô, táxi e afins')).toBeInTheDocument()
    expect(screen.getByText('Cursos, livros e mensalidades')).toBeInTheDocument()
  })
})

describe('PainelNaturezas — classes do design system (TL-04)', () => {
  it('cada entrada usa a classe .nat-item e a sigla usa .nat-sigla', () => {
    const { container } = render(<PainelNaturezas naturezas={naturezasFicticias} />)
    expect(container.querySelectorAll('.nat-item')).toHaveLength(3)
    expect(container.querySelectorAll('.nat-sigla')).toHaveLength(3)
  })
})

describe('PainelNaturezas — compatibilidade de assinatura com App.tsx (T11 pendente)', () => {
  it('aceita onClose opcional sem quebrar a renderização (call site antigo em App.tsx)', () => {
    render(<PainelNaturezas naturezas={naturezasFicticias} onClose={() => {}} />)
    expect(screen.getByText('ALM')).toBeInTheDocument()
  })
})
