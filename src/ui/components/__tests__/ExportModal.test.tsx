// ADR: see Docs/specs/redesign-frontend-claude-design.adr.md

import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ExportModal } from '../ExportModal'

describe('ExportModal', () => {
  describe('fase confirmar', () => {
    it('TL-01: renderiza .modal-titulo "Exportar planilha" e .arquivo-nome com o nome recebido', () => {
      const { container } = render(
        <ExportModal
          fase="confirmar"
          nome="2026-08-ES.xlsx"
          pendentes={0}
          onConfirmar={vi.fn()}
          onFechar={vi.fn()}
          onContinuar={vi.fn()}
        />,
      )
      expect(screen.getByText('Exportar planilha')).toBeInTheDocument()
      const arquivoNome = container.querySelector('.arquivo-nome')
      expect(arquivoNome).not.toBeNull()
      expect(arquivoNome?.textContent).toContain('2026-08-ES.xlsx')
    })

    it('TL-02: pendentes === 0 — não renderiza .alerta-export', () => {
      const { container } = render(
        <ExportModal
          fase="confirmar"
          nome="2026-08-ES.xlsx"
          pendentes={0}
          onConfirmar={vi.fn()}
          onFechar={vi.fn()}
          onContinuar={vi.fn()}
        />,
      )
      expect(container.querySelector('.alerta-export')).toBeNull()
    })

    it('TL-03: pendentes === 1 — renderiza .alerta-export com texto singular', () => {
      const { container } = render(
        <ExportModal
          fase="confirmar"
          nome="2026-08-ES.xlsx"
          pendentes={1}
          onConfirmar={vi.fn()}
          onFechar={vi.fn()}
          onContinuar={vi.fn()}
        />,
      )
      const alerta = container.querySelector('.alerta-export')
      expect(alerta).not.toBeNull()
      expect(alerta?.textContent).toContain('1 lançamento ainda sem natureza')
      expect(alerta?.textContent).toContain('irá em branco')
    })

    it('TL-03b: pendentes > 1 — renderiza .alerta-export com texto plural', () => {
      const { container } = render(
        <ExportModal
          fase="confirmar"
          nome="2026-08-ES.xlsx"
          pendentes={3}
          onConfirmar={vi.fn()}
          onFechar={vi.fn()}
          onContinuar={vi.fn()}
        />,
      )
      const alerta = container.querySelector('.alerta-export')
      expect(alerta).not.toBeNull()
      expect(alerta?.textContent).toContain('3 lançamentos ainda sem natureza')
      expect(alerta?.textContent).toContain('irão em branco')
    })

    it('TL-04: botão "Continuar revisando" dispara onContinuar()', () => {
      const onContinuar = vi.fn()
      render(
        <ExportModal
          fase="confirmar"
          nome="2026-08-ES.xlsx"
          pendentes={0}
          onConfirmar={vi.fn()}
          onFechar={vi.fn()}
          onContinuar={onContinuar}
        />,
      )
      fireEvent.click(screen.getByText('Continuar revisando'))
      expect(onContinuar).toHaveBeenCalledTimes(1)
    })

    it('TL-05: botão "Baixar .xlsx" dispara onConfirmar()', () => {
      const onConfirmar = vi.fn()
      render(
        <ExportModal
          fase="confirmar"
          nome="2026-08-ES.xlsx"
          pendentes={0}
          onConfirmar={onConfirmar}
          onFechar={vi.fn()}
          onContinuar={vi.fn()}
        />,
      )
      fireEvent.click(screen.getByText('Baixar .xlsx'))
      expect(onConfirmar).toHaveBeenCalledTimes(1)
    })

    it('TL-09 (confirmar): clique no .overlay dispara onContinuar()', () => {
      const onContinuar = vi.fn()
      const { container } = render(
        <ExportModal
          fase="confirmar"
          nome="2026-08-ES.xlsx"
          pendentes={0}
          onConfirmar={vi.fn()}
          onFechar={vi.fn()}
          onContinuar={onContinuar}
        />,
      )
      fireEvent.click(container.querySelector('.overlay') as Element)
      expect(onContinuar).toHaveBeenCalledTimes(1)
    })

    it('TL-10 (confirmar): clique dentro do .modal não propaga para o .overlay', () => {
      const onContinuar = vi.fn()
      const { container } = render(
        <ExportModal
          fase="confirmar"
          nome="2026-08-ES.xlsx"
          pendentes={0}
          onConfirmar={vi.fn()}
          onFechar={vi.fn()}
          onContinuar={onContinuar}
        />,
      )
      fireEvent.click(container.querySelector('.modal') as Element)
      expect(onContinuar).not.toHaveBeenCalled()
    })
  })

  describe('fase feito', () => {
    it('TL-06: renderiza .check-grande, "Planilha exportada" e o nome do arquivo', () => {
      const { container } = render(
        <ExportModal
          fase="feito"
          nome="2026-08-ES.xlsx"
          pendentes={0}
          onConfirmar={vi.fn()}
          onFechar={vi.fn()}
          onContinuar={vi.fn()}
        />,
      )
      expect(container.querySelector('.check-grande')).not.toBeNull()
      expect(screen.getByText('Planilha exportada')).toBeInTheDocument()
      expect(screen.getByText('2026-08-ES.xlsx')).toBeInTheDocument()
    })

    it('TL-07: renderiza .dica-dic com a dica de reuso no mês seguinte', () => {
      const { container } = render(
        <ExportModal
          fase="feito"
          nome="2026-08-ES.xlsx"
          pendentes={0}
          onConfirmar={vi.fn()}
          onFechar={vi.fn()}
          onContinuar={vi.fn()}
        />,
      )
      const dica = container.querySelector('.dica-dic')
      expect(dica).not.toBeNull()
      expect(dica?.textContent).toContain('mês')
      expect(dica?.textContent).toContain('preenche sozinho')
    })

    it('TL-08: botão "Fechar" dispara onFechar()', () => {
      const onFechar = vi.fn()
      render(
        <ExportModal
          fase="feito"
          nome="2026-08-ES.xlsx"
          pendentes={0}
          onConfirmar={vi.fn()}
          onFechar={onFechar}
          onContinuar={vi.fn()}
        />,
      )
      fireEvent.click(screen.getByText('Fechar'))
      expect(onFechar).toHaveBeenCalledTimes(1)
    })

    it('TL-09 (feito): clique no .overlay dispara onFechar()', () => {
      const onFechar = vi.fn()
      const { container } = render(
        <ExportModal
          fase="feito"
          nome="2026-08-ES.xlsx"
          pendentes={0}
          onConfirmar={vi.fn()}
          onFechar={onFechar}
          onContinuar={vi.fn()}
        />,
      )
      fireEvent.click(container.querySelector('.overlay') as Element)
      expect(onFechar).toHaveBeenCalledTimes(1)
    })
  })
})
