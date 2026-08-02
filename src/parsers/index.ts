// ADR: see Docs/specs/mvp-vertical-nubank.adr.md
// ADR: see Docs/specs/parsers-fatura-nubank-extrato-itau.adr.md

import { extratoNubank, ErroArquivoNaoReconhecido } from './extrato_nubank'
import type { ResultadoParse } from '../types'
import { faturaNumbank } from './fatura_nubank'
import { extratoItau } from './extrato_itau'
import { extratoInter } from './extrato_inter'
import { extratoBb } from './extrato_bb'

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

/**
 * Registro de parsers disponíveis. Estender aqui para novos bancos/formatos (D3 do ADR).
 *
 * Ordem: os `aceita()` são mutuamente exclusivos por cabeçalho/padrão estrutural distintos,
 * com uma exceção defensiva: uma linha de dados do Inter casa o regex estrutural do Itaú
 * (capturando o saldo como valor) — hoje o preâmbulo do Inter impede a colisão, mas
 * extrato_inter vem ANTES de extrato_itau para que a detecção pelo header explícito
 * vença caso essa premissa mude. extrato_nubank vem primeiro por ser o parser original.
 */
const parsers: Parser[] = [extratoNubank, faturaNumbank, extratoInter, extratoBb, extratoItau]

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
