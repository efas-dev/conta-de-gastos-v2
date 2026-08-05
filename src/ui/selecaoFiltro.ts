// ADR: see Docs/specs/grid-ux-filtros.adr.md

/**
 * Semântica de seleção de filtro multi-valor (D11 do ADR grid-ux-filtros).
 *
 * Nasceu nos chips da FiltroBar (aposentada no hotfix 2026-08-02) e hoje serve
 * aos cartões de natureza do `PainelNaturezas`:
 * - `acumular` (Ctrl/Cmd+clique): adiciona ou remove o item da seleção.
 * - Clique simples: seleção única; se o item já era o único ativo, desliga.
 */
export function proximaSelecaoFiltro(
  selecaoAtual: string[],
  item: string,
  acumular: boolean,
): string[] {
  if (acumular) {
    return selecaoAtual.includes(item)
      ? selecaoAtual.filter((x) => x !== item)
      : [...selecaoAtual, item]
  }
  if (selecaoAtual.length === 1 && selecaoAtual[0] === item) {
    return []
  }
  return [item]
}
