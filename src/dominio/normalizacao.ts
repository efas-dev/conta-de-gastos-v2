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
