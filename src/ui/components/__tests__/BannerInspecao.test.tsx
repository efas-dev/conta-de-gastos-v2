// ADR: see Docs/specs/redesign-frontend-claude-design.adr.md

import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BannerInspecao } from '../BannerInspecao'
import type { Aviso } from '../../../types'

function criarAviso(overrides: Partial<Aviso> = {}): Aviso {
  return {
    id: 'aviso-1',
    tipo: 'proposta',
    origem: 'valor-pendente',
    mensagem: 'Proposta de teste',
    alvo: ['l1'],
    permanece: [],
    estado: 'pendente',
    ...overrides,
  }
}

describe('BannerInspecao', () => {
  it('TL-01: retorna null quando aviso é null', () => {
    const { container } = render(
      <BannerInspecao aviso={null} onAprovar={vi.fn()} onDispensar={vi.fn()} onFechar={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('TL-01b: retorna null quando aviso é undefined', () => {
    const { container } = render(
      <BannerInspecao aviso={undefined} onAprovar={vi.fn()} onDispensar={vi.fn()} onFechar={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('TL-02: renderiza .banner-inspecao com "Inspecionando proposta" quando aviso presente', () => {
    const { container } = render(
      <BannerInspecao aviso={criarAviso()} onAprovar={vi.fn()} onDispensar={vi.fn()} onFechar={vi.fn()} />,
    )
    expect(container.querySelector('.banner-inspecao')).not.toBeNull()
    expect(screen.getByText('Inspecionando proposta')).toBeInTheDocument()
  })

  it('TL-03: tag sai com contagem singular quando alvo tem 1 item', () => {
    const { container } = render(
      <BannerInspecao aviso={criarAviso({ alvo: ['l1'] })} onAprovar={vi.fn()} onDispensar={vi.fn()} onFechar={vi.fn()} />,
    )
    const tagSai = container.querySelector('.tag-insp.sai')
    expect(tagSai).not.toBeNull()
    expect(tagSai?.textContent).toBe('sai')
    expect(screen.getByText('1 linha')).toBeInTheDocument()
  })

  it('TL-03b: tag sai com contagem plural quando alvo tem mais de 1 item', () => {
    render(
      <BannerInspecao
        aviso={criarAviso({ alvo: ['l1', 'l2', 'l3'] })}
        onAprovar={vi.fn()}
        onDispensar={vi.fn()}
        onFechar={vi.fn()}
      />,
    )
    expect(screen.getByText('3 linhas')).toBeInTheDocument()
  })

  it('TL-04: tag fica presente com contagem quando permanece.length > 0', () => {
    const { container } = render(
      <BannerInspecao
        aviso={criarAviso({ permanece: ['l2', 'l3'] })}
        onAprovar={vi.fn()}
        onDispensar={vi.fn()}
        onFechar={vi.fn()}
      />,
    )
    const tagFica = container.querySelector('.tag-insp.fica')
    expect(tagFica).not.toBeNull()
    expect(tagFica?.textContent).toBe('fica')
    expect(screen.getByText('2 linhas')).toBeInTheDocument()
  })

  it('TL-05: tag fica ausente quando permanece está vazio', () => {
    const { container } = render(
      <BannerInspecao aviso={criarAviso({ permanece: [] })} onAprovar={vi.fn()} onDispensar={vi.fn()} onFechar={vi.fn()} />,
    )
    expect(container.querySelector('.tag-insp.fica')).toBeNull()
  })

  it('TL-06: renderiza "· filtros suspensos"', () => {
    render(<BannerInspecao aviso={criarAviso()} onAprovar={vi.fn()} onDispensar={vi.fn()} onFechar={vi.fn()} />)
    expect(screen.getByText('· filtros suspensos')).toBeInTheDocument()
  })

  it('TL-07: botão Aprovar dispara onAprovar(aviso.id)', () => {
    const onAprovar = vi.fn()
    render(
      <BannerInspecao aviso={criarAviso({ id: 'aviso-x' })} onAprovar={onAprovar} onDispensar={vi.fn()} onFechar={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('Aprovar'))
    expect(onAprovar).toHaveBeenCalledWith('aviso-x')
  })

  it('TL-08: botão Dispensar dispara onDispensar(aviso.id)', () => {
    const onDispensar = vi.fn()
    render(
      <BannerInspecao aviso={criarAviso({ id: 'aviso-y' })} onAprovar={vi.fn()} onDispensar={onDispensar} onFechar={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('Dispensar'))
    expect(onDispensar).toHaveBeenCalledWith('aviso-y')
  })

  it('TL-09: botão de fechar dispara onFechar()', () => {
    const onFechar = vi.fn()
    render(
      <BannerInspecao aviso={criarAviso()} onAprovar={vi.fn()} onDispensar={vi.fn()} onFechar={onFechar} />,
    )
    fireEvent.click(screen.getByTitle('Fechar inspeção'))
    expect(onFechar).toHaveBeenCalledTimes(1)
  })
})
