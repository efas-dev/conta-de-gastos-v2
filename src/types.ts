// ADR: see Docs/specs/mvp-vertical-nubank.adr.md
// ADR: see Docs/specs/colinha-naturezas.adr.md
// ADR: see Docs/specs/avisos-acionaveis.adr.md

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

/**
 * Resultado do parse: lançamentos válidos + contagem de linhas puladas (D6 do ADR
 * `parsers-fatura-nubank-extrato-itau`) + lançamentos excluídos de forma explícita
 * (`excluidosPendentes`, Decisão 4/5 do ADR `avisos-acionaveis`).
 *
 * `excluidosPendentes` substitui o descarte silencioso: lançamentos como "Pagamento
 * recebido" ou "Valor pendente do mês anterior" saem aqui em vez de desaparecer sem
 * rastro. Todo parser deve preencher este campo (`[]` quando não há exclusão).
 */
export interface ResultadoParse {
  lancamentos: Lancamento[]
  linhasIgnoradas: number
  excluidosPendentes: Lancamento[]
}

/**
 * Aviso acionável exibido na Central de Avisos (ver ADR `avisos-acionaveis`, Decisão 5).
 *
 * `tipo: 'informativo'` é somente leitura; `tipo: 'proposta'` pode ser aceita/ignorada.
 * `alvo` carrega os ids dos lançamentos afetados como dado — quem decide o que fazer
 * com esses ids é o consumidor (`avisosSlice`), nunca o produtor do aviso.
 */
export interface Aviso {
  /** Identificador único do aviso */
  id: string
  /** 'informativo' = somente leitura; 'proposta' = pode ser aceita/dispensada */
  tipo: 'informativo' | 'proposta'
  /** Origem/detector que gerou o aviso (ex.: 'valor-pendente', 'conciliacao') */
  origem: string
  /** Mensagem exibida ao usuário na Central de Avisos */
  mensagem: string
  /** Ids dos lançamentos afetados pelo aviso */
  alvo: string[]
  /** Estado do ciclo de vida do aviso */
  estado: 'pendente' | 'aplicado' | 'dispensado'
}
