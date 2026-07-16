// ADR: see Docs/specs/grid-revisao.adr.md
// ADR: see Docs/specs/grid-ux-filtros.adr.md

import { create } from 'zustand'
import { enablePatches, produceWithPatches, applyPatches, current, type Patch } from 'immer'
import type { Lancamento, DicEntry } from '../../types'
import { ratearSplit, type AlvoSplit } from '../../dominio/split'

/**
 * Habilita o suporte a patches do Immer (necessário para undo por patches — D3 do ADR).
 * Chamado uma vez no carregamento do módulo — idempotente.
 */
enablePatches()

// ---------------------------------------------------------------------------
// Campos editáveis na grid (D7 do ADR grid-revisao)
// ---------------------------------------------------------------------------

/**
 * Campos de Lancamento que o usuário pode editar na grid.
 * Fonte, Data e Transcrição são somente leitura (D7 do ADR grid-revisao).
 */
export type CampoEditavel = 'iniciais' | 'natureza' | 'descricao' | 'valor'

/**
 * Colunas somente leitura — não podem ser preenchidas por preencherIntervalo.
 * Decisão D14 do ADR grid-ux-filtros: fill handle aplica só nas colunas editáveis.
 */
const COLUNAS_SOMENTE_LEITURA = new Set(['fonte', 'data', 'transcricao'])

// ---------------------------------------------------------------------------
// Tipos de filtro/ordenação (D7 e D9 do ADR grid-ux-filtros)
// ---------------------------------------------------------------------------

/** Colunas que podem ser usadas para ordenação visual (todas as colunas da grid). */
export type ColunaOrdenavel = keyof Pick<
  Lancamento,
  'fonte' | 'data' | 'transcricao' | 'valor' | 'natureza' | 'iniciais' | 'descricao'
>

/** Direção da ordenação. */
export type DirecaoOrdenacao = 'asc' | 'desc'

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

/** Estado completo do store de UI. */
export interface EstadoApp {
  /** Lançamentos parseados + enriquecidos, editáveis na grid. */
  lancamentos: Lancamento[]
  /** Iniciais do usuário logado (padrão para novos lançamentos). */
  iniciais: string
  /** Nome do usuário para detecção de Pix nominais. */
  nomeUsuario: string
  /** Naturezas válidas lidas do Modelo.xlsx (aba Naturezas B3:B32). */
  naturezasValidas: string[]
  /** Entradas do dicionário lidas do .xlsx anterior. */
  dicEntries: DicEntry[]
  /** Mensagens de aviso acumuladas para exibição. */
  avisos: string[]
  /**
   * Pilha de undo. Cada entrada guarda os patches diretos e inversos de uma
   * mutação, permitindo tanto desfazer (aplicar `inversas`) quanto refazer
   * (reaplicar `diretas`). A última posição é a mutação mais recente.
   */
  historico: EntradaHistorico[]
  /**
   * Pilha de redo. Recebe as entradas desempilhadas de `historico` pelo `undo`;
   * é zerada por qualquer nova mutação (uma edição nova invalida o redo).
   */
  futuro: EntradaHistorico[]
  /** Arquivo CSV selecionado pelo usuário (null = nenhum). */
  csvArquivo: File | null
  /**
   * Flag de estado "sujo": `true` quando há mutações não exportadas.
   * Liga em qualquer chamada de `mutarComHistorico` e em `setLancamentos`
   * com array não-vazio. Desliga via `marcarLimpo()` (chamado após exportação).
   * Fica fora de `EstadoMutavel` para não ser afetada por patches de undo/redo
   * (D6 do ADR — flag sujo).
   */
  sujo: boolean

  // -------------------------------------------------------------------------
  // Slice de filtro/ordenação — D7, D9 do ADR grid-ux-filtros
  // Fora do histórico de undo/redo: filtro é navegação, não edição de dados.
  // -------------------------------------------------------------------------

  /** Fontes selecionadas para filtro; array vazio = sem filtro por fonte. */
  filtroFontes: string[]
  /** Naturezas selecionadas para filtro; array vazio = sem filtro por natureza. */
  filtroNaturezas: string[]
  /** Quando true, exibe apenas lançamentos com natureza ou iniciais vazios. */
  filtroSoIncompletos: boolean
  /** Coluna usada para ordenação; null = ordem original dos parsers (D5). */
  ordenacaoColuna: ColunaOrdenavel | null
  /** Direção da ordenação ativa. */
  ordenacaoDirecao: DirecaoOrdenacao

  // -------------------------------------------------------------------------
  // Seletores derivados — D7 do ADR grid-ux-filtros
  // Recalculados reativamente; não entram no historico.
  // -------------------------------------------------------------------------

  /**
   * Subconjunto de `lancamentos` que passa pelos filtros e ordenação ativos.
   * Usado pela grid em vez de `lancamentos` para exibir a visão filtrada.
   * A exportação NUNCA usa este seletor (D4 do ADR grid-ux-filtros).
   */
  lancamentosVisiveis: Lancamento[]

  /**
   * Mapa de tradução: posição visual (índice em `lancamentosVisiveis`) →
   * posição real (índice em `lancamentos`).
   * Permite que `onCellEdited` e `preencherIntervalo` encontrem o lançamento
   * correto mesmo com filtro ativo (D14 do ADR grid-ux-filtros).
   */
  mapaIndiceVisualReal: number[]
}

/** Entrada de histórico: patches diretos (redo) e inversos (undo) de uma mutação. */
export interface EntradaHistorico {
  diretas: Patch[]
  inversas: Patch[]
}

/**
 * Sub-estado que pode ser mutado via `produceWithPatches`.
 * Exclui `historico`/`futuro` porque são gerenciados fora do ciclo de patches.
 * Exclui `sujo` para que patches de undo/redo não restaurem o flag (D6).
 * Exclui os campos de filtro/ordenação e seletores derivados porque são
 * navegação, não dados — não devem entrar no histórico (D9 do ADR grid-ux-filtros).
 */
type EstadoMutavel = Omit<
  EstadoApp,
  | 'historico'
  | 'futuro'
  | 'sujo'
  | 'filtroFontes'
  | 'filtroNaturezas'
  | 'filtroSoIncompletos'
  | 'ordenacaoColuna'
  | 'ordenacaoDirecao'
  | 'lancamentosVisiveis'
  | 'mapaIndiceVisualReal'
>

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Actions expostas pelo store. */
export interface AcoesApp {
  /**
   * Edita um campo editável de um lançamento na posição `indice`.
   *
   * Para o campo `valor`, valida que o resultado é um número finito
   * antes de aplicar a mutação (D7 do ADR — edição de Valor é numérica).
   * Empilha os patches inversos em `historico` para permitir undo.
   */
  editarCelula: (indice: number, campo: CampoEditavel, valor: string | number) => void

  /**
   * Remove o lançamento na posição `indice`.
   * Empilha os patches inversos em `historico`.
   */
  excluirLinha: (indice: number) => void

  /**
   * Move o lançamento na posição `indice` uma posição para cima ou para baixo.
   * Sem efeito se `indice` já estiver no limite do array.
   * Empilha os patches inversos em `historico`.
   */
  moverLinha: (indice: number, direcao: 'cima' | 'baixo') => void

  /**
   * Substitui o lançamento na posição `indice` pelo resultado de
   * `ratearSplit(lancamento, alvos)` — pode expandir de 1 para N linhas.
   * Empilha os patches inversos em `historico`.
   */
  aplicarSplit: (indice: number, alvos: AlvoSplit[]) => void

  /**
   * Reverte a última mutação aplicando os patches inversos do Immer.
   * Move a entrada do topo do `historico` para o `futuro` (para permitir redo).
   * Sem efeito se o histórico estiver vazio.
   */
  undo: () => void

  /**
   * Refaz a última mutação desfeita, reaplicando os patches diretos.
   * Move a entrada do topo do `futuro` de volta para o `historico`.
   * Sem efeito se o `futuro` estiver vazio.
   */
  redo: () => void

  /** Substitui a lista de lançamentos (sem rastreamento de undo). */
  setLancamentos: (lancamentos: Lancamento[]) => void

  /** Atualiza as iniciais do usuário (sem rastreamento de undo). */
  setIniciais: (iniciais: string) => void

  /** Atualiza o nome do usuário para detecção de Pix nominais (sem rastreamento de undo). */
  setNomeUsuario: (nomeUsuario: string) => void

  /** Armazena o arquivo CSV selecionado pelo usuário (sem rastreamento de undo). */
  setCSV: (arquivo: File | null) => void

  /**
   * Substitui as entradas do dicionário.
   * Sem rastreamento de undo — este setter é chamado no carregamento do dicionário.
   */
  setDic: (entries: DicEntry[]) => void

  /** Adiciona uma mensagem de aviso ao fim da lista. */
  addAviso: (aviso: string) => void

  /** Remove todas as mensagens de aviso. */
  clearAvisos: () => void

  /**
   * Seta `sujo: false` — chamado após exportação bem-sucedida para indicar
   * que não há mutações pendentes (D6 do ADR).
   */
  marcarLimpo: () => void

  // -------------------------------------------------------------------------
  // Actions de filtro/ordenação — D9 do ADR grid-ux-filtros
  // Não geram entradas no histórico de undo/redo.
  // -------------------------------------------------------------------------

  /** Define o conjunto de fontes selecionadas para filtro. */
  setFiltroFontes: (fontes: string[]) => void

  /** Define o conjunto de naturezas selecionadas para filtro. */
  setFiltroNaturezas: (naturezas: string[]) => void

  /** Ativa ou desativa o filtro "só incompletos". */
  setFiltroSoIncompletos: (ativo: boolean) => void

  /** Define a coluna e direção de ordenação. */
  setOrdenacao: (coluna: ColunaOrdenavel | null, direcao: DirecaoOrdenacao) => void

  /**
   * Cicla a ordenação de `coluna` (clique no cabeçalho): sem ordenação → asc →
   * desc → sem ordenação. Clicar em outra coluna reinicia o ciclo em asc.
   * Fora do histórico de undo (D9 do ADR).
   */
  ciclarOrdenacao: (coluna: ColunaOrdenavel) => void

  /** Remove todos os filtros e ordenação (retorna à ordem original). */
  limparFiltros: () => void

  /**
   * Preenche o campo `colId` com `valor` em todas as linhas visíveis no
   * intervalo visual `[startRow, endRow]` (coordenadas em `lancamentosVisiveis`).
   *
   * Colunas somente leitura (fonte, data, transcricao) são silenciosamente
   * ignoradas — D14 do ADR grid-ux-filtros.
   *
   * Cada célula modificada empilha sua própria entrada de undo, permitindo
   * desfazer granularmente.
   */
  preencherIntervalo: (startRow: number, endRow: number, colId: string, valor: string | number) => void
}

/** Tipo completo do store — estado + actions. */
export type AppStore = EstadoApp & AcoesApp

// ---------------------------------------------------------------------------
// Estado inicial
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helper — calcula visão derivada (lancamentosVisiveis + mapa)
// ---------------------------------------------------------------------------

/**
 * Computa o par `(lancamentosVisiveis, mapaIndiceVisualReal)` a partir do
 * estado atual de filtros/ordenação.
 *
 * - Filtros são cumulativos (AND lógico).
 * - Ordenação é aplicada após a filtragem.
 * - O mapa guarda os índices originais de `lancamentos` para tradução visual→real.
 * D7, D8, D14 do ADR grid-ux-filtros.
 */
function calcularVisao(
  lancamentos: Lancamento[],
  filtroFontes: string[],
  filtroNaturezas: string[],
  filtroSoIncompletos: boolean,
  ordenacaoColuna: ColunaOrdenavel | null,
  ordenacaoDirecao: DirecaoOrdenacao,
): { lancamentosVisiveis: Lancamento[]; mapaIndiceVisualReal: number[] } {
  // Monta lista de (indiceReal, lancamento) para preservar o índice original
  let pares: Array<{ indice: number; lancamento: Lancamento }> = lancamentos.map(
    (l, i) => ({ indice: i, lancamento: l }),
  )

  if (filtroFontes.length > 0) {
    pares = pares.filter(({ lancamento: l }) => filtroFontes.includes(l.fonte))
  }

  if (filtroNaturezas.length > 0) {
    pares = pares.filter(({ lancamento: l }) => filtroNaturezas.includes(l.natureza))
  }

  if (filtroSoIncompletos) {
    pares = pares.filter(
      ({ lancamento: l }) => !l.natureza || !l.iniciais,
    )
  }

  if (ordenacaoColuna !== null) {
    const col = ordenacaoColuna
    const fator = ordenacaoDirecao === 'asc' ? 1 : -1
    pares = [...pares].sort((a, b) => {
      const va = a.lancamento[col]
      const vb = b.lancamento[col]
      if (typeof va === 'number' && typeof vb === 'number') {
        return (va - vb) * fator
      }
      const sa = String(va ?? '')
      const sb = String(vb ?? '')
      return sa.localeCompare(sb, 'pt-BR') * fator
    })
  }

  return {
    lancamentosVisiveis: pares.map((p) => p.lancamento),
    mapaIndiceVisualReal: pares.map((p) => p.indice),
  }
}

// ---------------------------------------------------------------------------
// Estado inicial
// ---------------------------------------------------------------------------

const estadoInicial: EstadoApp = {
  lancamentos: [],
  iniciais: '',
  nomeUsuario: '',
  naturezasValidas: [],
  dicEntries: [],
  avisos: [],
  historico: [],
  futuro: [],
  csvArquivo: null,
  sujo: false,
  filtroFontes: [],
  filtroNaturezas: [],
  filtroSoIncompletos: false,
  ordenacaoColuna: null,
  ordenacaoDirecao: 'asc',
  lancamentosVisiveis: [],
  mapaIndiceVisualReal: [],
}

// ---------------------------------------------------------------------------
// Helper — extrai apenas os campos de EstadoApp do store completo
// ---------------------------------------------------------------------------

function extrairEstado(store: AppStore): EstadoApp {
  return {
    lancamentos: store.lancamentos,
    iniciais: store.iniciais,
    nomeUsuario: store.nomeUsuario,
    naturezasValidas: store.naturezasValidas,
    dicEntries: store.dicEntries,
    avisos: store.avisos,
    historico: store.historico,
    futuro: store.futuro,
    csvArquivo: store.csvArquivo,
    sujo: store.sujo,
    filtroFontes: store.filtroFontes,
    filtroNaturezas: store.filtroNaturezas,
    filtroSoIncompletos: store.filtroSoIncompletos,
    ordenacaoColuna: store.ordenacaoColuna,
    ordenacaoDirecao: store.ordenacaoDirecao,
    lancamentosVisiveis: store.lancamentosVisiveis,
    mapaIndiceVisualReal: store.mapaIndiceVisualReal,
  }
}


// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * Store central de UI do app — Zustand com Immer para undo por patches (D3 do ADR).
 *
 * Mutações rastreadas: `editarCelula`, `excluirLinha`, `moverLinha`, `aplicarSplit`
 * empilham `inversePatches` em `historico`; `undo` os aplica via `applyPatches`.
 *
 * Setters simples (`setLancamentos`, `setIniciais`, `setNomeUsuario`, `setCSV`,
 * `setDic`, `addAviso`, `clearAvisos`) não rastreiam undo — são chamados no
 * carregamento/setup, não durante a edição interativa.
 */
export const useAppStore = create<AppStore>()((set, get) => {
  /**
   * Aplica uma mutação com rastreamento de patches para undo.
   *
   * Usa `produceWithPatches` do Immer sobre o `EstadoMutavel` (sem `historico`)
   * e empilha os `inversePatches` resultantes no `historico` do store.
   */
  function mutarComHistorico(recipe: (draft: EstadoMutavel) => void): void {
    // `sujo`, filtros, ordenação e seletores derivados são excluídos do estadoMutavel
    // para que patches não os restaurem no undo/redo (D6, D9 do ADR).
    const {
      historico,
      futuro: _futuro,
      sujo: _sujo,
      filtroFontes: _ff,
      filtroNaturezas: _fn,
      filtroSoIncompletos: _fsi,
      ordenacaoColuna: _oc,
      ordenacaoDirecao: _od,
      lancamentosVisiveis: _lv,
      mapaIndiceVisualReal: _miv,
      ...estadoMutavel
    } = extrairEstado(get())
    const [novoEstado, diretas, inversas] = produceWithPatches(
      estadoMutavel as EstadoMutavel,
      recipe,
    )
    // Após mutação, recalcula a visão derivada com base nos filtros atuais (imutáveis na mutação)
    const { filtroFontes, filtroNaturezas, filtroSoIncompletos, ordenacaoColuna, ordenacaoDirecao } = get()
    const visao = calcularVisao(
      novoEstado.lancamentos,
      filtroFontes,
      filtroNaturezas,
      filtroSoIncompletos,
      ordenacaoColuna,
      ordenacaoDirecao,
    )
    set({
      ...novoEstado,
      historico: [...historico, { diretas, inversas }],
      futuro: [],
      sujo: true,
      ...visao,
    })
  }

  return {
    // Estado inicial
    ...estadoInicial,

    // -------------------------------------------------------------------
    // Actions mutativas — rastreiam patches para undo
    // -------------------------------------------------------------------

    editarCelula: (indice, campo, valor) => {
      mutarComHistorico((draft) => {
        const l = draft.lancamentos[indice]
        if (!l) return
        if (campo === 'valor') {
          const num = typeof valor === 'number' ? valor : Number(valor)
          if (Number.isFinite(num)) l.valor = num
        } else {
          l[campo] = valor as string
        }
      })
    },

    excluirLinha: (indice) => {
      mutarComHistorico((draft) => {
        draft.lancamentos.splice(indice, 1)
      })
    },

    moverLinha: (indice, direcao) => {
      mutarComHistorico((draft) => {
        const lans = draft.lancamentos
        const alvo = direcao === 'cima' ? indice - 1 : indice + 1
        if (alvo < 0 || alvo >= lans.length) return
        const temp = lans[indice]
        lans[indice] = lans[alvo]
        lans[alvo] = temp
      })
    },

    aplicarSplit: (indice, alvos) => {
      mutarComHistorico((draft) => {
        const l = draft.lancamentos[indice]
        if (!l) return
        // `current(l)` materializa o lançamento fora do draft antes de passar para
        // `ratearSplit`, que espera um objeto plain — não um Proxy do Immer.
        const snapshot = current(l)
        const resultado = ratearSplit(snapshot, alvos)
        draft.lancamentos.splice(indice, 1, ...resultado)
      })
    },

    undo: () => {
      // `sujo` é preservado do estado corrente — undo não limpa o flag (D6 do ADR).
      const {
        historico,
        futuro,
        sujo: _sujo,
        filtroFontes,
        filtroNaturezas,
        filtroSoIncompletos,
        ordenacaoColuna,
        ordenacaoDirecao,
        lancamentosVisiveis: _lv,
        mapaIndiceVisualReal: _miv,
        ...estadoMutavel
      } = extrairEstado(get())
      if (historico.length === 0) return
      const entrada = historico[historico.length - 1]
      const estadoRestaurado = applyPatches(estadoMutavel as EstadoMutavel, entrada.inversas)
      const visao = calcularVisao(
        estadoRestaurado.lancamentos,
        filtroFontes,
        filtroNaturezas,
        filtroSoIncompletos,
        ordenacaoColuna,
        ordenacaoDirecao,
      )
      set({
        ...estadoRestaurado,
        historico: historico.slice(0, historico.length - 1),
        futuro: [...futuro, entrada],
        ...visao,
      })
    },

    redo: () => {
      // `sujo` é preservado do estado corrente — redo não altera o flag.
      const {
        historico,
        futuro,
        sujo: _sujo,
        filtroFontes,
        filtroNaturezas,
        filtroSoIncompletos,
        ordenacaoColuna,
        ordenacaoDirecao,
        lancamentosVisiveis: _lv,
        mapaIndiceVisualReal: _miv,
        ...estadoMutavel
      } = extrairEstado(get())
      if (futuro.length === 0) return
      const entrada = futuro[futuro.length - 1]
      const estadoRefeito = applyPatches(estadoMutavel as EstadoMutavel, entrada.diretas)
      const visao = calcularVisao(
        estadoRefeito.lancamentos,
        filtroFontes,
        filtroNaturezas,
        filtroSoIncompletos,
        ordenacaoColuna,
        ordenacaoDirecao,
      )
      set({
        ...estadoRefeito,
        historico: [...historico, entrada],
        futuro: futuro.slice(0, futuro.length - 1),
        ...visao,
      })
    },

    // -------------------------------------------------------------------
    // Setters simples — sem rastreamento de undo
    // -------------------------------------------------------------------

    // `setLancamentos` suja o estado quando o array é não-vazio e recalcula a visão.
    setLancamentos: (lancamentos) => {
      const s = get()
      const visao = calcularVisao(
        lancamentos,
        s.filtroFontes,
        s.filtroNaturezas,
        s.filtroSoIncompletos,
        s.ordenacaoColuna,
        s.ordenacaoDirecao,
      )
      set({ lancamentos, ...(lancamentos.length > 0 ? { sujo: true } : {}), ...visao })
    },
    setIniciais: (iniciais) => set({ iniciais }),
    setNomeUsuario: (nomeUsuario) => set({ nomeUsuario }),
    setCSV: (arquivo) => set({ csvArquivo: arquivo }),
    setDic: (entries) => set({ dicEntries: entries }),
    addAviso: (aviso) => set((state) => ({ avisos: [...state.avisos, aviso] })),
    clearAvisos: () => set({ avisos: [] }),
    marcarLimpo: () => set({ sujo: false }),

    // -----------------------------------------------------------------------
    // Actions de filtro/ordenação — não entram no histórico (D9)
    // -----------------------------------------------------------------------

    setFiltroFontes: (fontes) => {
      const s = get()
      const visao = calcularVisao(s.lancamentos, fontes, s.filtroNaturezas, s.filtroSoIncompletos, s.ordenacaoColuna, s.ordenacaoDirecao)
      set({ filtroFontes: fontes, ...visao })
    },

    setFiltroNaturezas: (naturezas) => {
      const s = get()
      const visao = calcularVisao(s.lancamentos, s.filtroFontes, naturezas, s.filtroSoIncompletos, s.ordenacaoColuna, s.ordenacaoDirecao)
      set({ filtroNaturezas: naturezas, ...visao })
    },

    setFiltroSoIncompletos: (ativo) => {
      const s = get()
      const visao = calcularVisao(s.lancamentos, s.filtroFontes, s.filtroNaturezas, ativo, s.ordenacaoColuna, s.ordenacaoDirecao)
      set({ filtroSoIncompletos: ativo, ...visao })
    },

    setOrdenacao: (coluna, direcao) => {
      const s = get()
      const visao = calcularVisao(s.lancamentos, s.filtroFontes, s.filtroNaturezas, s.filtroSoIncompletos, coluna, direcao)
      set({ ordenacaoColuna: coluna, ordenacaoDirecao: direcao, ...visao })
    },

    ciclarOrdenacao: (coluna) => {
      const s = get()
      // Ciclo por coluna: outra coluna → asc; mesma coluna asc → desc; desc → remove.
      let novaColuna: ColunaOrdenavel | null = coluna
      let novaDirecao: DirecaoOrdenacao = 'asc'
      if (s.ordenacaoColuna === coluna) {
        if (s.ordenacaoDirecao === 'asc') {
          novaDirecao = 'desc'
        } else {
          novaColuna = null
        }
      }
      const visao = calcularVisao(s.lancamentos, s.filtroFontes, s.filtroNaturezas, s.filtroSoIncompletos, novaColuna, novaDirecao)
      set({ ordenacaoColuna: novaColuna, ordenacaoDirecao: novaDirecao, ...visao })
    },

    limparFiltros: () => {
      const s = get()
      const visao = calcularVisao(s.lancamentos, [], [], false, null, 'asc')
      set({
        filtroFontes: [],
        filtroNaturezas: [],
        filtroSoIncompletos: false,
        ordenacaoColuna: null,
        ordenacaoDirecao: 'asc',
        ...visao,
      })
    },

    // -----------------------------------------------------------------------
    // preencherIntervalo — D14 do ADR grid-ux-filtros
    // -----------------------------------------------------------------------

    preencherIntervalo: (startRow, endRow, colId, valor) => {
      // Colunas somente leitura são ignoradas silenciosamente (D14)
      if (COLUNAS_SOMENTE_LEITURA.has(colId)) return

      const mapa = get().mapaIndiceVisualReal
      // Filtra os índices visuais no intervalo [startRow, endRow]
      const indicesReais: number[] = []
      for (let visual = startRow; visual <= endRow; visual++) {
        const real = mapa[visual]
        if (real !== undefined) {
          indicesReais.push(real)
        }
      }
      if (indicesReais.length === 0) return

      // Aplica uma mutação por célula, cada uma com sua própria entrada de undo
      for (const indiceReal of indicesReais) {
        mutarComHistorico((draft) => {
          const l = draft.lancamentos[indiceReal]
          if (!l) return
          if (colId === 'valor') {
            const num = typeof valor === 'number' ? valor : Number(valor)
            if (Number.isFinite(num)) l.valor = num
          } else {
            ;(l as Record<string, unknown>)[colId] = valor
          }
        })
      }
    },
  }
})
