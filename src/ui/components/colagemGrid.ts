/**
 * Lógica pura da colagem (Ctrl/Cmd+V) na grid de revisão.
 *
 * Comportamento estilo Google Sheets/Excel: colar um valor copiado preenche
 * **todas as células da seleção**, não só a âncora. Um bloco copiado (ex.:
 * Natureza+Descrição de uma linha) é **replicado (tiled)** para cobrir a seleção.
 *
 * Função pura — sem Glide, sem store: recebe o alvo, os valores do clipboard, a
 * seleção e o mapa visual→real, e devolve a lista de edições a aplicar. Testável
 * em isolamento; a fiação (aplicar via `editarCelula`) fica no ReviewGrid.
 */

/** Uma edição a aplicar: índice REAL do lançamento, coluna (colId) e valor em texto. */
export interface EdicaoColagem {
  indiceReal: number
  colId: string
  valor: string
}

/** Retângulo de seleção da grid (índices VISUAIS), como o Glide expõe em `range`. */
export interface RetanguloSelecao {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Monta as edições de uma colagem.
 *
 * @param alvo           `[col, row]` visual: canto superior-esquerdo do paste (Glide `target`).
 * @param valores        Clipboard como matriz `[linha][coluna]` de strings (Glide `values`).
 * @param selecao        Retângulo da seleção atual (visual) ou `undefined`.
 * @param mapaVisualReal Mapa índice-visual → índice-real (linhas filtradas/reveladas).
 * @param colunas        colIds por índice de coluna (ex.: `['fonte','data',...]`).
 * @param somenteLeitura Índices de coluna somente-leitura (puladas).
 * @returns              Edições a aplicar; `[]` quando não há nada colável.
 *
 * Regras:
 * - Se a seleção cobre mais de uma célula, o destino parte do canto dela e o clipboard é
 *   replicado (tiled) por `% h`/`% w` — um único valor preenche tudo.
 * - O destino **cresce até caber o bloco** em cada eixo (`Math.max` com o tamanho do clipboard).
 *   Sem isso, colar Natureza+Descrição numa seleção de duas linhas da coluna Natureza descartava
 *   a Descrição — o "não cola as duas de uma vez" do item 40. O Sheets se comporta assim.
 * - Sem seleção multi-célula, cola o bloco a partir do `alvo` (comportamento padrão).
 * - Colunas somente-leitura são ignoradas.
 * - Célula ausente no clipboard (linha mais curta, típica de TSV terminado em quebra de linha)
 *   não vira edição: a célula de destino fica intacta em vez de receber `undefined`.
 */
export function montarColagem(
  alvo: readonly [number, number],
  valores: readonly (readonly string[])[],
  selecao: RetanguloSelecao | undefined,
  mapaVisualReal: readonly number[],
  colunas: readonly string[],
  somenteLeitura: ReadonlySet<number>,
): EdicaoColagem[] {
  const h = valores.length
  const w = h > 0 ? valores[0].length : 0
  if (h === 0 || w === 0) return []

  const multi = selecao !== undefined && (selecao.width > 1 || selecao.height > 1)
  const colInicial = multi ? selecao!.x : alvo[0]
  const linhaInicial = multi ? selecao!.y : alvo[1]
  const largura = multi ? Math.max(selecao!.width, w) : w
  const altura = multi ? Math.max(selecao!.height, h) : h

  const edicoes: EdicaoColagem[] = []
  for (let dr = 0; dr < altura; dr++) {
    for (let dc = 0; dc < largura; dc++) {
      const col = colInicial + dc
      const colId = colunas[col]
      if (colId === undefined || somenteLeitura.has(col)) continue
      const valor = valores[dr % h]?.[dc % w]
      if (valor === undefined) continue
      const linhaVisual = linhaInicial + dr
      const indiceReal = mapaVisualReal[linhaVisual] ?? linhaVisual
      edicoes.push({ indiceReal, colId, valor })
    }
  }
  return edicoes
}
