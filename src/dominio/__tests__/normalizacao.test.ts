// ADR: see Docs/specs/mvp-vertical-nubank.adr.md

import { describe, it, expect } from 'vitest'
import { normalizarChave, normalizarParaBusca, canonizarChave } from '../normalizacao'

describe('normalizarChave', () => {
  it('TL-01: remove sufixo DD/MM no final da transcrição', () => {
    expect(normalizarChave('PAG BOLETO ENERGIA 12/03')).toBe('PAG BOLETO ENERGIA')
  })

  it('TL-02: não altera transcrição sem sufixo de data', () => {
    expect(normalizarChave('Transferência recebida pelo Pix - Salário')).toBe(
      'Transferência recebida pelo Pix - Salário',
    )
  })

  it('TL-03: retorna string vazia para entrada vazia', () => {
    expect(normalizarChave('')).toBe('')
  })

  it('TL-04: remove sufixo DD/MM/AAAA no final da transcrição', () => {
    expect(normalizarChave('COMPRA 15/06/2025')).toBe('COMPRA')
  })

  it('TL-05: não remove data que não está no final da transcrição', () => {
    expect(normalizarChave('PAG BOLETO 12/03 ENERGIA')).toBe('PAG BOLETO 12/03 ENERGIA')
  })

  // TL-T5-07: regressão — normalizarChave preserva caixa e acentos (não foi alterada por T1)
  it('TL-06: preserva caixa original e acentos — não faz normalização além de remover data', () => {
    expect(normalizarChave('Café da Manhã')).toBe('Café da Manhã')
  })

  // -------------------------------------------------------------------------
  // T02 (spec dicionario-chave-canonica, D6): paridade com o regex do legado
  // `\s*D?\d{2}/\d{2}(/\d{2,4})?\s*$`. O regex anterior exigia `\s+` antes da
  // data e não previa o `D`, então não limpava nada no extrato Itaú — que
  // trunca o nome em largura fixa e cola a data sem espaço.
  // -------------------------------------------------------------------------

  it('TL-07: remove data colada sem espaço (Itaú trunca o nome em largura fixa)', () => {
    expect(normalizarChave('PIX TRANSF HENRIQU04/05')).toBe('PIX TRANSF HENRIQU')
  })

  it('TL-08: remove data colada precedida de `D` (inicial do sobrenome truncado)', () => {
    expect(normalizarChave('PIX TRANSF CESAR D13/06')).toBe('PIX TRANSF CESAR')
  })

  it('TL-09: remove sufixo de data com ano de 2 dígitos', () => {
    expect(normalizarChave('COMPRA 15/06/25')).toBe('COMPRA')
  })

  it('TL-10: apara espaços nas bordas, como o `.strip()` do legado', () => {
    expect(normalizarChave('  PADARIA CENTRAL  ')).toBe('PADARIA CENTRAL')
  })
})

// ---------------------------------------------------------------------------
// canonizarChave — T03 (spec dicionario-chave-canonica, F1/D13/D22)
// ---------------------------------------------------------------------------

describe('canonizarChave', () => {
  it('CAN-01: mascara o número da parcela preservando o total', () => {
    expect(canonizarChave('Autohubservice - Parcela 2/4')).toEqual({
      chave: 'Autohubservice - Parcela #/4',
      afrouxadaPorParcela: true,
    })
  })

  it('CAN-02: parcelas distintas da mesma compra convergem para a mesma chave', () => {
    expect(canonizarChave('Asaasip*Losango Servi - Parcela 5/6').chave).toBe(
      canonizarChave('Asaasip*Losango Servi - Parcela 6/6').chave,
    )
  })

  it('CAN-03: aceita a variação por extenso "N de M"', () => {
    expect(canonizarChave('Loja X - Parcela 1 de 6')).toEqual({
      chave: 'Loja X - Parcela #/6',
      afrouxadaPorParcela: true,
    })
  })

  it('CAN-04: normaliza zero à esquerda no total, para não criar duas formas', () => {
    expect(canonizarChave('Loja X - Parcela 02/04').chave).toBe('Loja X - Parcela #/4')
  })

  it('CAN-05: a regra de parcela roda ANTES da de data — `02/04` não é confundido com data', () => {
    // Sem a ordem correta, `\s*D?\d{2}/\d{2}\s*$` comeria o "02/04" e sobraria
    // "Loja X - Parcela", colapsando planos de parcelamento diferentes.
    expect(canonizarChave('Loja X - Parcela 02/04').chave).toContain('#/4')
  })

  it('CAN-06: transcrição sem parcela não é marcada como afrouxada', () => {
    expect(canonizarChave('PIX TRANSF HENRIQU04/05')).toEqual({
      chave: 'PIX TRANSF HENRIQU',
      afrouxadaPorParcela: false,
    })
  })

  it('CAN-07: D13 — canonização que esvazia a chave cai de volta na transcrição original', () => {
    expect(canonizarChave('01/05')).toEqual({
      chave: '01/05',
      afrouxadaPorParcela: false,
    })
  })

  it('CAN-08: D13 — fallback também vale para transcrição que é só uma data com `D`', () => {
    expect(canonizarChave('D01/05').chave).toBe('D01/05')
  })

  it('CAN-09: exige a palavra "Parcela" — `N/M` solto não é mascarado', () => {
    // Conservador por desenho: "Loja 2/4" é indistinguível de uma data e o
    // legado nunca tratou esse caso.
    expect(canonizarChave('Loja X - Item 3 de 7').afrouxadaPorParcela).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// D15 — `normalizarParaBusca` NÃO herda a canonização de parcela
// ---------------------------------------------------------------------------

describe('normalizarParaBusca × canonizarChave (D15)', () => {
  it('D15-01: normalizarParaBusca não mascara parcela — opera sobre descrições, não transcrições', () => {
    // `calcularSugestoes` passa por aqui o texto digitado e os valores de
    // natureza/descrição/iniciais. Mascarar "parcela" mutilaria descrição
    // legítima escrita pelo usuário.
    expect(normalizarParaBusca('Curso Anual - Parcela 2/6')).toBe('curso anual - parcela 2/6')
  })

  it('D15-02: normalizarParaBusca herda a correção de data (T02), e só ela', () => {
    expect(normalizarParaBusca('PIX TRANSF HENRIQU04/05')).toBe('pix transf henriqu')
  })
})

// ---------------------------------------------------------------------------
// normalizarParaBusca — regressão T1 (thin wrapper adicionado em T1)
// ---------------------------------------------------------------------------

describe('normalizarParaBusca', () => {
  // TL-T5-06: converte para minúsculas e remove acentos
  it('REG-01: converte para minúsculas', () => {
    expect(normalizarParaBusca('PADARIA CENTRAL')).toBe('padaria central')
  })

  it('REG-02: remove acentos', () => {
    expect(normalizarParaBusca('Café')).toBe('cafe')
  })

  it('REG-03: combina remoção de data + minúsculas + sem acentos', () => {
    expect(normalizarParaBusca('PAG BOLETO ENERGIA 12/03')).toBe('pag boleto energia')
  })

  it('REG-04: string vazia retorna string vazia', () => {
    expect(normalizarParaBusca('')).toBe('')
  })
})
