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
  // Classes do design system portado em T1 (`.filtros`/`.filtro-grupo`/`.divisor`/
  // `.chip`(+`.on`)/`.chip-sujo`/`.btn-limpar`) — zero hex hardcoded (item 2 do spec).
  return (
    <div role="toolbar" aria-label="Filtros e ordenação" className="filtros">

      {/* Chips de Fonte */}
      {fontesRankeadas.length > 0 && (
        <div role="group" aria-label="Filtro por fonte" className="filtro-grupo">
          {fontesRankeadas.map((fonte) => (
            <button
              key={fonte}
              title={TOOLTIP_ATALHO}
              aria-pressed={filtroFontes.includes(fonte)}
              onClick={(e) => handleChipFonte(fonte, e.ctrlKey || e.metaKey)}
              className={'chip' + (filtroFontes.includes(fonte) ? ' on' : '')}
            >
              {fonte}
            </button>
          ))}
        </div>
      )}

      {/* Divisor */}
      {fontesRankeadas.length > 0 && naturezasVisiveis.length > 0 && (
        <span aria-hidden="true" className="divisor" />
      )}

      {/* Chips de Natureza */}
      {naturezasVisiveis.length > 0 && (
        <div role="group" aria-label="Filtro por natureza" className="filtro-grupo">
          {naturezasVisiveis.map((natureza) => (
            <button
              key={natureza}
              title={TOOLTIP_ATALHO}
              aria-pressed={filtroNaturezas.includes(natureza)}
              onClick={(e) => handleChipNatureza(natureza, e.ctrlKey || e.metaKey)}
              className={'chip' + (filtroNaturezas.includes(natureza) ? ' on' : '')}
            >
              {natureza}
            </button>
          ))}
          {/* Chip "+N mais" — D12 do ADR */}
          {naturezasResto.length > 0 && !naturezaExpandida && (
            <button
              aria-label={`Mostrar mais ${naturezasResto.length} naturezas`}
              onClick={() => setNaturezaExpandida(true)}
              className="chip"
            >
              +{naturezasResto.length} mais
            </button>
          )}
          {naturezaExpandida && naturezasResto.length > 0 && (
            <button
              aria-label="Recolher naturezas"
              onClick={() => setNaturezaExpandida(false)}
              className="chip"
            >
              menos
            </button>
          )}
        </div>
      )}

      {/* Chip "só incompletos" — visível apenas quando há lançamentos incompletos.
          Usa `.chip-sujo` (pill de alerta terracota do design system) por ser um
          indicador de atenção, não uma seleção de filtro comum. `.chip-sujo` não
          tem variante `.on` no design system (fora do escopo desta task); o
          estado ativo/inativo continua exposto via `aria-pressed`. */}
      {qtdIncompletos > 0 && (
        <button
          aria-pressed={filtroSoIncompletos}
          onClick={() => setFiltroSoIncompletos(!filtroSoIncompletos)}
          className="chip-sujo"
        >
          só incompletos ({qtdIncompletos})
        </button>
      )}

      {/* Botão Limpar — classe `.btn-limpar` do design system (T1), fiel a
          `prototipo/cdg-revisao.jsx:202`. A ordenação migrou para cliques nos
          cabeçalhos das colunas da grid (decisão humana de 2026-07-15); o
          Limpar também a remove. */}
      <button className="btn-limpar" onClick={limparFiltros}>
        Limpar
      </button>

      {/* Contador N de M visíveis */}
      <span aria-live="polite" className="dc-rotulo">
        {lancamentosVisiveis.length} de {lancamentos.length} visíveis
      </span>
    </div>
  )
}
