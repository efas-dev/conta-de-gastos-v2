/**
 * Item 51 do TODO — foco preso na grid.
 *
 * A grid parece "uma coisa separada" do app: ao clicar num botão, card de aviso ou
 * painel, o foco vai para o elemento clicado e é preciso clicar na grid de novo para
 * voltar a digitar. `deveDevolverFocoAGrid` é o predicado puro que decide quando o
 * foco volta — testável em jsdom com DOM real, sem o canvas do Glide.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { deveDevolverFocoAGrid, deveDevolverFocoAposFecharModal } from '../focoGrid'

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
    temModalAberto: false,
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

  it('TL-51-13: clique que ABRE um modal não devolve o foco à grid atrás dele', () => {
    // Achado da inspeção visual no app: o botão "Exportar .xlsx" mora FORA do modal, que
    // no instante do clique ainda nem existe. Olhar só o alvo deixava o foco voltar para a
    // grid e a digitação vazava para a célula por trás do modal aberto.
    const botao = em(fora, 'button')
    expect(deveDevolverFocoAGrid(params({ alvo: botao, ativo: botao, temModalAberto: true }))).toBe(false)
  })

  it('TL-51-14: sem modal aberto, o mesmo clique segue devolvendo o foco', () => {
    expect(deveDevolverFocoAGrid(params({ temModalAberto: false }))).toBe(true)
  })

  it('TL-51-7: clique dentro de um modal aberto não devolve o foco', () => {
    const dialogo = em(fora, 'div', { role: 'dialog' })
    const botao = em(dialogo, 'button')
    expect(deveDevolverFocoAGrid(params({ alvo: botao, ativo: botao, temModalAberto: true }))).toBe(false)
  })

  it('TL-51-15: clique que FECHA o modal devolve o foco à grid', () => {
    // Segundo achado da inspeção: o "Fechar" do modal já foi desmontado quando a decisão
    // roda, mas segue pendurado no diálogo (agora destacado do documento). Olhar o alvo
    // deixava o foco parado no <body> e a grid seguia surda — o sintoma do item 51.
    const dialogo = em(fora, 'div', { role: 'dialog' })
    const botao = em(dialogo, 'button')
    dialogo.remove()
    expect(
      deveDevolverFocoAGrid(params({ alvo: botao, ativo: document.body, temModalAberto: false })),
    ).toBe(true)
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

/**
 * Fechar o modal pelo teclado também precisa devolver o foco — achado da inspeção visual da
 * onda 4. A política do clique não cobre esse caminho: o Escape não é clique, e quando o
 * diálogo desmonta o foco cai no `<body>`, deixando a grid surda outra vez. É o sintoma do
 * item 51 reaparecendo pela via do teclado.
 */
describe('deveDevolverFocoAposFecharModal (item 51, via teclado)', () => {
  /** Default: havia modal, ele fechou, e o foco sobrou no `<body>`. */
  function paramsEscape(overrides: Partial<Parameters<typeof deveDevolverFocoAposFecharModal>[0]> = {}) {
    return {
      modalEstavaAberto: true,
      temModalAberto: false,
      ativo: document.body,
      containerGrid: grid,
      temCelulaCorrente: true,
      ...overrides,
    }
  }

  it('TL-51-16: Escape que fecha o modal devolve o foco à grid', () => {
    expect(deveDevolverFocoAposFecharModal(paramsEscape())).toBe(true)
  })

  it('TL-51-17: Escape sem modal aberto antes não mexe no foco', () => {
    // Escape para cancelar a edição de uma célula, por exemplo — o Glide cuida disso.
    expect(deveDevolverFocoAposFecharModal(paramsEscape({ modalEstavaAberto: false }))).toBe(false)
  })

  it('TL-51-18: Escape com o modal ainda aberto não mexe no foco', () => {
    // Modal que não fecha no Escape, ou um segundo modal por baixo: o foco segue sendo dele.
    expect(deveDevolverFocoAposFecharModal(paramsEscape({ temModalAberto: true }))).toBe(false)
  })

  it('TL-51-19: se o foco já foi para um campo de texto, respeita quem o recebeu', () => {
    const campo = em(fora, 'input')
    expect(deveDevolverFocoAposFecharModal(paramsEscape({ ativo: campo }))).toBe(false)
  })

  it('TL-51-20: sem célula corrente não há para onde voltar', () => {
    expect(deveDevolverFocoAposFecharModal(paramsEscape({ temCelulaCorrente: false }))).toBe(false)
  })

  it('TL-51-21: sem container de grid montado, não faz nada', () => {
    expect(deveDevolverFocoAposFecharModal(paramsEscape({ containerGrid: null }))).toBe(false)
  })
})
