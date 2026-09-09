/**
 * Menu de contexto e atalhos de linha da grid de revisão — item 38 do TODO.
 *
 * O Glide desenha em canvas e não roda em jsdom, então as duas decisões que valem regra ficam
 * aqui, como funções puras, e o `ReviewGrid` guarda apenas a fiação: ONDE o menu aparece
 * (`posicionarMenuContexto`) e QUAL ação um atalho dispara (`acaoDoAtalhoDeLinha`). Mesmo
 * espírito de `focoGrid.ts` e `colagemGrid.ts`.
 */

import { SELETOR_ENTRADA_DE_TEXTO } from './focoGrid'

/** Distância mínima entre o menu e a borda da janela, em px. */
const MARGEM_PADRAO = 8

export interface ParamsPosicaoMenu {
  /** Coordenada X do clique, em coordenadas de viewport. */
  x: number
  /** Coordenada Y do clique, em coordenadas de viewport. */
  y: number
  /** Largura medida do menu. */
  largura: number
  /** Altura medida do menu. */
  altura: number
  /** Largura da janela (`window.innerWidth`). */
  larguraViewport: number
  /** Altura da janela (`window.innerHeight`). */
  alturaViewport: number
  /** Distância mínima da borda; default `MARGEM_PADRAO`. */
  margem?: number
}

/**
 * Decide o canto superior esquerdo do menu de contexto a partir do ponto do clique.
 *
 * Regra, na ordem: o menu abre para a direita e para baixo do cursor, como qualquer menu de
 * contexto; quando não cabe, **espelha** para o outro lado do cursor (nunca fica por baixo do
 * ponteiro nem cortado); quando não cabe nem espelhado — menu maior que a janela — encosta na
 * margem, que é o melhor possível.
 */
export function posicionarMenuContexto({
  x,
  y,
  largura,
  altura,
  larguraViewport,
  alturaViewport,
  margem = MARGEM_PADRAO,
}: ParamsPosicaoMenu): { x: number; y: number } {
  /** Espelha para o lado oposto do cursor quando estoura, e encosta na margem em último caso. */
  function encaixar(inicio: number, tamanho: number, limite: number): number {
    const espelhado = inicio + tamanho > limite - margem ? inicio - tamanho : inicio
    return Math.max(margem, espelhado)
  }

  return {
    x: encaixar(x, largura, larguraViewport),
    y: encaixar(y, altura, alturaViewport),
  }
}

/** Ações de linha que o item 38 entrega, tanto pelo menu quanto por atalho. */
export type AcaoDeLinha = 'excluir' | 'inserir'

export interface ParamsAtalhoDeLinha {
  /** `KeyboardEvent.key`. */
  key: string
  ctrlKey: boolean
  metaKey: boolean
  /** `true` quando o editor inline da célula está aberto — ver `haEdicaoDeCelulaAberta`. */
  edicaoAberta: boolean
}

/**
 * Traduz uma tecla nos atalhos de linha do Google Sheets: `Ctrl+-` exclui, `Ctrl++` insere.
 *
 * `'='` conta como `'+'` porque em teclado ABNT/US o sinal de mais só sai com Shift — e é a
 * tecla sem Shift que o navegador usa para o zoom, então é ela que o usuário aperta na prática.
 *
 * Com o editor de célula aberto a função nunca opina: o `GhostEditor` monta um `<input>` real e
 * é dono do teclado enquanto durar a edição. Sem esse guard, `Ctrl+-` dentro de um valor sendo
 * digitado apagaria a linha que o usuário está editando.
 */
export function acaoDoAtalhoDeLinha({
  key,
  ctrlKey,
  metaKey,
  edicaoAberta,
}: ParamsAtalhoDeLinha): AcaoDeLinha | null {
  if (edicaoAberta) return null
  if (!ctrlKey && !metaKey) return null
  if (key === '-') return 'excluir'
  if (key === '+' || key === '=') return 'inserir'
  return null
}

/**
 * `true` quando o foco está num campo de digitação — na prática, o `<input>` que o `GhostEditor`
 * monta enquanto uma célula é editada. Lê o mesmo seletor que a política de foco (`focoGrid.ts`)
 * usa para decidir quem é dono do teclado, em vez de manter uma segunda lista.
 */
export function haEdicaoDeCelulaAberta(doc: Document): boolean {
  const ativo = doc.activeElement
  return ativo !== null && ativo.closest(SELETOR_ENTRADA_DE_TEXTO) !== null
}
