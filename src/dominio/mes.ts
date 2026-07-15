// ADR: see spec/mes-referencia-ui.adr.md

import type { Lancamento } from '../types'

/**
 * Retorna o mês anterior ao corrente no formato YYYY-MM.
 * Utilizado como valor default do campo de mês de referência.
 */
export function defaultMes(): string {
  const agora = new Date()
  const ano = agora.getFullYear()
  const mes = agora.getMonth() // 0-based: 0=jan … 11=dez

  if (mes === 0) {
    // Janeiro → retorna dezembro do ano anterior
    return `${ano - 1}-12`
  }

  const mesAnterior = mes // mes é 0-based, então mes=1 significa fevereiro e mes-1=0=janeiro
  return `${ano}-${String(mesAnterior).padStart(2, '0')}`
}

/**
 * Detecta o mês sugerido a partir dos lançamentos fornecidos.
 * Retorna o mês mais recente com data estritamente anterior ao mês corrente,
 * no formato YYYY-MM, ou null quando nenhum lançamento qualifica (F6).
 */
export function detectarMesSugerido(lancamentos: Lancamento[]): string | null {
  if (lancamentos.length === 0) return null

  const agora = new Date()
  const anoCorrente = agora.getFullYear()
  const mesCorrente = agora.getMonth() + 1 // 1-based

  // Prefixo do mês corrente para comparação lexicográfica
  const prefixoCorrente = `${anoCorrente}-${String(mesCorrente).padStart(2, '0')}`

  let maisRecente: string | null = null

  for (const lanc of lancamentos) {
    const data = lanc.data
    // Valida formato YYYY-MM-DD (mínimo 7 caracteres para extrair YYYY-MM)
    if (!data || data.length < 7) continue

    const prefixoMes = data.slice(0, 7) // 'YYYY-MM'
    // Verifica que o prefixo é um formato válido (YYYY-MM)
    if (!/^\d{4}-\d{2}$/.test(prefixoMes)) continue

    // Deve ser estritamente anterior ao mês corrente (comparação lexicográfica funciona para YYYY-MM)
    if (prefixoMes >= prefixoCorrente) continue

    if (maisRecente === null || prefixoMes > maisRecente) {
      maisRecente = prefixoMes
    }
  }

  return maisRecente
}

/**
 * Classifica uma fonte como 'fatura' ou 'extrato' em relação ao mês de referência.
 * Uma fonte é 'fatura' quando possui ao menos um lançamento com data anterior ao mesRef.
 * Caso contrário, é 'extrato'.
 */
export function classificarFonte(
  fonte: string,
  lancamentos: Lancamento[],
  mesRef: string,
): 'fatura' | 'extrato' {
  for (const lanc of lancamentos) {
    if (lanc.fonte !== fonte) continue

    const data = lanc.data
    if (!data || data.length < 7) continue

    const prefixoMes = data.slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(prefixoMes)) continue

    // Fatura: ao menos uma transação da fonte com data anterior ao mesRef
    if (prefixoMes < mesRef) return 'fatura'
  }

  return 'extrato'
}
