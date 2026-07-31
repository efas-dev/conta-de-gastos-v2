// ADR: see Docs/specs/avisos-acionaveis.adr.md

import { describe, it, expect } from 'vitest'
import { detectarValorPendente, detectarConciliacao } from '../deteccoes'
import type { Lancamento } from '../../types'

function lancamento(overrides: Partial<Lancamento>): Lancamento {
  return {
    fonte: 'fatura_nubank_cc',
    data: '2026-06-15',
    transcricao: 'Compra genérica',
    valor: -50,
    iniciais: '',
    natureza: '',
    descricao: '',
    ...overrides,
  }
}

describe('detectarValorPendente', () => {
  it('retorna aviso proposta para transcrição "Valor pendente do mês anterior" (TL-1, TL-14, TL-16)', () => {
    const excluidos = [lancamento({ transcricao: 'Valor pendente do mês anterior', valor: -120.5 })]
    const avisos = detectarValorPendente(excluidos)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].tipo).toBe('proposta')
    expect(avisos[0].origem).toBe('valor-pendente')
    expect(avisos[0].estado).toBe('pendente')
  })

  it('alvo vazio — não há linha física em lancamentos para remover (TL-15)', () => {
    const excluidos = [lancamento({ transcricao: 'Valor pendente do mês anterior', valor: -120.5 })]
    const avisos = detectarValorPendente(excluidos)
    expect(avisos[0].alvo).toEqual([])
  })

  it('ignora lançamentos com outra transcrição, ex. "Pagamento recebido" (TL-2)', () => {
    const excluidos = [lancamento({ transcricao: 'Pagamento recebido', valor: 300 })]
    expect(detectarValorPendente(excluidos)).toHaveLength(0)
  })

  it('retorna array vazio quando excluidosPendentes está vazio (TL-3)', () => {
    expect(detectarValorPendente([])).toEqual([])
  })

  it('casamento é NFD+lowercase — ignora acentuação e caixa (TL-4)', () => {
    const excluidos = [lancamento({ transcricao: 'VALOR PENDENTE DO MES ANTERIOR' })]
    expect(detectarValorPendente(excluidos)).toHaveLength(1)
  })

  it('mantém resumo undefined — não há regra de tolerância nesse caminho (TL-9)', () => {
    const excluidos = [lancamento({ transcricao: 'Valor pendente do mês anterior', valor: -120.5 })]
    const avisos = detectarValorPendente(excluidos)
    expect(avisos[0].resumo).toBeUndefined()
  })
})

describe('detectarConciliacao', () => {
  it('casamento total dentro da tolerância de R$ 0,05 gera proposta única (TL-5)', () => {
    const fatura = [
      lancamento({ transcricao: 'Item A', valor: -100 }),
      lancamento({ transcricao: 'Item B', valor: -50.3 }),
    ]
    const extrato = [
      lancamento({ transcricao: 'Pagamento de fatura', valor: -150.32 }), // diff 0.02, dentro da tolerância
      lancamento({ transcricao: 'Outro débito qualquer', valor: -999 }),
    ]
    const avisos = detectarConciliacao(fatura, extrato)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].tipo).toBe('proposta')
    expect(avisos[0].origem).toBe('conciliacao')
    expect(avisos[0].alvo).toEqual(['0'])
  })

  it('fallback subset-sum: soma total não bate, mas subconjunto exato bate ao centavo (TL-6)', () => {
    const fatura = [
      lancamento({ transcricao: 'Item A', valor: -100 }),
      lancamento({ transcricao: 'Item B', valor: -50.3 }),
      lancamento({ transcricao: 'Item C', valor: -30 }),
    ]
    // soma total = -180.30; nenhum candidato do extrato bate nisso.
    // subconjunto [Item A, Item C] = -130.00 bate exatamente com o pagamento parcial abaixo.
    const extrato = [
      lancamento({ transcricao: 'Pagamento de fatura (parcial)', valor: -130 }),
      lancamento({ transcricao: 'Outro débito qualquer', valor: -999 }),
    ]
    const avisos = detectarConciliacao(fatura, extrato)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].tipo).toBe('proposta')
    expect(avisos[0].origem).toBe('conciliacao')
    expect(avisos[0].alvo).toEqual(['0'])
  })

  it('ambiguidade: 2+ candidatos dentro da tolerância → nenhuma proposta (TL-7)', () => {
    const fatura = [lancamento({ transcricao: 'Item A', valor: -200 })]
    const extrato = [
      lancamento({ transcricao: 'Pagamento de fatura', valor: -200.01 }),
      lancamento({ transcricao: 'Pagamento de fatura (duplicado)', valor: -199.99 }),
    ]
    expect(detectarConciliacao(fatura, extrato)).toEqual([])
  })

  it('sem casamento algum gera aviso informativo "fatura não conciliada" (TL-8)', () => {
    const fatura = [lancamento({ transcricao: 'Item A', valor: -200 })]
    const extrato = [lancamento({ transcricao: 'Outro débito qualquer', valor: -999 })]
    const avisos = detectarConciliacao(fatura, extrato)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].tipo).toBe('informativo')
    expect(avisos[0].mensagem).toContain('fatura não conciliada')
  })

  it('casamento total: permanece contém todos os ids da fatura e resumo formatado (TL-10)', () => {
    const fatura = [
      lancamento({ transcricao: 'Item A', valor: -100 }),
      lancamento({ transcricao: 'Item B', valor: -50.3 }),
    ]
    const extrato = [
      lancamento({ transcricao: 'Pagamento de fatura', valor: -150.32 }),
      lancamento({ transcricao: 'Outro débito qualquer', valor: -999 }),
    ]
    const avisos = detectarConciliacao(fatura, extrato)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].permanece).toEqual(['0', '1'])
    expect(avisos[0].resumo).toBe(
      'somatório da fatura R$ 150,30 ↔ pagamento R$ 150,32, diferença ≤ R$ 0,05',
    )
  })

  it('fallback subset-sum: permanece contém só os ids do subconjunto casado e resumo correspondente (TL-11)', () => {
    const fatura = [
      lancamento({ transcricao: 'Item A', valor: -100 }),
      lancamento({ transcricao: 'Item B', valor: -50.3 }),
      lancamento({ transcricao: 'Item C', valor: -30 }),
    ]
    const extrato = [
      lancamento({ transcricao: 'Pagamento de fatura (parcial)', valor: -130 }),
      lancamento({ transcricao: 'Outro débito qualquer', valor: -999 }),
    ]
    const avisos = detectarConciliacao(fatura, extrato)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].permanece).toEqual(['0', '2'])
    expect(avisos[0].resumo).toBe(
      'somatório da fatura R$ 130,00 ↔ pagamento R$ 130,00, diferença ≤ R$ 0,05',
    )
  })

  it('sem casamento: permanece vazio e resumo undefined (TL-12)', () => {
    const fatura = [lancamento({ transcricao: 'Item A', valor: -200 })]
    const extrato = [lancamento({ transcricao: 'Outro débito qualquer', valor: -999 })]
    const avisos = detectarConciliacao(fatura, extrato)
    expect(avisos[0].permanece).toEqual([])
    expect(avisos[0].resumo).toBeUndefined()
  })
})
