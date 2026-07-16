// ADR: see Docs/specs/grid-ux-filtros.adr.md

import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import { rankFontes, rankNaturezas, contarIncompletos } from '../filtroRanking'

// ---------------------------------------------------------------------------
// Constantes de UX
// ---------------------------------------------------------------------------

const TOOLTIP_ATALHO = 'Ctrl+clique (ou Cmd+clique) para acumular seleções'

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

/**
 * Barra de filtros e ordenação acima da grid de revisão.
 *
 * Lê o estado do store Zustand diretamente e despacha as actions de
 * filtro/ordenação de T1. Não há prop drilling — as actions do store
 * são chamadas diretamente (D7 do ADR grid-ux-filtros).
 *
 * Comportamento de clique nos chips (D11 do ADR):
 * - Clique simples: seleção única (toggle se já ativo).
 * - Ctrl/Cmd+clique: acumula seleções.
 */
export function FiltroBar(_props: Record<string, never> = {}) {
  const lancamentos = useAppStore((s) => s.lancamentos)
  const lancamentosVisiveis = useAppStore((s) => s.lancamentosVisiveis)
  const filtroFontes = useAppStore((s) => s.filtroFontes)
  const filtroNaturezas = useAppStore((s) => s.filtroNaturezas)
  const filtroSoIncompletos = useAppStore((s) => s.filtroSoIncompletos)
  const setFiltroFontes = useAppStore((s) => s.setFiltroFontes)
  const setFiltroNaturezas = useAppStore((s) => s.setFiltroNaturezas)
  const setFiltroSoIncompletos = useAppStore((s) => s.setFiltroSoIncompletos)
  const limparFiltros = useAppStore((s) => s.limparFiltros)

  // Estado local: expansão do chip "+N mais" de Natureza
  const [naturezaExpandida, setNaturezaExpandida] = useState(false)

  // ---------------------------------------------------------------------------
  // Rankings derivados dos lançamentos completos (não filtrados)
  // Os rankings refletem a distribuição total, não a visão filtrada
  // ---------------------------------------------------------------------------
  const fontesRankeadas = rankFontes(lancamentos)
  const { top5: naturezasTop5, resto: naturezasResto } = rankNaturezas(lancamentos)
  const qtdIncompletos = contarIncompletos(lancamentos)

  // ---------------------------------------------------------------------------
  // Handlers de chips de Fonte (D11 do ADR)
  // ---------------------------------------------------------------------------
  function handleChipFonte(fonte: string, acumular: boolean) {
    if (acumular) {
      // Ctrl/Cmd+clique: adiciona ou remove da seleção acumulada
      const novaSelecao = filtroFontes.includes(fonte)
        ? filtroFontes.filter((f) => f !== fonte)
        : [...filtroFontes, fonte]
      setFiltroFontes(novaSelecao)
    } else {
      // Clique simples: seleção única ou toggle
      if (filtroFontes.length === 1 && filtroFontes[0] === fonte) {
        setFiltroFontes([]) // desliga se era o único ativo
      } else {
        setFiltroFontes([fonte])
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Handlers de chips de Natureza (D11 do ADR)
  // ---------------------------------------------------------------------------
  function handleChipNatureza(natureza: string, acumular: boolean) {
    if (acumular) {
      const novaSelecao = filtroNaturezas.includes(natureza)
        ? filtroNaturezas.filter((n) => n !== natureza)
        : [...filtroNaturezas, natureza]
      setFiltroNaturezas(novaSelecao)
    } else {
      if (filtroNaturezas.length === 1 && filtroNaturezas[0] === natureza) {
        setFiltroNaturezas([])
      } else {
        setFiltroNaturezas([natureza])
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Naturezas visíveis nos chips (top-5 + resto se expandido)
  // ---------------------------------------------------------------------------
  const naturezasVisiveis = naturezaExpandida
    ? [...naturezasTop5, ...naturezasResto]
    : naturezasTop5

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  // Sem padding próprio: a barra compartilhada do App (chips + legenda) o fornece.
  return (
    <div role="toolbar" aria-label="Filtros e ordenação" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>

      {/* Chips de Fonte */}
      {fontesRankeadas.length > 0 && (
        <div role="group" aria-label="Filtro por fonte" style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
          {fontesRankeadas.map((fonte) => (
            <button
              key={fonte}
              title={TOOLTIP_ATALHO}
              aria-pressed={filtroFontes.includes(fonte)}
              onClick={(e) => handleChipFonte(fonte, e.ctrlKey || e.metaKey)}
              style={{
                padding: '0.2rem 0.6rem',
                borderRadius: '999px',
                border: '1px solid #ccc',
                background: filtroFontes.includes(fonte) ? '#4f46e5' : '#f3f4f6',
                color: filtroFontes.includes(fonte) ? '#fff' : '#111',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              {fonte}
            </button>
          ))}
        </div>
      )}

      {/* Divisor */}
      {fontesRankeadas.length > 0 && naturezasVisiveis.length > 0 && (
        <span aria-hidden="true" style={{ color: '#d1d5db' }}>|</span>
      )}

      {/* Chips de Natureza */}
      {naturezasVisiveis.length > 0 && (
        <div role="group" aria-label="Filtro por natureza" style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
          {naturezasVisiveis.map((natureza) => (
            <button
              key={natureza}
              title={TOOLTIP_ATALHO}
              aria-pressed={filtroNaturezas.includes(natureza)}
              onClick={(e) => handleChipNatureza(natureza, e.ctrlKey || e.metaKey)}
              style={{
                padding: '0.2rem 0.6rem',
                borderRadius: '999px',
                border: '1px solid #ccc',
                background: filtroNaturezas.includes(natureza) ? '#0891b2' : '#f3f4f6',
                color: filtroNaturezas.includes(natureza) ? '#fff' : '#111',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              {natureza}
            </button>
          ))}
          {/* Chip "+N mais" — D12 do ADR */}
          {naturezasResto.length > 0 && !naturezaExpandida && (
            <button
              aria-label={`Mostrar mais ${naturezasResto.length} naturezas`}
              onClick={() => setNaturezaExpandida(true)}
              style={{
                padding: '0.2rem 0.6rem',
                borderRadius: '999px',
                border: '1px dashed #ccc',
                background: '#f9fafb',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              +{naturezasResto.length} mais
            </button>
          )}
          {naturezaExpandida && naturezasResto.length > 0 && (
            <button
              aria-label="Recolher naturezas"
              onClick={() => setNaturezaExpandida(false)}
              style={{
                padding: '0.2rem 0.6rem',
                borderRadius: '999px',
                border: '1px dashed #ccc',
                background: '#f9fafb',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              menos
            </button>
          )}
        </div>
      )}

      {/* Chip "só incompletos" — visível apenas quando há lançamentos incompletos */}
      {qtdIncompletos > 0 && (
        <button
          aria-pressed={filtroSoIncompletos}
          onClick={() => setFiltroSoIncompletos(!filtroSoIncompletos)}
          style={{
            padding: '0.2rem 0.6rem',
            borderRadius: '999px',
            border: '1px solid #f59e0b',
            background: filtroSoIncompletos ? '#f59e0b' : '#fffbeb',
            color: filtroSoIncompletos ? '#fff' : '#92400e',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          só incompletos ({qtdIncompletos})
        </button>
      )}

      {/* Botão Limpar — segue o design system (dc-btn) em tamanho compacto.
          A ordenação migrou para cliques nos cabeçalhos das colunas da grid
          (decisão humana de 2026-07-15); o Limpar também a remove. */}
      <button
        className="dc-btn dc-btn-secundario"
        onClick={limparFiltros}
        style={{ fontSize: '13px', padding: '4px 12px', borderRadius: '999px' }}
      >
        Limpar
      </button>

      {/* Contador N de M visíveis */}
      <span aria-live="polite" style={{ fontSize: '0.85rem', color: '#6b7280' }}>
        {lancamentosVisiveis.length} de {lancamentos.length} visíveis
      </span>
    </div>
  )
}
