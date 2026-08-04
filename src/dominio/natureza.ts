/**
 * Correção de natureza digitada na grid: reconhece a sigla mesmo com caracteres
 * acidentais (espaço, hífen, etc.) e devolve a forma limpa.
 *
 * As siglas de natureza têm 2 letras (aba `Naturezas` do Modelo — ex.: "RR", "IT").
 * Quando o usuário erra e insere um espaço ou outro caractere entre/ao redor das
 * letras, mas as **duas primeiras letras válidas** formam uma sigla reconhecida, o
 * sistema a identifica e apaga o caractere acidental.
 *
 * Regras (em ordem):
 *  - Resultado sempre em caixa alta (item 28).
 *  - Se o valor (após `trim`) já é uma natureza válida, é devolvido intacto —
 *    nunca trunca uma natureza legítima (protege siglas de qualquer tamanho).
 *  - Senão, extrai só as letras A–Z e toma as **2 primeiras**; se formarem uma
 *    sigla válida, devolve-a (o caractere acidental some).
 *  - Caso contrário, devolve o valor em caixa alta como veio — mantém o realce de
 *    "precisa de atenção" para o usuário corrigir.
 *
 * Função pura: com `naturezasValidas` vazio, equivale a `toUpperCase()` (nenhuma
 * sigla a reconhecer), preservando o comportamento anterior do item 28.
 */
export function corrigirNatureza(entrada: string, naturezasValidas: string[]): string {
  const upper = entrada.toUpperCase()

  const jaValida = upper.trim()
  if (naturezasValidas.includes(jaValida)) return jaValida

  const duasLetras = upper.replace(/[^A-Z]/g, '').slice(0, 2)
  if (duasLetras.length === 2 && naturezasValidas.includes(duasLetras)) return duasLetras

  return upper
}
