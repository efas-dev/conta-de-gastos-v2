// ADR: see Docs/specs/grid-revisao.adr.md

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
// Campos editáveis na grid (D7 do ADR)
// ---------------------------------------------------------------------------

/**
 * Campos de Lancamento que o usuário pode editar na grid.
 * Fonte, Data e Transcrição são somente leitura (D7 do ADR).
 */
export type CampoEditavel = 'iniciais' | 'natureza' | 'descricao' | 'valor'

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
   * Pilha de patches inversos do Immer para o undo.
   * Cada elemento é o array de `inversePatches` produzido por uma única mutação.
   * A última posição representa a mutação mais recente.
   */
  historico: Patch[][]
  /** Arquivo CSV selecionado pelo usuário (null = nenhum). */
  csvArquivo: File | null
}

/**
 * Sub-estado que pode ser mutado via `produceWithPatches`.
 * Exclui `historico` porque ele é gerenciado fora do ciclo de patches.
 */
type EstadoMutavel = Omit<EstadoApp, 'historico'>

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
   * Remove a entrada do topo do `historico`.
   * Sem efeito se o histórico estiver vazio.
   */
  undo: () => void

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
}

/** Tipo completo do store — estado + actions. */
export type AppStore = EstadoApp & AcoesApp

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
  csvArquivo: null,
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
    csvArquivo: store.csvArquivo,
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
    const { historico, ...estadoMutavel } = extrairEstado(get())
    const [novoEstado, , inversePatches] = produceWithPatches(
      estadoMutavel as EstadoMutavel,
      recipe,
    )
    set({ ...novoEstado, historico: [...historico, inversePatches] })
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
      const { historico, ...estadoMutavel } = extrairEstado(get())
      if (historico.length === 0) return
      const inversePatches = historico[historico.length - 1]
      const novoHistorico = historico.slice(0, historico.length - 1)
      const estadoRestaurado = applyPatches(estadoMutavel as EstadoMutavel, inversePatches)
      set({ ...estadoRestaurado, historico: novoHistorico })
    },

    // -------------------------------------------------------------------
    // Setters simples — sem rastreamento de undo
    // -------------------------------------------------------------------

    setLancamentos: (lancamentos) => set({ lancamentos }),
    setIniciais: (iniciais) => set({ iniciais }),
    setNomeUsuario: (nomeUsuario) => set({ nomeUsuario }),
    setCSV: (arquivo) => set({ csvArquivo: arquivo }),
    setDic: (entries) => set({ dicEntries: entries }),
    addAviso: (aviso) => set((state) => ({ avisos: [...state.avisos, aviso] })),
    clearAvisos: () => set({ avisos: [] }),
  }
})
