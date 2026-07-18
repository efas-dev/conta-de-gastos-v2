// ADR: see Docs/specs/mvp-vertical-nubank.adr.md

/**
 * Representa um lançamento financeiro normalizado, independente da fonte de origem.
 *
 * Produzido pelos parsers e consumido pelo domínio, pelo gerador .xlsx e pela UI.
 */
export interface Lancamento {
  /** Nome do banco/fonte de origem (ex.: "Nubank") */
  fonte: string
  /** Data do lançamento em formato ISO 8601 (YYYY-MM-DD) */
  data: string
  /** Descrição original do lançamento, preservada como vem da fonte */
  transcricao: string
  /** Valor em reais (negativo = débito, positivo = crédito) */
  valor: number
  /** Iniciais da pessoa responsável pelo gasto (default = iniciais do usuário) */
  iniciais: string
  /** Natureza/categoria do gasto (preenchida pelo dicionário ou em branco) */
  natureza: string
  /** Descrição enriquecida do gasto (preenchida pelo dicionário ou em branco) */
  descricao: string
  /**
   * Indica se o lançamento é uma movimentação entre contas do próprio usuário.
   * `true` = transferência interna (ex.: TED/Pix para conta própria, pagamento de fatura de cartão próprio).
   * Preenchida pelo pipeline via `detectarTransferenciaInterna`; `undefined` antes do enriquecimento.
   */
  transferenciaInterna?: boolean
  /**
   * Classificação do lançamento quanto a investimentos de renda fixa/variável.
   * `'aplicacao'` = entrada de dinheiro em investimento (débito na conta corrente).
   * `'resgate'` = saída de investimento de volta para conta corrente (crédito).
   * `null` = lançamento comum, sem caráter de investimento.
   * `undefined` = campo ainda não avaliado pelo pipeline.
   * Preenchida pelo pipeline via `detectarInvestimento`.
   */
  investimento?: 'aplicacao' | 'resgate' | null
}

/**
 * Natureza de gasto enriquecida com nome completo e descrição curta,
 * lida da aba `Naturezas` do Modelo.xlsx (colunas B, A e F, linhas 3–32).
 *
 * Produzida por `lerNaturezas` e consumida pelo store e pelo painel colinha.
 */
export interface NaturezaRica {
  /** Sigla da natureza (coluna B, ex.: "ALM", "TRN") */
  sigla: string
  /** Nome completo da natureza (coluna A, ex.: "Alimentação") */
  nome: string
  /** Descrição curta (coluna F); vazio quando a célula está ausente ou em branco */
  descricao: string
}

/**
 * Entrada do dicionário de classificações, lida da aba `Dicionario` do .xlsx anterior.
 *
 * A chave é a transcrição normalizada (sufixo de data removido).
 * Duas entradas com a mesma chave e fonte geram `ambiguo = true` se diferirem em
 * natureza, descricao ou iniciais.
 */
export interface DicEntry {
  /** Transcrição normalizada usada como chave de lookup */
  chave: string
  /** Fonte de origem associada à entrada (ex.: "Nubank") */
  fonte: string
  /** Natureza/categoria do gasto */
  natureza: string
  /** Descrição enriquecida do gasto */
  descricao: string
  /** Iniciais da pessoa responsável pelo gasto */
  iniciais: string
  /** Número de vezes que esta chave foi classificada com este padrão */
  vezes: number
  /** `true` quando a chave apresentou classificações conflitantes — não auto-preenche */
  ambiguo: boolean
}
