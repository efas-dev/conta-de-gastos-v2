// ADR: see Docs/specs/avisos-acionaveis.adr.md
// ADR: see Docs/specs/inspecao-proposta-conciliacao.adr.md
// ADR: see Docs/specs/redesign-frontend-claude-design.adr.md
// ADR: see Docs/specs/vr-despesas.adr.md
// ADR: see Docs/specs/rendimentos.adr.md
// ADR: see Docs/specs/patches-ui-ux.adr.md

import { useState, type KeyboardEvent } from 'react'
import { useAppStore } from '../store/appStore'
import type { Aviso } from '../../types'
import { defaultMes } from '../../dominio/mes'
import { FormVR } from './FormVR'
import { FormRendimentos } from './FormRendimentos'

/**
 * Conteúdo da aba "Avisos" do `PainelLateral` — Task T5.
 *
 * Lê `avisosAcionaveis.avisos` do store e expõe ações (`aplicar`/`desfazer`/
 * `dispensar`) por proposta (D4 do ADR `avisos-acionaveis`: a UI só lê o
 * slice e dispara ações; nunca importa as funções de detecção
 * `detectarValorPendente`/`detectarConciliacao` — essas rodam em
 * `PipelineState.produzirLancamentos`, Decisão 5 do ADR).
 *
 * Deixou de ser um sheet colapsável com toggle/overlay próprio (esse botão
 * "vazava" para a barra de ações — D12 do ADR `inspecao-proposta-conciliacao`,
 * revertido nesta task): quem decide exibir este conteúdo agora é o
 * `PainelLateral`, via aba ativa. O badge de contagem de propostas pendentes
 * (D15) também migrou para lá — fica na aba, não no corpo.
 *
 * Rótulos "Aprovar"/"Dispensar" na UI, sem renomear as actions internas do
 * slice (D13); "Desfazer" fica visível tanto para `estado==='aplicado'`
 * quanto para `estado==='dispensado'` (D14).
 *
 * Convive com o canal legado `EstadoApp.avisos: string[]`, exibido por
 * `AvisoList.tsx` em `App.tsx` — módulos distintos, sem migração cruzada
 * (aviso de escopo da Task 6, spec `avisos-acionaveis`).
 *
 * Retorna `null` quando não há avisos (mesmo padrão de `AvisoList.tsx` e
 * `PainelNaturezas.tsx` — nada montado sem conteúdo).
 */
export interface CentralDeAvisosProps {
  /**
   * Mês de referência real (`YYYY-MM`), encadeado de `TelaRevisao` (`mesEscolhido`) via
   * `PainelLateral` (Task 7-bis) — usado por `FormVR` para a data automática dos lançamentos
   * (D4 do ADR `vr-despesas`). Opcional por compatibilidade retroativa: quando ausente (todo
   * consumidor que ainda não repassa a prop), cai para `defaultMes()`, o stand-in usado antes
   * desta task.
   */
  mesRef?: string
}

export function CentralDeAvisos({ mesRef }: CentralDeAvisosProps = {}) {
  const avisos = useAppStore((s) => s.avisosAcionaveis.avisos)
  const aplicar = useAppStore((s) => s.aplicar)
  const desfazer = useAppStore((s) => s.desfazer)
  const dispensar = useAppStore((s) => s.dispensar)
  const avisoEmInspecao = useAppStore((s) => s.avisosAcionaveis.avisoEmInspecao)
  const entrarInspecao = useAppStore((s) => s.entrarInspecao)
  const sairInspecao = useAppStore((s) => s.sairInspecao)
  const focarInspecao = useAppStore((s) => s.focarInspecao)

  // Estado local do painel — `formVRAberto` (Task 7): abre/fecha o `FormVR` no clique do card do
  // aviso `origem==='vr'`. Deliberadamente NÃO vai para o store (invariante "etapa da jornada é
  // derivada", `Docs/ARCHITECTURE.md`) — é puramente visual, sem significado fora desta sessão de
  // painel.
  const [formVRAberto, setFormVRAberto] = useState(false)

  // Estado local do painel — `formRendimentosAberto` (Task 11): abre/fecha o `FormRendimentos` no
  // clique do card do aviso `origem==='rendimentos'`, mesmo padrão de `formVRAberto` acima. Também
  // não vai para o store — puramente visual, independente de `formVRAberto` porque os dois avisos
  // (`'rendimentos'` e `'vr'`) nunca são o mesmo card.
  const [formRendimentosAberto, setFormRendimentosAberto] = useState(false)

  // Mês de referência efetivo do FormVR/FormRendimentos (Task 7-bis, reusado pela Task 11): usa o
  // mês real quando o consumidor o repassa; sem ele, cai para `defaultMes()` — o stand-in que valia
  // antes da Task 7-bis.
  const mesRefEfetivo = mesRef ?? defaultMes()

  if (avisos.length === 0) {
    return (
      <div className="painel-vazio">
        <p style={{ margin: 0 }}>Nenhuma sugestão pendente no momento.</p>
        <p style={{ margin: 0 }}>Novas sugestões aparecem aqui conforme você importa ou revisa lançamentos.</p>
      </div>
    )
  }

  // Informativos dispensados saem da lista (T9, D18) — sem "Desfazer" para este tipo,
  // diferente das propostas (D14): dispensar um informativo é definitivo na sessão.
  const informativos = avisos.filter((a) => a.tipo === 'informativo' && a.estado !== 'dispensado')
  const propostas = avisos.filter((a) => a.tipo === 'proposta')

  return (
    <>
      {propostas.length > 0 && (
        <section aria-label="Propostas">
          <div className="painel-secao">Propostas</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {propostas.map((aviso) => (
              <CartaoProposta
                key={aviso.id}
                aviso={aviso}
                aplicar={aplicar}
                desfazer={desfazer}
                dispensar={dispensar}
                emInspecao={avisoEmInspecao === aviso.id}
                entrarInspecao={entrarInspecao}
                sairInspecao={sairInspecao}
                focarInspecao={focarInspecao}
                formVRAberto={formVRAberto}
                alternarFormVR={() => setFormVRAberto((atual) => !atual)}
                formRendimentosAberto={formRendimentosAberto}
                alternarFormRendimentos={() => setFormRendimentosAberto((atual) => !atual)}
                mesRef={mesRefEfetivo}
              />
            ))}
          </ul>
        </section>
      )}

      {informativos.length > 0 && (
        <section aria-label="Sugestões informativas">
          <div className="painel-secao">Informativos</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {informativos.map((aviso) => (
              <li key={aviso.id} className="card-aviso">
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span className="icone-aviso info" />
                  <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>{aviso.mensagem}</div>
                </div>
                <div className="acoes-aviso" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button type="button" className="btn sec mini" onClick={() => dispensar(aviso.id)}>
                    OK, entendi
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

interface AcoesPropostaProps {
  aviso: Aviso
  aplicar: (id: string) => void
  desfazer: (id: string) => void
  dispensar: (id: string) => void
}

interface CartaoPropostaProps extends AcoesPropostaProps {
  /** `true` quando este é o aviso atualmente em modo inspeção (D5, ADR `inspecao-proposta-conciliacao`). */
  emInspecao: boolean
  entrarInspecao: (id: string) => void
  sairInspecao: () => void
  /** Pede foco na linha-âncora sem sair da inspeção — botão "Ir para a linha" (item 39.1). */
  focarInspecao: () => void
  /**
   * `true` quando o `FormVR` está aberto neste painel — só tem efeito visual/de renderização para
   * o aviso `origem==='vr'` (Task 7, ADR `vr-despesas`). Estado local de `CentralDeAvisos`, não do
   * store (invariante "etapa da jornada é derivada").
   */
  formVRAberto: boolean
  /** Alterna `formVRAberto` — chamado no clique do card quando `aviso.origem === 'vr'`. */
  alternarFormVR: () => void
  /**
   * `true` quando o `FormRendimentos` está aberto neste painel — só tem efeito visual/de
   * renderização para o aviso `origem==='rendimentos'` (Task 11, ADR `rendimentos`). Estado local
   * de `CentralDeAvisos`, não do store (invariante "etapa da jornada é derivada").
   */
  formRendimentosAberto: boolean
  /** Alterna `formRendimentosAberto` — chamado no clique do card quando `aviso.origem === 'rendimentos'`. */
  alternarFormRendimentos: () => void
  /** Mês de referência efetivo (real, com fallback a `defaultMes()`) repassado ao `FormVR`/`FormRendimentos` (Task 7-bis/11). */
  mesRef: string
}

/**
 * Card de uma proposta — mensagem + ações que variam conforme `aviso.estado`, mais o modo
 * inspeção (D5): clicar no corpo do card alterna `entrarInspecao`/`sairInspecao`; os botões de
 * ação usam `stopPropagation` para não disparar o toggle acidentalmente. Em inspeção, mostra os
 * papéis "sai"/"fica" (D2: `alvo`/`permanece`) e o `resumo` da regra quando presente.
 *
 * Exceção: os avisos `origem==='vr'` (Task 7, ADR `vr-despesas`) e `origem==='rendimentos'` (Task
 * 11, ADR `rendimentos`) não participam do toggle de inspeção — clicar no corpo do card abre/fecha
 * o `FormVR`/`FormRendimentos` respectivamente (D5 do ADR `vr-despesas`: "clicar no aviso abre um
 * formulário", padrão reusado por `rendimentos`), usando o `mesRef` efetivo repassado por
 * `CentralDeAvisos` (Task 7-bis: mês real encadeado de `TelaRevisao`, com fallback a `defaultMes()`
 * só quando o consumidor não repassa a prop `mesRef` — ver `CentralDeAvisos`).
 */
function CartaoProposta({
  aviso,
  aplicar,
  desfazer,
  dispensar,
  emInspecao,
  entrarInspecao,
  sairInspecao,
  focarInspecao,
  formVRAberto,
  alternarFormVR,
  formRendimentosAberto,
  alternarFormRendimentos,
  mesRef,
}: CartaoPropostaProps) {
  const ehVR = aviso.origem === 'vr'
  const ehRendimentos = aviso.origem === 'rendimentos'
  const formVRVisivel = ehVR && formVRAberto
  const formRendimentosVisivel = ehRendimentos && formRendimentosAberto

  function aoClicarNoCard() {
    if (ehVR) {
      alternarFormVR()
      return
    }
    if (ehRendimentos) {
      alternarFormRendimentos()
      return
    }
    if (emInspecao) {
      sairInspecao()
      return
    }
    entrarInspecao(aviso.id)
  }

  // Teclado real (Task B3, patches-ui-ux): Enter e Espaço disparam a mesma ação do clique — o
  // card já é interativo (toggle de inspeção ou abre FormVR/FormRendimentos), só faltava o
  // suporte a teclado equivalente ao `onClick` existente. Guarda `e.target === e.currentTarget`
  // (paridade com o `stopPropagation` usado no `onClick` dos botões filhos, ver `AcoesProposta`
  // abaixo): sem ela, ativar um botão interno (ex.: "Aplicar") via teclado também dispararia a
  // ação do card, porque o evento `keydown` do botão faz bubbling até este `<li>` independente do
  // `stopPropagation` do `onClick` sintético do botão.
  function aoTeclarNoCard(e: KeyboardEvent<HTMLLIElement>) {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      aoClicarNoCard()
    }
  }

  return (
    <li
      onClick={aoClicarNoCard}
      onKeyDown={aoTeclarNoCard}
      role="button"
      tabIndex={0}
      aria-label={aviso.mensagem}
      className={
        'card-aviso' +
        (emInspecao ? ' inspecionando' : '') +
        (formVRVisivel || formRendimentosVisivel ? ' expandido' : '') +
        (aviso.estado !== 'pendente' ? ' resolvido' : '')
      }
      style={{ cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span className="icone-aviso proposta" />
        <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>{aviso.mensagem}</div>
      </div>

      {emInspecao && !ehVR && !ehRendimentos && (
        <div className="legenda-insp" aria-label="Papéis da proposta">
          <span aria-label="Papel: sai">
            Sai{aviso.alvo.length > 0 ? `: ${aviso.alvo.length} lançamento(s)` : ''}
          </span>
          {aviso.origem === 'conciliacao' && (
            <span aria-label="Papel: fica">Fica: {aviso.permanece.length} lançamento(s)</span>
          )}
          {aviso.resumo && <p aria-label="Resumo da regra" style={{ margin: 0 }}>{aviso.resumo}</p>}
          {/* O card é um toggle: re-clicá-lo SAI da inspeção. Depois de rolar a grid à mão não
              havia como voltar à linha sem perder o realce — daí o botão dedicado, que só pede
              foco (`stopPropagation` impede o toggle do card). Resíduo do item 39.1 do TODO. */}
          <button
            type="button"
            className="btn sec mini"
            onClick={(e) => {
              e.stopPropagation()
              focarInspecao()
            }}
          >
            Ir para a linha
          </button>
        </div>
      )}

      {formVRVisivel && (
        <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10 }}>
          <FormVR mesRef={mesRef} />
        </div>
      )}

      {formRendimentosVisivel && (
        <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10 }}>
          <FormRendimentos mesRef={mesRef} />
        </div>
      )}

      <div className="acoes-aviso" style={{ display: 'flex', justifyContent: 'flex-end', gap: 7, marginTop: 10 }}>
        <AcoesProposta aviso={aviso} aplicar={aplicar} desfazer={desfazer} dispensar={dispensar} />
      </div>
    </li>
  )
}

/** Botões de ação de uma proposta — variam conforme `aviso.estado`. */
function AcoesProposta({ aviso, aplicar, desfazer, dispensar }: AcoesPropostaProps) {
  if (aviso.estado === 'pendente') {
    // Avisos `origem==='vr'`/`'rendimentos'` (Task B3, patches-ui-ux): o botão afirmativo some
    // daqui — quem aplica a proposta é o botão "Aplicar" do próprio `FormVR`/`FormRendimentos`
    // (ver `CartaoProposta` acima), não este componente. "Dispensar" continua disponível.
    const afirmativoSuprimido = aviso.origem === 'vr' || aviso.origem === 'rendimentos'
    // Ordem visual: "Dispensar" à esquerda, "Aplicar" à direita — a ação afirmativa fica na ponta
    // direita da barra, junto ao canto onde o olhar termina a leitura do card.
    return (
      <>
        <button
          type="button"
          className="btn sec mini"
          onClick={(e) => {
            e.stopPropagation()
            dispensar(aviso.id)
          }}
        >
          Dispensar
        </button>
        {!afirmativoSuprimido && (
          <button
            type="button"
            className="btn pri mini"
            onClick={(e) => {
              e.stopPropagation()
              aplicar(aviso.id)
            }}
          >
            Aplicar
          </button>
        )}
      </>
    )
  }

  // 'aplicado' e 'dispensado' — ambos reversíveis via "Reverter" (D14).
  if (aviso.estado === 'aplicado' || aviso.estado === 'dispensado') {
    return (
      <button
        type="button"
        className="btn sec mini"
        onClick={(e) => {
          e.stopPropagation()
          desfazer(aviso.id)
        }}
      >
        Reverter
      </button>
    )
  }

  return null
}
