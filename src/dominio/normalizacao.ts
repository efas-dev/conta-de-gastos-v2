// ADR: see spec/mvp-vertical-nubank.adr.md

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
