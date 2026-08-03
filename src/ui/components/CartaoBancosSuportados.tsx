// ADR: see Docs/specs/redesign-frontend-claude-design.adr.md

interface FormatoBanco {
  banco: string
  formatos: string
}

/**
 * Lista dos bancos/formatos que os parsers de `src/parsers/` reconhecem hoje
 * (registro `parsers` em `src/parsers/index.ts`). Mantida em código em vez de
 * derivada automaticamente do registro porque os parsers não expõem metadados
 * de banco/formato — apenas `aceita`/`parsear` (contrato `Parser`).
 */
const BANCOS_SUPORTADOS: FormatoBanco[] = [
  { banco: 'Nubank', formatos: 'extrato CSV · fatura CSV' },
  { banco: 'Itaú', formatos: 'extrato TXT' },
  { banco: 'Inter', formatos: 'extrato CSV' },
  { banco: 'Banco do Brasil', formatos: 'extrato CSV' },
]

/**
 * Cartão estático "Bancos suportados" — Task T10.
 *
 * Fiel ao `.cartao-info` do protótipo (`prototipo/cdg-upload.jsx:126-131`), mas
 * com a lista real de bancos/formatos que o app suporta hoje (verificada em
 * `src/parsers/`), não o texto demo do protótipo — que cita PDF, formato para
 * o qual não existe parser no app real.
 */
export function CartaoBancosSuportados() {
  return (
    <div className="cartao-info">
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Bancos suportados</div>
      {BANCOS_SUPORTADOS.map(({ banco, formatos }) => (
        <div className="linha-banco" key={banco}>
          <span>{banco}</span>
          <span className="fmt">{formatos}</span>
        </div>
      ))}
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 9, lineHeight: 1.5 }}>
        Outro banco? Contribua com um parser.
      </div>
    </div>
  )
}
