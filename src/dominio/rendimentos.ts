// ADR: see spec/rendimentos.adr.md

import type { Aviso, Lancamento } from '../types'
import type { ContextoDeteccao } from './registry'

/** Converte um valor em reais para centavos inteiros, evitando float drift (mesmo padrão de `deteccoes.ts`/`vr.ts`). */
function paraCentavos(valor: number): number {
  return Math.round(valor * 100)
}

/**
 * Calcula o saldo do mês corrente a partir do saldo anterior (lido de B5 do xlsx do mês
 * anterior, `lerSaldoAnterior`, Task 1) mais a soma algébrica de todos os lançamentos do grid
 * corrente, sem filtro por natureza/fonte (ver ADR `rendimentos`, F3).
 *
 * Função pura, sem I/O: soma em centavos inteiros antes de converter de volta para reais, evitando
 * drift de ponto flutuante ao somar N lançamentos (mesmo cuidado de `deteccoes.ts`/`vr.ts`).
 *
 * `lancamentos: []` retorna exatamente `saldoAnterior`, sem alteração.
 *
 * @returns saldo anterior + soma de todos os valores de `lancamentos`, em reais.
 */
export function calcularSaldoCalculado(saldoAnterior: number, lancamentos: Lancamento[]): number {
  const somaCentavos = lancamentos.reduce((acc, lancamento) => acc + paraCentavos(lancamento.valor), 0)

  return (paraCentavos(saldoAnterior) + somaCentavos) / 100
}

/** Cada termo aceita apenas dígitos com vírgula decimal opcional (convenção BR), sem ponto/sinal. */
const REGEX_TERMO_SOMA_INLINE = /^\d+(,\d+)?$/

/**
 * Interpreta o texto do campo "aplicações" do form de rendimentos (ver ADR `rendimentos`, Decisão 4):
 * o usuário digita valores separados por `+` (ex.: `"1000+500+200"`), representando N aplicações
 * (caixinhas, porquinhos, cofrinhos), e a função devolve a soma.
 *
 * Função pura, sem I/O, que NUNCA lança exceção — entradas malformadas (termo vazio, não-numérico, ou
 * string vazia/só espaços) retornam `valido: false`. O flag `valido` é o sinal que a UI (Task 10) usa
 * para o feedback visual por cor (estilo Excel) que a Decisão 4 pede.
 *
 * Um único valor sem `+` é uma soma válida de 1 termo. Vírgula é aceita como separador decimal por
 * termo; ponto e separador de milhar não são aceitos. Soma em centavos inteiros antes de converter de
 * volta para reais, mesmo cuidado de `calcularSaldoCalculado`/`vr.ts`/`deteccoes.ts`.
 */
export function parsearSomaInline(texto: string): { valor: number | null; valido: boolean } {
  const termos = texto.split('+').map((termo) => termo.trim())

  if (termos.some((termo) => termo === '' || !REGEX_TERMO_SOMA_INLINE.test(termo))) {
    return { valor: null, valido: false }
  }

  const somaCentavos = termos.reduce(
    (acc, termo) => acc + Math.round(Number(termo.replace(',', '.')) * 100),
    0,
  )

  return { valor: somaCentavos / 100, valido: true }
}

/** Taxa razoável CHUMBADA em 5% ao mês, aplicada sobre o saldo informado (ver ADR `rendimentos`, Decisão 5). */
const LIMIAR_SANITY_CHECK = 0.05

// TODO: mecanismo PRECISO de sanity check, descartado nesta spec (ver ADR `rendimentos`, Decisão 5):
// reconstruir o saldo dia a dia (por DIA ÚTIL) a partir do saldo anterior (B5) + os lançamentos do grid
// ordenados por data, e aplicar uma taxa a.d.u. razoável (~120% CDI, "taxa over" como as casas bancárias
// usam) sobre o saldo de cada dia útil, somando o rendimento esperado acumulado — para então comparar esse
// rendimento esperado (dia a dia) com a diferença real (saldo_informado - saldo_calculado), em vez de um
// único limiar percentual sobre o snapshot final de saldo.
// Por que o limiar de 5% chumbado abaixo é aproximação grosseira: o saldo informado é um snapshot de FIM
// DE MÊS — no cenário típico do usuário (salário entra dia 5, sai dia 25), o saldo final e as aplicações
// ficam baixos, mas muito dinheiro passou pela conta e rendeu enquanto esteve lá durante o mês. Um limiar
// sobre o saldo final subestima o rendimento esperado nesse padrão de fluxo (falsos positivos de "over").
// Implementar o mecanismo diário×CDI exigiria uma fonte de taxa — NUNCA via API/rede (violaria o
// invariante 100% client-side/zero-rede, `Docs/ARCHITECTURE.md`); uma spec futura pode resolver isso com
// uma taxa configurável localmente pelo usuário, sem chamada externa.

/**
 * Avalia se o rendimento estimado (a diferença entre saldo informado e saldo calculado) excede a taxa
 * razoável chumbada de 5% ao mês sobre o saldo informado — um sinal de que provavelmente falta um
 * lançamento no grid (ex.: extrato não importado), não necessariamente um erro (ver ADR `rendimentos`,
 * Decisão 5). Função pura, sem I/O, meramente informativa (não bloqueia o fluxo do form, T10).
 *
 * @param diferenca diferença entre saldo informado e saldo calculado (saldoInformado - saldoCalculado).
 * @param saldoInformado saldo informado pelo usuário no form (conta corrente + aplicações).
 * @returns `{ over: true }` quando `diferenca` excede estritamente `saldoInformado * LIMIAR_SANITY_CHECK`.
 */
export function avaliarSanityCheck(diferenca: number, saldoInformado: number): { over: boolean } {
  return { over: diferenca > saldoInformado * LIMIAR_SANITY_CHECK }
}

/**
 * Retorna o último dia do mês de `mesRef` (`YYYY-MM`) no formato `YYYY-MM-DD`, sem passar por
 * `Date` (evita drift de fuso horário). Replicada localmente a partir da mesma função privada já
 * existente em `vr.ts` (não exportada de lá — importar exigiria ampliar a superfície pública de um
 * módulo fora das `Áreas tocadas` desta task); mesmo padrão já adotado para `paraCentavos` acima.
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

/** Descrição fixa do lançamento sintético de rendimentos, sem I/O nem interação do usuário. */
const DESCRICAO_RR = 'Rendimento de aplicações (RR)'

/**
 * Decide o desfecho do cálculo de rendimentos (ver ADR `rendimentos`, Decisão 6): quando o saldo
 * informado pelo usuário no form (`FormRendimentos`, T10) é maior ou igual ao saldo calculado a
 * partir do saldo anterior + lançamentos do grid (`calcularSaldoCalculado`, T5), a diferença é
 * lançada como 1 lançamento sintético de natureza `"RR"`. Quando o saldo calculado excede o
 * informado (diferença negativa), nenhum lançamento é produzido — o sinal é tratado como um
 * lançamento faltando no grid, a ser resolvido por conciliação manual do usuário, não como um
 * "rendimento negativo" (orientação ao usuário é responsabilidade da UI, T10, não desta função).
 *
 * Função pura, sem I/O. Soma em centavos inteiros antes de converter de volta para reais, mesmo
 * cuidado de `calcularSaldoCalculado`/`parsearSomaInline` acima. O objeto de lançamento retornado
 * não tem campo `id` — atribuição é responsabilidade exclusiva de quem aplica a mutação
 * (`avisosSlice.aplicar`, verbo `'adicionar'`, via `atribuirIds`).
 *
 * @param saldoCalculado saldo anterior + soma dos lançamentos do grid (`calcularSaldoCalculado`).
 * @param saldoInformado saldo real informado pelo usuário no form (conta corrente + aplicações).
 * @param mesRef mês de referência corrente, formato `YYYY-MM`.
 * @returns `{ tipo: 'lancamento', lancamento }` quando `saldoInformado >= saldoCalculado` (inclui
 *   diferença zero); `{ tipo: 'diferenca-negativa' }` caso contrário, sem nenhum lançamento.
 */
export function gerarLancamentoRendimento(
  saldoCalculado: number,
  saldoInformado: number,
  mesRef: string,
): { tipo: 'lancamento'; lancamento: Omit<Lancamento, 'id'> } | { tipo: 'diferenca-negativa' } {
  const diferencaCentavos = paraCentavos(saldoInformado) - paraCentavos(saldoCalculado)

  if (diferencaCentavos < 0) {
    return { tipo: 'diferenca-negativa' }
  }

  const data = ultimoDiaDoMes(mesRef)

  return {
    tipo: 'lancamento',
    lancamento: {
      fonte: 'form_rendimentos',
      data,
      transcricao: DESCRICAO_RR,
      valor: diferencaCentavos / 100,
      iniciais: '',
      natureza: 'RR',
      descricao: DESCRICAO_RR,
    },
  }
}

/**
 * Detecta a oportunidade de lançar rendimentos do mês (ver ADR `rendimentos`, Decisão 2).
 *
 * Mesmo padrão do detector `'vr'` (`detectarVR`, `src/dominio/vr.ts`, ADR `vr-despesas`, Decisão 5):
 * SEMPRE devolve exatamente 1 `Aviso` de convite, independente do conteúdo de `lancamentos`
 * (inclusive `[]`) — a origem dos dados de rendimentos (saldos informados pelo usuário no
 * `FormRendimentos`, Task 10) é inteiramente manual, sem nenhum indício nos lançamentos importados
 * a detectar.
 *
 * O aviso não carrega `mutacaoProposta`: a mutação (verbo `'adicionar'`, reusando o padrão do VR)
 * só é construída no submit do formulário `FormRendimentos` (Task 10), a partir do lançamento que
 * `gerarLancamentoRendimento` produzir — a detecção pura não antecipa esse conteúdo.
 *
 * `lancamentos`/`contexto` seguem o contrato `FuncaoDeteccao` (`src/dominio/registry.ts`) para
 * poder ser registrada diretamente no array `detectores`, mas nenhum dos dois é lido pelo corpo da
 * função — prefixados com `_` para respeitar `noUnusedParameters` do projeto.
 *
 * @returns Sempre um array com exatamente 1 `Aviso` (`origem:'rendimentos'`, `tipo:'proposta'`,
 *   `estado:'pendente'`, sem `mutacaoProposta`).
 */
export function detectarRendimentos(_lancamentos: Lancamento[], _contexto?: ContextoDeteccao): Aviso[] {
  return [
    {
      id: 'rendimentos',
      tipo: 'proposta',
      origem: 'rendimentos',
      mensagem: 'Lançar rendimentos do mês? Clique para informar os saldos.',
      alvo: [],
      permanece: [],
      estado: 'pendente',
    },
  ]
}
