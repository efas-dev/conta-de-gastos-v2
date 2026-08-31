// ADR: see Docs/specs/fundacao-operacoes.adr.md

/**
 * Ícones inline (SVG) usados por `TelaImportacao`/`TelaRevisao` — coerentes com
 * o handoff de design.
 *
 * Task T12-bis (spec `fundacao-operacoes`): extraído de `App.tsx` sem alteração
 * de marcação (mesmos `path`/atributos), só o ponto de definição mudou.
 */

export function IconeUpload({ cor = 'var(--verde)' }: { cor?: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  )
}

export function IconeArquivo({ cor = 'var(--verde)' }: { cor?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}

export function IconeSeta() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#faf8f3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

export function IconeDesfazer() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--texto-3)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-1" />
    </svg>
  )
}

export function IconeRefazer() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--texto-3)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 14 20 9l-5-5" />
      <path d="M20 9H9a5 5 0 0 0 0 10h1" />
    </svg>
  )
}

export function IconeExportar() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#faf8f3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V3M7 10l5 5 5-5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  )
}
