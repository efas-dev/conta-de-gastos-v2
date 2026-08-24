// ADR: see Docs/specs/mes-referencia-ui.adr.md

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FonteRotulo } from '../FonteRotulo'

/**
 * Localiza o badge de tipo pela classe `.tag-tipo` (Task B12): o elemento deixou de expor
 * `role="status"`, então os testes que precisam inspecionar `className`/`aria-label` do badge
 * (em vez de apenas o texto visível, já coberto por `getByText`) usam esta busca por seletor.
 */
function badge(container: HTMLElement): HTMLElement {
  const elemento = container.querySelector('.tag-tipo')
  if (!elemento) {
    throw new Error('badge .tag-tipo não encontrado')
  }
  return elemento as HTMLElement
}

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
    const { container, rerender } = render(<FonteRotulo fonte="Nubank" tipo="fatura" />)
    let rotulo = badge(container)
    expect(rotulo).toHaveClass('tag-tipo', 'fatura')
    expect(rotulo).not.toHaveAttribute('style')

    rerender(<FonteRotulo fonte="Itaú" tipo="extrato" />)
    rotulo = badge(container)
    expect(rotulo).toHaveClass('tag-tipo', 'extrato')
    expect(rotulo).not.toHaveAttribute('style')
  })
})

describe('FonteRotulo — rótulo "form_vr" (Task 2, ADR vr-despesas Decisão 3)', () => {
  it('TL-31: renderiza o nome da fonte quando tipo="form_vr", sem erro de tipo/runtime', () => {
    render(<FonteRotulo fonte="VR Agosto" tipo="form_vr" />)
    expect(screen.getByText('VR Agosto')).toBeInTheDocument()
  })

  it('TL-31b: badge de form_vr tem className e aria-label distintos de fatura/extrato', () => {
    const { container } = render(<FonteRotulo fonte="VR Agosto" tipo="form_vr" />)
    const rotulo = badge(container)
    expect(rotulo).toHaveClass('tag-tipo', 'form_vr')
    const label = rotulo.getAttribute('aria-label')
    expect(label).not.toBe('tipo fatura')
    expect(label).not.toBe('tipo extrato')
  })
})

describe('FonteRotulo — rótulo "form_rendimentos" (Task 4, ADR rendimentos)', () => {
  it('TL4-RD-01: renderiza o nome da fonte quando tipo="form_rendimentos", sem erro de tipo/runtime', () => {
    render(<FonteRotulo fonte="Rendimentos Agosto" tipo="form_rendimentos" />)
    expect(screen.getByText('Rendimentos Agosto')).toBeInTheDocument()
  })

  it('TL4-RD-02: badge de form_rendimentos tem className e aria-label distintos de fatura/extrato/form_vr', () => {
    const { container } = render(<FonteRotulo fonte="Rendimentos Agosto" tipo="form_rendimentos" />)
    const rotulo = badge(container)
    expect(rotulo).toHaveClass('tag-tipo', 'form_rendimentos')
    const label = rotulo.getAttribute('aria-label')
    expect(label).not.toBe('tipo fatura')
    expect(label).not.toBe('tipo extrato')
    expect(label).not.toBe('tipo form_vr')
  })
})

describe('FonteRotulo — rótulo humano para form_vr (Task B12)', () => {
  it('TL-B12-1: renderiza o texto "VR" (nunca o identificador cru "form_vr") quando tipo="form_vr"', () => {
    render(<FonteRotulo fonte="VR Agosto" tipo="form_vr" />)
    expect(screen.getByText('VR')).toBeInTheDocument()
    expect(screen.queryByText('form_vr')).not.toBeInTheDocument()
  })
})

describe('FonteRotulo — rótulo humano para form_rendimentos (Task B12)', () => {
  it('TL-B12-2: renderiza o texto "rendimentos" (nunca o identificador cru "form_rendimentos") quando tipo="form_rendimentos"', () => {
    render(<FonteRotulo fonte="Rendimentos Agosto" tipo="form_rendimentos" />)
    expect(screen.getByText('rendimentos')).toBeInTheDocument()
    expect(screen.queryByText('form_rendimentos')).not.toBeInTheDocument()
  })
})

describe('FonteRotulo — remoção de role="status" (Task B12)', () => {
  it('TL-B12-3: não expõe nenhum elemento com role="status"', () => {
    render(<FonteRotulo fonte="Nubank" tipo="fatura" />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('FonteRotulo — rótulo "fatura_itau_cc" (Task T10, ADR fatura-itau-xlsx)', () => {
  it('TL-T10-1: renderiza o nome da fonte quando tipo="fatura_itau_cc", sem erro de tipo/runtime', () => {
    render(<FonteRotulo fonte="Fatura Itaú Agosto" tipo="fatura_itau_cc" />)
    expect(screen.getByText('Fatura Itaú Agosto')).toBeInTheDocument()
  })

  it('TL-T10-2: badge de fatura_itau_cc tem className e aria-label distintos de fatura/extrato/form_vr/form_rendimentos', () => {
    const { container } = render(<FonteRotulo fonte="Fatura Itaú Agosto" tipo="fatura_itau_cc" />)
    const rotulo = badge(container)
    expect(rotulo).toHaveClass('tag-tipo', 'fatura_itau_cc')
    const label = rotulo.getAttribute('aria-label')
    expect(label).not.toBe('tipo fatura')
    expect(label).not.toBe('tipo extrato')
    expect(label).not.toBe('tipo form_vr')
    expect(label).not.toBe('tipo form_rendimentos')
  })

  it('TL-T10-3: renderiza o texto "Fatura Itaú" (nunca o identificador cru "fatura_itau_cc") quando tipo="fatura_itau_cc"', () => {
    render(<FonteRotulo fonte="Fatura Itaú Agosto" tipo="fatura_itau_cc" />)
    expect(screen.getByText('Fatura Itaú')).toBeInTheDocument()
    expect(screen.queryByText('fatura_itau_cc')).not.toBeInTheDocument()
  })
})

describe('FonteRotulo — mapeamentos existentes permanecem inalterados (Task T10)', () => {
  it('TL-T10-4: form_vr continua renderizando "VR" após a adição de fatura_itau_cc', () => {
    render(<FonteRotulo fonte="VR Agosto" tipo="form_vr" />)
    expect(screen.getByText('VR')).toBeInTheDocument()
  })

  it('TL-T10-5: form_rendimentos continua renderizando "rendimentos" após a adição de fatura_itau_cc', () => {
    render(<FonteRotulo fonte="Rendimentos Agosto" tipo="form_rendimentos" />)
    expect(screen.getByText('rendimentos')).toBeInTheDocument()
  })

  it('TL-T10-6: fatura/extrato continuam com os rótulos "fatura"/"extrato" após a adição de fatura_itau_cc', () => {
    const { rerender } = render(<FonteRotulo fonte="Nubank" tipo="fatura" />)
    expect(screen.getByText('fatura')).toBeInTheDocument()
    rerender(<FonteRotulo fonte="Itaú" tipo="extrato" />)
    expect(screen.getByText('extrato')).toBeInTheDocument()
  })
})

describe('FonteRotulo — discriminação visual', () => {
  it('TL6-5: fatura e extrato têm aria-label distintos', () => {
    const { container, rerender } = render(<FonteRotulo fonte="Nubank" tipo="fatura" />)
    const rotulo1 = badge(container)
    const label1 = rotulo1.getAttribute('aria-label')

    rerender(<FonteRotulo fonte="Nubank" tipo="extrato" />)
    const rotulo2 = badge(container)
    const label2 = rotulo2.getAttribute('aria-label')

    expect(label1).not.toBe(label2)
  })
})
