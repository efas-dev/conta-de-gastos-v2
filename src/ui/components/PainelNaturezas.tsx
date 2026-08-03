// ADR: see Docs/specs/colinha-naturezas.adr.md
// ADR: see Docs/specs/redesign-frontend-claude-design.adr.md

import type { NaturezaRica } from '../../types'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface PainelNaturezasProps {
  /** Lista pré-filtrada pelo pai — somente entradas com descricao não-vazia */
  naturezas: NaturezaRica[]
  /**
   * Mantido opcional só por compatibilidade de assinatura com o call site atual
   * em `App.tsx` (não tocado nesta task — integração real fica para T11). O
   * componente deixou de gerenciar abertura/fechamento próprios (Task T5): quem
   * decide se este conteúdo está visível é o `PainelLateral` (aba ativa).
   */
  onClose?: () => void
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

/**
 * Conteúdo da aba "Naturezas" do `PainelLateral` — Task T5.
 *
 * Exibe sigla, nome e descrição das naturezas recebidas, na ordem da planilha,
 * usando as classes `.nat-item`/`.nat-sigla` portadas em T1. Não é mais um
 * sheet colapsável com toggle/overlay próprio (isso "vazava" para a barra de
 * ações) — o `PainelLateral` é quem decide exibir este conteúdo, via aba.
 *
 * Quando a lista é vazia, o componente renderiza `null` — mesmo padrão
 * anterior de "nada montado sem conteúdo".
 */
export function PainelNaturezas({ naturezas }: PainelNaturezasProps) {
  if (naturezas.length === 0) {
    return null
  }

  return (
    <>
      {naturezas.map((n) => (
        <div key={n.sigla} className="nat-item">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="nat-sigla">{n.sigla}</span>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{n.nome}</span>
          </div>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--texto-3)', lineHeight: 1.5 }}>
            {n.descricao}
          </p>
        </div>
      ))}
    </>
  )
}
