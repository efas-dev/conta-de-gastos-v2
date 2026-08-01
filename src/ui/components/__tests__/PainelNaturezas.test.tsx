// ADR: see Docs/specs/colinha-naturezas.adr.md

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PainelNaturezas } from '../PainelNaturezas'
import type { NaturezaRica } from '../../../types'

const naturezasFicticias: NaturezaRica[] = [
  { sigla: 'ALM', nome: 'Alimentação', descricao: 'Gastos com comida e restaurantes' },
  { sigla: 'TRN', nome: 'Transporte', descricao: 'Ônibus, metrô, táxi e afins' },
  { sigla: 'EDU', nome: 'Educação', descricao: 'Cursos, livros e mensalidades' },
]

describe('PainelNaturezas — lista vazia', () => {
  it('TL-T4-2: com naturezas vazia o botão de toggle NÃO é renderizado', () => {
    const onClose = vi.fn()
    render(<PainelNaturezas naturezas={[]} onClose={onClose} />)
    expect(screen.queryByRole('button', { name: /colinha|naturezas/i })).toBeNull()
  })

  it('TL-T4-3: com naturezas vazia o painel de conteúdo NÃO é montado', () => {
    const onClose = vi.fn()
    render(<PainelNaturezas naturezas={[]} onClose={onClose} />)
    expect(screen.queryByRole('complementary')).toBeNull()
  })
})

describe('PainelNaturezas — estado inicial (lista não-vazia)', () => {
  it('TL-T4-1: com naturezas não-vazia o botão de toggle é renderizado', () => {
    const onClose = vi.fn()
    render(<PainelNaturezas naturezas={naturezasFicticias} onClose={onClose} />)
    expect(screen.getByRole('button', { name: /colinha|naturezas/i })).toBeInTheDocument()
  })

  it('TL-T4-4: estado inicial — painel fechado (conteúdo não visível)', () => {
    const onClose = vi.fn()
    render(<PainelNaturezas naturezas={naturezasFicticias} onClose={onClose} />)
    // O conteúdo da colinha não deve estar visível no estado inicial fechado
    expect(screen.queryByText('ALM')).toBeNull()
    expect(screen.queryByText('Alimentação')).toBeNull()
  })
})

describe('PainelNaturezas — toggle abre/fecha', () => {
  let onClose: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onClose = vi.fn()
  })

  it('TL-T4-5: clicar no toggle quando fechado abre o painel', () => {
    render(<PainelNaturezas naturezas={naturezasFicticias} onClose={onClose} />)
    const botaoToggle = screen.getByRole('button', { name: /colinha|naturezas/i })
    fireEvent.click(botaoToggle)
    // Após abrir, o conteúdo deve ser visível
    expect(screen.getByText('ALM')).toBeInTheDocument()
    expect(screen.getByText('Alimentação')).toBeInTheDocument()
  })

  it('TL-T4-6: clicar no toggle quando aberto fecha o painel', () => {
    render(<PainelNaturezas naturezas={naturezasFicticias} onClose={onClose} />)
    const botaoToggle = screen.getByRole('button', { name: /colinha|naturezas/i })
    // Abre
    fireEvent.click(botaoToggle)
    expect(screen.getByText('ALM')).toBeInTheDocument()
    // Fecha via toggle
    fireEvent.click(botaoToggle)
    expect(screen.queryByText('ALM')).toBeNull()
  })
})

describe('PainelNaturezas — conteúdo exibido', () => {
  it('TL-T4-7: painel aberto renderiza sigla, nome e descrição de cada entrada na ordem recebida', () => {
    const onClose = vi.fn()
    render(<PainelNaturezas naturezas={naturezasFicticias} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /colinha|naturezas/i }))

    // Verifica presença e ordem das siglas
    const siglas = screen.getAllByText(/^(ALM|TRN|EDU)$/)
    expect(siglas[0]).toHaveTextContent('ALM')
    expect(siglas[1]).toHaveTextContent('TRN')
    expect(siglas[2]).toHaveTextContent('EDU')

    // Verifica nomes
    expect(screen.getByText('Alimentação')).toBeInTheDocument()
    expect(screen.getByText('Transporte')).toBeInTheDocument()
    expect(screen.getByText('Educação')).toBeInTheDocument()

    // Verifica descrições
    expect(screen.getByText('Gastos com comida e restaurantes')).toBeInTheDocument()
    expect(screen.getByText('Ônibus, metrô, táxi e afins')).toBeInTheDocument()
    expect(screen.getByText('Cursos, livros e mensalidades')).toBeInTheDocument()
  })
})

describe('PainelNaturezas — botão de fechar interno', () => {
  it('TL-T4-8: botão "×" dentro do painel aberto chama onClose e fecha o painel', () => {
    const onClose = vi.fn()
    render(<PainelNaturezas naturezas={naturezasFicticias} onClose={onClose} />)

    // Abre o painel
    fireEvent.click(screen.getByRole('button', { name: /colinha|naturezas/i }))
    expect(screen.getByText('ALM')).toBeInTheDocument()

    // Fecha via botão interno ×
    const botaoFechar = screen.getByRole('button', { name: /fechar/i })
    fireEvent.click(botaoFechar)

    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.queryByText('ALM')).toBeNull()
  })
})
