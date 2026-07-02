// ADR: see Docs/specs/dominio-transferencia-investimento-iniciais.adr.md

import type { Lancamento } from '../../../../types'

/** Base de lançamento para reúso nos fixtures */
const base: Omit<Lancamento, 'transcricao' | 'valor'> = {
  fonte: 'Nubank',
  data: '2025-03-12',
  iniciais: 'ES',
  natureza: '',
  descricao: '',
}

/** TL-1: Open Banking — transferência entre contas próprias via Open Banking */
export const lancamentoOpenBanking: Lancamento = {
  ...base,
  transcricao: 'Transferência de Eduardo pelo Pix - Banco Inter Open Banking',
  valor: -500.0,
}

/** TL-2: Pagamento de fatura de cartão próprio */
export const lancamentoPagFatura: Lancamento = {
  ...base,
  transcricao: 'Pagamento de fatura Nubank',
  valor: -1200.0,
}

/** TL-3: Pagamento de fatura Itaú Black (padrão legado) */
export const lancamentoItauBlack: Lancamento = {
  ...base,
  fonte: 'Itau',
  transcricao: 'ITAU BLACK pagamento fatura',
  valor: -3000.0,
}

/** TL-4: Pix nominal — nome do usuário presente e casa com a transcrição */
export const lancamentoPixNominalMatch: Lancamento = {
  ...base,
  transcricao: 'Transferência enviada pelo Pix - Eduardo Santos',
  valor: -200.0,
}

/** TL-5: Pix nominal — nome presente mas transcrição não contém o nome */
export const lancamentoPixNominalNoMatch: Lancamento = {
  ...base,
  transcricao: 'Transferência enviada pelo Pix - João Silva',
  valor: -150.0,
}

/** TL-7: Lançamento comum — deve retornar false */
export const lancamentoComum: Lancamento = {
  ...base,
  transcricao: 'Restaurante Bom Sabor',
  valor: -85.0,
}

/** TL-8: Pix nominal case-insensitive — transcrição em minúsculas */
export const lancamentoPixNominalCaseInsensitive: Lancamento = {
  ...base,
  transcricao: 'Transferência enviada pelo Pix - eduardo santos',
  valor: -300.0,
}

/** TL-9: Transcrição vazia */
export const lancamentoTranscricaoVazia: Lancamento = {
  ...base,
  transcricao: '',
  valor: 0,
}
