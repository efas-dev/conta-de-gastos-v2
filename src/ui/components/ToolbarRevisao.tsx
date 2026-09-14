// ADR: see Docs/specs/redesign-frontend-claude-design.adr.md
// ADR: see Docs/specs/patches-ui-ux.adr.md
// ADR: see Docs/specs/refino-ui-revisao-v2.adr.md

import type { ReactNode } from 'react'
import { useAppStore } from '../store/appStore'
import { validarLinha } from '../../dominio/validacao'
import { calcularSaldoCalculado } from '../../dominio/rendimentos'

interface ToolbarRevisaoProps {
  /**
   * Controles de ação (desfazer/refazer, mês de referência, Avisos/Naturezas,
   * Exportar) renderizados no lado direito da mesma barra. O protótipo mantém
   * status e ações numa faixa única (`prototipo/cdg-revisao.jsx:163-191`), com
   * `.toolbar` distribuindo os dois grupos via `justify-content:space-between`.
   */
  children?: ReactNode
}

/**
 * Barra compacta única da tela de revisão — Task T7 (faixa única no hotfix
 * pós-redesign: status à esquerda, ações à direita).
 *
 * O grupo da esquerda mostra o progresso de classificação ("X de Y
 * classificados", via `.progresso`/`.prog-barra`/`.prog-fill`) e o chip "não
 * exportado" (`.chip-sujo`), visível apenas quando o store está `sujo`. O grupo
 * da direita é o slot `children`, preenchido por `App.tsx` com os controles de
 * ação — assim os dois grupos convivem numa só `.toolbar.compacta`, fiel ao
 * protótipo, em vez de duas faixas empilhadas.
 *
 * Lê o estado diretamente do store Zustand (mesmo padrão de `FiltroBar`,
 * sem prop drilling). A regra de "classificado" reaproveita `validarLinha`
 * — já usada por `ReviewGrid` para decidir o tema de atenção da linha —
 * em vez de reimplementar o critério aqui.
 */
export function ToolbarRevisao({ children }: ToolbarRevisaoProps) {
  const lancamentos = useAppStore((s) => s.lancamentos)
  const naturezasValidas = useAppStore((s) => s.naturezasValidas)
  const sujo = useAppStore((s) => s.sujo)
  const saldoAnterior = useAppStore((s) => s.saldoAnterior)
  const filtroSoIncompletos = useAppStore((s) => s.filtroSoIncompletos)
  const setFiltroSoIncompletos = useAppStore((s) => s.setFiltroSoIncompletos)

  const total = lancamentos.length
  const pendentes = lancamentos.filter((l) => validarLinha(l, naturezasValidas)).length
  const classificados = total - pendentes
  const percentual = total > 0 ? (classificados / total) * 100 : 0

  // Sem nenhuma pendente não há para onde levar — o switch fica desabilitado em vez de
  // sumir (a posição do contador é estável, e sumir esconderia a própria existência do
  // atalho). Exceção: com o filtro LIGADO ele continua clicável mesmo em zero pendentes,
  // senão classificar a última linha trancaria o usuário numa grid vazia.
  const podeFiltrar = pendentes > 0 || filtroSoIncompletos

  return (
    <div className="toolbar compacta">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <span className="logo mini">
          <IconeLogo />
        </span>
        {/* O contador deixou de só informar e passou a levar (item 39.2 do TODO): clicar
            liga o filtro "só as pendentes", que já existia no store desde a spec
            `grid-ux-filtros` mas tinha perdido a UI junto com a linha de filterchips
            (commit `034221f`). `role="switch"` porque o efeito é um estado ligado/desligado
            sobre a grid, não uma navegação — mesmo padrão do recorte por iniciais da
            colinha (`PainelNaturezas.tsx`, item 41). */}
        <button
          type="button"
          className={'progresso' + (filtroSoIncompletos ? ' filtrando' : '')}
          role="switch"
          aria-checked={filtroSoIncompletos}
          disabled={!podeFiltrar}
          title={
            pendentes === 0
              ? 'Nenhuma linha pendente'
              : filtroSoIncompletos
                ? `Mostrando só as ${pendentes} pendentes — clique para ver todas as linhas`
                : `${pendentes} ainda sem natureza — clique para ver só elas`
          }
          onClick={() => setFiltroSoIncompletos(!filtroSoIncompletos)}
        >
          {/* Texto antes da barra: mantém "X de Y classificados" colado ao
              ícone (pedido do usuário), à esquerda; a barra vem logo depois. */}
          <span style={{ whiteSpace: 'nowrap' }}>{classificados} de {total} classificados</span>
          <span className="prog-barra">
            <span className="prog-fill" style={{ width: `${percentual}%` }} />
          </span>
        </button>
        {sujo && (
          <span
            className="chip-sujo"
            title="Os dados vivem apenas nesta aba. Exporte antes de fechar ou recarregar."
          >
            <span className="ponto" />
            não exportado · só nesta aba
          </span>
        )}
      </div>
      {saldoAnterior !== null && (
        <div
          className="saldos"
          title="Saldo ant.: lido do xlsx do mês anterior (célula B5). Calculado: saldo anterior + soma de todos os lançamentos deste mês."
        >
          <span>Saldo ant.: {formatarBRL(saldoAnterior)}</span>
          <span style={{ color: calcularSaldoCalculado(saldoAnterior, lancamentos) < 0 ? 'var(--terracota)' : undefined }}>
            Calculado: {formatarBRL(calcularSaldoCalculado(saldoAnterior, lancamentos))}
          </span>
        </div>
      )}
      {children && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{children}</div>
      )}
    </div>
  )
}

/** Mesmo padrão de formatação BRL já usado por `SplitModal.tsx`/`ReviewGrid.tsx`/`PainelNaturezas.tsx`. */
function formatarBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function IconeLogo() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#faf8f3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7h18M3 12h18M3 17h10" />
    </svg>
  )
}
