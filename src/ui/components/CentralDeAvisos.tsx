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

  const [aberto, setAberto] = useState(false)

  if (avisos.length === 0) return null

  const informativos = avisos.filter((a) => a.tipo === 'informativo')
  const propostas = avisos.filter((a) => a.tipo === 'proposta')

  return (
    <div
      role="region"
      aria-label="Central de avisos"
      style={{ height: '100%', display: 'flex', flexDirection: 'row', alignItems: 'stretch', flexShrink: 0 }}
    >
      <button
        type="button"
        aria-expanded={aberto}
        aria-label={aberto ? 'Fechar central de avisos' : 'Abrir central de avisos'}
        onClick={() => setAberto((v) => !v)}
        className="dc-btn dc-btn-secundario"
        style={{
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          padding: '14px 10px',
          borderRadius: 0,
          position: 'relative',
        }}
      >
        Avisos
        {contagemPendentes > 0 && (
          <span
            aria-label={`${contagemPendentes} ${contagemPendentes === 1 ? 'proposta pendente' : 'propostas pendentes'}`}
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              minWidth: 16,
              height: 16,
              borderRadius: 999,
              background: 'var(--linha-atencao-borda, #b45309)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              lineHeight: '16px',
              writingMode: 'horizontal-tb',
              padding: '0 4px',
            }}
          >
            {contagemPendentes}
          </span>
        )}
      </button>

      {aberto && (
        <div
          style={{
            width: 320,
            borderLeft: '1px solid var(--borda-2)',
            padding: 16,
            overflowY: 'auto',
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
                      padding: 10,
                      borderRadius: 8,
                      border: '1px solid var(--borda-2)',
                      fontSize: 13.5,
                    }}
                  >
                    {aviso.mensagem}
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
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

interface AcoesPropostaProps {
  aviso: Aviso
  aplicar: (id: string) => void
  desfazer: (id: string) => void
  dispensar: (id: string) => void
}

/** Card de uma proposta — mensagem + ações que variam conforme `aviso.estado`. */
function CartaoProposta({ aviso, aplicar, desfazer, dispensar }: AcoesPropostaProps) {
  return (
    <li
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
        <button type="button" className="dc-btn dc-btn-secundario" onClick={() => aplicar(aviso.id)}>
          Aprovar
        </button>
        <button type="button" className="dc-btn dc-btn-secundario" onClick={() => dispensar(aviso.id)}>
          Dispensar
        </button>
      </>
    )
  }

  // 'aplicado' e 'dispensado' — ambos reversíveis via "Desfazer" (D14).
  if (aviso.estado === 'aplicado' || aviso.estado === 'dispensado') {
    return (
      <button type="button" className="dc-btn dc-btn-secundario" onClick={() => desfazer(aviso.id)}>
        Desfazer
      </button>
    )
  }

  return null
}
