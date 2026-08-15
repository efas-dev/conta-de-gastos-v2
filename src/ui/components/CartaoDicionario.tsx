// ADR: see Docs/specs/redesign-frontend-claude-design.adr.md
// ADR: see Docs/specs/patches-ui-ux.adr.md

interface DicionarioCarregado {
  /** Nome do arquivo `.xlsx` carregado (ex.: "2026-05-ES.xlsx"). */
  nome: string
  /** Número de lembretes de classificação (estabelecimento → Natureza/Descrição) presentes no dicionário. */
  entradas: number
}

interface CartaoDicionarioProps {
  /** Dicionário já carregado, ou `null` quando o cartão ainda está no estado vazio. */
  dicionario: DicionarioCarregado | null
  /** Disparado ao clicar no cartão vazio, convidando a carregar o `.xlsx` do mês anterior. */
  onCarregar: () => void
}

/**
 * Cartão "Planilha do mês anterior" — Task T10.
 *
 * Componente de apresentação puro, fiel ao `.cartao-dic` do protótipo
 * (`prototipo/cdg-upload.jsx:108-125`). Estado vazio convida a soltar o `.xlsx`
 * exportado no mês passado; estado carregado mostra o nome do arquivo e o
 * número de entradas. A leitura/parse do arquivo é responsabilidade do
 * consumidor (`App.tsx`, T11) — este componente não acopla ao store.
 */
export function CartaoDicionario({ dicionario, onCarregar }: CartaoDicionarioProps) {
  const carregado = dicionario !== null

  function aoPressionarTecla(evento: React.KeyboardEvent<HTMLDivElement>) {
    if (evento.key === 'Enter' || evento.key === ' ') {
      onCarregar()
    }
  }

  return (
    <div
      className={'cartao-dic' + (carregado ? ' carregado' : '')}
      onClick={carregado ? undefined : onCarregar}
      {...(carregado ? {} : { role: 'button', tabIndex: 0, onKeyDown: aoPressionarTecla })}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="icone-arq">
          <IconeLivro />
        </span>
        <div style={{ fontSize: 14, fontWeight: 800 }}>Planilha do mês anterior</div>
        <span className="tag-tipo extrato" style={{ marginLeft: 'auto' }}>
          .xlsx
        </span>
      </div>
      {carregado ? (
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--texto-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700 }}>
            <IconeCheck />
            {dicionario.nome}
          </div>
          <div style={{ color: 'var(--muted)', marginTop: 4 }}>
            {dicionario.entradas} lembretes de classificação
          </div>
        </div>
      ) : (
        <p style={{ margin: '9px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--texto-3)' }}>
          Solte aqui o .xlsx exportado no mês passado: o app <strong>lembra como você classificou</strong>{' '}
          cada estabelecimento e preenche Natureza e Descrição sozinho.
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ícones inline (SVG) — replicados de prototipo/cdg-dados.jsx (paths `P.book` e
// `P.check`), mesmo padrão já aceito em Cabecalho.tsx/ExportModal.tsx (T6/T9).
// ---------------------------------------------------------------------------

function IconeLivro() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--verde)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

function IconeCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--verde)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12.5 9.5 18 20 6" />
    </svg>
  )
}
