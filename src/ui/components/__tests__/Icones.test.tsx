// ADR: see spec/fundacao-operacoes.adr.md

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  IconeUpload,
  IconeArquivo,
  IconeSeta,
  IconeDesfazer,
  IconeRefazer,
  IconeExportar,
} from '../Icones'

// ---------------------------------------------------------------------------
// Task T12-bis (spec fundacao-operacoes) — extração comportamento-preservante
// de App.tsx. Estes testes provam que cada ícone renderiza o SVG correto
// (marcação/atributos), isoladamente do resto da UI.
// ---------------------------------------------------------------------------

describe('Icones', () => {
  it('IconeUpload renderiza um svg com a cor padrão --verde e dois paths', () => {
    const { container } = render(<IconeUpload />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('stroke')).toBe('var(--verde)')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(container.querySelectorAll('path')).toHaveLength(2)
  })

  it('IconeUpload aceita cor customizada via prop', () => {
    const { container } = render(<IconeUpload cor="#ff0000" />)
    expect(container.querySelector('svg')?.getAttribute('stroke')).toBe('#ff0000')
  })

  it('IconeArquivo renderiza um svg com a cor padrão --verde e dois paths', () => {
    const { container } = render(<IconeArquivo />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('stroke')).toBe('var(--verde)')
    expect(container.querySelectorAll('path')).toHaveLength(2)
  })

  it('IconeArquivo aceita cor customizada via prop', () => {
    const { container } = render(<IconeArquivo cor="#123456" />)
    expect(container.querySelector('svg')?.getAttribute('stroke')).toBe('#123456')
  })

  it('IconeSeta renderiza um svg com stroke fixo #faf8f3 e um path', () => {
    const { container } = render(<IconeSeta />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('stroke')).toBe('#faf8f3')
    expect(container.querySelectorAll('path')).toHaveLength(1)
  })

  it('IconeDesfazer renderiza um svg com stroke fixo var(--texto-3) e dois paths', () => {
    const { container } = render(<IconeDesfazer />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('stroke')).toBe('var(--texto-3)')
    expect(container.querySelectorAll('path')).toHaveLength(2)
  })

  it('IconeRefazer renderiza um svg com stroke fixo var(--texto-3) e dois paths', () => {
    const { container } = render(<IconeRefazer />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('stroke')).toBe('var(--texto-3)')
    expect(container.querySelectorAll('path')).toHaveLength(2)
  })

  it('IconeExportar renderiza um svg com stroke fixo #faf8f3 e dois paths', () => {
    const { container } = render(<IconeExportar />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('stroke')).toBe('#faf8f3')
    expect(container.querySelectorAll('path')).toHaveLength(2)
  })
})
