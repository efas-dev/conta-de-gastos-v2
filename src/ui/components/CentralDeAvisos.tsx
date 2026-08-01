// ADR: see Docs/specs/avisos-acionaveis.adr.md

import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import { selecionarContagemPendentes } from '../store/avisosSlice'
import type { Aviso } from '../../types'

/**
 * Central de avisos acionáveis — sheet lateral colapsável à direita (D12 do
 * ADR `inspecao-proposta-conciliacao`). Lê `avisosAcionaveis.avisos` do store
 * e expõe ações (`aplicar`/`desfazer`/`dispensar`) por proposta (D4 do ADR
 * `avisos-acionaveis`: a UI só lê o slice e dispara ações; nunca importa as
 * funções de detecção `detectarValorPendente`/`detectarConciliacao` — essas
 * rodam em `PipelineState.produzirLancamentos`, Decisão 5 do ADR).
 *
 * Colapsado por padrão; abre só por clique manual do usuário — um aviso novo
 * apenas incrementa o badge de contagem, nunca abre o sheet sozinho (D15).
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
  const contagemPendentes = useAppStore(selecionarContagemPendentes)
  const avisoEmInspecao = useAppStore((s) => s.avisosAcionaveis.avisoEmInspecao)
  const entrarInspecao = useAppStore((s) => s.entrarInspecao)
  const sairInspecao = useAppStore((s) => s.sairInspecao)

  const [aberto, setAberto] = useState(false)

  if (avisos.length === 0) return null

  // Informativos dispensados saem da lista (T9, D18) — sem "Desfazer" para este tipo,
  // diferente das propostas (D14): dispensar um informativo é definitivo na sessão.
  const informativos = avisos.filter((a) => a.tipo === 'informativo' && a.estado !== 'dispensado')
  const propostas = avisos.filter((a) => a.tipo === 'proposta')

  return (
    <>
      {/* Botão de toggle horizontal na barra de ações, ao lado da "Colinha" —
          mesmo padrão de `PainelNaturezas` (o pai insere <CentralDeAvisos /> na
          barra de ações; o Fragment "vaza" o botão para dentro do flex-row). */}
      <button
        type="button"
        aria-expanded={aberto}
        aria-label={aberto ? 'Fechar central de avisos' : 'Abrir central de avisos'}
        onClick={() => setAberto((v) => !v)}
        className="dc-btn dc-btn-secundario"
        style={{ fontSize: '13px', padding: '4px 12px', position: 'relative' }}
      >
        Avisos
        {contagemPendentes > 0 && (
          <span
            aria-label={`${contagemPendentes} ${contagemPendentes === 1 ? 'proposta pendente' : 'propostas pendentes'}`}
            style={{
              position: 'absolute',
              top: -7,
              right: -7,
              minWidth: 16,
              height: 16,
              borderRadius: 999,
              background: 'var(--linha-atencao-borda, #b45309)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              lineHeight: '16px',
              padding: '0 4px',
            }}
          >
            {contagemPendentes}
          </span>
        )}
      </button>

      {/* Painel lateral — sobreposição fixa à direita, mesmo formato da Colinha
          (position:fixed, z-index acima da grid, cabeçalho com título + "×"). */}
      {aberto && (
        <aside
          role="complementary"
          aria-label="Central de avisos"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: 320,
            height: '100vh',
            background: 'var(--superficie-1, #fff)',
            borderLeft: '1px solid var(--borda-2, #e5e7eb)',
            boxShadow: '-4px 0 16px rgba(0,0,0,0.10)',
            zIndex: 200,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Cabeçalho */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid var(--borda-2, #e5e7eb)',
              flexShrink: 0,
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 15 }}>Avisos</span>
            <button
              type="button"
              aria-label="Fechar avisos"
              onClick={() => setAberto(false)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 18,
                lineHeight: 1,
                color: 'var(--texto-3, #6b7280)',
                padding: '2px 6px',
              }}
            >
              ×
            </button>
          </div>

          {/* Conteúdo rolável */}
          <div
            style={{
              overflowY: 'auto',
              flex: 1,
              padding: '12px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
          {informativos.length > 0 && (
            <section aria-label="Avisos informativos">
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 6px' }}>Informativos</h3>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {informativos.map((aviso) => (
                  <li
                    key={aviso.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      padding: 10,
                      borderRadius: 8,
                      border: '1px solid var(--borda-2)',
                      fontSize: 13.5,
                    }}
                  >
                    <span>{aviso.mensagem}</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="dc-btn dc-btn-secundario"
                        onClick={() => dispensar(aviso.id)}
                      >
                        Dispensar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {propostas.length > 0 && (
            <section aria-label="Propostas">
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 6px' }}>Propostas</h3>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
          </div>
        </aside>
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
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 10,
        borderRadius: 8,
        border: emInspecao ? '1px solid var(--acento, #2563eb)' : '1px solid var(--borda-2)',
        fontSize: 13.5,
        cursor: 'pointer',
      }}
    >
      <span>{aviso.mensagem}</span>

      {emInspecao && (
        <div
          aria-label="Papéis da proposta"
          style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}
        >
          <span aria-label="Papel: sai">
            Sai{aviso.alvo.length > 0 ? ` — ${aviso.alvo.length} lançamento(s)` : ''}
          </span>
          {aviso.origem === 'conciliacao' && (
            <span aria-label="Papel: fica">Fica — {aviso.permanece.length} lançamento(s)</span>
          )}
          {aviso.resumo && <p aria-label="Resumo da regra" style={{ margin: 0 }}>{aviso.resumo}</p>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
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
          className="dc-btn dc-btn-secundario"
          onClick={(e) => {
            e.stopPropagation()
            aplicar(aviso.id)
          }}
        >
          Aprovar
        </button>
        <button
          type="button"
          className="dc-btn dc-btn-secundario"
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
        className="dc-btn dc-btn-secundario"
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
