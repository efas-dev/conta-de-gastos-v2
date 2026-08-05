// ADR: see Docs/specs/mes-referencia-ui.adr.md
// ADR: see spec/vr-despesas.adr.md

interface FonteRotuloProps {
  fonte: string
  tipo: 'fatura' | 'extrato' | 'form_vr'
}

const ARIA_LABEL_POR_TIPO: Record<FonteRotuloProps['tipo'], string> = {
  fatura: 'tipo fatura',
  extrato: 'tipo extrato',
  form_vr: 'tipo form_vr',
}

/**
 * Exibe o rótulo visual "fatura", "extrato" ou "form_vr" ao lado do nome da fonte.
 *
 * Usado na lista de arquivos selecionados em App.tsx para comunicar
 * imediatamente ao usuário o tipo de documento detectado por `classificarFonte`
 * (D10 e D11 do ADR mes-referencia-ui).
 *
 * O terceiro valor, `'form_vr'` (Task 2, ADR vr-despesas Decisão 3), existe apenas para o tipo da
 * prop compilar honestamente contra o retorno estendido de `classificarFontePorPrefixo` — na
 * prática, fontes `form_vr` nunca aparecem nesta tela (não vêm de upload de arquivo).
 */
export function FonteRotulo({ fonte, tipo }: FonteRotuloProps) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
      <span>{fonte}</span>
      <span role="status" aria-label={ARIA_LABEL_POR_TIPO[tipo]} className={'tag-tipo ' + tipo}>
        {tipo}
      </span>
    </span>
  )
}
