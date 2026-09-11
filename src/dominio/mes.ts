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
 *
 * O **extrato é a fonte de verdade** (decisão do usuário, 2026-08-31): havendo qualquer
 * lançamento de fonte `extrato_*`, só eles decidem o mês. Na fatura a data é a da COMPRA, não a
 * do ciclo — uma fatura fechada em junho carrega compras de maio e puxaria a sugestão um mês
 * para trás (item 44 do TODO). Sem nenhum extrato carregado, todos os lançamentos voltam a
 * contar: melhor um palpite enviesado do que nenhum.
 */
export function detectarMesSugerido(lancamentos: Lancamento[]): string | null {
  if (lancamentos.length === 0) return null

  // Prefixo direto em vez de `classificarFontePorPrefixo`: aqui uma fonte fora da convenção não
  // deve derrubar a sugestão inteira com um throw — ela apenas não é extrato.
  const doExtrato = lancamentos.filter((l) => l.fonte?.startsWith('extrato_'))
  const consideraveis = doExtrato.length > 0 ? doExtrato : lancamentos

  const agora = new Date()
  const anoCorrente = agora.getFullYear()
  const mesCorrente = agora.getMonth() + 1 // 1-based

  // Prefixo do mês corrente para comparação lexicográfica
  const prefixoCorrente = `${anoCorrente}-${String(mesCorrente).padStart(2, '0')}`

  let maisRecente: string | null = null

  for (const lanc of consideraveis) {
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
 * Valor exato do campo `fonte` de uma linha inserida à mão pela grid de revisão (item 38 do TODO).
 *
 * Existe como constante para que a convenção tenha um único dono: quem cria a linha
 * (`inserirLinha`, `src/ui/store/appStore.ts`), quem a classifica (`classificarFontePorPrefixo`,
 * abaixo) e quem a exclui do casamento de pares (`FONTES_MANUAIS`, `src/dominio/pares.ts`) leem
 * todos a mesma string.
 */
export const FONTE_MANUAL = 'manual'

/**
 * Fonte AUTORITATIVA de classificação fatura/extrato/form_vr/form_rendimentos/manual (D1, ADR
 * conciliacao-robusta; D3, ADR vr-despesas; D3, ADR rendimentos; item 38 do TODO). Decide UNICAMENTE
 * pelo prefixo do campo `fonte` declarado pelo parser (ou, no caso de `form_vr`/`form_rendimentos`,
 * pelo form de registro manual correspondente; ou, no caso de `manual`, pela própria grid) no momento
 * do parse/geração/inserção (`fatura_*` → 'fatura', `extrato_*` → 'extrato', `form_vr`/`form_vr_*` →
 * 'form_vr', `form_rendimentos`/`form_rendimentos_*` → 'form_rendimentos', `manual` → 'manual') —
 * nunca depende de `lancamentos` nem de `mesRef`, ao contrário de `classificarFonte` (heurística por
 * data, rebaixada a cross-check informativo).
 *
 * `'form_vr'`, `'form_rendimentos'` e `'manual'` são tipos nomeados adicionais (não `'fatura'`, não
 * `'extrato'`): lançamentos que nascem dentro do app não vêm de nenhum documento bancário, então
 * nenhuma das duas classificações existentes faria sentido para eles. A distinção entre eles preserva
 * rastreabilidade de origem (D3, ADR rendimentos) — inclusive na coluna A da planilha exportada
 * (`src/excel/writer/gerador.ts`). A conciliação (`detectarConciliacaoRegistry`, `src/dominio/registry.ts`) e
 * o cross-check de desalinhamento (`detectarDesalinhamentoMes`, abaixo) excluem/ignoram os três
 * naturalmente; o motor de pares os exclui via `FONTES_MANUAIS` (`src/dominio/pares.ts`).
 *
 * `'manual'` (item 38 — linha inserida à mão pela grid de revisão) fecha o caso que a Decisão 3 do
 * ADR vr-despesas deixara reservado. Diferente dos demais, é reconhecida por **igualdade exata**, não
 * por prefixo: `manual` não nomeia uma família de parsers com variantes por banco — a origem é sempre
 * a mesma (o usuário). Manter `manual_*` fora da convenção preserva a falha ruidosa para qualquer
 * parser futuro que invente um identificador parecido.
 *
 * Um `fonte` que não seguir nenhuma das convenções é um parser não-conformante: falha ruidosamente
 * (lança `Error`) em vez de assumir um default silencioso, para que o problema apareça no momento do
 * parse e não vire uma classificação errada mascarada.
 */
export function classificarFontePorPrefixo(
  fonte: string,
): 'fatura' | 'extrato' | 'form_vr' | 'form_rendimentos' | 'manual' {
  if (fonte.startsWith('fatura_')) return 'fatura'
  if (fonte.startsWith('extrato_')) return 'extrato'
  if (fonte === 'form_vr' || fonte.startsWith('form_vr_')) return 'form_vr'
  if (fonte === 'form_rendimentos' || fonte.startsWith('form_rendimentos_')) {
    return 'form_rendimentos'
  }
  if (fonte === FONTE_MANUAL) return 'manual'

  throw new Error(
    `classificarFontePorPrefixo: prefixo de fonte desconhecido "${fonte}". Esperado "fatura_*", "extrato_*", "form_vr", "form_rendimentos" ou "manual"`,
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
 * (T2, ADR vr-despesas Decisão 3), `'form_rendimentos'` (T2, ADR rendimentos Decisão 3) ou
 * `'manual'` (item 38 do TODO) — o cross-check de mês não se aplica a lançamentos que nascem dentro
 * do app, que não vêm de nenhum documento bancário e não têm heurística por data significativa; um
 * único `Aviso` `tipo:'informativo'` (sem `mutacaoProposta`) quando fatura/extrato divergem.
 */
export function detectarDesalinhamentoMes(
  fonte: string,
  lancamentos: Lancamento[],
  mesRef: string,
): Aviso[] {
  const porPrefixo = classificarFontePorPrefixo(fonte)
  if (porPrefixo === 'form_vr' || porPrefixo === 'form_rendimentos' || porPrefixo === 'manual') {
    return []
  }

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
