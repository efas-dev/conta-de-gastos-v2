// ADR: see Docs/specs/avisos-acionaveis.adr.md
// ADR: see Docs/specs/inspecao-proposta-conciliacao.adr.md
// ADR: see spec/fundacao-operacoes.adr.md
// ADR: see spec/conciliacao-robusta.adr.md

import type { Aviso, Lancamento } from '../types'

const TOLERANCIA_CENTAVOS = 5

/**
 * Faixa de proximidade (D2 do ADR `conciliacao-robusta`): além da tolerância exata de
 * R$ 0,05, um lançamento do extrato cuja diferença absoluta em relação ao somatório da
 * fatura seja de até 10% desse somatório é listado como "candidato próximo" — critério
 * simples e proporcional ao tamanho da fatura, sem casamento/remoção automática (listar
 * ≠ casar). Ver `detectarConciliacao`.
 */
const FAIXA_PROXIMIDADE_PERCENTUAL = 0.1

/** Converte um valor em reais para centavos inteiros, evitando float drift. */
function paraCentavos(valor: number): number {
  return Math.round(valor * 100)
}

/** Formata centavos inteiros como reais em pt-BR (vírgula decimal), sem o prefixo "R$". */
function formatarReais(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Formata uma data ISO (`YYYY-MM-DD`) como `DD/MM/YYYY`, sem passar por `Date` (evita fuso). */
function formatarDataBr(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split('-')
  return `${dia}/${mes}/${ano}`
}

/** Resumo textual (valor + data) de um candidato próximo — ver `candidatosProximos`. */
function formatarResumoCandidato(lancamento: Lancamento): string {
  return `R$ ${formatarReais(Math.abs(paraCentavos(lancamento.valor)))} em ${formatarDataBr(lancamento.data)}`
}

/**
 * Resumo textual da regra de casamento aplicada em `detectarConciliacao` (ver ADR
 * `inspecao-proposta-conciliacao`, Decisão 2) — usado em `Aviso.resumo`.
 *
 * O texto expõe os dois lados do casamento (soma dos itens ↔ pagamento) e o MOTIVO da
 * proposta: as compras da fatura já entraram uma a uma na planilha, então manter também a
 * linha do extrato — que é o pagamento dessas mesmas compras — contaria os gastos duas vezes.
 *
 * @param parcial - `true` quando o casamento veio do fallback subset-sum, isto é, quando o
 * pagamento cobre só PARTE dos itens da fatura. Distinguir importa: dizer "soma dos itens da
 * fatura" num casamento parcial seria falso (a fatura inteira soma mais que o pagamento).
 */
function formatarResumoConciliacao(
  somaFaturaCentavos: number,
  pagamentoCentavos: number,
  parcial = false,
): string {
  const sujeito = parcial ? 'Parte dos itens desta fatura já entrou' : 'Os itens desta fatura já entraram'
  return (
    `${sujeito} na planilha, um a um (somam R$ ${formatarReais(somaFaturaCentavos)}). ` +
    `Esta linha do extrato é o pagamento desses mesmos gastos (R$ ${formatarReais(pagamentoCentavos)}) — ` +
    `manter as duas contaria tudo duas vezes. Aprovar remove só a linha do extrato.`
  )
}

/** Rótulo exibido por origem especial, usado na mensagem/resumo das propostas de remoção. */
const ROTULO_ORIGEM_ESPECIAL: Record<'valor-pendente' | 'pagamento-recebido', string> = {
  'valor-pendente': 'Valor pendente do mês anterior',
  'pagamento-recebido': 'Pagamento recebido',
}

/**
 * Explicação exibida no resumo do aviso. As duas linhas são uma particularidade do CSV do
 * Nubank, que abre a fatura repetindo o saldo que ficou em aberto no ciclo anterior e, em
 * seguida, o crédito da quitação desse saldo. Quando o usuário não atrasa a fatura, as duas
 * se anulam (mesmo valor, sinais opostos) — daí "em geral": com atraso entram multa e juros
 * e os módulos deixam de coincidir, mas nenhuma das duas linhas é gasto do mês corrente.
 * O texto nomeia a contraparte para que o usuário entenda o par ao tratar cada aviso.
 */
const COMPLEMENTO_RESUMO_ORIGEM_ESPECIAL: Record<'valor-pendente' | 'pagamento-recebido', string> = {
  'valor-pendente':
    'é o que ficou em aberto na fatura passada, que o Nubank repete no começo desta. ' +
    'Não é uma compra deste mês: em geral se anula com o "Pagamento recebido" de mesmo valor. ' +
    'Aprovar tira a linha da planilha.',
  'pagamento-recebido':
    'é a quitação da fatura anterior, que o Nubank lança dentro desta fatura. ' +
    'Não é gasto nem receita deste mês: em geral se anula com o "Valor pendente do mês anterior". ' +
    'Aprovar tira a linha da planilha.',
}

/**
 * Localiza em `lancamentos` as linhas marcadas com a `origemEspecial` dada (ver
 * `Lancamento.origemEspecial`, materializado pelo parser — ADR `inspecao-proposta-conciliacao`,
 * Decisões 16/17) e gera uma proposta de remoção acionável por linha encontrada.
 *
 * `alvo` aponta o índice REAL da linha em `lancamentos` — a linha entra na grid como
 * lançamento normal (D16) até o usuário Aprovar a remoção, quando `aplicar()` (mecanismo já
 * existente do `avisosSlice`, por índice posicional) a retira. `permanece` fica sempre `[]`
 * (papel único "sai", sem contraparte que "fica"). `resumo` carrega o valor formatado.
 *
 * Função pura: não faz I/O, não tem efeito colateral, não referencia o store.
 */
function detectarPorOrigemEspecial(
  lancamentos: Lancamento[],
  origem: 'valor-pendente' | 'pagamento-recebido',
): Aviso[] {
  const avisos: Aviso[] = []

  lancamentos.forEach((lancamento, index) => {
    if (lancamento.origemEspecial !== origem) return

    const rotulo = ROTULO_ORIGEM_ESPECIAL[origem]
    const valorCentavos = Math.abs(paraCentavos(lancamento.valor))
    const valorFormatado = `R$ ${formatarReais(valorCentavos)}`

    // A transcrição só entra quando acrescenta informação: no caso comum ela é idêntica ao
    // rótulo da origem ("Valor pendente do mês anterior"), e repeti-la só polui o título.
    const transcricaoRedundante =
      lancamento.transcricao.trim().toLocaleLowerCase('pt-BR') === rotulo.toLocaleLowerCase('pt-BR')

    avisos.push({
      id: `${origem}-${index}`,
      tipo: 'proposta',
      origem,
      mensagem: transcricaoRedundante
        ? `${rotulo}: ${valorFormatado}.`
        : `${rotulo}: ${valorFormatado} ("${lancamento.transcricao}").`,
      alvo: [String(index)],
      permanece: [],
      resumo: `${rotulo}: R$ ${formatarReais(valorCentavos)} — ${COMPLEMENTO_RESUMO_ORIGEM_ESPECIAL[origem]}`,
      estado: 'pendente',
    })
  })

  return avisos
}

/**
 * Detecta, entre `lancamentos`, as linhas de "Valor pendente do mês anterior" (marcadas pelo
 * parser via `Lancamento.origemEspecial === 'valor-pendente'`) e gera uma proposta de remoção
 * acionável para cada uma — tornando auditável um valor que, se tratado como lançamento comum,
 * duplicaria despesa já contada no ciclo anterior (ver ADR `avisos-acionaveis`, Contexto).
 *
 * Revisão de D10/D11 pela Decisão 16 (emenda pós-inspeção): a linha deixou de ser excluída no
 * parse (T6) e agora entra em `lancamentos` como lançamento normal; `alvo` deixa de ser `[]` e
 * passa a apontar o índice real dessa linha, reusando o mecanismo de `aplicar()` já existente.
 *
 * @param lancamentos - Lista de lançamentos a inspecionar (tipicamente `state.lancamentos`).
 * @returns Um `Aviso` proposta por linha encontrada; array vazio se nenhuma existir.
 */
export function detectarValorPendente(lancamentos: Lancamento[]): Aviso[] {
  return detectarPorOrigemEspecial(lancamentos, 'valor-pendente')
}

/**
 * Detecta, entre `lancamentos`, as linhas de "Pagamento recebido" (marcadas pelo parser via
 * `Lancamento.origemEspecial === 'pagamento-recebido'`) e gera uma proposta de remoção acionável
 * para cada uma — análoga a `detectarValorPendente`, antecipando o follow-up de D9 (ver ADR
 * `inspecao-proposta-conciliacao`, Decisão 17). A linha deixou de ser descartada silenciosamente
 * no parse (T6) e agora entra em `lancamentos` como lançamento normal.
 *
 * @param lancamentos - Lista de lançamentos a inspecionar (tipicamente `state.lancamentos`).
 * @returns Um `Aviso` proposta por linha encontrada; array vazio se nenhuma existir.
 */
export function detectarPagamentoRecebido(lancamentos: Lancamento[]): Aviso[] {
  return detectarPorOrigemEspecial(lancamentos, 'pagamento-recebido')
}

/**
 * Encontra os índices (posição em `lancamentosFatura`) de algum subconjunto cuja soma em
 * centavos seja exatamente igual a `alvoCentavos`, ou `null` se não existir. Mesma programação
 * dinâmica de subset-sum de antes (soma alcançável em ordem), agora guardando a composição de
 * índices que atinge cada soma alcançável — a decisão de "existe casamento" continua idêntica
 * (deriva de "achou composição, sim ou não"), zero mudança na lógica de casamento.
 */
function subsetComposicaoIndices(
  lancamentosFatura: Lancamento[],
  alvoCentavos: number,
): number[] | null {
  if (alvoCentavos <= 0) return null

  const alcancaveis = new Map<number, number[]>([[0, []]])
  for (let indice = 0; indice < lancamentosFatura.length; indice++) {
    const valor = Math.abs(paraCentavos(lancamentosFatura[indice].valor))
    if (valor <= 0) continue
    const entradas = Array.from(alcancaveis.entries())
    for (const [soma, indices] of entradas) {
      const proxima = soma + valor
      if (proxima <= alvoCentavos && !alcancaveis.has(proxima)) {
        alcancaveis.set(proxima, [...indices, indice])
      }
    }
    if (alcancaveis.has(alvoCentavos)) break
  }
  return alcancaveis.get(alvoCentavos) ?? null
}

/**
 * Monta o Aviso informativo (sem `mutacaoProposta`) que lista candidatos do extrato para
 * seleção manual do usuário — usado tanto pela ambiguidade exata (D3, 2+ candidatos por
 * total ou por subconjunto) quanto pelos candidatos próximos (D2). Listar ≠ casar: nenhum
 * desses caminhos aplica remoção automática.
 */
function avisoInformativoComCandidatos(
  id: string,
  mensagem: string,
  candidatosLancamentos: Lancamento[],
): Aviso {
  return {
    id,
    tipo: 'informativo',
    origem: 'conciliacao',
    mensagem,
    alvo: [],
    permanece: [],
    estado: 'pendente',
    candidatos: candidatosLancamentos.map((lancamento) => ({
      alvo: String(lancamento.id),
      resumo: formatarResumoCandidato(lancamento),
    })),
  }
}

/** Monta o Aviso de proposta de conciliação apontando para o lançamento do extrato. */
function propostaConciliacao(
  lancamento: Lancamento,
  indexExtrato: number,
  permanece: string[],
  resumo: string,
): Aviso {
  return {
    id: `conciliacao-${indexExtrato}`,
    tipo: 'proposta',
    origem: 'conciliacao',
    mensagem: `Pagamento desta fatura no extrato: "${lancamento.transcricao}" (R$ ${formatarReais(Math.abs(paraCentavos(lancamento.valor)))}).`,
    alvo: [String(indexExtrato)],
    permanece,
    resumo,
    estado: 'pendente',
  }
}

/**
 * Detecta conciliação entre os lançamentos de uma fatura e os lançamentos de um extrato,
 * evitando que a mesma despesa seja contada duas vezes (item a item pela fatura, agregada
 * pelo extrato) — ver ADR `avisos-acionaveis`, Decisão 8 (R1) e Decisão 9 (R2).
 *
 * Estratégia, nesta ordem:
 * 1. Casamento do somatório total da fatura contra cada lançamento do extrato, com
 *    tolerância de R$ 0,05 (arredondamento bancário). Exatamente 1 candidato → proposta.
 * 2. Fallback: quando o somatório total não casa com nenhum candidato, tenta casamento
 *    exato ao centavo entre um subconjunto da fatura e um lançamento do extrato (cenário
 *    de pagamento parcial).
 * 3. Em ambas as etapas, 2+ candidatos dentro do critério é ambiguidade — par único
 *    conservador (R2): nenhuma proposta é gerada; em vez disso (ADR `conciliacao-robusta`
 *    Decisão 3), emite 1 aviso informativo com `Aviso.candidatos` listando todos os
 *    candidatos ambíguos (valor/data/id) para seleção manual — nunca remoção automática.
 * 4. Nenhum casamento em nenhuma etapa: se existir ≥1 lançamento do extrato dentro da
 *    faixa de proximidade do total da fatura (`FAIXA_PROXIMIDADE_PERCENTUAL`, ADR
 *    `conciliacao-robusta` Decisão 2), emite 1 aviso informativo com `Aviso.candidatos`
 *    listando-os (valor/data/id) para seleção manual — nunca casamento/remoção
 *    automática (D2: listar ≠ casar). Sem candidato próximo, mantém o informativo
 *    genérico "fatura não conciliada".
 *
 * Função pura: não faz I/O, não tem efeito colateral, não referencia o store.
 *
 * @param lancamentosFatura - Lançamentos da fatura a conciliar.
 * @param lancamentosExtrato - Lançamentos do extrato candidatos ao casamento.
 * @returns Array com 0 ou 1 `Aviso` (proposta de conciliação, informativo com
 * candidatos próximos, ou informativo genérico de não-casamento).
 */
export function detectarConciliacao(
  lancamentosFatura: Lancamento[],
  lancamentosExtrato: Lancamento[],
): Aviso[] {
  const somaFaturaCentavos = Math.abs(
    lancamentosFatura.reduce((acc, l) => acc + paraCentavos(l.valor), 0),
  )

  const candidatosTotal = lancamentosExtrato
    .map((lancamento, index) => ({ lancamento, index }))
    .filter(
      ({ lancamento }) =>
        Math.abs(Math.abs(paraCentavos(lancamento.valor)) - somaFaturaCentavos) <=
        TOLERANCIA_CENTAVOS,
    )

  if (candidatosTotal.length === 1) {
    const { lancamento, index } = candidatosTotal[0]
    const permanece = lancamentosFatura.map((_, i) => String(i))
    const resumo = formatarResumoConciliacao(
      somaFaturaCentavos,
      Math.abs(paraCentavos(lancamento.valor)),
    )
    return [propostaConciliacao(lancamento, index, permanece, resumo)]
  }
  if (candidatosTotal.length >= 2) {
    return [
      avisoInformativoComCandidatos(
        'conciliacao-ambiguidade-total',
        `${candidatosTotal.length} lançamentos do extrato têm o valor exato desta fatura — não dá para saber qual é o pagamento dela. Escolha qual remover para não contar os mesmos gastos duas vezes.`,
        candidatosTotal.map(({ lancamento }) => lancamento),
      ),
    ]
  }

  const candidatosSubset = lancamentosExtrato
    .map((lancamento, index) => ({
      lancamento,
      index,
      composicao: subsetComposicaoIndices(lancamentosFatura, Math.abs(paraCentavos(lancamento.valor))),
    }))
    .filter(
      (candidato): candidato is typeof candidato & { composicao: number[] } =>
        candidato.composicao !== null,
    )

  if (candidatosSubset.length === 1) {
    const { lancamento, index, composicao } = candidatosSubset[0]
    const permanece = composicao.map((i) => String(i))
    const somaSubsetCentavos = composicao.reduce(
      (acc, i) => acc + Math.abs(paraCentavos(lancamentosFatura[i].valor)),
      0,
    )
    // `parcial`: o casamento cobre só os itens de `composicao`, não a fatura inteira.
    const resumo = formatarResumoConciliacao(
      somaSubsetCentavos,
      Math.abs(paraCentavos(lancamento.valor)),
      composicao.length < lancamentosFatura.length,
    )
    return [propostaConciliacao(lancamento, index, permanece, resumo)]
  }
  if (candidatosSubset.length >= 2) {
    return [
      avisoInformativoComCandidatos(
        'conciliacao-ambiguidade-subconjunto',
        `${candidatosSubset.length} lançamentos do extrato batem com algum grupo de itens desta fatura — não dá para saber qual é o pagamento dela. Escolha qual remover para não contar os mesmos gastos duas vezes.`,
        candidatosSubset.map(({ lancamento }) => lancamento),
      ),
    ]
  }

  const limiteProximidadeCentavos = somaFaturaCentavos * FAIXA_PROXIMIDADE_PERCENTUAL
  const candidatosProximos = lancamentosExtrato
    .map((lancamento, index) => ({
      lancamento,
      index,
      diferencaCentavos: Math.abs(Math.abs(paraCentavos(lancamento.valor)) - somaFaturaCentavos),
    }))
    .filter(
      ({ diferencaCentavos }) =>
        diferencaCentavos > TOLERANCIA_CENTAVOS && diferencaCentavos <= limiteProximidadeCentavos,
    )

  if (candidatosProximos.length > 0) {
    return [
      avisoInformativoComCandidatos(
        'conciliacao-candidatos-proximos',
        `Nenhum lançamento do extrato bate exatamente com esta fatura, mas ${candidatosProximos.length} chega(m) perto. Veja se algum é o pagamento dela e remova-o para não contar os mesmos gastos duas vezes.`,
        candidatosProximos.map(({ lancamento }) => lancamento),
      ),
    ]
  }

  return [
    {
      id: 'conciliacao-sem-casamento',
      tipo: 'informativo',
      origem: 'conciliacao',
      mensagem:
        'Não encontrei no extrato o pagamento desta fatura. Nada foi removido: se o pagamento ' +
        'estiver lá com outro valor, remova-o à mão para não contar os mesmos gastos duas vezes.',
      alvo: [],
      permanece: [],
      estado: 'pendente',
    },
  ]
}
