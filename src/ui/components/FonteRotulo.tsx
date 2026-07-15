// ADR: see spec/mes-referencia-ui.adr.md

interface FonteRotuloProps {
  fonte: string
  tipo: 'fatura' | 'extrato'
}

/**
 * Exibe o rótulo visual "fatura" ou "extrato" ao lado do nome da fonte.
 *
 * Usado na lista de arquivos selecionados em App.tsx para comunicar
 * imediatamente ao usuário o tipo de documento detectado por `classificarFonte`
 * (D10 e D11 do ADR mes-referencia-ui).
 */
export function FonteRotulo({ fonte, tipo }: FonteRotuloProps) {
  const isFatura = tipo === 'fatura'

  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
    >
      <span>{fonte}</span>
      <span
        role="status"
        aria-label={isFatura ? 'tipo fatura' : 'tipo extrato'}
        style={{
          display: 'inline-block',
          padding: '1px 7px',
          borderRadius: '999px',
          fontSize: '0.75rem',
          fontWeight: 600,
          background: isFatura ? '#fef3c7' : '#d1fae5',
          color: isFatura ? '#92400e' : '#065f46',
          border: `1px solid ${isFatura ? '#fcd34d' : '#6ee7b7'}`,
        }}
      >
        {tipo}
      </span>
    </span>
  )
}
