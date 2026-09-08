/**
 * Devolução de foco à grid de revisão — item 51 do TODO.
 *
 * Sintoma: a grid parece uma coisa separada do app. Ao clicar num botão, num card de
 * aviso ou no painel lateral, o foco vai para o elemento clicado e o teclado deixa de
 * chegar na grid; é preciso clicar nela de novo para voltar a digitar.
 *
 * A correção é devolver o foco à grid **depois** de interações da UI ao redor — mas só
 * quando o clique não entregou o foco a alguém que legitimamente precisa dele. Esta
 * decisão vive aqui como função **pura sobre o DOM** (mesmo espírito de `colagemGrid.ts`):
 * o Glide desenha em canvas e não roda em jsdom, então a política fica testável sozinha e
 * o `ReviewGrid` guarda apenas a fiação (ouvir o clique e chamar `focus()` do Glide).
 */

/** Seletor dos elementos que recebem digitação e nunca podem perder o foco para a grid. */
const SELETOR_ENTRADA_DE_TEXTO = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'

/** `true` quando `el` é — ou está dentro de — um elemento que casa com `seletor`. */
function casaOuEstaDentro(el: Element | null, seletor: string): boolean {
  return el !== null && el.closest(seletor) !== null
}

export interface ParamsFocoGrid {
  /** Alvo do clique (`event.target`). */
  alvo: Element | null
  /** Elemento focado logo após o clique (`document.activeElement`). */
  ativo: Element | null
  /** Container que embrulha o `DataEditor` do Glide; `null` antes da montagem. */
  containerGrid: Element | null
  /** `true` para clique de ponteiro de verdade (`MouseEvent.detail > 0`). */
  cliqueDePonteiro: boolean
  /** `true` quando a grid tem célula corrente — sem ela não há para onde voltar. */
  temCelulaCorrente: boolean
}

/**
 * Decide se o foco deve voltar para a grid após um clique na UI ao redor.
 *
 * Devolve `true` apenas no caso que o item 51 descreve: clique de ponteiro num elemento
 * **não textual** fora da grid (botão, card de aviso, área do painel), com a grid tendo
 * uma célula corrente para onde voltar. Todos os demais casos preservam o foco de quem o
 * recebeu:
 *
 * - **Clique dentro da própria grid** — o Glide já gerencia o foco dela, inclusive o
 *   overlay de edição (`GhostEditor`), que monta um `<input>` real.
 * - **Campos de entrada de texto** (`input`/`textarea`/`select`/`contenteditable`), aqui e
 *   em qualquer lugar: busca, formulários de VR/rendimentos, inputs inline de avisos e o
 *   switch da colinha. Vale tanto para o alvo do clique quanto para quem ficou focado —
 *   clicar num `<label>` foca o campo associado, e é o campo que manda.
 * - **Modais** (`[role="dialog"]`): enquanto um está aberto, o foco é dele; puxá-lo para a
 *   grid atrás do modal quebraria a navegação por teclado do próprio modal.
 * - **Ativação por teclado** (`detail === 0`: Enter/Espaço num botão focado, navegação por
 *   Tab): sequestrar o foco aí destruiria a navegação por teclado da página.
 */
export function deveDevolverFocoAGrid({
  alvo,
  ativo,
  containerGrid,
  cliqueDePonteiro,
  temCelulaCorrente,
}: ParamsFocoGrid): boolean {
  if (!cliqueDePonteiro) return false
  if (!temCelulaCorrente) return false
  if (containerGrid === null || alvo === null) return false

  // Clique dentro da grid: o Glide cuida do próprio foco.
  if (containerGrid.contains(alvo)) return false

  if (casaOuEstaDentro(alvo, '[role="dialog"]')) return false
  if (casaOuEstaDentro(alvo, SELETOR_ENTRADA_DE_TEXTO)) return false
  if (casaOuEstaDentro(ativo, SELETOR_ENTRADA_DE_TEXTO)) return false

  return true
}
