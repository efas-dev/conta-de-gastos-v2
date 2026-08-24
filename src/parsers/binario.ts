// ADR: see spec/fatura-itau-xlsx.adr.md

import type { ResultadoParse } from '../types'

/**
 * Contrato de um parser de arquivo binário (ex.: `.xlsx`).
 *
 * Irmão conceitual de `Parser` (`src/parsers/index.ts`), mesma forma
 * `aceita`/`parsear`, agora sobre `Uint8Array` em vez de `string` — a leitura de
 * um `.xlsx` exige bytes, não texto (Decisão 3 do ADR desta spec). Não altera o
 * contrato `Parser` de texto nem os 5 parsers existentes em `src/parsers/index.ts`.
 */
export interface ParserBinario {
  aceita(bytes: Uint8Array): boolean
  parsear(bytes: Uint8Array): ResultadoParse
}

/**
 * Registro de parsers binários disponíveis, array irmão de `parsers`
 * (`src/parsers/index.ts`), dentro do mesmo diretório `src/parsers/` (Decisão 3
 * do ADR desta spec) — não é um terceiro registry, é uma variação do mesmo ponto
 * de extensão comunitário.
 *
 * Vazio nesta task: os parsers binários concretos (ex.: `fatura_itau_cc`) são
 * entregues por tasks futuras/paralelas desta mesma spec.
 */
export const parsersBinarios: ParserBinario[] = []
