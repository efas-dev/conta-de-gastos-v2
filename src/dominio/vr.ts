// ADR: see spec/vr-despesas.adr.md

import type { Aviso, Lancamento } from '../types'
import type { ContextoDeteccao } from './registry'

/**
 * Detecta a oportunidade de registrar despesas domésticas pagas com VR (vale-refeição).
 *
 * Diferente dos demais detectores deste módulo, `detectarVR` SEMPRE devolve exatamente 1
 * `Aviso` de convite, independente do conteúdo de `lancamentos` (inclusive `[]`) — decisão
 * deliberada do ADR `vr-despesas` (Decisão 5): a origem dos dados de VR é inteiramente manual,
 * sem nenhum indício nos lançamentos importados a detectar. Este NÃO é um bug — é o único
 * detector do registry que roda "sempre presente", por contrato explícito.
 *
 * O aviso não carrega `mutacaoProposta`: a mutação (verbo `'adicionar'`) só é construída no
 * submit do formulário `FormVR` (Task 6), a partir das despesas que o usuário informar — a
 * detecção pura não antecipa esse conteúdo.
 *
 * `lancamentos`/`contexto` seguem o contrato `FuncaoDeteccao` (`src/dominio/registry.ts`) para
 * poder ser registrada diretamente no array `detectores`, mas nenhum dos dois é lido pelo corpo
 * da função — prefixados com `_` para respeitar `noUnusedParameters` do projeto.
 *
 * @returns Sempre um array com exatamente 1 `Aviso` (`origem:'vr'`, `tipo:'proposta'`,
 *   `estado:'pendente'`, sem `mutacaoProposta`).
 */
export function detectarVR(_lancamentos: Lancamento[], _contexto?: ContextoDeteccao): Aviso[] {
  return [
    {
      id: 'vr',
      tipo: 'proposta',
      origem: 'vr',
      mensagem: 'Despesas da casa pagas com vale-refeição? Clique para lançar.',
      alvo: [],
      permanece: [],
      estado: 'pendente',
    },
  ]
}
