// ADR: see spec/fundacao-operacoes.adr.md

/**
 * Contador incremental do id serial de nascimento (ver ADR `fundacao-operacoes`,
 * Decisão 2). Estado de módulo — vive pela duração de uma sessão do app (um
 * carregamento de página), incrementado a cada lançamento atribuído por qualquer
 * parser, independente do arquivo de origem. Nunca decrementado nem recalculado.
 */
let proximoId = 1

/**
 * Atribui o próximo id serial de nascimento a cada item da lista, na ordem em que
 * aparecem. Ponto central único reutilizado por todos os parsers (`src/parsers/*.ts`)
 * — nenhum parser mantém seu próprio contador.
 *
 * Deve ser chamado apenas sobre os lançamentos finais de um parse (após qualquer
 * deduplicação), nunca sobre linhas que serão descartadas — do contrário ids seriam
 * consumidos por lançamentos que nunca chegam a existir.
 */
export function atribuirIds<T extends object>(itens: T[]): (T & { id: number })[] {
  return itens.map(item => ({ ...item, id: proximoId++ }))
}

/**
 * Reseta o contador para 1. Uso restrito a isolamento entre testes — nenhum código
 * de produção deve chamar esta função (o contador nunca é recalculado numa sessão real).
 */
export function reiniciarContadorIds(): void {
  proximoId = 1
}
