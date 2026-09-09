/**
 * Item 38 do TODO — menu de contexto da grid de revisão.
 *
 * É a única superfície de UI genuinamente nova do item, então é aqui que o cuidado é gasto:
 * acesso por teclado, Escape, fechar ao clicar fora e rótulos acessíveis.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MenuContextoGrid } from '../MenuContextoGrid'

afterEach(cleanup)

function acoes() {
  return [
    { rotulo: 'Inserir linha acima', onSelecionar: vi.fn() },
    { rotulo: 'Inserir linha abaixo', atalho: 'Ctrl +', onSelecionar: vi.fn() },
    { rotulo: 'Excluir linha', atalho: 'Ctrl −', onSelecionar: vi.fn() },
  ]
}

function montar(overrides: Partial<Parameters<typeof MenuContextoGrid>[0]> = {}) {
  const props = { x: 100, y: 100, acoes: acoes(), onFechar: vi.fn(), ...overrides }
  const utils = render(<MenuContextoGrid {...props} />)
  return { ...utils, props }
}

describe('MenuContextoGrid — estrutura acessível (item 38)', () => {
  it('TL-38-42: expõe um role="menu" com nome acessível', () => {
    montar()
    expect(screen.getByRole('menu', { name: /linha/i })).toBeInTheDocument()
  })

  it('TL-38-43: cada ação é um menuitem com rótulo textual', () => {
    montar()
    const itens = screen.getAllByRole('menuitem')
    expect(itens).toHaveLength(3)
    expect(itens[0]).toHaveAccessibleName(/inserir linha acima/i)
    expect(itens[2]).toHaveAccessibleName(/excluir linha/i)
  })

  it('TL-38-44: os menuitems são <button type="button"> — nunca submetem um form ancestral', () => {
    montar()
    for (const item of screen.getAllByRole('menuitem')) {
      expect(item.tagName).toBe('BUTTON')
      expect(item).toHaveAttribute('type', 'button')
    }
  })

  it('TL-38-45: o primeiro item recebe o foco na abertura — o menu é navegável só pelo teclado', () => {
    montar()
    expect(screen.getAllByRole('menuitem')[0]).toHaveFocus()
  })
})

describe('MenuContextoGrid — acionamento (item 38)', () => {
  it('TL-38-46: clicar numa ação executa a callback dela e fecha o menu', () => {
    const { props } = montar()
    fireEvent.click(screen.getByRole('menuitem', { name: /excluir linha/i }))
    expect(props.acoes[2].onSelecionar).toHaveBeenCalledTimes(1)
    expect(props.onFechar).toHaveBeenCalled()
  })

  it('TL-38-47: acionar uma ação não dispara as outras', () => {
    const { props } = montar()
    fireEvent.click(screen.getByRole('menuitem', { name: /inserir linha acima/i }))
    expect(props.acoes[0].onSelecionar).toHaveBeenCalledTimes(1)
    expect(props.acoes[1].onSelecionar).not.toHaveBeenCalled()
    expect(props.acoes[2].onSelecionar).not.toHaveBeenCalled()
  })
})

describe('MenuContextoGrid — teclado (item 38)', () => {
  it('TL-38-48: seta para baixo move o foco para o próximo item e circula no fim', () => {
    montar()
    const itens = screen.getAllByRole('menuitem')
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(itens[1]).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(itens[2]).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(itens[0]).toHaveFocus()
  })

  it('TL-38-49: seta para cima circula para o último item', () => {
    montar()
    const itens = screen.getAllByRole('menuitem')
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowUp' })
    expect(itens[2]).toHaveFocus()
  })

  it('TL-38-50: Home e End vão para o primeiro e o último item', () => {
    montar()
    const itens = screen.getAllByRole('menuitem')
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'End' })
    expect(itens[2]).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'Home' })
    expect(itens[0]).toHaveFocus()
  })

  it('TL-38-51: Escape fecha o menu sem executar nenhuma ação', () => {
    const { props } = montar()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(props.onFechar).toHaveBeenCalled()
    for (const acao of props.acoes) expect(acao.onSelecionar).not.toHaveBeenCalled()
  })

  it('TL-38-52: Tab fecha o menu em vez de deixar o foco escapar para trás dele', () => {
    const { props } = montar()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Tab' })
    expect(props.onFechar).toHaveBeenCalled()
  })
})

describe('MenuContextoGrid — fechar por interação externa (item 38)', () => {
  it('TL-38-53: clique fora fecha o menu', () => {
    const { props } = montar()
    fireEvent.click(document.body)
    expect(props.onFechar).toHaveBeenCalled()
  })

  it('TL-38-54: clique DENTRO do menu não conta como clique fora', () => {
    const { props } = montar()
    fireEvent.click(screen.getByRole('menu'))
    expect(props.onFechar).not.toHaveBeenCalled()
  })

  it('TL-38-55: o listener de clique é registrado em CAPTURA — na fase de bubbling um stopPropagation() de qualquer handler React mataria o fechamento', () => {
    const espia = vi.spyOn(document, 'addEventListener')
    montar()
    const registroDeClique = espia.mock.calls.find(([tipo]) => tipo === 'click')
    expect(registroDeClique?.[2]).toBe(true)
    espia.mockRestore()
  })

  it('TL-38-56: um novo clique com o botão direito em outro lugar fecha o menu corrente', () => {
    const { props } = montar()
    fireEvent.contextMenu(document.body)
    expect(props.onFechar).toHaveBeenCalled()
  })

  it('TL-38-57: rolar a página fecha o menu — ele é posicionado em coordenadas de viewport e ficaria órfão', () => {
    const { props } = montar()
    fireEvent.scroll(document, {})
    expect(props.onFechar).toHaveBeenCalled()
  })

  it('TL-38-58: desmontar remove os listeners globais', () => {
    const espia = vi.spyOn(document, 'removeEventListener')
    const { unmount } = montar()
    unmount()
    const tipos = espia.mock.calls.map(([tipo]) => tipo)
    expect(tipos).toContain('click')
    expect(tipos).toContain('contextmenu')
    expect(tipos).toContain('scroll')
    espia.mockRestore()
  })
})

describe('MenuContextoGrid — posicionamento (item 38)', () => {
  it('TL-38-59: o menu é fixo na viewport, nas coordenadas pedidas', () => {
    montar({ x: 123, y: 45 })
    const menu = screen.getByRole('menu')
    expect(menu.style.position).toBe('fixed')
    expect(menu.style.left).toBe('123px')
    expect(menu.style.top).toBe('45px')
  })
})
