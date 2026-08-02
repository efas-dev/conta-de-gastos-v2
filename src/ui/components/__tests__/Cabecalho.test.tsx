// ADR: see Docs/specs/redesign-frontend-claude-design.adr.md

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Cabecalho } from '../Cabecalho'

describe('Cabecalho', () => {
  it('renderiza o título e o logo', () => {
    const { container } = render(<Cabecalho etapa={0} />)
    expect(screen.getByText('Conta de Gastos')).toBeTruthy()
    expect(container.querySelector('.topo')).toBeTruthy()
    expect(container.querySelector('.logo')).toBeTruthy()
  })

  it('renderiza os 3 nomes de passo na ordem Importar, Revisar, Exportar', () => {
    render(<Cabecalho etapa={0} />)
    const nomes = screen.getAllByText(/Importar|Revisar|Exportar/)
    expect(nomes.map((n) => n.textContent)).toEqual(['Importar', 'Revisar', 'Exportar'])
  })

  it('etapa=0: destaca "Importar" como ativo e não marca os demais', () => {
    const { container } = render(<Cabecalho etapa={0} />)
    const numeros = container.querySelectorAll('.step-num')
    const nomes = container.querySelectorAll('.step-nome')

    expect(numeros[0].className).toContain('ativo')
    expect(numeros[0].className).not.toContain('feito')
    expect(nomes[0].className).toContain('ativo')

    expect(numeros[1].className).not.toContain('ativo')
    expect(numeros[1].className).not.toContain('feito')
    expect(nomes[1].className).not.toContain('ativo')

    expect(numeros[2].className).not.toContain('ativo')
    expect(numeros[2].className).not.toContain('feito')
    expect(nomes[2].className).not.toContain('ativo')
  })

  it('etapa=1: marca "Importar" como feito (com check) e "Revisar" como ativo', () => {
    const { container } = render(<Cabecalho etapa={1} />)
    const numeros = container.querySelectorAll('.step-num')
    const nomes = container.querySelectorAll('.step-nome')

    expect(numeros[0].className).toContain('feito')
    expect(numeros[0].className).not.toContain('ativo')
    expect(numeros[0].querySelector('svg')).toBeTruthy()

    expect(numeros[1].className).toContain('ativo')
    expect(nomes[1].className).toContain('ativo')

    expect(numeros[2].className).not.toContain('ativo')
    expect(numeros[2].className).not.toContain('feito')
  })

  it('etapa=2: marca "Importar" e "Revisar" como feitos e "Exportar" como ativo', () => {
    const { container } = render(<Cabecalho etapa={2} />)
    const numeros = container.querySelectorAll('.step-num')
    const nomes = container.querySelectorAll('.step-nome')

    expect(numeros[0].className).toContain('feito')
    expect(numeros[0].querySelector('svg')).toBeTruthy()
    expect(numeros[1].className).toContain('feito')
    expect(numeros[1].querySelector('svg')).toBeTruthy()

    expect(numeros[2].className).toContain('ativo')
    expect(nomes[2].className).toContain('ativo')
  })

  it('passo nem ativo nem feito exibe o número do passo, não o ícone de check', () => {
    const { container } = render(<Cabecalho etapa={0} />)
    const numeros = container.querySelectorAll('.step-num')

    expect(numeros[1].querySelector('svg')).toBeFalsy()
    expect(numeros[1].textContent).toBe('2')
    expect(numeros[2].querySelector('svg')).toBeFalsy()
    expect(numeros[2].textContent).toBe('3')
  })

  it('renderiza o pill de privacidade com o texto esperado', () => {
    const { container } = render(<Cabecalho etapa={0} />)
    const pill = container.querySelector('.pill-privado')
    expect(pill).toBeTruthy()
    expect(pill?.textContent).toContain('Seus dados nunca saem do seu computador')
  })

  it('renderiza exatamente 2 separadores .step-linha entre os 3 passos', () => {
    const { container } = render(<Cabecalho etapa={0} />)
    expect(container.querySelectorAll('.step-linha').length).toBe(2)
  })
})
