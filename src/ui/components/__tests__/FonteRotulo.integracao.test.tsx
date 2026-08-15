// ADR: see spec/conciliacao-robusta.adr.md

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FonteRotulo } from '../FonteRotulo'
import { classificarFonte, classificarFontePorPrefixo } from '../../../dominio/mes'
import type { Lancamento } from '../../../types'

// ---------------------------------------------------------------------------
// Task 9 (spec conciliacao-robusta) — prova de integração `classificarFontePorPrefixo`
// (T1, D1 do ADR) × `FonteRotulo`: o rótulo visual renderizado tem que refletir a
// classificação AUTORITATIVA por prefixo em 100% dos casos, nunca a heurística por
// data `classificarFonte` (rebaixada a cross-check informativo por D1) — independente
// de `mesRef` estar alinhado ou desalinhado aos dados. Fixtures usam os prefixos reais
// declarados pelos parsers hoje existentes: `fatura_nubank_cc`, `extrato_nubank`,
// `extrato_inter`, `extrato_bb`, `extrato_itau`.
// ---------------------------------------------------------------------------

function lancamento(overrides: Partial<Lancamento> = {}): Lancamento {
  return {
    fonte: 'fatura_nubank_cc',
    data: '2026-06-10',
    transcricao: 'Compra',
    valor: -100,
    iniciais: 'ES',
    natureza: '',
    descricao: '',
    ...overrides,
  }
}

interface Caso {
  fonte: string
  tipoEsperado: 'fatura' | 'extrato'
  alinhamento: 'alinhado' | 'DESALINHADO'
  lancamentos: Lancamento[]
  mesRef: string
}

// Matriz: cada uma das 5 fontes reais, num cenário ALINHADO (heurística concorda com
// o prefixo) e num cenário DESALINHADO (heurística diverge do prefixo — o caso que
// motivou o bug F1). A prova de T9 é que `tipoEsperado` vence em ambos os cenários.
const casos: Caso[] = [
  {
    fonte: 'fatura_nubank_cc',
    tipoEsperado: 'fatura',
    alinhamento: 'alinhado',
    lancamentos: [lancamento({ fonte: 'fatura_nubank_cc', data: '2026-05-20' })],
    mesRef: '2026-06',
  },
  {
    fonte: 'fatura_nubank_cc',
    tipoEsperado: 'fatura',
    alinhamento: 'DESALINHADO',
    lancamentos: [lancamento({ fonte: 'fatura_nubank_cc', data: '2026-06-10' })],
    mesRef: '2026-06',
  },
  {
    fonte: 'extrato_nubank',
    tipoEsperado: 'extrato',
    alinhamento: 'alinhado',
    lancamentos: [lancamento({ fonte: 'extrato_nubank', data: '2026-06-10' })],
    mesRef: '2026-06',
  },
  {
    fonte: 'extrato_nubank',
    tipoEsperado: 'extrato',
    alinhamento: 'DESALINHADO',
    lancamentos: [lancamento({ fonte: 'extrato_nubank', data: '2026-05-01' })],
    mesRef: '2026-06',
  },
  {
    fonte: 'extrato_inter',
    tipoEsperado: 'extrato',
    alinhamento: 'alinhado',
    lancamentos: [lancamento({ fonte: 'extrato_inter', data: '2026-06-15' })],
    mesRef: '2026-06',
  },
  {
    fonte: 'extrato_inter',
    tipoEsperado: 'extrato',
    alinhamento: 'DESALINHADO',
    lancamentos: [lancamento({ fonte: 'extrato_inter', data: '2026-01-01' })],
    mesRef: '2026-06',
  },
  {
    fonte: 'extrato_bb',
    tipoEsperado: 'extrato',
    alinhamento: 'alinhado',
    lancamentos: [lancamento({ fonte: 'extrato_bb', data: '2026-06-20' })],
    mesRef: '2026-06',
  },
  {
    fonte: 'extrato_bb',
    tipoEsperado: 'extrato',
    alinhamento: 'DESALINHADO',
    lancamentos: [lancamento({ fonte: 'extrato_bb', data: '2026-02-01' })],
    mesRef: '2026-06',
  },
  {
    fonte: 'extrato_itau',
    tipoEsperado: 'extrato',
    alinhamento: 'alinhado',
    lancamentos: [lancamento({ fonte: 'extrato_itau', data: '2026-06-01' })],
    mesRef: '2026-06',
  },
  {
    fonte: 'extrato_itau',
    tipoEsperado: 'extrato',
    alinhamento: 'DESALINHADO',
    lancamentos: [lancamento({ fonte: 'extrato_itau', data: '2026-03-01' })],
    mesRef: '2026-06',
  },
]

describe('FonteRotulo — sem regressão de classificação (Task 9, D1 do ADR conciliacao-robusta)', () => {
  it.each(casos)(
    'TL9: fonte "$fonte" ($alinhamento) → rótulo "$tipoEsperado", independente da heurística por data',
    ({ fonte, tipoEsperado, lancamentos, mesRef }) => {
      const porPrefixo = classificarFontePorPrefixo(fonte)
      expect(porPrefixo).toBe(tipoEsperado)

      const { container } = render(<FonteRotulo fonte={fonte} tipo={porPrefixo} />)

      expect(screen.getByText(tipoEsperado)).toBeInTheDocument()
      const badgeEsperado = tipoEsperado === 'fatura' ? 'tipo fatura' : 'tipo extrato'
      expect(container.querySelector(`.tag-tipo[aria-label="${badgeEsperado}"]`)).toBeInTheDocument()

      // Referência muda de comportamento com mesRef/lancamentos só para provar, abaixo,
      // que os fixtures DESALINHADO de fato divergem — não usada para decidir o rótulo.
      void classificarFonte(fonte, lancamentos, mesRef)
    },
  )

  it('TL9-sanidade: casos marcados DESALINHADO de fato divergem da heurística por data — a prova não é vácua', () => {
    const desalinhados = casos.filter((c) => c.alinhamento === 'DESALINHADO')
    expect(desalinhados).toHaveLength(5)

    for (const c of desalinhados) {
      const porHeuristica = classificarFonte(c.fonte, c.lancamentos, c.mesRef)
      const porPrefixo = classificarFontePorPrefixo(c.fonte)
      expect(porHeuristica).not.toBe(porPrefixo)
    }
  })

  it('TL9-sanidade: casos marcados alinhado de fato concordam com a heurística por data', () => {
    const alinhados = casos.filter((c) => c.alinhamento === 'alinhado')
    expect(alinhados).toHaveLength(5)

    for (const c of alinhados) {
      const porHeuristica = classificarFonte(c.fonte, c.lancamentos, c.mesRef)
      const porPrefixo = classificarFontePorPrefixo(c.fonte)
      expect(porHeuristica).toBe(porPrefixo)
    }
  })
})
