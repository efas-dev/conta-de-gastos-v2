// ADR: see Docs/specs/redesign-frontend-claude-design.adr.md
// ADR: see Docs/specs/patches-ui-ux.adr.md
// ADR: see Docs/specs/refino-ui-revisao-v2.adr.md

import { useAppStore } from '../store/appStore'
import type { Aviso } from '../../types'

export interface BannerInspecaoProps {
  /** Aviso atualmente em modo inspeção, ou `null`/`undefined` quando nenhum está em inspeção. */
  aviso: Aviso | null | undefined
  /** Callback disparado ao clicar em "Aplicar" — recebe o id do aviso. */
  onAprovar: (id: string) => void
  /** Callback disparado ao clicar em "Dispensar" — recebe o id do aviso. */
  onDispensar: (id: string) => void
  /** Callback disparado ao clicar no botão de fechar a inspeção. */
  onFechar: () => void
}

/**
 * Banner de inspeção de proposta — Task T8.
 *
 * Componente de apresentação puro, fiel ao bloco `.banner-inspecao` do
 * protótipo (`prototipo/cdg-revisao.jsx:210-221`). Recebe o `aviso` em
 * inspeção e os 3 callbacks via props; não lê nem escreve `useAppStore`
 * diretamente — a ligação ao estado (`avisosAcionaveis.avisoEmInspecao`)
 * fica para T11.
 *
 * Retorna `null` quando não há aviso em inspeção (mesmo padrão de
 * `AvisoList.tsx`/`PainelNaturezas.tsx`/`CentralDeAvisos.tsx` — nada
 * montado sem conteúdo).
 *
 * Revisão da Task B9 (D8/D9 do ADR `patches-ui-ux`): a presença de filtro ativo é
 * derivada direto do store (`filtroFontes`/`filtroNaturezas`/`filtroSoIncompletos`),
 * sem prop nova — e o sufixo de texto deixa de afirmar "filtros suspensos" (nunca foi
 * verdade: `aplicarRevelacaoInspecao` em `ReviewGrid.tsx` só anexa as linhas do aviso
 * ao final da lista já filtrada/ordenada, sem suspender filtro nem ordenação).
 */
export function BannerInspecao({ aviso, onAprovar, onDispensar, onFechar }: BannerInspecaoProps) {
  const filtroFontes = useAppStore((s) => s.filtroFontes)
  const filtroNaturezas = useAppStore((s) => s.filtroNaturezas)
  const filtroSoIncompletos = useAppStore((s) => s.filtroSoIncompletos)
  const filtroAtivo = filtroFontes.length > 0 || filtroNaturezas.length > 0 || filtroSoIncompletos

  if (!aviso) return null

  return (
    <div className="banner-inspecao">
      <IconeOlho />
      <span className="rotulo">Inspecionando proposta</span>
      <span className="tag-insp sai">sai</span>
      <span style={{ color: 'var(--texto-3)' }}>
        {aviso.alvo.length} linha{aviso.alvo.length > 1 ? 's' : ''}
      </span>
      {aviso.permanece.length > 0 && (
        <>
          <span className="tag-insp fica">fica</span>
          <span style={{ color: 'var(--texto-3)' }}>{aviso.permanece.length} linhas</span>
        </>
      )}
      {filtroAtivo && (
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>
          · linhas do aviso reveladas apesar do filtro ativo
        </span>
      )}
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        <button type="button" className="btn pri mini" onClick={() => onAprovar(aviso.id)}>
          <IconeCheck />
          Aplicar
        </button>
        <button type="button" className="btn sec mini" onClick={() => onDispensar(aviso.id)}>
          Dispensar
        </button>
        <button type="button" className="btn sec mini icone" onClick={onFechar} title="Fechar inspeção">
          <IconeX />
        </button>
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ícones inline (SVG) — replicados de `prototipo/cdg-dados.jsx` (paths `P.eye`/
// `P.check`/`P.x`), não importáveis de `App.tsx` (fora das Áreas tocadas desta task).
// ---------------------------------------------------------------------------

function IconeOlho() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--texto-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0" />
    </svg>
  )
}

function IconeCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12.5 9.5 18 20 6" />
    </svg>
  )
}

function IconeX() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
