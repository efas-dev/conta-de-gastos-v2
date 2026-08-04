// ADR: see Docs/specs/avisos-acionaveis.adr.md
// ADR: see Docs/specs/inspecao-proposta-conciliacao.adr.md
// ADR: see spec/fundacao-operacoes.adr.md

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
  /**
   * Id do aviso atualmente em modo inspeção, ou `null` quando nenhum está
   * ativo. No máximo 1 ativo por vez — entrar em inspeção de outro aviso
   * troca a ativa (D5/D14 do ADR `inspecao-proposta-conciliacao`).
   */
  avisoEmInspecao: string | null
}

/** Ações do slice de avisos acionáveis. */
export interface AcoesAvisosSlice {
  /** Adiciona avisos ao fim da lista existente (append, nunca substitui). */
  adicionarAvisos: (novos: Aviso[]) => void
  /**
   * Aplica uma proposta pendente: interpreta `aviso.mutacaoProposta` de forma
   * genérica (Decisão 1 do ADR `fundacao-operacoes`) e remove de `lancamentos`
   * os itens cujo `id` está no alvo da mutação, marcando o aviso como
   * `'aplicado'`. Avisos legados sem `mutacaoProposta` ainda são suportados
   * via ponte de compatibilidade (ver `resolverAlvoParaRemocao`). Sem efeito em avisos
   * informativos, avisos inexistentes ou avisos que já não estão `'pendente'`
   * (idempotente).
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
  /**
   * Entra em modo inspeção do aviso `id`. No máximo 1 ativo por vez — chamar
   * de novo com outro id troca a inspeção ativa, nunca acumula duas.
   */
  entrarInspecao: (id: string) => void
  /** Sai do modo inspeção, independentemente de qual aviso estava ativo. */
  sairInspecao: () => void
  /**
   * Reconcilia avisos `'pendente'` cujos alvos (por `Lancamento.id`, via
   * `mutacaoProposta.alvo`) deixaram de existir em `lancamentosAtuais`, transicionando-os
   * para `'obsoleto'` (ver ADR `fundacao-operacoes`, Decisão 7). Basta que UM dos ids-alvo
   * esteja ausente para o aviso inteiro virar obsoleto — nunca aplicável pela metade.
   * Só afeta avisos `'pendente'` com `mutacaoProposta` (caminho definitivo, T03); avisos
   * já `'aplicado'`/`'dispensado'` e avisos legados sem `mutacaoProposta` não são tocados.
   * Idempotente. O gatilho real (chamar isto após uma exclusão manual de linha na grid)
   * é responsabilidade de quem manipula `lancamentos` (ex.: `excluirLinha` no
   * `appStore.ts`) — fora do escopo desta ação, que só materializa a transição.
   */
  reconciliarObsoletos: (lancamentosAtuais: Lancamento[]) => void
  /**
   * Zera `avisos`, `removidos` e `avisoEmInspecao` por inteiro (Decisão 8 do ADR
   * `fundacao-operacoes`, T09): cada chamada de "produzir" limpa o estado de avisos do zero,
   * incluindo decisões já tomadas (`'aplicado'`/`'dispensado'`) — previsibilidade sobre
   * memória, decisão humana explícita que contrariou a recomendação do agente na captura.
   * `removidos` some junto porque um registro de remoção só faz sentido enquanto o aviso
   * que o originou ainda existir para ser desfeito; `avisoEmInspecao` volta a `null` para
   * não deixar uma inspeção pendurada num aviso que não existe mais. Idempotente.
   */
  limparAvisos: () => void
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
  avisoEmInspecao: null,
}

/**
 * Seletor de contagem de propostas pendentes (`tipo==='proposta' &&
 * estado==='pendente'`), usado para alimentar o badge do sheet de avisos
 * (D15 do ADR `inspecao-proposta-conciliacao`).
 */
export function selecionarContagemPendentes(state: StoreComAvisos): number {
  return state.avisosAcionaveis.avisos.filter(
    (a) => a.tipo === 'proposta' && a.estado === 'pendente',
  ).length
}

/**
 * Resolve os `Lancamento`s-alvo de `aviso` para remoção, de forma genérica —
 * sem `switch` por `origem`/detector (Decisão 1 do ADR `fundacao-operacoes`).
 *
 * Caminho definitivo: quando `aviso.mutacaoProposta` está presente, o
 * casamento é estritamente por `Lancamento.id` — `mutacaoProposta.alvo` já
 * carrega ids reais (`Mutacao`, `src/types.ts`).
 *
 * Ponte de compatibilidade transitória: avisos legados — produzidos pelos
 * detectores que ainda não migraram para o registry (T06/T07/T07-bis) — não
 * populam `mutacaoProposta` e carregam `alvo` como índice posicional textual.
 * Esses detectores nunca tiveram acesso a um id real no momento da detecção,
 * então a ponte resolve diretamente à referência do `Lancamento` que ocupa
 * aquela posição em `lancamentos` no momento da aplicação — sem depender de
 * `Lancamento.id` estar definido (alguns fixtures de teste anteriores a esta
 * task constroem `Lancamento` fora dos parsers e não atribuem `id`; ver
 * iteração-log, Task T03, "Debugging gate"). A remoção em `aplicar` casa por
 * referência de objeto contra o resultado desta função — nunca por índice.
 * Esta ponte é temporária: some quando os detectores restantes migrarem.
 */
function resolverAlvoParaRemocao(aviso: Aviso, lancamentos: Lancamento[]): Lancamento[] {
  if (aviso.mutacaoProposta) {
    const idsAlvo = new Set(aviso.mutacaoProposta.alvo)
    return lancamentos.filter((lancamento) => idsAlvo.has(lancamento.id))
  }

  return aviso.alvo
    .map((indicePosicional) => lancamentos[Number(indicePosicional)])
    .filter((lancamento): lancamento is Lancamento => lancamento !== undefined)
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

      const alvos = new Set(resolverAlvoParaRemocao(aviso, state.lancamentos))
      const removidosDoAviso: LancamentoRemovido[] = []
      const lancamentosRestantes = state.lancamentos.filter((lancamento, indice) => {
        if (alvos.has(lancamento)) {
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
          avisoEmInspecao: encerrarInspecaoSeForAviso(state.avisosAcionaveis, id),
        },
      } as Partial<TStore>)
    },

    desfazer: (id) => {
      const state = get()
      const { avisos, removidos } = state.avisosAcionaveis
      const aviso = avisos.find((a) => a.id === id)
      if (!aviso) {
        return
      }

      if (aviso.estado === 'aplicado') {
        const removidosDoAviso = removidos[id] ?? []
        const lancamentosRestaurados = [...state.lancamentos]
        for (const { indice, lancamento } of [...removidosDoAviso].sort(
          (a, b) => a.indice - b.indice,
        )) {
          lancamentosRestaurados.splice(indice, 0, lancamento)
        }

        const { [id]: _removidoDoAviso, ...removidosSemAviso } = removidos

        set({
          lancamentos: lancamentosRestaurados,
          avisosAcionaveis: {
            avisos: avisos.map((a) => (a.id === id ? { ...a, estado: 'pendente' as const } : a)),
            removidos: removidosSemAviso,
            avisoEmInspecao: encerrarInspecaoSeForAviso(state.avisosAcionaveis, id),
          },
        } as Partial<TStore>)
        return
      }

      if (aviso.estado === 'dispensado') {
        // Transição pura de estado (D14 do ADR `inspecao-proposta-conciliacao`):
        // `dispensar` nunca alterou `lancamentos`, então desfazê-la também não deve.
        set({
          avisosAcionaveis: {
            ...state.avisosAcionaveis,
            avisos: avisos.map((a) => (a.id === id ? { ...a, estado: 'pendente' as const } : a)),
            avisoEmInspecao: encerrarInspecaoSeForAviso(state.avisosAcionaveis, id),
          },
        } as Partial<TStore>)
      }
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
          avisoEmInspecao: encerrarInspecaoSeForAviso(state.avisosAcionaveis, id),
        },
      } as Partial<TStore>)
    },

    entrarInspecao: (id) => {
      set((state) => ({
        avisosAcionaveis: { ...state.avisosAcionaveis, avisoEmInspecao: id },
      }) as Partial<TStore>)
    },

    sairInspecao: () => {
      set((state) => ({
        avisosAcionaveis: { ...state.avisosAcionaveis, avisoEmInspecao: null },
      }) as Partial<TStore>)
    },

    reconciliarObsoletos: (lancamentosAtuais) => {
      const state = get()
      const { avisos } = state.avisosAcionaveis
      const idsAtuais = new Set(lancamentosAtuais.map((l) => l.id))

      set({
        avisosAcionaveis: {
          ...state.avisosAcionaveis,
          avisos: avisos.map((a) => {
            if (a.estado !== 'pendente' || !a.mutacaoProposta) {
              return a
            }
            const algumAlvoAusente = a.mutacaoProposta.alvo.some((id) => !idsAtuais.has(id))
            return algumAlvoAusente ? { ...a, estado: 'obsoleto' as const } : a
          }),
        },
      } as Partial<TStore>)
    },

    limparAvisos: () => {
      set({
        avisosAcionaveis: estadoInicialAvisos,
      } as Partial<TStore>)
    },
  }
}

/**
 * Retorna `null` quando `id` é o aviso atualmente em inspeção (encerrando-a),
 * ou o valor atual de `avisoEmInspecao` sem alteração caso contrário — usado
 * por `aplicar`/`dispensar`/`desfazer` para encerrar a inspeção só quando a
 * ação afeta o aviso ativo (D5/D14 do ADR `inspecao-proposta-conciliacao`).
 */
function encerrarInspecaoSeForAviso(estado: EstadoAvisosSlice, id: string): string | null {
  return estado.avisoEmInspecao === id ? null : estado.avisoEmInspecao
}
