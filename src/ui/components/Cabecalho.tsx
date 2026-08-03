// ADR: see Docs/specs/redesign-frontend-claude-design.adr.md

const PASSOS = ['Importar', 'Revisar', 'Exportar']

interface CabecalhoProps {
  /** Índice do passo ativo (0=Importar, 1=Revisar, 2=Exportar). Passos anteriores exibem "feito". */
  etapa: number
}

/**
 * Cabeçalho com Stepper de 3 passos — Task T6.
 *
 * Componente de apresentação puro, fiel ao `Cabecalho`/`Stepper` do protótipo
 * (`prototipo/cdg-dados.jsx`). O passo ativo vem via prop `etapa`; quem decide
 * exibir este componente e qual etapa passar é o consumidor (`App.tsx`, T11) —
 * este componente não lê nem escreve estado global.
 */
export function Cabecalho({ etapa }: CabecalhoProps) {
  return (
    <div className="topo">
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span className="logo">
          <IconeLogo />
        </span>
        <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em' }}>
          Conta de Gastos
        </span>
      </div>
      <div className="stepper">
        {PASSOS.map((nome, i) => (
          <span key={nome} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {i > 0 && <span className="step-linha" />}
            <span
              className={'step-num' + (i < etapa ? ' feito' : i === etapa ? ' ativo' : '')}
            >
              {i < etapa ? <IconeCheck /> : i + 1}
            </span>
            <span className={'step-nome' + (i === etapa ? ' ativo' : '')}>{nome}</span>
          </span>
        ))}
      </div>
      <span className="pill-privado">
        <IconeCadeado />
        Seus dados nunca saem do seu computador
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ícones inline (SVG) — replicados de App.tsx/prototipo/cdg-dados.jsx, que não
// são importáveis diretamente (App.tsx fora das Áreas tocadas desta task).
// ---------------------------------------------------------------------------

function IconeLogo() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#faf8f3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7h18M3 12h18M3 17h10" />
    </svg>
  )
}

function IconeCadeado() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--verde)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

function IconeCheck() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#faf8f3" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12.5 9.5 18 20 6" />
    </svg>
  )
}
