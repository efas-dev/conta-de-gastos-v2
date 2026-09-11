/**
 * Item 38 do TODO — política pura do menu de contexto da grid.
 *
 * O Glide desenha em canvas e não roda em jsdom, então a decisão de ONDE o menu aparece e de
 * QUAL ação um atalho dispara mora aqui, testável sozinha — mesmo espírito de `focoGrid.ts` e
 * `colagemGrid.ts`.
 */

import { describe, it, expect } from 'vitest'
import {
  acaoDoAtalhoDeLinha,
  posicionarMenuContexto,
  avisoDeLinhaInseridaEscondida,
} from '../menuContexto'

/** Viewport de referência dos testes de posicionamento. */
const VIEWPORT = { larguraViewport: 1000, alturaViewport: 800 }

describe('posicionarMenuContexto (item 38)', () => {
  it('TL-38-30: com espaço de sobra, o menu abre exatamente no ponto do clique', () => {
    expect(
      posicionarMenuContexto({ x: 200, y: 300, largura: 220, altura: 120, ...VIEWPORT }),
    ).toEqual({ x: 200, y: 300 })
  })

  it('TL-38-31: sem espaço à direita, o menu abre para a ESQUERDA do ponto do clique', () => {
    const { x } = posicionarMenuContexto({ x: 900, y: 300, largura: 220, altura: 120, ...VIEWPORT })
    expect(x).toBe(900 - 220)
  })

  it('TL-38-32: sem espaço abaixo, o menu abre para CIMA do ponto do clique', () => {
    const { y } = posicionarMenuContexto({ x: 200, y: 750, largura: 220, altura: 120, ...VIEWPORT })
    expect(y).toBe(750 - 120)
  })

  it('TL-38-33: um menu maior que a viewport encosta na margem em vez de sair da tela', () => {
    const pos = posicionarMenuContexto({
      x: 990,
      y: 790,
      largura: 2000,
      altura: 2000,
      margem: 8,
      ...VIEWPORT,
    })
    expect(pos.x).toBe(8)
    expect(pos.y).toBe(8)
  })

  it('TL-38-34: o menu nunca fica com coordenada negativa, mesmo com clique colado na borda', () => {
    const pos = posicionarMenuContexto({ x: 2, y: 2, largura: 220, altura: 120, margem: 8, ...VIEWPORT })
    expect(pos.x).toBeGreaterThanOrEqual(8)
    expect(pos.y).toBeGreaterThanOrEqual(8)
  })
})

/** Atalho default: Ctrl pressionado, célula fora de edição. */
function atalho(overrides: Partial<Parameters<typeof acaoDoAtalhoDeLinha>[0]> = {}) {
  return { key: '-', ctrlKey: true, metaKey: false, edicaoAberta: false, ...overrides }
}

describe('acaoDoAtalhoDeLinha (item 38)', () => {
  it('TL-38-35: Ctrl+- exclui a linha (atalho do Google Sheets)', () => {
    expect(acaoDoAtalhoDeLinha(atalho())).toBe('excluir')
  })

  it('TL-38-36: Ctrl++ insere linha em branco', () => {
    expect(acaoDoAtalhoDeLinha(atalho({ key: '+' }))).toBe('inserir')
  })

  it('TL-38-37: Ctrl+= também insere — em teclado ABNT/US o "+" só sai com Shift, e é a tecla que o navegador usa para zoom', () => {
    expect(acaoDoAtalhoDeLinha(atalho({ key: '=' }))).toBe('inserir')
  })

  it('TL-38-38: Cmd (metaKey) vale por Ctrl, como no resto dos atalhos da grid', () => {
    expect(acaoDoAtalhoDeLinha(atalho({ ctrlKey: false, metaKey: true }))).toBe('excluir')
    expect(acaoDoAtalhoDeLinha(atalho({ key: '+', ctrlKey: false, metaKey: true }))).toBe('inserir')
  })

  it('TL-38-39: "-" ou "+" SEM modificador não é atalho — é digitação normal numa célula', () => {
    expect(acaoDoAtalhoDeLinha(atalho({ ctrlKey: false }))).toBeNull()
    expect(acaoDoAtalhoDeLinha(atalho({ key: '+', ctrlKey: false }))).toBeNull()
  })

  it('TL-38-40: com célula EM EDIÇÃO nenhum atalho dispara — o editor inline é dono do teclado', () => {
    expect(acaoDoAtalhoDeLinha(atalho({ edicaoAberta: true }))).toBeNull()
    expect(acaoDoAtalhoDeLinha(atalho({ key: '+', edicaoAberta: true }))).toBeNull()
  })

  it('TL-38-41: qualquer outra tecla com Ctrl não é atalho de linha (Ctrl+C, Ctrl+V, Ctrl+Z seguem intactos)', () => {
    for (const key of ['c', 'v', 'z', 'a', 'f', 'ArrowDown', ' ']) {
      expect(acaoDoAtalhoDeLinha(atalho({ key }))).toBeNull()
    }
  })
})

/**
 * Achado da inspeção visual da onda 5: com um filtro de natureza ativo, inserir linha criava a
 * linha certa mas ela nascia invisível — a linha em branco não tem natureza, então nenhum filtro
 * de natureza a inclui. Do ponto de vista do usuário, o menu não fazia nada. O aviso quebra esse
 * silêncio, que é justamente o que o projeto evita.
 */
describe('avisoDeLinhaInseridaEscondida (item 38)', () => {
  it('TL-38-67: com filtro de natureza ativo, devolve aviso informativo dispensável', () => {
    const aviso = avisoDeLinhaInseridaEscondida(['MR'], 7)
    expect(aviso).not.toBeNull()
    expect(aviso?.tipo).toBe('informativo')
    expect(aviso?.estado).toBe('pendente')
    expect(aviso?.origem).toBe('linha-manual-escondida')
    expect(aviso?.alvo).toEqual(['7'])
  })

  it('TL-38-68: sem filtro de natureza, não há nada a avisar', () => {
    expect(avisoDeLinhaInseridaEscondida([], 7)).toBeNull()
  })

  it('TL-38-69: a mensagem nomeia as naturezas filtradas, para o usuário saber o que limpar', () => {
    const aviso = avisoDeLinhaInseridaEscondida(['MR', 'GO'], 3)
    expect(aviso?.mensagem).toContain('MR')
    expect(aviso?.mensagem).toContain('GO')
  })

  it('TL-38-70: o id é estável por linha — reinserir na mesma posição não empilha avisos', () => {
    expect(avisoDeLinhaInseridaEscondida(['MR'], 7)?.id).toBe(
      avisoDeLinhaInseridaEscondida(['GO'], 7)?.id,
    )
    expect(avisoDeLinhaInseridaEscondida(['MR'], 7)?.id).not.toBe(
      avisoDeLinhaInseridaEscondida(['MR'], 8)?.id,
    )
  })
})
