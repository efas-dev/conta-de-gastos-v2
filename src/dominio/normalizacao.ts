// ADR: see Docs/specs/mvp-vertical-nubank.adr.md

/**
 * Remove sufixo de data (DD/MM ou DD/MM/AAAA) do final de uma transcrição,
 * produzindo a chave de lookup no dicionário.
 *
 * Regra: apenas sufixos no final da string são removidos; datas no meio da
 * transcrição são preservadas. Conforme Decisão 4 do ADR: só a transcrição
 * normalizada entra na chave — valor não participa.
 */
export function normalizarChave(transcricao: string): string {
  return transcricao.replace(/\s+\d{2}\/\d{2}(\/\d{4})?$/, '')
}

/**
 * Normaliza um texto para busca por prefixo: remove sufixo de data via
 * `normalizarChave`, converte para minúsculas e remove diacríticos (acentos).
 *
 * Thin wrapper sobre `normalizarChave` — não altera seu contrato.
 * Reutilizado por `calcularSugestoes` para casamento case/accent-insensitive.
 * (Decisão 3 do ADR adr-20260704-grid-autocomplete-aviso-saida)
 */
export function normalizarParaBusca(texto: string): string {
  return normalizarChave(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/**
 * Interpreta um valor monetário digitado ou colado na grid, devolvendo `null` quando o texto não
 * contém número algum.
 *
 * Existe por causa do item 40 do TODO: o clipboard nunca traz o número cru. Copiar da própria
 * grid entrega o texto contábil desenhado (`-R$ 1.083,06`); copiar do Excel/Sheets entrega a
 * moeda formatada, às vezes com o negativo entre parênteses. `Number()` devolvia `NaN` para todos
 * esses casos e a guarda de finitude do `editarCelula` descartava a edição em silêncio.
 *
 * Regra de separadores: havendo vírgula, ela é o decimal e os pontos são milhar (pt-BR). Sem
 * vírgula, o ponto é tratado como decimal — preserva o `'-300.5'` que já funcionava e é o único
 * palpite possível, já que `'1.234'` é ambíguo entre as duas convenções. Na prática não morde: a
 * grid e as planilhas sempre emitem os centavos com vírgula.
 */
export function interpretarValorMonetario(texto: string): number | null {
  const limpo = texto.trim()
  if (!/\d/.test(limpo)) return null

  // Parênteses são a notação contábil de negativo do Excel: (1.234,50) = −1234,50.
  const negativo = limpo.startsWith('-') || /^\(.*\)$/.test(limpo)
  const digitos = limpo.replace(/[^\d.,]/g, '')
  const semMilhar = digitos.includes(',')
    ? digitos.replace(/\./g, '').replace(',', '.')
    : digitos
  const num = Number(semMilhar)
  if (!Number.isFinite(num)) return null
  return negativo ? -Math.abs(num) : num
}
