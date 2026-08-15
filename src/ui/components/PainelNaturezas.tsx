// ADR: see Docs/specs/colinha-naturezas.adr.md
// ADR: see Docs/specs/redesign-frontend-claude-design.adr.md

import { useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import { proximaSelecaoFiltro } from '../selecaoFiltro'
import type { Lancamento, NaturezaRica } from '../../types'

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
// Funções puras — exportadas para testabilidade
// ---------------------------------------------------------------------------

/**
 * Soma os valores dos lançamentos agrupados por natureza (sigla).
 * Só siglas com pelo menos um lançamento entram no Map — a ausência de chave
 * é o que permite ao cartão OMITIR o número em vez de exibir 0.
 */
export function somarPorNatureza(lancamentos: Lancamento[]): Map<string, number> {
  const somas = new Map<string, number>()
  for (const l of lancamentos) {
    if (!l.natureza) continue
    somas.set(l.natureza, (somas.get(l.natureza) ?? 0) + l.valor)
  }
  return somas
}

/**
 * Ordena os cartões da colinha (ajuste 2026-08-02): RR sempre primeiro
 * (independente do valor, mesmo sem lançamentos); as demais por |soma|
 * decrescente. Naturezas sem lançamentos contam como 0 e, por estabilidade
 * do sort, preservam entre si a ordem recebida (a da planilha).
 */
export function ordenarNaturezas(
  naturezas: NaturezaRica[],
  somas: Map<string, number>,
): NaturezaRica[] {
  const rr = naturezas.filter((n) => n.sigla === 'RR')
  const demais = naturezas
    .filter((n) => n.sigla !== 'RR')
    .sort((a, b) => Math.abs(somas.get(b.sigla) ?? 0) - Math.abs(somas.get(a.sigla) ?? 0))
  return [...rr, ...demais]
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

/**
 * Conteúdo da aba "Naturezas" do `PainelLateral` — Task T5.
 *
 * Exibe sigla, nome, descrição e a somatória dos lançamentos rotulados com
 * cada natureza (lida do store — atualiza junto com a grid). Cartão sem
 * lançamento correspondente omite o número. Ordem: RR primeiro, demais por
 * |soma| decrescente (ajuste 2026-08-02).
 *
 * Quando a lista é vazia, o componente renderiza `.painel-vazio` explicando o
 * que houve (nenhuma natureza carregada) e o que fazer (importar um
 * extrato/fatura) — em vez de `return null` (Task B6).
 */
export function PainelNaturezas({ naturezas }: PainelNaturezasProps) {
  const lancamentos = useAppStore((s) => s.lancamentos)
  const filtroNaturezas = useAppStore((s) => s.filtroNaturezas)
  const setFiltroNaturezas = useAppStore((s) => s.setFiltroNaturezas)

  const somas = useMemo(() => somarPorNatureza(lancamentos), [lancamentos])
  const ordenadas = useMemo(() => ordenarNaturezas(naturezas, somas), [naturezas, somas])

  if (naturezas.length === 0) {
    return (
      <div className="painel-vazio">
        <p style={{ margin: 0 }}>Nenhuma natureza carregada ainda.</p>
        <p style={{ margin: 0 }}>Importe um extrato ou fatura para ver as naturezas aqui.</p>
      </div>
    )
  }

  return (
    <>
      {ordenadas.map((n) => {
        const soma = somas.get(n.sigla)
        const ativo = filtroNaturezas.includes(n.sigla)
        return (
          <button
            key={n.sigla}
            type="button"
            className="nat-item"
            aria-pressed={ativo}
            title="Filtrar a grid por esta natureza · Ctrl/Cmd+clique acumula"
            onClick={(e) =>
              // Mesma semântica dos chips do FiltroBar (D11): clique simples
              // troca/desliga; Ctrl/Cmd+clique acumula (ajuste 2026-08-02)
              setFiltroNaturezas(
                proximaSelecaoFiltro(filtroNaturezas, n.sigla, e.ctrlKey || e.metaKey),
              )
            }
            style={{
              // Reset de <button> — o cartão mantém o visual de item de lista
              display: 'block',
              width: '100%',
              textAlign: 'left',
              background: ativo ? 'var(--verde-suave, #eff3ef)' : 'none',
              border: 'none',
              font: 'inherit',
              color: 'inherit',
              cursor: 'pointer',
              borderRadius: 8,
              padding: '6px 8px 11px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="nat-sigla">{n.sigla}</span>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{n.nome}</span>
              {soma !== undefined && (
                <span
                  className="nat-soma"
                  style={{
                    marginLeft: 'auto',
                    fontSize: 12.5,
                    fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                    color: soma < 0 ? 'var(--terracota)' : 'var(--verde)',
                  }}
                >
                  {soma.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              )}
            </div>
            <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--texto-3)', lineHeight: 1.5 }}>
              {n.descricao}
            </p>
          </button>
        )
      })}
    </>
  )
}
