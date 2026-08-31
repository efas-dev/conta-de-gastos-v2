// ADR: see Docs/specs/mes-referencia-ui.adr.md
// ADR: see Docs/specs/conciliacao-robusta.adr.md
// ADR: see Docs/specs/vr-despesas.adr.md
// ADR: see Docs/specs/rendimentos.adr.md

import type { Aviso, Lancamento } from '../types'

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

/**
 * Fonte AUTORITATIVA de classificação fatura/extrato/form_vr/form_rendimentos (D1, ADR
 * conciliacao-robusta; D3, ADR vr-despesas; D3, ADR rendimentos). Decide UNICAMENTE pelo prefixo do
 * campo `fonte` declarado pelo parser (ou, no caso de `form_vr`/`form_rendimentos`, pelo form de
 * registro manual correspondente) no momento do parse/geração (`fatura_*` → 'fatura', `extrato_*` →
 * 'extrato', `form_vr`/`form_vr_*` → 'form_vr', `form_rendimentos`/`form_rendimentos_*` →
 * 'form_rendimentos') — nunca depende de `lancamentos` nem de `mesRef`, ao contrário de
 * `classificarFonte` (heurística por data, rebaixada a cross-check informativo).
 *
 * `'form_vr'` e `'form_rendimentos'` são tipos nomeados adicionais (não `'fatura'`, não `'extrato'`,
 * não `'manual'` — reservado para um caso futuro, D3 do ADR vr-despesas): lançamentos sintéticos
 * gerados pelos forms de VR/rendimentos não vêm de nenhum documento bancário, então nenhuma das duas
 * classificações existentes faria sentido para eles. A distinção entre os dois preserva rastreabilidade
 * de origem (D3, ADR rendimentos). A conciliação (`detectarConciliacaoRegistry`,
 * `src/dominio/registry.ts`) e o cross-check de desalinhamento (`detectarDesalinhamentoMes`, abaixo)
 * excluem/ignoram ambos naturalmente.
 *
 * Um `fonte` que não seguir nenhuma das convenções é um parser não-conformante: falha ruidosamente
 * (lança `Error`) em vez de assumir um default silencioso, para que o problema apareça no momento do
 * parse e não vire uma classificação errada mascarada.
 */
export function classificarFontePorPrefixo(
  fonte: string,
): 'fatura' | 'extrato' | 'form_vr' | 'form_rendimentos' {
  if (fonte.startsWith('fatura_')) return 'fatura'
  if (fonte.startsWith('extrato_')) return 'extrato'
  if (fonte === 'form_vr' || fonte.startsWith('form_vr_')) return 'form_vr'
  if (fonte === 'form_rendimentos' || fonte.startsWith('form_rendimentos_')) {
    return 'form_rendimentos'
  }

  throw new Error(
    `classificarFontePorPrefixo: prefixo de fonte desconhecido "${fonte}". Esperado "fatura_*", "extrato_*", "form_vr" ou "form_rendimentos"`,
  )
}

/**
 * Cross-check informativo entre a classificação autoritativa por prefixo (`classificarFontePorPrefixo`,
 * T1) e a heurística por data (`classificarFonte`), rebaixada a este papel pela Decisão 1 do ADR
 * `conciliacao-robusta`. Função pura: nunca decide fatura/extrato — apenas sinaliza quando as duas
 * classificações divergem, o que indica que o `mesRef` escolhido pelo usuário provavelmente está
 * desalinhado com os dados (ex.: fatura de junho com `mesRef='2026-06'` sem nenhuma data anterior ao
 * mês escolhido — cenário motivador F1 desta spec).
 *
 * @returns `[]` quando prefixo e heurística concordam, ou quando `fonte` classifica como `'form_vr'`
 * (T2, ADR vr-despesas Decisão 3) ou `'form_rendimentos'` (T2, ADR rendimentos Decisão 3) — o
 * cross-check de mês não se aplica a lançamentos sintéticos, que não vêm de nenhum documento bancário
 * e não têm heurística por data significativa; um único `Aviso` `tipo:'informativo'` (sem
 * `mutacaoProposta`) quando fatura/extrato divergem.
 */
export function detectarDesalinhamentoMes(
  fonte: string,
  lancamentos: Lancamento[],
  mesRef: string,
): Aviso[] {
  const porPrefixo = classificarFontePorPrefixo(fonte)
  if (porPrefixo === 'form_vr' || porPrefixo === 'form_rendimentos') return []

  const porHeuristica = classificarFonte(fonte, lancamentos, mesRef)

  if (porPrefixo === porHeuristica) return []

  return [
    {
      id: `desalinhamento-mes-${fonte}`,
      tipo: 'informativo',
      origem: 'desalinhamento-mes',
      mensagem: `Aviso: mês de referência "${mesRef}" pode estar desalinhado com a fonte "${fonte}". A classificação por prefixo indica "${porPrefixo}", mas nenhum lançamento da fonte corresponde a essa data em relação ao mês escolhido.`,
      alvo: [],
      permanece: [],
      estado: 'pendente',
    },
  ]
}
