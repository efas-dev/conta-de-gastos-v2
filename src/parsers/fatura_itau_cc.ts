// ADR: see spec/fatura-itau-xlsx.adr.md

import { lerCelulas } from '../excel/celulas/leitorCelulas'

/**
 * Retorna `true` quando `bytes` contém uma tabela de fatura de cartão Itaú:
 * uma linha com as células "Data", "Lançamento" e "Valor" (Decisão 7 do ADR
 * desta spec) — sem depender do nome da aba nem da posição da linha na
 * planilha, já que o layout observado varia mês a mês.
 *
 * Cobre tanto fatura paga quanto em aberto (Decisão 8): a tabela em si não
 * distingue os dois casos, então nenhum marcador de "fatura paga" é exigido.
 *
 * Best-effort: `lerCelulas` nunca lança exceção (bytes vazios, ZIP inválido —
 * ex.: um `.csv`/`.txt` solto no app — ou XML malformado viram matriz `[]`),
 * então `aceita` também nunca lança.
 *
 * @param bytes  Conteúdo binário do arquivo oferecido ao registry binário.
 */
export function aceita(bytes: Uint8Array): boolean {
  const matriz = lerCelulas(bytes)
  return matriz.some((linha) => {
    const celulas = linha.map((celula) => celula.trim())
    return celulas.includes('Data') && celulas.includes('Lançamento') && celulas.includes('Valor')
  })
}
