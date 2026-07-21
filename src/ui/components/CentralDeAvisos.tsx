// ADR: see Docs/specs/avisos-acionaveis.adr.md

import { useAppStore } from '../store/appStore'
import type { Aviso } from '../../types'

/**
 * Central de avisos acionáveis — lê `avisosAcionaveis.avisos` do store e expõe
 * ações (`aplicar`/`desfazer`/`dispensar`) por proposta (D4 do ADR
 * `avisos-acionaveis`: a UI só lê o slice e dispara ações; nunca importa as
 * funções de detecção `detectarValorPendente`/`detectarConciliacao` — essas
 * rodam em `PipelineState.produzirLancamentos`, Decisão 5 do ADR).
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

  if (avisos.length === 0) return null

  const informativos = avisos.filter((a) => a.tipo === 'informativo')
  const propostas = avisos.filter((a) => a.tipo === 'proposta')

  return (
    <div role="region" aria-label="Central de avisos" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {informativos.length > 0 && (
        <section aria-label="Avisos informativos">
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 6px' }}>Informativos</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {informativos.map((aviso) => (
              <li key={aviso.id} style={{ fontSize: 13.5 }}>
                {aviso.mensagem}
              </li>
            ))}
          </ul>
        </section>
      )}

      {propostas.length > 0 && (
        <section aria-label="Propostas">
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 6px' }}>Propostas</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {propostas.map((aviso) => (
              <li key={aviso.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}>
                <span style={{ flex: 1 }}>{aviso.mensagem}</span>
                <AcoesProposta aviso={aviso} aplicar={aplicar} desfazer={desfazer} dispensar={dispensar} />
              </li>
            ))}
          </ul>
        </section>
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

/** Botões de ação de uma proposta — variam conforme `aviso.estado`. */
function AcoesProposta({ aviso, aplicar, desfazer, dispensar }: AcoesPropostaProps) {
  if (aviso.estado === 'pendente') {
    return (
      <>
        <button type="button" className="dc-btn dc-btn-secundario" onClick={() => aplicar(aviso.id)}>
          Aplicar
        </button>
        <button type="button" className="dc-btn dc-btn-secundario" onClick={() => dispensar(aviso.id)}>
          Dispensar
        </button>
      </>
    )
  }

  if (aviso.estado === 'aplicado') {
    return (
      <button type="button" className="dc-btn dc-btn-secundario" onClick={() => desfazer(aviso.id)}>
        Desfazer
      </button>
    )
  }

  // 'dispensado' — sem ação disponível
  return null
}
