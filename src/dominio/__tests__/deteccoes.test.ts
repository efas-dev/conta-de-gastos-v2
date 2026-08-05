// ADR: see Docs/specs/avisos-acionaveis.adr.md

import { describe, it, expect } from 'vitest'
import { detectarValorPendente, detectarPagamentoRecebido, detectarConciliacao } from '../deteccoes'
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
  it('localiza a linha via origemEspecial e emite alvo com o índice real em lancamentos (TL-1)', () => {
    const lancamentos = [
      lancamento({ transcricao: 'Compra qualquer' }),
      lancamento({ transcricao: 'Valor pendente do mês anterior', valor: -120.5, origemEspecial: 'valor-pendente' }),
    ]
    const avisos = detectarValorPendente(lancamentos)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].tipo).toBe('proposta')
    expect(avisos[0].origem).toBe('valor-pendente')
    expect(avisos[0].estado).toBe('pendente')
    expect(avisos[0].alvo).toEqual(['1'])
  })

  it('permanece vazio (TL-2)', () => {
    const lancamentos = [
      lancamento({ transcricao: 'Valor pendente do mês anterior', valor: -120.5, origemEspecial: 'valor-pendente' }),
    ]
    const avisos = detectarValorPendente(lancamentos)
    expect(avisos[0].permanece).toEqual([])
  })

  it('resumo carrega o valor formatado — D16 supera resumo undefined de T0/D10 (TL-3)', () => {
    const lancamentos = [
      lancamento({ transcricao: 'Valor pendente do mês anterior', valor: -120.5, origemEspecial: 'valor-pendente' }),
    ]
    const avisos = detectarValorPendente(lancamentos)
    expect(avisos[0].resumo).toBeDefined()
    expect(avisos[0].resumo).toContain('120,50')
  })

  it('retorna array vazio quando nenhum lançamento tem origemEspecial valor-pendente (TL-4)', () => {
    const lancamentos = [lancamento({ transcricao: 'Compra qualquer' })]
    expect(detectarValorPendente(lancamentos)).toEqual([])
    expect(detectarValorPendente([])).toEqual([])
  })

  it('aponta o índice real mesmo quando a linha marcada não é a primeira do array (TL-5)', () => {
    const lancamentos = [
      lancamento({ transcricao: 'Compra A' }),
      lancamento({ transcricao: 'Compra B' }),
      lancamento({ transcricao: 'Valor pendente do mês anterior', valor: -50, origemEspecial: 'valor-pendente' }),
    ]
    const avisos = detectarValorPendente(lancamentos)
    expect(avisos[0].alvo).toEqual(['2'])
  })

  it('não captura linha marcada como pagamento-recebido (TL-8)', () => {
    const lancamentos = [
      lancamento({ transcricao: 'Pagamento recebido', valor: 300, origemEspecial: 'pagamento-recebido' }),
    ]
    expect(detectarValorPendente(lancamentos)).toHaveLength(0)
  })
})

describe('detectarPagamentoRecebido', () => {
  it('localiza a linha via origemEspecial e emite alvo com o índice real em lancamentos (TL-6)', () => {
    const lancamentos = [
      lancamento({ transcricao: 'Compra qualquer' }),
      lancamento({ transcricao: 'Pagamento recebido', valor: 300, origemEspecial: 'pagamento-recebido' }),
    ]
    const avisos = detectarPagamentoRecebido(lancamentos)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].tipo).toBe('proposta')
    expect(avisos[0].origem).toBe('pagamento-recebido')
    expect(avisos[0].estado).toBe('pendente')
    expect(avisos[0].alvo).toEqual(['1'])
    expect(avisos[0].permanece).toEqual([])
    expect(avisos[0].resumo).toBeDefined()
    expect(avisos[0].resumo).toContain('300,00')
  })

  it('retorna array vazio quando nenhum lançamento tem origemEspecial pagamento-recebido (TL-7)', () => {
    const lancamentos = [lancamento({ transcricao: 'Compra qualquer' })]
    expect(detectarPagamentoRecebido(lancamentos)).toEqual([])
    expect(detectarPagamentoRecebido([])).toEqual([])
  })

  it('não captura linha marcada como valor-pendente (TL-8)', () => {
    const lancamentos = [
      lancamento({ transcricao: 'Valor pendente do mês anterior', valor: -120.5, origemEspecial: 'valor-pendente' }),
    ]
    expect(detectarPagamentoRecebido(lancamentos)).toHaveLength(0)
  })

  it('múltiplas linhas da mesma origem geram uma proposta por linha, cada com seu índice real (TL-9)', () => {
    const lancamentos = [
      lancamento({ transcricao: 'Pagamento recebido', valor: 100, origemEspecial: 'pagamento-recebido' }),
      lancamento({ transcricao: 'Compra qualquer' }),
      lancamento({ transcricao: 'Pagamento recebido', valor: 200, origemEspecial: 'pagamento-recebido' }),
    ]
    const avisos = detectarPagamentoRecebido(lancamentos)
    expect(avisos).toHaveLength(2)
    expect(avisos.map((a) => a.alvo[0])).toEqual(['0', '2'])
  })
})

describe('não-duplicação entre detecções de origemEspecial e detectarConciliacao (TL-10)', () => {
  it('nenhum índice de lancamentosFatura aparece no alvo de detectarConciliacao (que só referencia o extrato)', () => {
    const lancamentosFatura = [
      lancamento({ transcricao: 'Item A', valor: -100 }),
      lancamento({ transcricao: 'Pagamento recebido', valor: 300, origemEspecial: 'pagamento-recebido' }),
    ]
    const lancamentosExtrato = [
      lancamento({ transcricao: 'Pagamento de fatura', valor: -100 }),
    ]

    const avisosPagamentoRecebido = detectarPagamentoRecebido(lancamentosFatura)
    const avisosConciliacao = detectarConciliacao(lancamentosFatura, lancamentosExtrato)

    expect(avisosPagamentoRecebido).toHaveLength(1)
    expect(avisosPagamentoRecebido[0].alvo).toEqual(['1'])
    expect(avisosConciliacao).toHaveLength(1)
    // detectarConciliacao referencia sempre o extrato — alvo nunca coincide com
    // um índice de lancamentosFatura (espaços de índice distintos, sem overlap real).
    expect(avisosConciliacao[0].alvo).toEqual(['0'])
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

  it('candidato único próximo (fora da tolerância exata, dentro da faixa de 10%) vira informativo com candidatos, sem mutacaoProposta (TL-13)', () => {
    const fatura = [lancamento({ transcricao: 'Item A', valor: -200, id: 1 })]
    const extrato = [
      lancamento({ transcricao: 'Pagamento parecido', valor: -215, data: '2026-06-20', id: 42 }),
      lancamento({ transcricao: 'Nada a ver', valor: -999, id: 99 }),
    ]
    const avisos = detectarConciliacao(fatura, extrato)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].tipo).toBe('informativo')
    expect(avisos[0].mutacaoProposta).toBeUndefined()
    expect(avisos[0].candidatos).toEqual([
      { alvo: '42', resumo: expect.stringContaining('215,00') },
    ])
    expect(avisos[0].candidatos?.[0].resumo).toContain('20/06/2026')
  })

  it('2+ candidatos próximos são todos listados, na ordem do extrato (TL-14)', () => {
    const fatura = [lancamento({ transcricao: 'Item A', valor: -200, id: 1 })]
    const extrato = [
      lancamento({ transcricao: 'Perto 1', valor: -210, data: '2026-06-10', id: 10 }),
      lancamento({ transcricao: 'Perto 2', valor: -190, data: '2026-06-11', id: 11 }),
      lancamento({ transcricao: 'Longe demais', valor: -999, id: 12 }),
    ]
    const avisos = detectarConciliacao(fatura, extrato)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].tipo).toBe('informativo')
    expect(avisos[0].mutacaoProposta).toBeUndefined()
    expect(avisos[0].candidatos).toHaveLength(2)
    expect(avisos[0].candidatos?.map((c) => c.alvo)).toEqual(['10', '11'])
  })

  it('nenhum candidato dentro da faixa de proximidade mantém o informativo genérico, sem campo candidatos (TL-15)', () => {
    const fatura = [lancamento({ transcricao: 'Item A', valor: -200, id: 1 })]
    const extrato = [lancamento({ transcricao: 'Muito longe', valor: -999, id: 2 })]
    const avisos = detectarConciliacao(fatura, extrato)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].tipo).toBe('informativo')
    expect(avisos[0].mensagem).toContain('fatura não conciliada')
    expect(avisos[0].candidatos).toBeUndefined()
  })

  it('faixa de proximidade (10% do somatório da fatura) é inclusiva na borda superior (TL-16)', () => {
    const fatura = [lancamento({ transcricao: 'Item A', valor: -200, id: 1 })]
    // diferença exata de R$ 20,00 = 10% de R$ 200,00 → deve entrar como candidato
    const extratoNaBorda = [lancamento({ transcricao: 'Na borda', valor: -220, id: 5 })]
    const avisosNaBorda = detectarConciliacao(fatura, extratoNaBorda)
    expect(avisosNaBorda[0].candidatos).toHaveLength(1)

    // diferença de R$ 20,01 → passou da faixa, volta ao informativo genérico
    const extratoForaDaBorda = [lancamento({ transcricao: 'Passou da borda', valor: -220.01, id: 6 })]
    const avisosForaDaBorda = detectarConciliacao(fatura, extratoForaDaBorda)
    expect(avisosForaDaBorda[0].candidatos).toBeUndefined()
  })
})
