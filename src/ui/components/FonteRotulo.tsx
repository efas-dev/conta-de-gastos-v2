// ADR: see Docs/specs/mes-referencia-ui.adr.md

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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
      <span>{fonte}</span>
      <span
        role="status"
        aria-label={isFatura ? 'tipo fatura' : 'tipo extrato'}
        className={'tag-tipo ' + tipo}
      >
        {tipo}
      </span>
    </span>
  )
}
