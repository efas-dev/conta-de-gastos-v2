// ADR: see Docs/specs/redesign-frontend-claude-design.adr.md

import { useEffect } from 'react'

export interface ExportModalProps {
  /** Fase corrente do modal: confirmação antes de gerar ou tela de sucesso após gerar. */
  fase: 'confirmar' | 'feito'
  /** Nome do arquivo `.xlsx` a ser exportado (ex.: `2026-08-ES.xlsx`). */
  nome: string
  /** Quantidade de lançamentos ainda sem natureza válida. */
  pendentes: number
  /** Callback disparado ao confirmar a exportação (fase `confirmar` → geração do `.xlsx` pelo pai). */
  onConfirmar: () => void
  /** Callback disparado ao fechar o modal (botão "Fechar" na fase `feito`, ou clique no overlay). */
  onFechar: () => void
  /** Callback disparado ao desistir da exportação e continuar revisando (fase `confirmar`). */
  onContinuar: () => void
}

/**
 * Modal de exportação — Task T9.
 *
 * Componente de apresentação puro, fiel ao componente `ExportModal` do
 * protótipo (`prototipo/cdg-revisao.jsx:416-452`). Duas fases: `confirmar`
 * (nome do arquivo, alerta de pendentes, botões "Continuar revisando" e
 * "Baixar .xlsx") e `feito` (check grande, confirmação de sucesso, dica de
 * reuso no mês seguinte, botão "Fechar").
 *
 * Não gera o `.xlsx` nem lê `src/excel/writer/`/`src/ui/PipelineState.ts` —
 * a geração é responsabilidade do pai via `onConfirmar` (App.tsx, T11).
 */
export function ExportModal({ fase, nome, pendentes, onConfirmar, onFechar, onContinuar }: ExportModalProps) {
  const fecharOverlay = fase === 'confirmar' ? onContinuar : onFechar

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') {
        fecharOverlay()
      }
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [fecharOverlay])

  return (
    <div className="overlay" onClick={fecharOverlay}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={fase === 'confirmar' ? 'Exportar planilha' : 'Planilha exportada'}
        onClick={(e) => e.stopPropagation()}
      >
        {fase === 'confirmar' ? (
          <>
            <h2 className="modal-titulo">Exportar planilha</h2>
            <div className="arquivo-nome">
              <IconeFile />
              {nome}
            </div>
            {pendentes > 0 && (
              <div className="alerta-export">
                <IconeAlerta />
                {pendentes} lançamento{pendentes > 1 ? 's' : ''} ainda sem natureza: {pendentes > 1 ? 'irão' : 'irá'} em
                branco e o Excel {pendentes > 1 ? 'os marcará' : 'o marcará'} em vermelho.
              </div>
            )}
            <p style={{ fontSize: 13.5, color: 'var(--texto-3)', lineHeight: 1.55, margin: '14px 0 0' }}>
              O arquivo usa o modelo fixo: fórmulas de saldo, totais e formatação já vêm prontos.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
              <button type="button" className="btn sec" onClick={onContinuar}>
                Continuar revisando
              </button>
              <button type="button" className="btn pri" onClick={onConfirmar}>
                <IconeDownload />
                Baixar .xlsx
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
              <span className="check-grande">
                <IconeCheck />
              </span>
              <h2 className="modal-titulo" style={{ marginTop: 14 }}>
                Planilha exportada
              </h2>
              <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 4 }}>{nome}</div>
            </div>
            <div className="dica-dic">
              <IconeBook />
              <span>
                Guarde este arquivo: no mês que vem, solte-o junto com os extratos e o app <strong>preenche sozinho</strong>{' '}
                o que você classificou aqui.
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
              <button type="button" className="btn sec" onClick={onFechar}>
                Fechar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ícones inline (SVG) — replicados de `prototipo/cdg-dados.jsx` (paths `P.file`/
// `P.alerta`/`P.download`/`P.check`/`P.book`), não importáveis de `App.tsx`
// (fora das Áreas tocadas desta task). Mesmo padrão já aceito em `Cabecalho.tsx`
// (T6), `ToolbarRevisao.tsx` (T7) e `BannerInspecao.tsx` (T8).
// ---------------------------------------------------------------------------

function IconeFile() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--verde)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" />
    </svg>
  )
}

function IconeAlerta() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--terracota)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 2 20h20zM12 9v5M12 17.5v.5" />
    </svg>
  )
}

function IconeDownload() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#faf8f3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V3M7 10l5 5 5-5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  )
}

function IconeCheck() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#faf8f3" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12.5 9.5 18 20 6" />
    </svg>
  )
}

function IconeBook() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--verde)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h7a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H2zM22 4h-7a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h7z" />
    </svg>
  )
}
