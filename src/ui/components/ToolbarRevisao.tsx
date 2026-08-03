// ADR: see Docs/specs/redesign-frontend-claude-design.adr.md

import { useAppStore } from '../store/appStore'
import { validarLinha } from '../../dominio/validacao'

/**
 * Barra compacta de status da tela de revisão — Task T7.
 *
 * Mostra o progresso de classificação ("X de Y classificados", via
 * `.progresso`/`.prog-barra`/`.prog-fill`) e o chip "não exportado"
 * (`.chip-sujo`), visível apenas quando o store está `sujo`.
 *
 * Lê o estado diretamente do store Zustand (mesmo padrão de `FiltroBar`,
 * sem prop drilling). A regra de "classificado" reaproveita `validarLinha`
 * — já usada por `ReviewGrid` para decidir o tema de atenção da linha —
 * em vez de reimplementar o critério aqui.
 */
export function ToolbarRevisao() {
  const lancamentos = useAppStore((s) => s.lancamentos)
  const naturezasValidas = useAppStore((s) => s.naturezasValidas)
  const sujo = useAppStore((s) => s.sujo)

  const total = lancamentos.length
  const pendentes = lancamentos.filter((l) => validarLinha(l, naturezasValidas)).length
  const classificados = total - pendentes
  const percentual = total > 0 ? (classificados / total) * 100 : 0

  return (
    <div className="toolbar compacta">
      <span className="logo mini">
        <IconeLogo />
      </span>
      <span className="progresso" title={`${pendentes} ainda sem natureza`}>
        <span className="prog-barra">
          <span className="prog-fill" style={{ width: `${percentual}%` }} />
        </span>
        <span>{classificados} de {total} classificados</span>
      </span>
      {sujo && (
        <span className="chip-sujo" title="Os dados vivem apenas nesta aba — exporte antes de fechar.">
          <span className="ponto" />
          não exportado
        </span>
      )}
    </div>
  )
}

function IconeLogo() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#faf8f3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7h18M3 12h18M3 17h10" />
    </svg>
  )
}
