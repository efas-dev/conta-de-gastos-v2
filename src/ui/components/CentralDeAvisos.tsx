// ADR: see Docs/specs/avisos-acionaveis.adr.md
// ADR: see Docs/specs/inspecao-proposta-conciliacao.adr.md
// ADR: see Docs/specs/redesign-frontend-claude-design.adr.md

import { useAppStore } from '../store/appStore'
import type { Aviso } from '../../types'

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
export function CentralDeAvisos() {
  const avisos = useAppStore((s) => s.avisosAcionaveis.avisos)
  const aplicar = useAppStore((s) => s.aplicar)
  const desfazer = useAppStore((s) => s.desfazer)
  const dispensar = useAppStore((s) => s.dispensar)
  const avisoEmInspecao = useAppStore((s) => s.avisosAcionaveis.avisoEmInspecao)
  const entrarInspecao = useAppStore((s) => s.entrarInspecao)
  const sairInspecao = useAppStore((s) => s.sairInspecao)

  if (avisos.length === 0) return null

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
              />
            ))}
          </ul>
        </section>
      )}

      {informativos.length > 0 && (
        <section aria-label="Avisos informativos">
          <div className="painel-secao">Informativos</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {informativos.map((aviso) => (
              <li key={aviso.id} className="card-aviso">
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span className="icone-aviso info" />
                  <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>{aviso.mensagem}</div>
                </div>
                <div style={{ display: 'flex', marginTop: 8 }}>
                  <button type="button" className="btn sec mini" onClick={() => dispensar(aviso.id)}>
                    Dispensar
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
}

/**
 * Card de uma proposta — mensagem + ações que variam conforme `aviso.estado`, mais o modo
 * inspeção (D5): clicar no corpo do card alterna `entrarInspecao`/`sairInspecao`; os botões de
 * ação usam `stopPropagation` para não disparar o toggle acidentalmente. Em inspeção, mostra os
 * papéis "sai"/"fica" (D2: `alvo`/`permanece`) e o `resumo` da regra quando presente.
 */
function CartaoProposta({
  aviso,
  aplicar,
  desfazer,
  dispensar,
  emInspecao,
  entrarInspecao,
  sairInspecao,
}: CartaoPropostaProps) {
  return (
    <li
      onClick={() => (emInspecao ? sairInspecao() : entrarInspecao(aviso.id))}
      className={'card-aviso' + (emInspecao ? ' inspecionando' : '') + (aviso.estado !== 'pendente' ? ' resolvido' : '')}
      style={{ cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span className="icone-aviso proposta" />
        <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>{aviso.mensagem}</div>
      </div>

      {emInspecao && (
        <div className="legenda-insp" aria-label="Papéis da proposta">
          <span aria-label="Papel: sai">
            Sai{aviso.alvo.length > 0 ? ` — ${aviso.alvo.length} lançamento(s)` : ''}
          </span>
          {aviso.origem === 'conciliacao' && (
            <span aria-label="Papel: fica">Fica — {aviso.permanece.length} lançamento(s)</span>
          )}
          {aviso.resumo && <p aria-label="Resumo da regra" style={{ margin: 0 }}>{aviso.resumo}</p>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
        <AcoesProposta aviso={aviso} aplicar={aplicar} desfazer={desfazer} dispensar={dispensar} />
      </div>
    </li>
  )
}

/** Botões de ação de uma proposta — variam conforme `aviso.estado`. */
function AcoesProposta({ aviso, aplicar, desfazer, dispensar }: AcoesPropostaProps) {
  if (aviso.estado === 'pendente') {
    return (
      <>
        <button
          type="button"
          className="btn sec mini"
          onClick={(e) => {
            e.stopPropagation()
            aplicar(aviso.id)
          }}
        >
          Aprovar
        </button>
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
      </>
    )
  }

  // 'aplicado' e 'dispensado' — ambos reversíveis via "Desfazer" (D14).
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
        Desfazer
      </button>
    )
  }

  return null
}
