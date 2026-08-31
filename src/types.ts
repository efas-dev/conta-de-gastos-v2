// ADR: see Docs/specs/mvp-vertical-nubank.adr.md
// ADR: see Docs/specs/colinha-naturezas.adr.md
// ADR: see Docs/specs/avisos-acionaveis.adr.md
// ADR: see Docs/specs/inspecao-proposta-conciliacao.adr.md
// ADR: see Docs/specs/fundacao-operacoes.adr.md
// ADR: see Docs/specs/conciliacao-robusta.adr.md
// ADR: see Docs/specs/vr-despesas.adr.md

/**
 * Representa um lançamento financeiro normalizado, independente da fonte de origem.
 *
 * Produzido pelos parsers e consumido pelo domínio, pelo gerador .xlsx e pela UI.
 */
export interface Lancamento {
  /**
   * Id serial de nascimento: contador incremental por sessão, atribuído no momento
   * do parse (via `src/parsers/idSerial.ts`), nunca recalculado depois. Buracos na
   * numeração visível após remoção são comportamento correto, não um bug — o id é
   * número de nascimento, não posição visual (ver ADR `fundacao-operacoes`, Decisão 2).
   */
  id: number
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
  // Os campos `transferenciaInterna` e `investimento` foram removidos em 2026-08-09:
  // eram gravados pelo pipeline e lidos por um único consumidor — o realce colorido
  // permanente da grid, aposentado a pedido do usuário. As detecções de domínio
  // (`detectarTransferenciaInterna`/`detectarInvestimento`) continuam vivas e rodam sob
  // demanda no registry, que gera os avisos acionáveis; nenhuma delas precisava da flag.
  /**
   * Marca as linhas de fatura que antes eram excluídas silenciosamente no parser
   * (`excluidosPendentes`) e agora entram em `lancamentos` como lançamentos normais
   * (ver ADR `inspecao-proposta-conciliacao`, Decisões 16/17).
   * `'valor-pendente'` = "Valor pendente do mês anterior"; `'pagamento-recebido'` =
   * "Pagamento recebido". `undefined` = lançamento comum, sem origem especial.
   * Consumida pela detecção (`detectarValorPendente`/`detectarPagamentoRecebido`) para
   * localizar a linha real em `lancamentos` sem depender de reconhecimento por texto.
   */
  origemEspecial?: 'valor-pendente' | 'pagamento-recebido'
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
 * Mutação declarativa que um `Aviso` do tipo `'proposta'` pode carregar em
 * `mutacaoProposta`: descreve o que aplicar/desfazer sem que o `avisosSlice`
 * precise conhecer a semântica de cada detector (ver ADR `fundacao-operacoes`,
 * Decisões 1 e 5).
 *
 * União discriminada por `verbo`, extensível — hoje `'remover'` e `'adicionar'`
 * (ver ADR `spec-20260805-vr-despesas`, Decisão 1). Novos verbos (ex.: `'editar'`)
 * só entram quando uma spec futura os exigir.
 *
 * `'remover'` referencia lançamentos JÁ EXISTENTES por id (`alvo`): quem propõe a
 * mutação (o detector) já viu o `Lancamento` completo em `lancamentos` e só precisa
 * apontar para ele. `'adicionar'` carrega os LANÇAMENTOS COMPLETOS a inserir (sem
 * `id`) em vez de ids, porque eles ainda não existem no momento da proposta — são
 * construídos no submit do form que gera a proposta (ex.: `FormVR`, spec
 * `vr-despesas`) e só ganham `id` serial de nascimento quando `avisosSlice.aplicar`
 * os insere (via `atribuirIds`, `src/parsers/idSerial.ts`). Referenciar por id não
 * seria possível aqui: não há id para referenciar antes da inserção.
 */
export type Mutacao =
  | {
      /** Remove os lançamentos existentes referenciados por `alvo`. */
      verbo: 'remover'
      /** Ids (`Lancamento.id`) dos lançamentos alvo da mutação. */
      alvo: number[]
    }
  | {
      /** Insere `lancamentos` como novos lançamentos, ainda sem `id`. */
      verbo: 'adicionar'
      /**
       * Lançamentos completos a inserir, sem `id` — o id serial de nascimento é
       * atribuído por quem aplica a mutação (`avisosSlice.aplicar`), nunca por
       * quem propõe.
       */
      lancamentos: Omit<Lancamento, 'id'>[]
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
  /**
   * Ids dos lançamentos que permanecem — "quem fica" — como complemento de `alvo` ("quem sai").
   * Campo aditivo (ver ADR `inspecao-proposta-conciliacao`, Decisão 2): `alvo` não muda de
   * semântica. Populado por `detectarConciliacao` com os ids da fatura que compõem a soma
   * casada; vazio (`[]`) quando não há casamento.
   */
  permanece: string[]
  /**
   * Resumo textual da regra de casamento aplicada (ex.: "somatório da fatura R$ X ↔ pagamento
   * R$ Y, diferença ≤ R$ 0,05"). `undefined` quando não há regra de tolerância nesse caminho
   * (ex.: `detectarValorPendente`) ou quando o aviso não representa um casamento.
   */
  resumo?: string
  /**
   * Estado do ciclo de vida do aviso. `'obsoleto'` é terminal: alcançado quando o(s)
   * alvo(s) por id de um aviso `'pendente'` deixam de existir em `lancamentos` (ex.:
   * exclusão manual de linha na grid) — nunca aplicado pela metade (ver ADR
   * `fundacao-operacoes`, Decisão 7). Fica fora de `selecionarContagemPendentes` e
   * nunca é aplicável, pelo mesmo guard usado para `'aplicado'`/`'dispensado'`
   * (`avisosSlice.aplicar` só age sobre `estado === 'pendente'`).
   */
  estado: 'pendente' | 'aplicado' | 'dispensado' | 'obsoleto'
  /**
   * Mutação declarativa proposta por este aviso, interpretada genericamente pelo
   * `avisosSlice` em `aplicar`/`desfazer` (ver ADR `fundacao-operacoes`, Decisão 1).
   * Opcional nesta task (T02): os detectores existentes ainda não a populam — isso
   * é feito em T06/T07/T07-bis. `undefined` = aviso sem proposta de mutação
   * estruturada (ex.: avisos informativos, ou propostas ainda não migradas ao
   * registry).
   */
  mutacaoProposta?: Mutacao
  /**
   * Lista de candidatos de conciliação para exibição (ver ADR `conciliacao-robusta`,
   * Decisões 2 e 3): candidatos próximos do total da fatura (D2) quando nenhum bate
   * exato, ou candidatos ambíguos (D3) quando 2+ batem exato. Cada item carrega o id
   * do lançamento candidato (`alvo`) e um `resumo` textual (valor/data) para exibição
   * — nunca aplicado automaticamente, apenas listado para seleção manual do usuário.
   * Populado por `detectarConciliacao` (T3/T4). `undefined` = aviso sem candidatos
   * (ex.: proposta com casamento exato único, ou avisos de outras origens).
   */
  candidatos?: { alvo: string; resumo: string }[]
}
