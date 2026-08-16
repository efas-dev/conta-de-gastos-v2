// ADR: see Docs/specs/dominio-transferencia-investimento-iniciais.adr.md
// ADR: see spec/fundacao-operacoes.adr.md

import type { Aviso, Lancamento } from '../types'

/**
 * Detecta se um lançamento corresponde a uma operação de investimento de renda fixa.
 *
 * Regra de detecção (Decisão 5 do ADR):
 * - Palavras explícitas `APLICACAO` ou `RESGATE` na `transcricao` (case-insensitive) determinam
 *   o tipo diretamente, independentemente do sinal do valor.
 * - Palavras genéricas `RDB` ou `CDB` na `transcricao` são desambiguadas pelo sinal do valor:
 *   negativo → `'aplicacao'`; positivo → `'resgate'`.
 * - Quando há conflito entre palavra explícita e sinal do valor, a palavra vence.
 * - Lançamentos sem palavras-chave retornam `null`.
 *
 * @param lancamento - Lançamento financeiro normalizado
 * @returns `'aplicacao'`, `'resgate'` ou `null`
 */
export function detectarInvestimento(lancamento: Lancamento): 'aplicacao' | 'resgate' | null {
  const texto = lancamento.transcricao.toUpperCase()

  // Palavras explícitas: determinam o tipo independentemente do sinal
  if (texto.includes('APLICACAO')) return 'aplicacao'
  if (texto.includes('RESGATE')) return 'resgate'

  // Palavras genéricas: desambiguadas pelo sinal do valor
  if (texto.includes('RDB') || texto.includes('CDB')) {
    return lancamento.valor < 0 ? 'aplicacao' : 'resgate'
  }

  return null
}

/** Converte um valor em reais para centavos inteiros, evitando float drift. */
function paraCentavos(valor: number): number {
  return Math.round(valor * 100)
}

/** Formata centavos inteiros como reais em pt-BR (vírgula decimal), sem o prefixo "R$". */
function formatarReais(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Rótulo exibido na mensagem/resumo da proposta, por tipo de operação de investimento. */
const ROTULO_INVESTIMENTO: Record<'aplicacao' | 'resgate', string> = {
  aplicacao: 'Aplicação de investimento detectada',
  resgate: 'Resgate de investimento detectado',
}

/** Concorda número e substantivo: `2, 'resgate'` → `"2 resgates"`. */
function pluralizar(quantidade: number, singular: string, plural: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : plural}`
}

/**
 * Detecta, entre `lancamentos`, as linhas de aplicação/resgate de investimento (via
 * `detectarInvestimento`) e gera UMA única proposta de remoção cobrindo todas elas —
 * mesma paridade de detecção do call-site legado (`detectarInvestimento` não muda),
 * emitindo `Aviso` com `mutacaoProposta` (verbo `'remover'`, ver ADR `fundacao-operacoes`,
 * Decisão 4), aplicável/desfazível via o caminho genérico do `avisosSlice` (T03).
 *
 * Agregação (2026-08-09, a pedido do usuário): antes cada movimentação virava um aviso,
 * e um extrato real com 7 idas e vindas de RDB enchia a fila com 7 cartões que o usuário
 * despachava um a um. São sempre a mesma decisão ("isso não é gasto, tire da planilha"),
 * então viraram um cartão só. `Mutacao` já aceitava `alvo: number[]` — nada no slice
 * precisou mudar.
 *
 * `mutacaoProposta.alvo` usa `Lancamento.id` (não índice posicional) — o `Aviso` mira
 * exatamente os lançamentos que o originaram, independentemente de reordenação/fatiamento
 * posterior. `alvo`/`permanece` legados (`string[]`) também são populados (ids como string)
 * para compatibilidade com os consumidores existentes de `Aviso.alvo` que só leem sua
 * contagem (`CentralDeAvisos.tsx`, `BannerInspecao.tsx`) — `investimento` não integra
 * `ORIGENS_COM_EFEITO_GRID` de `ReviewGrid.tsx`, então não depende de `alvo` ser índice
 * posicional.
 *
 * Não muta `lancamentos` nem os objetos `Lancamento` recebidos — função pura, mesma
 * disciplina de `detectarInvestimento` e dos detectores de `src/dominio/deteccoes.ts`.
 *
 * @param lancamentos - Lista de lançamentos a inspecionar.
 * @returns Array com exatamente um `Aviso` proposta cobrindo todas as movimentações
 * encontradas; array vazio se não houver nenhuma.
 */
export function detectarInvestimentoAvisos(lancamentos: Lancamento[]): Aviso[] {
  const movimentacoes = lancamentos
    .map((lancamento) => ({ lancamento, tipo: detectarInvestimento(lancamento) }))
    .filter((m): m is { lancamento: Lancamento; tipo: 'aplicacao' | 'resgate' } => m.tipo !== null)

  if (movimentacoes.length === 0) return []

  const ids = movimentacoes.map(({ lancamento }) => lancamento.id!)
  const aplicacoes = movimentacoes.filter(({ tipo }) => tipo === 'aplicacao')
  const resgates = movimentacoes.filter(({ tipo }) => tipo === 'resgate')

  const somar = (grupo: typeof movimentacoes): number =>
    grupo.reduce((acc, { lancamento }) => acc + Math.abs(paraCentavos(lancamento.valor)), 0)

  // Caso de uma movimentação só: identificar a linha pela transcrição é mais útil que
  // anunciar "1 movimentação". A partir de duas, a transcrição de uma delas não
  // representaria o conjunto — a contagem por tipo comunica melhor o que será removido.
  const mensagem =
    movimentacoes.length === 1
      ? `${ROTULO_INVESTIMENTO[movimentacoes[0].tipo]}: "${movimentacoes[0].lancamento.transcricao}" ` +
        `(R$ ${formatarReais(somar(movimentacoes))}).`
      : `${movimentacoes.length} movimentações de investimento: ` +
        `${pluralizar(aplicacoes.length, 'aplicação', 'aplicações')} e ` +
        `${pluralizar(resgates.length, 'resgate', 'resgates')}.`

  const partesResumo: string[] = []
  if (aplicacoes.length > 0) {
    partesResumo.push(
      `${pluralizar(aplicacoes.length, 'aplicação', 'aplicações')}, R$ ${formatarReais(somar(aplicacoes))}`,
    )
  }
  if (resgates.length > 0) {
    partesResumo.push(
      `${pluralizar(resgates.length, 'resgate', 'resgates')}, R$ ${formatarReais(somar(resgates))}`,
    )
  }

  return [
    {
      // Id fixo: o detector emite no máximo um aviso por rodada, e o registry re-roda
      // tudo do zero a cada "produzir" (D8 do ADR `fundacao-operacoes`).
      id: 'investimento',
      tipo: 'proposta',
      origem: 'investimento',
      mensagem,
      alvo: ids.map(String),
      permanece: [],
      resumo:
        `${partesResumo.join(' · ')}. Aplicar e resgatar não é gasto nem receita: o dinheiro ` +
        `só muda de lugar entre as suas contas. Aprovar remove ` +
        `${movimentacoes.length === 1 ? 'a linha' : `as ${movimentacoes.length} linhas`} da planilha.`,
      estado: 'pendente',
      mutacaoProposta: { verbo: 'remover', alvo: ids },
    },
  ]
}
