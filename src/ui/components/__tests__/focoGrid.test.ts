/**
 * Item 51 do TODO — foco preso na grid.
 *
 * A grid parece "uma coisa separada" do app: ao clicar num botão, card de aviso ou
 * painel, o foco vai para o elemento clicado e é preciso clicar na grid de novo para
 * voltar a digitar. `deveDevolverFocoAGrid` é o predicado puro que decide quando o
 * foco volta — testável em jsdom com DOM real, sem o canvas do Glide.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { deveDevolverFocoAGrid } from '../focoGrid'

let container: HTMLElement
let grid: HTMLElement
let fora: HTMLElement

beforeEach(() => {
  document.body.innerHTML = ''
  container = document.createElement('div')
  grid = document.createElement('div')
  fora = document.createElement('div')
  container.append(grid, fora)
  document.body.append(container)
})

/** Cria um elemento dentro de `pai` e devolve-o. */
function em(pai: HTMLElement, tag: string, attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  pai.append(el)
  return el
}

/** Parâmetros default do caso feliz: clique de ponteiro num botão fora da grid. */
function params(overrides: Partial<Parameters<typeof deveDevolverFocoAGrid>[0]> = {}) {
  const botao = em(fora, 'button')
  return {
    alvo: botao,
    ativo: botao,
    containerGrid: grid,
    cliqueDePonteiro: true,
    temCelulaCorrente: true,
    ...overrides,
  }
}

describe('deveDevolverFocoAGrid (item 51)', () => {
  it('TL-51-1: clique num botão fora da grid devolve o foco', () => {
    expect(deveDevolverFocoAGrid(params())).toBe(true)
  })

  it('TL-51-2: clique num card de aviso (div clicável) devolve o foco', () => {
    const card = em(fora, 'div', { role: 'button', tabindex: '0' })
    expect(deveDevolverFocoAGrid(params({ alvo: card, ativo: card }))).toBe(true)
  })

  it('TL-51-3: clique DENTRO da grid não mexe no foco — o Glide cuida do próprio', () => {
    const canvas = em(grid, 'canvas')
    expect(deveDevolverFocoAGrid(params({ alvo: canvas, ativo: canvas }))).toBe(false)
  })

  for (const tag of ['input', 'textarea', 'select']) {
    it(`TL-51-4: clique em <${tag}> preserva o foco do campo`, () => {
      const campo = em(fora, tag)
      expect(deveDevolverFocoAGrid(params({ alvo: campo, ativo: campo }))).toBe(false)
    })
  }

  it('TL-51-5: clique em elemento contenteditable preserva o foco', () => {
    const editavel = em(fora, 'div', { contenteditable: 'true' })
    expect(deveDevolverFocoAGrid(params({ alvo: editavel, ativo: editavel }))).toBe(false)
  })

  it('TL-51-6: clique num <label> que foca o input associado preserva o foco do input', () => {
    const rotulo = em(fora, 'label')
    const campo = em(fora, 'input')
    expect(deveDevolverFocoAGrid(params({ alvo: rotulo, ativo: campo }))).toBe(false)
  })

  it('TL-51-7: clique dentro de um modal ([role=dialog]) não devolve o foco', () => {
    const dialogo = em(fora, 'div', { role: 'dialog' })
    const botao = em(dialogo, 'button')
    expect(deveDevolverFocoAGrid(params({ alvo: botao, ativo: botao }))).toBe(false)
  })

  it('TL-51-8: ativação por teclado (detail 0) não devolve o foco — não sequestra o Tab', () => {
    expect(deveDevolverFocoAGrid(params({ cliqueDePonteiro: false }))).toBe(false)
  })

  it('TL-51-9: sem célula corrente na grid não há para onde voltar — não devolve o foco', () => {
    expect(deveDevolverFocoAGrid(params({ temCelulaCorrente: false }))).toBe(false)
  })

  it('TL-51-10: sem container de grid montado, não faz nada', () => {
    expect(deveDevolverFocoAGrid(params({ containerGrid: null }))).toBe(false)
  })

  it('TL-51-11: alvo nulo (clique sem alvo identificável) não devolve o foco', () => {
    expect(deveDevolverFocoAGrid(params({ alvo: null }))).toBe(false)
  })

  it('TL-51-12: input DENTRO da grid (overlay de edição do Glide) preserva o foco', () => {
    // O GhostEditor do Glide monta um <input> em portal; se ele estiver dentro do
    // container da grid, roubar o foco cancelaria a edição em curso.
    const campo = em(grid, 'input')
    expect(deveDevolverFocoAGrid(params({ alvo: campo, ativo: campo }))).toBe(false)
  })
})
