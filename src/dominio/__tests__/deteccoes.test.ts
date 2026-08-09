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

  it('TL-10: mensagem formata o valor em pt-BR (vírgula decimal e separador de milhar)', () => {
    const lancamentos = [
      lancamento({ transcricao: 'Valor pendente do mês anterior', valor: -3043.64, origemEspecial: 'valor-pendente' }),
    ]
    const avisos = detectarValorPendente(lancamentos)
    expect(avisos[0].mensagem).toContain('R$ 3.043,64')
    expect(avisos[0].mensagem).not.toContain('3043.64')
  })

  it('TL-11: mensagem não repete a transcrição quando ela é igual ao rótulo da origem', () => {
    const lancamentos = [
      lancamento({ transcricao: 'Valor pendente do mês anterior', valor: -120.5, origemEspecial: 'valor-pendente' }),
    ]
    const avisos = detectarValorPendente(lancamentos)
    expect(avisos[0].mensagem).toBe('Valor pendente do mês anterior: R$ 120,50.')
  })

  it('TL-12: mensagem preserva a transcrição entre aspas quando ela difere do rótulo', () => {
    const lancamentos = [
      lancamento({ transcricao: 'Saldo restante da fatura', valor: -120.5, origemEspecial: 'valor-pendente' }),
    ]
    const avisos = detectarValorPendente(lancamentos)
    expect(avisos[0].mensagem).toContain('"Saldo restante da fatura"')
  })

  it('TL-13: resumo explica que o valor em geral se anula com o pagamento recebido', () => {
    const lancamentos = [
      lancamento({ transcricao: 'Valor pendente do mês anterior', valor: -120.5, origemEspecial: 'valor-pendente' }),
    ]
    const avisos = detectarValorPendente(lancamentos)
    expect(avisos[0].resumo).toContain('Pagamento recebido')
    expect(avisos[0].resumo).toContain('anula')
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

  it('TL-14: mensagem formata o valor em pt-BR e não repete a transcrição igual ao rótulo', () => {
    const lancamentos = [
      lancamento({ transcricao: 'Pagamento recebido', valor: 3043.64, origemEspecial: 'pagamento-recebido' }),
    ]
    const avisos = detectarPagamentoRecebido(lancamentos)
    expect(avisos[0].mensagem).toBe('Pagamento recebido: R$ 3.043,64.')
  })

  it('TL-15: resumo explica que o crédito em geral se anula com o valor pendente', () => {
    const lancamentos = [
      lancamento({ transcricao: 'Pagamento recebido', valor: 300, origemEspecial: 'pagamento-recebido' }),
    ]
    const avisos = detectarPagamentoRecebido(lancamentos)
    expect(avisos[0].resumo).toContain('Valor pendente do mês anterior')
    expect(avisos[0].resumo).toContain('anula')
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

  it('ambiguidade por TOTAL: 2+ candidatos exatos dentro da tolerância vira informativo listando todos, sem mutacaoProposta (TL-7/TL-17)', () => {
    const fatura = [lancamento({ transcricao: 'Item A', valor: -200 })]
    const extrato = [
      lancamento({ transcricao: 'Pagamento de fatura', valor: -200.01, data: '2026-06-05', id: 30 }),
      lancamento({ transcricao: 'Pagamento de fatura (duplicado)', valor: -199.99, data: '2026-06-06', id: 31 }),
    ]
    const avisos = detectarConciliacao(fatura, extrato)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].tipo).toBe('informativo')
    expect(avisos[0].mutacaoProposta).toBeUndefined()
    expect(avisos[0].candidatos).toEqual([
      { alvo: '30', resumo: expect.stringContaining('200,01') },
      { alvo: '31', resumo: expect.stringContaining('199,99') },
    ])
  })

  it('ambiguidade por SUBCONJUNTO: 2+ candidatos batem exatamente por subset-sum (soma total não bate) vira informativo listando todos, sem mutacaoProposta (TL-18)', () => {
    const fatura = [
      lancamento({ transcricao: 'Item A', valor: -100 }),
      lancamento({ transcricao: 'Item B', valor: -30 }),
      lancamento({ transcricao: 'Item C', valor: -70 }),
    ]
    // soma total = -200; nenhum candidato do extrato bate nisso.
    // duas linhas do extrato, cada uma batendo exatamente com o subconjunto [Item A] (-100).
    const extrato = [
      lancamento({ transcricao: 'Pagamento X', valor: -100, data: '2026-06-07', id: 40 }),
      lancamento({ transcricao: 'Pagamento Y', valor: -100, data: '2026-06-08', id: 41 }),
    ]
    const avisos = detectarConciliacao(fatura, extrato)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].tipo).toBe('informativo')
    expect(avisos[0].mutacaoProposta).toBeUndefined()
    expect(avisos[0].candidatos).toEqual([
      { alvo: '40', resumo: expect.stringContaining('100,00') },
      { alvo: '41', resumo: expect.stringContaining('100,00') },
    ])
  })

  it('sem casamento algum gera aviso informativo dizendo que o pagamento não foi achado (TL-8)', () => {
    const fatura = [lancamento({ transcricao: 'Item A', valor: -200 })]
    const extrato = [lancamento({ transcricao: 'Outro débito qualquer', valor: -999 })]
    const avisos = detectarConciliacao(fatura, extrato)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].tipo).toBe('informativo')
    expect(avisos[0].mensagem).toContain('pagamento desta fatura')
    expect(avisos[0].mensagem).toContain('Nada foi removido')
  })

  it('TL-21: os três informativos explicam o risco de contar os gastos duas vezes', () => {
    const faturaAmbigua = [lancamento({ transcricao: 'Item A', valor: -200 })]
    const extratoAmbiguo = [
      lancamento({ transcricao: 'Pagamento de fatura', valor: -200, id: 30 }),
      lancamento({ transcricao: 'Pagamento de fatura (duplicado)', valor: -200, id: 31 }),
    ]
    const [ambiguidade] = detectarConciliacao(faturaAmbigua, extratoAmbiguo)
    expect(ambiguidade.mensagem).toContain('duas vezes')

    // Fora da tolerância de R$ 0,05, dentro da faixa de 10% → candidatos próximos.
    const [proximos] = detectarConciliacao(faturaAmbigua, [
      lancamento({ transcricao: 'Pagamento quase igual', valor: -205, id: 42 }),
    ])
    expect(proximos.mensagem).toContain('duas vezes')

    const [semCasamento] = detectarConciliacao(faturaAmbigua, [
      lancamento({ transcricao: 'Outro débito qualquer', valor: -999 }),
    ])
    expect(semCasamento.mensagem).toContain('duas vezes')
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
    // O resumo mostra os dois lados do casamento (itens da fatura ↔ pagamento no extrato)
    // e diz por que a remoção é proposta: sem ela, os mesmos gastos entram duas vezes.
    expect(avisos[0].resumo).toContain('R$ 150,30')
    expect(avisos[0].resumo).toContain('R$ 150,32')
    expect(avisos[0].resumo).toContain('duas vezes')
  })

  it('TL-19: proposta de casamento total explica a duplicidade e diz que só a linha do extrato sai', () => {
    const fatura = [lancamento({ transcricao: 'Item A', valor: -100 })]
    const extrato = [lancamento({ transcricao: 'Pagamento de fatura', valor: -100 })]
    const avisos = detectarConciliacao(fatura, extrato)

    expect(avisos[0].mensagem).toContain('Pagamento de fatura')
    expect(avisos[0].mensagem).toContain('R$ 100,00')
    expect(avisos[0].resumo).toContain('um a um')
    expect(avisos[0].resumo).toContain('só a linha do extrato')
  })

  it('TL-20: no casamento parcial o resumo diz que só PARTE dos itens da fatura foi coberta', () => {
    const fatura = [
      lancamento({ transcricao: 'Item A', valor: -100 }),
      lancamento({ transcricao: 'Item B', valor: -50.3 }),
      lancamento({ transcricao: 'Item C', valor: -30 }),
    ]
    const extrato = [lancamento({ transcricao: 'Pagamento parcial', valor: -130 })]
    const avisos = detectarConciliacao(fatura, extrato)

    expect(avisos[0].resumo).toContain('Parte dos itens')
    expect(avisos[0].resumo).toContain('R$ 130,00')
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
    expect(avisos[0].resumo).toContain('R$ 130,00')
    expect(avisos[0].resumo).toContain('duas vezes')
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
    expect(avisos[0].mensagem).toContain('pagamento desta fatura')
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
