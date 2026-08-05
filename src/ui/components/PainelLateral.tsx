// ADR: see Docs/specs/redesign-frontend-claude-design.adr.md

import { useAppStore } from '../store/appStore'
import { selecionarContagemPendentes } from '../store/avisosSlice'
import type { NaturezaRica } from '../../types'
import { CentralDeAvisos } from './CentralDeAvisos'
import { PainelNaturezas } from './PainelNaturezas'

export type AbaPainelLateral = 'avisos' | 'naturezas' | null

interface PainelLateralProps {
  /** Aba atualmente ativa — controlada pelo consumidor (App.tsx decide em T11). */
  aba: AbaPainelLateral
  /** Troca a aba ativa; `null` fecha o painel (o consumidor decide se desmonta). */
  setAba: (aba: AbaPainelLateral) => void
  /** Lista pré-filtrada de naturezas com descrição — mesmo contrato de `PainelNaturezas`. */
  naturezas: NaturezaRica[]
  /**
   * Exibe o botão "×" de fechar. Só faz sentido onde o painel é um overlay
   * dispensável (TelaImportacao); na revisão o painel é fixo e fica sempre
   * aberto (hotfix 2026-08-02), sem botão de fechar.
   */
  fechavel?: boolean
}

/**
 * Painel lateral único com abas Avisos | Naturezas — Task T5.
 *
 * Substitui os dois sheets independentes (`CentralDeAvisos`/`PainelNaturezas`,
 * cada um `position:fixed` com botão-toggle próprio) por uma coluna fixa de
 * ~330px ao lado da grid (item 4 das frases de intenção), fiel à estrutura do
 * `PainelLateral` do protótipo (`prototipo/cdg-revisao.jsx:314-385`).
 *
 * A aba ativa é controlada via props pelo consumidor (mesmo padrão do
 * protótipo, onde `TelaRevisao` mantém `aba`/`setAba` e repassa por props) —
 * `App.tsx` decide em T11 se/quando este componente é montado. Nesta task o
 * componente é autocontido e não é integrado a `App.tsx`.
 *
 * O badge de contagem de propostas pendentes (D15 do ADR
 * `inspecao-proposta-conciliacao`) migrou do botão de toggle antigo de
 * `CentralDeAvisos` para a própria aba "Avisos".
 */
export function PainelLateral({ aba, setAba, naturezas, fechavel = false }: PainelLateralProps) {
  const contagemPendentes = useAppStore(selecionarContagemPendentes)

  return (
    <aside className="painel" role="complementary" aria-label="Painel lateral">
      <div className="painel-abas">
        <button
          type="button"
          className={'aba' + (aba === 'avisos' ? ' on' : '')}
          onClick={() => setAba('avisos')}
        >
          Avisos
          {contagemPendentes > 0 && (
            <span
              className="badge inline"
              aria-label={
                contagemPendentes === 1 ? '1 proposta pendente' : `${contagemPendentes} propostas pendentes`
              }
            >
              {contagemPendentes}
            </span>
          )}
        </button>
        <button
          type="button"
          className={'aba' + (aba === 'naturezas' ? ' on' : '')}
          onClick={() => setAba('naturezas')}
        >
          Naturezas
        </button>
        {fechavel && (
          <button
            type="button"
            className="btn sec mini icone"
            style={{ marginLeft: 'auto' }}
            aria-label="Fechar painel"
            onClick={() => setAba(null)}
          >
            ×
          </button>
        )}
      </div>
      <div className="painel-corpo">
        {aba === 'avisos' && <CentralDeAvisos />}
        {aba === 'naturezas' && <PainelNaturezas naturezas={naturezas} />}
      </div>
    </aside>
  )
}
