// ADR: see spec/mvp-vertical-nubank.adr.md

import { extratoNubank, ErroArquivoNaoReconhecido } from './extrato_nubank'
import type { ResultadoParse } from './extrato_nubank'

/**
 * Contrato de um parser de extrato/fatura bancária.
 *
 * `aceita` é o discriminador de formato: deve ser barato (lê apenas o cabeçalho).
 * `parsear` produz o resultado em modo best-effort (D6 do ADR).
 */
export interface Parser {
  aceita(conteudo: string): boolean
  parsear(conteudo: string): ResultadoParse
}

/** Registro de parsers disponíveis. Estender aqui para novos bancos/formatos (D3 do ADR). */
const parsers: Parser[] = [extratoNubank]

/**
 * Retorna o parser adequado para o conteúdo fornecido.
 * Lança ErroArquivoNaoReconhecido se nenhum parser aceitar o conteúdo.
 */
export function detectar(conteudo: string): Parser {
  const parser = parsers.find(p => p.aceita(conteudo))
  if (!parser) {
    throw new ErroArquivoNaoReconhecido(
      'Nenhum parser reconhece o formato do arquivo fornecido.',
    )
  }
  return parser
}

export { ErroArquivoNaoReconhecido } from './extrato_nubank'
