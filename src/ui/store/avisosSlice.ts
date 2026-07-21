// ADR: see Docs/specs/avisos-acionaveis.adr.md

import type { Aviso, Lancamento } from '../../types'

/**
 * Registro de um lançamento removido por `aplicar`, guardando sua posição
 * original em `lancamentos` para que `desfazer` consiga reinseri-lo no lugar.
 */
export interface LancamentoRemovido {
  indice: number
  lancamento: Lancamento
}

/**
 * Estado próprio do slice de avisos acionáveis (Decisão 5 do ADR
 * `avisos-acionaveis`). Vive inteiramente em memória — zero `localStorage`
 * (D0 do ADR, invariante de zero-retenção do projeto).
 *
 * Este é o contrato literal pedido pela Task 4 do spec: `avisos: Aviso[]`.
 * A integração ao `AppStore` (`appStore.ts`) expõe este objeto sob o
 * campo-namespace `avisosAcionaveis` para não colidir com o campo legado
 * `EstadoApp.avisos: string[]` (avisos de linha ignorada exibidos por
 * `AvisoList.tsx`) — ver `Docs/.harness/iteracao-log-spec-20260720-avisos-acionaveis.md`,
 * bloco "iteracao 2 — Task 4 — Plan".
 */
export interface EstadoAvisosSlice {
  avisos: Aviso[]
  /** Lançamentos removidos por `aplicar`, indexados pelo id do aviso — usado por `desfazer`. */
  removidos: Record<string, LancamentoRemovido[]>
}

/** Ações do slice de avisos acionáveis. */
export interface AcoesAvisosSlice {
  /** Adiciona avisos ao fim da lista existente (append, nunca substitui). */
  adicionarAvisos: (novos: Aviso[]) => void
  /**
   * Aplica uma proposta pendente: remove de `lancamentos` os itens cujo
   * índice posicional está em `aviso.alvo` e marca o aviso como `'aplicado'`.
   * Sem efeito em avisos informativos, avisos inexistentes ou avisos que já
   * não estão `'pendente'` (idempotente).
   */
  aplicar: (id: string) => void
  /**
   * Reverte um `aplicar`: reinsere em `lancamentos` os itens removidos, nas
   * posições originais, e volta o aviso ao estado `'pendente'`.
   * Sem efeito em avisos que não estão `'aplicado'` (idempotente).
   */
  desfazer: (id: string) => void
  /**
   * Marca uma proposta pendente como `'dispensado'`, sem alterar `lancamentos`.
   * Sem efeito em avisos que não estão `'pendente'`.
   */
  dispensar: (id: string) => void
}

/** Estado mínimo do store completo do qual o slice de avisos depende. */
export interface StoreComAvisos {
  lancamentos: Lancamento[]
  avisosAcionaveis: EstadoAvisosSlice
}

/** Estado inicial do slice — sem avisos, sem remoções pendentes. */
export const estadoInicialAvisos: EstadoAvisosSlice = {
  avisos: [],
  removidos: {},
}

/**
 * Cria as ações do slice de avisos acionáveis, ligadas a um `set`/`get` de
 * um store Zustand que contenha ao menos `lancamentos` e `avisosAcionaveis`
 * (`StoreComAvisos`). Genérico sobre o tipo do store completo para evitar
 * import circular com `appStore.ts` (que integra este slice).
 */
export function criarAvisosSlice<TStore extends StoreComAvisos>(
  set: (partial: Partial<TStore> | ((state: TStore) => Partial<TStore>)) => void,
  get: () => TStore,
): AcoesAvisosSlice {
  return {
    adicionarAvisos: (novos) => {
      set((state) => ({
        avisosAcionaveis: {
          ...state.avisosAcionaveis,
          avisos: [...state.avisosAcionaveis.avisos, ...novos],
        },
      }) as Partial<TStore>)
    },

    aplicar: (id) => {
      const state = get()
      const { avisos, removidos } = state.avisosAcionaveis
      const aviso = avisos.find((a) => a.id === id)
      if (!aviso || aviso.tipo !== 'proposta' || aviso.estado !== 'pendente') {
        return
      }

      const alvoSet = new Set(aviso.alvo)
      const removidosDoAviso: LancamentoRemovido[] = []
      const lancamentosRestantes = state.lancamentos.filter((lancamento, indice) => {
        if (alvoSet.has(String(indice))) {
          removidosDoAviso.push({ indice, lancamento })
          return false
        }
        return true
      })

      set({
        lancamentos: lancamentosRestantes,
        avisosAcionaveis: {
          avisos: avisos.map((a) => (a.id === id ? { ...a, estado: 'aplicado' as const } : a)),
          removidos: { ...removidos, [id]: removidosDoAviso },
        },
      } as Partial<TStore>)
    },

    desfazer: (id) => {
      const state = get()
      const { avisos, removidos } = state.avisosAcionaveis
      const aviso = avisos.find((a) => a.id === id)
      if (!aviso || aviso.estado !== 'aplicado') {
        return
      }

      const removidosDoAviso = removidos[id] ?? []
      const lancamentosRestaurados = [...state.lancamentos]
      for (const { indice, lancamento } of [...removidosDoAviso].sort((a, b) => a.indice - b.indice)) {
        lancamentosRestaurados.splice(indice, 0, lancamento)
      }

      const { [id]: _removidoDoAviso, ...removidosSemAviso } = removidos

      set({
        lancamentos: lancamentosRestaurados,
        avisosAcionaveis: {
          avisos: avisos.map((a) => (a.id === id ? { ...a, estado: 'pendente' as const } : a)),
          removidos: removidosSemAviso,
        },
      } as Partial<TStore>)
    },

    dispensar: (id) => {
      const state = get()
      const { avisos } = state.avisosAcionaveis
      const aviso = avisos.find((a) => a.id === id)
      if (!aviso || aviso.estado !== 'pendente') {
        return
      }

      set({
        avisosAcionaveis: {
          ...state.avisosAcionaveis,
          avisos: avisos.map((a) => (a.id === id ? { ...a, estado: 'dispensado' as const } : a)),
        },
      } as Partial<TStore>)
    },
  }
}
