// ADR: see Docs/specs/vr-despesas.adr.md

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

/** Converte um valor em reais para centavos inteiros, evitando float drift (mesmo padrão de `deteccoes.ts`/`investimento.ts`). */
function paraCentavos(valor: number): number {
  return Math.round(valor * 100)
}

/**
 * Retorna o último dia do mês de `mesRef` (`YYYY-MM`) no formato `YYYY-MM-DD`, sem passar por
 * `Date` (evita drift de fuso horário — mesmo cuidado de `formatarDataBr` em `deteccoes.ts`).
 */
function ultimoDiaDoMes(mesRef: string): string {
  const [anoStr, mesStr] = mesRef.split('-')
  const ano = Number(anoStr)
  const mes = Number(mesStr) // 1-based

  const bissexto = ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0)
  const diasPorMes = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  const ultimoDia = diasPorMes[mes - 1]

  return `${anoStr}-${mesStr}-${String(ultimoDia).padStart(2, '0')}`
}

/** Uma despesa informada pelo usuário no `FormVR` (Task 6): valor, natureza e descrição. */
interface DespesaVR {
  valor: number
  natureza: string
  descricao: string
}

/**
 * Transforma N despesas de VR num lote de lançamentos a inserir: N saídas (fonte `form_vr`,
 * valor negativo, natureza/descrição da despesa) mais 1 entrada de compensação (natureza `'RR'`,
 * descrição fixa, valor positivo = soma dos módulos das N saídas) — ver ADR `vr-despesas`,
 * Decisões 2 e 4. Todas as N+1 entradas compartilham a mesma data: o último dia de `mesRef`
 * (data automática, D4 — o usuário não escolhe data por despesa).
 *
 * Função pura: nenhum objeto retornado tem `id` — a atribuição do id serial de nascimento é
 * responsabilidade exclusiva de quem aplica a mutação (`avisosSlice.aplicar`, T3, via
 * `atribuirIds`), nunca de quem propõe.
 *
 * `despesas: []` devolve `[]` — sem nenhuma despesa informada, não há o que compensar; gerar
 * apenas uma entrada RR de valor zero não tem significado de negócio.
 *
 * @returns N+1 lançamentos sem `id` (ou `[]` quando `despesas` é vazio).
 */
export function gerarLancamentosVR(despesas: DespesaVR[], mesRef: string): Omit<Lancamento, 'id'>[] {
  if (despesas.length === 0) return []

  const data = ultimoDiaDoMes(mesRef)

  const saidas: Omit<Lancamento, 'id'>[] = despesas.map((despesa) => ({
    fonte: 'form_vr',
    data,
    transcricao: despesa.descricao,
    valor: -Math.abs(despesa.valor),
    iniciais: '',
    natureza: despesa.natureza,
    descricao: despesa.descricao,
  }))

  const somaCentavos = despesas.reduce((acc, despesa) => acc + Math.abs(paraCentavos(despesa.valor)), 0)
  const descricaoRR = 'VR utilizado para despesas familiares'

  const entradaRR: Omit<Lancamento, 'id'> = {
    fonte: 'form_vr',
    data,
    transcricao: descricaoRR,
    valor: somaCentavos / 100,
    iniciais: '',
    natureza: 'RR',
    descricao: descricaoRR,
  }

  return [...saidas, entradaRR]
}
