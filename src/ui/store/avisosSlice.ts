// ADR: see Docs/specs/avisos-acionaveis.adr.md
// ADR: see Docs/specs/inspecao-proposta-conciliacao.adr.md
// ADR: see spec/fundacao-operacoes.adr.md

import type { Aviso, Lancamento } from '../../types'
import { atribuirIds } from '../../parsers/idSerial'

/**
 * Registro de um lançamento removido por `aplicar`, guardando uma âncora por
 * `id` — o `id` do lançamento que o precedia em `lancamentos` no momento da
 * remoção, ou `null` quando o removido era o primeiro — para que `desfazer`
 * consiga reinseri-lo na posição relativa correta (Task T13, ADR
 * `fundacao-operacoes`). Substitui o antigo `indice` posicional: um índice
 * numérico fica obsoleto assim que a lista muda de tamanho ou é reordenada
 * (ex.: drag-and-drop na grid) entre a remoção e o desfazer; a âncora por id
 * sobrevive a ambos porque aponta para uma identidade, não para uma posição.
 */
export interface LancamentoRemovido {
  ancoraId: number | null
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
  /** Lançamentos removidos por `aplicar` (verbo `'remover'`), indexados pelo id do aviso — usado por `desfazer`. */
  removidos: Record<string, LancamentoRemovido[]>
  /**
   * Ids seriais de nascimento atribuídos por `aplicar` (verbo `'adicionar'`, Task 3 do ADR
   * `vr-despesas`), indexados pelo id do aviso — usado por `desfazer` para saber exatamente
   * quais lançamentos remover. Estrutura irmã de `removidos` (mesmo padrão keyed-by-aviso-id),
   * não um terceiro mecanismo de estado: `removidos` guarda lançamentos completos com âncora de
   * reinserção (verbo `'remover'`); `adicionados` guarda só os ids recém-criados a apagar (verbo
   * `'adicionar'`) — os dois verbos precisam desfazer coisas estruturalmente diferentes.
   */
  adicionados: Record<string, number[]>
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
   * genérica por verbo (Decisão 1 do ADR `fundacao-operacoes`; verbo
   * `'adicionar'` estreado pela Decisão 1 do ADR `vr-despesas`, Task 3).
   * Verbo `'remover'` (ou aviso legado sem `mutacaoProposta`) remove de
   * `lancamentos` os itens cujo `id` está no alvo da mutação (ver
   * `resolverAlvoParaRemocao`). Verbo `'adicionar'` atribui ids seriais novos
   * (`atribuirIds`) aos `mutacaoProposta.lancamentos` e os insere ao final de
   * `lancamentos`, registrando os ids inseridos em `adicionados[id]` para que
   * `desfazer` saiba o que remover. Em ambos os casos o aviso é marcado
   * `'aplicado'`. Sem efeito em avisos informativos, avisos inexistentes ou
   * avisos que já não estão `'pendente'` (idempotente).
   */
  aplicar: (id: string) => void
  /**
   * Reverte um `aplicar`. Para o verbo `'remover'`: reinsere em `lancamentos`
   * os itens removidos, nas posições originais (via `removidos[id]`). Para o
   * verbo `'adicionar'` (Task 3, ADR `vr-despesas`): remove de `lancamentos`
   * exatamente os ids registrados em `adicionados[id]`. Em ambos os casos o
   * aviso volta ao estado `'pendente'`. Sem efeito em avisos que não estão
   * `'aplicado'` (idempotente).
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
   * Só afeta avisos `'pendente'` com `mutacaoProposta` de verbo `'remover'` (caminho
   * definitivo, T03); avisos já `'aplicado'`/`'dispensado'`, avisos legados sem
   * `mutacaoProposta` e avisos de verbo `'adicionar'` (Task 3, ADR `vr-despesas` — não
   * referenciam lançamentos existentes, então não há alvo a ficar obsoleto) não são
   * tocados. Idempotente. O gatilho real (chamar isto após uma exclusão manual de linha na grid)
   * é responsabilidade de quem manipula `lancamentos` (ex.: `excluirLinha` no
   * `appStore.ts`) — fora do escopo desta ação, que só materializa a transição.
   */
  reconciliarObsoletos: (lancamentosAtuais: Lancamento[]) => void
  /**
   * Zera `avisos`, `removidos`, `adicionados` e `avisoEmInspecao` por inteiro (Decisão 8 do
   * ADR `fundacao-operacoes`, T09): cada chamada de "produzir" limpa o estado de avisos do
   * zero, incluindo decisões já tomadas (`'aplicado'`/`'dispensado'`) — previsibilidade sobre
   * memória, decisão humana explícita que contrariou a recomendação do agente na captura.
   * `removidos`/`adicionados` somem junto porque um registro de remoção/inserção só faz
   * sentido enquanto o aviso que o originou ainda existir para ser desfeito; `avisoEmInspecao`
   * volta a `null` para não deixar uma inspeção pendurada num aviso que não existe mais.
   * Idempotente.
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
  adicionados: {},
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
 * Caminho definitivo: quando `aviso.mutacaoProposta` está presente com verbo
 * `'remover'`, o casamento é estritamente por `Lancamento.id` —
 * `mutacaoProposta.alvo` já carrega ids reais (`Mutacao`, `src/types.ts`).
 * Só é chamada para o verbo `'remover'` (ou avisos legados sem
 * `mutacaoProposta`) — o verbo `'adicionar'` (Task 3, ADR `vr-despesas`) tem
 * caminho próprio em `aplicar`, que nunca resolve alvos a remover.
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
  if (aviso.mutacaoProposta && aviso.mutacaoProposta.verbo === 'remover') {
    const idsAlvo = new Set(aviso.mutacaoProposta.alvo)
    return lancamentos.filter((lancamento) => idsAlvo.has(lancamento.id))
  }

  return aviso.alvo
    .map((indicePosicional) => lancamentos[Number(indicePosicional)])
    .filter((lancamento): lancamento is Lancamento => lancamento !== undefined)
}

/**
 * Reinsere os lançamentos removidos de volta em `base`, na posição relativa
 * original, usando a âncora por `id` de cada `LancamentoRemovido` (Task T13).
 *
 * Cada removido é reinserido logo após o lançamento cujo `id` é sua âncora
 * (`ancoraId`), ou no início quando `ancoraId` é `null`. Como uma remoção em
 * lote pode conter lançamentos adjacentes entre si (a âncora de um é outro
 * removido, não um lançamento que sobrou em `base`), o processamento é
 * iterativo: a cada volta, insere quem já tem âncora disponível em
 * `resultado`, o que libera a âncora do próximo da cadeia na volta seguinte.
 *
 * Busca a âncora pela ÚLTIMA ocorrência de `id` em `resultado` (não a
 * primeira). Para dados reais (`Lancamento.id` único, garantido por T01)
 * isso não faz diferença — há no máximo uma ocorrência. É o que torna o
 * comportamento correto também sob fixtures de teste degeneradas de outros
 * módulos fora desta task que constroem `Lancamento` sem atribuir `id`
 * (ficando `undefined` em runtime, ver iteração-log, Task T03, "Debugging
 * gate"): ao reinserir do fim da cadeia para o começo, a última ocorrência de
 * um `id` duplicado/indefinido em `resultado` é sempre o lançamento mais à
 * direita ainda presente — exatamente onde a inserção original ocorreria — o
 * que preserva a ordem correta sem exigir que os `id`s sejam distintos.
 */
function reinserirRemovidos(
  base: Lancamento[],
  removidosDoAviso: LancamentoRemovido[],
): Lancamento[] {
  let resultado = base
  const pendentes = [...removidosDoAviso]

  while (pendentes.length > 0) {
    const indiceProcessavel = pendentes.findIndex(
      (removido) =>
        removido.ancoraId === null || resultado.some((l) => l.id === removido.ancoraId),
    )

    if (indiceProcessavel === -1) {
      // Âncoras ausentes de `resultado` (ex.: o lançamento-âncora foi excluído
      // por fora deste ciclo aplicar/desfazer) — insere os remanescentes ao
      // final, preservando a ordem relativa entre si em vez de perder dados.
      resultado = [...resultado, ...pendentes.map((r) => r.lancamento)]
      break
    }

    const [removido] = pendentes.splice(indiceProcessavel, 1)
    if (removido.ancoraId === null) {
      resultado = [removido.lancamento, ...resultado]
      continue
    }

    const posicaoAncora = resultado.reduce(
      (ultimaOcorrencia, l, i) => (l.id === removido.ancoraId ? i : ultimaOcorrencia),
      -1,
    )
    resultado = [
      ...resultado.slice(0, posicaoAncora + 1),
      removido.lancamento,
      ...resultado.slice(posicaoAncora + 1),
    ]
  }

  return resultado
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
      const { avisos, removidos, adicionados } = state.avisosAcionaveis
      const aviso = avisos.find((a) => a.id === id)
      if (!aviso || aviso.tipo !== 'proposta' || aviso.estado !== 'pendente') {
        return
      }

      if (aviso.mutacaoProposta && aviso.mutacaoProposta.verbo === 'adicionar') {
        const novosLancamentos = atribuirIds(aviso.mutacaoProposta.lancamentos)

        set({
          lancamentos: [...state.lancamentos, ...novosLancamentos],
          avisosAcionaveis: {
            ...state.avisosAcionaveis,
            avisos: avisos.map((a) => (a.id === id ? { ...a, estado: 'aplicado' as const } : a)),
            adicionados: { ...adicionados, [id]: novosLancamentos.map((l) => l.id) },
            avisoEmInspecao: encerrarInspecaoSeForAviso(state.avisosAcionaveis, id),
          },
        } as Partial<TStore>)
        return
      }

      const alvos = new Set(resolverAlvoParaRemocao(aviso, state.lancamentos))
      const removidosDoAviso: LancamentoRemovido[] = []
      const lancamentosRestantes = state.lancamentos.filter((lancamento, indice) => {
        if (alvos.has(lancamento)) {
          const anterior = indice > 0 ? state.lancamentos[indice - 1] : undefined
          const ancoraId = anterior !== undefined ? anterior.id : null
          removidosDoAviso.push({ ancoraId, lancamento })
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
      const { avisos, removidos, adicionados } = state.avisosAcionaveis
      const aviso = avisos.find((a) => a.id === id)
      if (!aviso) {
        return
      }

      if (aviso.estado === 'aplicado' && aviso.mutacaoProposta?.verbo === 'adicionar') {
        const idsAdicionados = new Set(adicionados[id] ?? [])
        const lancamentosRestantes = state.lancamentos.filter(
          (lancamento) => !idsAdicionados.has(lancamento.id),
        )
        const { [id]: _adicionadoDoAviso, ...adicionadosSemAviso } = adicionados

        set({
          lancamentos: lancamentosRestantes,
          avisosAcionaveis: {
            ...state.avisosAcionaveis,
            avisos: avisos.map((a) => (a.id === id ? { ...a, estado: 'pendente' as const } : a)),
            adicionados: adicionadosSemAviso,
            avisoEmInspecao: encerrarInspecaoSeForAviso(state.avisosAcionaveis, id),
          },
        } as Partial<TStore>)
        return
      }

      if (aviso.estado === 'aplicado') {
        const removidosDoAviso = removidos[id] ?? []
        const lancamentosRestaurados = reinserirRemovidos(state.lancamentos, removidosDoAviso)

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
            if (a.estado !== 'pendente' || !a.mutacaoProposta || a.mutacaoProposta.verbo !== 'remover') {
              return a
            }
            const algumAlvoAusente = a.mutacaoProposta.alvo.some((id: number) => !idsAtuais.has(id))
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
