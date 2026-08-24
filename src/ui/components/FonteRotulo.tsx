// ADR: see Docs/specs/mes-referencia-ui.adr.md
// ADR: see spec/vr-despesas.adr.md
// ADR: see spec/rendimentos.adr.md
// ADR: see Docs/specs/patches-ui-ux.adr.md
// ADR: see spec/fatura-itau-xlsx.adr.md

interface FonteRotuloProps {
  fonte: string
  tipo: 'fatura' | 'extrato' | 'form_vr' | 'form_rendimentos' | 'fatura_itau_cc'
}

const ARIA_LABEL_POR_TIPO: Record<FonteRotuloProps['tipo'], string> = {
  fatura: 'tipo fatura',
  extrato: 'tipo extrato',
  form_vr: 'tipo form_vr',
  form_rendimentos: 'tipo form_rendimentos',
  fatura_itau_cc: 'tipo fatura_itau_cc',
}

/**
 * Rótulo humano exibido no badge (Task B12): `fatura`/`extrato` já são palavras legíveis
 * e permanecem como estão; `form_vr`/`form_rendimentos`/`fatura_itau_cc` são identificadores
 * internos que nunca devem chegar crus à tela — viram "VR", "rendimentos" e "Fatura Itaú"
 * respectivamente (Task T10, ADR fatura-itau-xlsx).
 */
const RÓTULO_POR_TIPO: Record<FonteRotuloProps['tipo'], string> = {
  fatura: 'fatura',
  extrato: 'extrato',
  form_vr: 'VR',
  form_rendimentos: 'rendimentos',
  fatura_itau_cc: 'Fatura Itaú',
}

/**
 * Exibe o rótulo visual "fatura", "extrato", "form_vr", "form_rendimentos" ou "fatura_itau_cc"
 * ao lado do nome da fonte.
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
 *
 * O quinto valor, `'fatura_itau_cc'` (Task T10, ADR fatura-itau-xlsx), cobre o caso em que um
 * consumidor futuro passe esse identificador diretamente como `tipo` (em vez do genérico
 * `'fatura'` que `classificarFontePorPrefixo` já atribui hoje a qualquer fonte com prefixo
 * `fatura_`) — o badge sabe exibir um rótulo humano ("Fatura Itaú") em vez do identificador cru.
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
