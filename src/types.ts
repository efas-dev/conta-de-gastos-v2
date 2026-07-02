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
