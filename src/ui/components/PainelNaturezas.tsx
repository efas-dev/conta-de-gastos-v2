// ADR: see Docs/specs/colinha-naturezas.adr.md

import { useState } from 'react'
import type { NaturezaRica } from '../../types'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface PainelNaturezasProps {
  /** Lista pré-filtrada pelo pai — somente entradas com descricao não-vazia */
  naturezas: NaturezaRica[]
  /** Chamada quando o usuário fecha o painel via botão interno "×" */
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

/**
 * Painel lateral colapsável — "colinha de naturezas".
 *
 * Exibe sigla, nome e descrição das naturezas recebidas, na ordem da planilha.
 * Quando a lista é vazia, nem o botão de toggle nem o painel são montados.
 * Estado aberto/fechado é interno; `onClose` é chamado ao fechar via "×".
 *
 * Decisões visuais (D7 delegada ao agente — spec colinha-naturezas.adr.md):
 * - Botão de toggle usa classe `dc-btn dc-btn-secundario` do design system vigente.
 * - Painel posicionado como sobreposição lateral (position:fixed, direita), com
 *   z-index acima da grid, bordas e sombra consistentes com o SplitModal.
 * - Cabeçalho do painel inclui título "Colinha" e botão "×" de fechar.
 * - Largura: 320px — suficiente para sigla+nome+descrição sem truncar o comum.
 */
export function PainelNaturezas({ naturezas, onClose }: PainelNaturezasProps) {
  const [aberto, setAberto] = useState(false)

  // D5 do ADR: quando lista filtrada vazia, nem botão nem painel são montados
  if (naturezas.length === 0) {
    return null
  }

  function handleFechar() {
    setAberto(false)
    onClose()
  }

  return (
    <>
      {/* Botão de toggle na barra de ações (inserido pelo pai em T5;
          em T4 o componente renderiza o botão para que os testes de unidade o encontrem) */}
      <button
        aria-label="Colinha de naturezas"
        aria-expanded={aberto}
        className="dc-btn dc-btn-secundario"
        onClick={() => setAberto((prev) => !prev)}
        style={{ fontSize: '13px', padding: '4px 12px' }}
      >
        Colinha
      </button>

      {/* Painel lateral — montado somente quando aberto */}
      {aberto && (
        <aside
          role="complementary"
          aria-label="Colinha de naturezas"
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
            <span style={{ fontWeight: 700, fontSize: 15 }}>Colinha de naturezas</span>
            <button
              aria-label="Fechar colinha"
              onClick={handleFechar}
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

          {/* Lista de naturezas */}
          <div
            style={{
              overflowY: 'auto',
              flex: 1,
              padding: '12px 20px',
            }}
          >
            {naturezas.map((n) => (
              <div
                key={n.sigla}
                style={{
                  marginBottom: 14,
                  paddingBottom: 14,
                  borderBottom: '1px solid var(--borda-2, #f3f4f6)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 13,
                      fontFamily: 'monospace',
                      background: 'var(--superficie-2, #f3f4f6)',
                      padding: '1px 6px',
                      borderRadius: 4,
                      letterSpacing: '0.04em',
                    }}
                  >
                    {n.sigla}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{n.nome}</span>
                </div>
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: 12.5,
                    color: 'var(--texto-3, #6b7280)',
                    lineHeight: 1.5,
                  }}
                >
                  {n.descricao}
                </p>
              </div>
            ))}
          </div>
        </aside>
      )}
    </>
  )
}
