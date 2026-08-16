// ADR: see Docs/specs/mes-referencia-ui.adr.md
// ADR: see spec/vr-despesas.adr.md
// ADR: see spec/rendimentos.adr.md
// ADR: see Docs/specs/patches-ui-ux.adr.md

interface FonteRotuloProps {
  fonte: string
  tipo: 'fatura' | 'extrato' | 'form_vr' | 'form_rendimentos'
}

const ARIA_LABEL_POR_TIPO: Record<FonteRotuloProps['tipo'], string> = {
  fatura: 'tipo fatura',
  extrato: 'tipo extrato',
  form_vr: 'tipo form_vr',
  form_rendimentos: 'tipo form_rendimentos',
}

/**
 * Rótulo humano exibido no badge (Task B12): `fatura`/`extrato` já são palavras legíveis
 * e permanecem como estão; `form_vr`/`form_rendimentos` são identificadores internos que
 * nunca devem chegar crus à tela — viram "VR" e "rendimentos" respectivamente.
 */
const RÓTULO_POR_TIPO: Record<FonteRotuloProps['tipo'], string> = {
  fatura: 'fatura',
  extrato: 'extrato',
  form_vr: 'VR',
  form_rendimentos: 'rendimentos',
}

/**
 * Exibe o rótulo visual "fatura", "extrato", "form_vr" ou "form_rendimentos" ao lado do nome da
 * fonte.
 *
 * Usado na lista de arquivos selecionados em App.tsx para comunicar
 * imediatamente ao usuário o tipo de documento detectado por `classificarFonte`
 * (D10 e D11 do ADR mes-referencia-ui).
 *
 * O terceiro valor, `'form_vr'` (Task 2, ADR vr-despesas Decisão 3), e o quarto, `'form_rendimentos'`
 * (Task 4, ADR rendimentos, fechando o narrowing aberto pela Task 2 dessa mesma spec), existem
 * apenas para o tipo da prop compilar honestamente contra o retorno estendido de
 * `classificarFontePorPrefixo` — na prática, fontes `form_vr`/`form_rendimentos` nunca aparecem
 * nesta tela (não vêm de upload de arquivo).
 */
export function FonteRotulo({ fonte, tipo }: FonteRotuloProps) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
      <span>{fonte}</span>
      <span aria-label={ARIA_LABEL_POR_TIPO[tipo]} className={'tag-tipo ' + tipo}>
        {RÓTULO_POR_TIPO[tipo]}
      </span>
    </span>
  )
}
