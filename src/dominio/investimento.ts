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

/**
 * Detecta, entre `lancamentos`, as linhas de aplicação/resgate de investimento (via
 * `detectarInvestimento`) e gera uma proposta de remoção acionável para cada uma — mesma
 * paridade de detecção do call-site legado (`detectarInvestimento` não muda), mas agora
 * emitindo `Aviso` com `mutacaoProposta` (verbo `'remover'`, ver ADR `fundacao-operacoes`,
 * Decisão 4), aplicável/desfazível via o caminho genérico do `avisosSlice` (T03).
 *
 * `mutacaoProposta.alvo` usa `Lancamento.id` (não índice posicional) — cada `Aviso` mira
 * exatamente o lançamento que o originou, independentemente de reordenação/fatiamento
 * posterior. `alvo`/`permanece` legados (`string[]`) também são populados (id como string)
 * para compatibilidade com os consumidores existentes de `Aviso.alvo` que só leem sua
 * contagem (`CentralDeAvisos.tsx`, `BannerInspecao.tsx`) — `investimento` não integra
 * `ORIGENS_COM_EFEITO_GRID` de `ReviewGrid.tsx`, então não depende de `alvo` ser índice
 * posicional.
 *
 * Não muta `lancamentos` nem os objetos `Lancamento` recebidos — função pura, mesma
 * disciplina de `detectarInvestimento` e dos detectores de `src/dominio/deteccoes.ts`.
 *
 * @param lancamentos - Lista de lançamentos a inspecionar.
 * @returns Um `Aviso` proposta por linha de investimento encontrada; array vazio se nenhuma existir.
 */
export function detectarInvestimentoAvisos(lancamentos: Lancamento[]): Aviso[] {
  const avisos: Aviso[] = []

  for (const lancamento of lancamentos) {
    const tipo = detectarInvestimento(lancamento)
    if (tipo === null) continue

    const rotulo = ROTULO_INVESTIMENTO[tipo]
    const valorCentavos = Math.abs(paraCentavos(lancamento.valor))

    avisos.push({
      id: `investimento-${lancamento.id}`,
      tipo: 'proposta',
      origem: 'investimento',
      // Valor em pt-BR (vírgula decimal, separador de milhar) — o mesmo `formatarReais` do
      // `resumo` logo abaixo, para que os dois números do aviso não divirjam de formato.
      mensagem: `${rotulo}: "${lancamento.transcricao}" (R$ ${formatarReais(valorCentavos)}). Deseja remover esse lançamento?`,
      alvo: [String(lancamento.id)],
      permanece: [],
      resumo: `${rotulo}: R$ ${formatarReais(valorCentavos)}`,
      estado: 'pendente',
      mutacaoProposta: { verbo: 'remover', alvo: [lancamento.id] },
    })
  }

  return avisos
}
