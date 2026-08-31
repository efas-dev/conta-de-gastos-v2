// ADR: see Docs/specs/mvp-vertical-nubank.adr.md
// ADR: see Docs/specs/avisos-acionaveis.adr.md
// ADR: see Docs/specs/fundacao-operacoes.adr.md
import { describe, it, expect } from 'vitest'
import type { Lancamento, DicEntry, ResultadoParse, Aviso, Mutacao } from '../types'

// TL-01 a TL-07: Lancamento possui todos os campos esperados com os tipos corretos
describe('Lancamento', () => {
  it('pode ser instanciado com todos os campos (TL-01 a TL-07, TL-15)', () => {
    const lancamento: Lancamento = {
      fonte: 'Nubank',
      data: '2024-01-15',
      transcricao: 'Mercado Extra',
      valor: -150.5,
      iniciais: 'ES',
      natureza: 'Alimentação',
      descricao: 'Compras do mês',
    }

    expect(lancamento.fonte).toBe('Nubank')
    expect(lancamento.data).toBe('2024-01-15')
    expect(lancamento.transcricao).toBe('Mercado Extra')
    expect(lancamento.valor).toBe(-150.5)
    expect(lancamento.iniciais).toBe('ES')
    expect(lancamento.natureza).toBe('Alimentação')
    expect(lancamento.descricao).toBe('Compras do mês')
  })

  // TL-17: transferenciaInterna aceita false (movimentação comum)
  it('campo transferenciaInterna aceita false (TL-17)', () => {
    const l: Lancamento = {
      fonte: 'Nubank',
      data: '2024-01-15',
      transcricao: 'Mercado Extra',
      valor: -50,
      iniciais: 'ES',
      natureza: '',
      descricao: '',
      transferenciaInterna: false,
    }
    expect(l.transferenciaInterna).toBe(false)
  })

  // TL-18: transferenciaInterna aceita true (movimentação entre contas próprias)
  it('campo transferenciaInterna aceita true (TL-18)', () => {
    const l: Lancamento = {
      fonte: 'Nubank',
      data: '2024-01-15',
      transcricao: 'TED PARA CONTA PROPRIA',
      valor: -1000,
      iniciais: 'ES',
      natureza: '',
      descricao: '',
      transferenciaInterna: true,
    }
    expect(l.transferenciaInterna).toBe(true)
  })

  // TL-19: investimento aceita null (lançamento sem caráter de investimento)
  it('campo investimento aceita null (TL-19)', () => {
    const l: Lancamento = {
      fonte: 'Nubank',
      data: '2024-01-15',
      transcricao: 'Mercado Extra',
      valor: -50,
      iniciais: 'ES',
      natureza: '',
      descricao: '',
      investimento: null,
    }
    expect(l.investimento).toBeNull()
  })

  // TL-20: investimento aceita 'aplicacao' (aplicação de renda fixa/variável)
  it("campo investimento aceita 'aplicacao' (TL-20)", () => {
    const l: Lancamento = {
      fonte: 'Nubank',
      data: '2024-01-15',
      transcricao: 'APLICACAO RDB',
      valor: -500,
      iniciais: 'ES',
      natureza: '',
      descricao: '',
      investimento: 'aplicacao',
    }
    expect(l.investimento).toBe('aplicacao')
  })

  // TL-21: investimento aceita 'resgate' (resgate de renda fixa/variável)
  it("campo investimento aceita 'resgate' (TL-21)", () => {
    const l: Lancamento = {
      fonte: 'Nubank',
      data: '2024-01-15',
      transcricao: 'RESGATE CDB',
      valor: 500,
      iniciais: 'ES',
      natureza: '',
      descricao: '',
      investimento: 'resgate',
    }
    expect(l.investimento).toBe('resgate')
  })

  // TL-22: Lancamento sem os novos campos ainda é válido (compatibilidade backward)
  it('Lancamento sem transferenciaInterna nem investimento ainda compila (TL-22)', () => {
    const l: Lancamento = {
      fonte: 'Nubank',
      data: '2024-01-15',
      transcricao: 'Mercado Extra',
      valor: -50,
      iniciais: 'ES',
      natureza: '',
      descricao: '',
    }
    expect(l.transferenciaInterna).toBeUndefined()
    expect(l.investimento).toBeUndefined()
  })

  it('campo fonte é string (TL-01)', () => {
    const l: Lancamento = {
      fonte: 'Nubank',
      data: '2024-01-15',
      transcricao: 'teste',
      valor: 0,
      iniciais: '',
      natureza: '',
      descricao: '',
    }
    expect(typeof l.fonte).toBe('string')
  })

  it('campo data é string ISO (TL-02)', () => {
    const l: Lancamento = {
      fonte: 'Nubank',
      data: '2024-03-20',
      transcricao: 'teste',
      valor: 0,
      iniciais: '',
      natureza: '',
      descricao: '',
    }
    expect(typeof l.data).toBe('string')
  })

  it('campo valor é number (TL-04)', () => {
    const l: Lancamento = {
      fonte: 'Nubank',
      data: '2024-01-01',
      transcricao: 'teste',
      valor: -99.99,
      iniciais: '',
      natureza: '',
      descricao: '',
    }
    expect(typeof l.valor).toBe('number')
  })
})

// TL-08 a TL-14: DicEntry possui todos os campos esperados com os tipos corretos
describe('DicEntry', () => {
  it('pode ser instanciado com todos os campos (TL-08 a TL-14, TL-16)', () => {
    const entry: DicEntry = {
      chave: 'Mercado Extra',
      fonte: 'Nubank',
      natureza: 'Alimentação',
      descricao: 'Compras do mês',
      iniciais: 'ES',
      vezes: 3,
      ambiguo: false,
    }

    expect(entry.chave).toBe('Mercado Extra')
    expect(entry.fonte).toBe('Nubank')
    expect(entry.natureza).toBe('Alimentação')
    expect(entry.descricao).toBe('Compras do mês')
    expect(entry.iniciais).toBe('ES')
    expect(entry.vezes).toBe(3)
    expect(entry.ambiguo).toBe(false)
  })

  it('campo vezes é number (TL-13)', () => {
    const e: DicEntry = {
      chave: 'teste',
      fonte: 'Nubank',
      natureza: '',
      descricao: '',
      iniciais: '',
      vezes: 7,
      ambiguo: false,
    }
    expect(typeof e.vezes).toBe('number')
  })

  it('campo ambiguo é boolean (TL-14)', () => {
    const e: DicEntry = {
      chave: 'teste',
      fonte: 'Nubank',
      natureza: '',
      descricao: '',
      iniciais: '',
      vezes: 1,
      ambiguo: true,
    }
    expect(typeof e.ambiguo).toBe('boolean')
  })
})

// TL-23 a TL-25: ResultadoParse possui excluidosPendentes: Lancamento[]
describe('ResultadoParse', () => {
  it('aceita excluidosPendentes preenchido com Lancamento[] (TL-23)', () => {
    const excluido: Lancamento = {
      fonte: 'Nubank',
      data: '2024-01-15',
      transcricao: 'Pagamento recebido',
      valor: 100,
      iniciais: '',
      natureza: '',
      descricao: '',
    }
    const resultado: ResultadoParse = {
      lancamentos: [],
      linhasIgnoradas: 0,
      excluidosPendentes: [excluido],
    }
    expect(resultado.excluidosPendentes).toHaveLength(1)
    expect(resultado.excluidosPendentes[0].transcricao).toBe('Pagamento recebido')
  })

  it('aceita excluidosPendentes vazio (default dos parsers sem exclusão) (TL-24)', () => {
    const resultado: ResultadoParse = {
      lancamentos: [],
      linhasIgnoradas: 0,
      excluidosPendentes: [],
    }
    expect(resultado.excluidosPendentes).toEqual([])
  })

  it('mantém lancamentos e linhasIgnoradas inalterados (TL-25)', () => {
    const resultado: ResultadoParse = {
      lancamentos: [],
      linhasIgnoradas: 3,
      excluidosPendentes: [],
    }
    expect(resultado.linhasIgnoradas).toBe(3)
  })
})

// TL-26 a TL-30: Aviso possui id, tipo, origem, mensagem, alvo, estado
describe('Aviso', () => {
  it('pode ser instanciado com todos os campos, tipo informativo (TL-26)', () => {
    const aviso: Aviso = {
      id: 'aviso-1',
      tipo: 'informativo',
      origem: 'valor-pendente',
      mensagem: 'Valor pendente do mês anterior detectado',
      alvo: ['lanc-1'],
      estado: 'pendente',
    }
    expect(aviso.id).toBe('aviso-1')
    expect(aviso.tipo).toBe('informativo')
    expect(aviso.origem).toBe('valor-pendente')
    expect(aviso.mensagem).toBe('Valor pendente do mês anterior detectado')
    expect(aviso.alvo).toEqual(['lanc-1'])
    expect(aviso.estado).toBe('pendente')
  })

  it("campo tipo aceita 'proposta' (TL-27)", () => {
    const aviso: Aviso = {
      id: 'aviso-2',
      tipo: 'proposta',
      origem: 'conciliacao',
      mensagem: 'Fatura conciliável com pagamento do extrato',
      alvo: ['lanc-2'],
      estado: 'pendente',
    }
    expect(aviso.tipo).toBe('proposta')
  })

  it("campo estado aceita 'aplicado' (TL-28)", () => {
    const aviso: Aviso = {
      id: 'aviso-3',
      tipo: 'proposta',
      origem: 'conciliacao',
      mensagem: 'teste',
      alvo: [],
      estado: 'aplicado',
    }
    expect(aviso.estado).toBe('aplicado')
  })

  it("campo estado aceita 'dispensado' (TL-29)", () => {
    const aviso: Aviso = {
      id: 'aviso-4',
      tipo: 'proposta',
      origem: 'conciliacao',
      mensagem: 'teste',
      alvo: [],
      estado: 'dispensado',
    }
    expect(aviso.estado).toBe('dispensado')
  })

  it('campo alvo é string[] de ids de Lancamento (TL-30)', () => {
    const aviso: Aviso = {
      id: 'aviso-5',
      tipo: 'informativo',
      origem: 'valor-pendente',
      mensagem: 'teste',
      alvo: ['id-a', 'id-b'],
      estado: 'pendente',
    }
    expect(Array.isArray(aviso.alvo)).toBe(true)
    expect(aviso.alvo.every(id => typeof id === 'string')).toBe(true)
  })
})

// TL-31 a TL-34: Mutacao (verbo único 'remover') e Aviso.mutacaoProposta (ADR fundacao-operacoes, Decisão 5)
describe('Mutacao', () => {
  it("verbo 'remover' tem a forma { verbo: 'remover'; alvo: number[] } (TL-31)", () => {
    const mutacao: Mutacao = { verbo: 'remover', alvo: [1, 2, 3] }
    expect(mutacao.verbo).toBe('remover')
    expect(mutacao.alvo).toEqual([1, 2, 3])
  })

  it('alvo é number[] de ids de Lancamento, não string[] (TL-32)', () => {
    const mutacao: Mutacao = { verbo: 'remover', alvo: [42] }
    expect(Array.isArray(mutacao.alvo)).toBe(true)
    expect(mutacao.alvo.every(id => typeof id === 'number')).toBe(true)
  })

  it('Aviso.mutacaoProposta aceita uma Mutacao de remover com ids numéricos (TL-33)', () => {
    const aviso: Aviso = {
      id: 'aviso-6',
      tipo: 'proposta',
      origem: 'conciliacao',
      mensagem: 'teste',
      alvo: ['lanc-1'],
      permanece: [],
      estado: 'pendente',
      mutacaoProposta: { verbo: 'remover', alvo: [7, 8] },
    }
    expect(aviso.mutacaoProposta).toEqual({ verbo: 'remover', alvo: [7, 8] })
  })

  it('Aviso.mutacaoProposta é opcional — Aviso sem o campo continua válido (TL-34)', () => {
    const aviso: Aviso = {
      id: 'aviso-7',
      tipo: 'informativo',
      origem: 'valor-pendente',
      mensagem: 'teste',
      alvo: [],
      permanece: [],
      estado: 'pendente',
    }
    expect(aviso.mutacaoProposta).toBeUndefined()
  })

  // TL-37: verbo 'adicionar' tem a forma { verbo: 'adicionar'; lancamentos: Omit<Lancamento,'id'>[] }
  // (ADR spec-20260805-vr-despesas, Decisão 1)
  it("verbo 'adicionar' tem a forma { verbo: 'adicionar'; lancamentos: Omit<Lancamento,'id'>[] } (TL-37)", () => {
    const lancamentoSemId: Omit<Lancamento, 'id'> = {
      fonte: 'form_vr',
      data: '2024-01-31',
      transcricao: '',
      valor: -50,
      iniciais: 'ES',
      natureza: 'ALM',
      descricao: 'Despesa VR',
    }
    const mutacao: Mutacao = { verbo: 'adicionar', lancamentos: [lancamentoSemId] }
    expect(mutacao.verbo).toBe('adicionar')
    expect(mutacao.lancamentos).toEqual([lancamentoSemId])
  })

  // TL-38: lancamentos do verbo 'adicionar' aceita objetos com todos os campos de Lancamento exceto id
  it("lancamentos do verbo 'adicionar' aceita Lancamento completo sem id (TL-38)", () => {
    const lancamentoCompleto: Omit<Lancamento, 'id'> = {
      fonte: 'form_vr',
      data: '2024-01-31',
      transcricao: '',
      valor: 50,
      iniciais: 'ES',
      natureza: 'RR',
      descricao: 'VR utilizado para despesas familiares',
      transferenciaInterna: false,
      investimento: null,
      origemEspecial: undefined,
    }
    const mutacao: Mutacao = { verbo: 'adicionar', lancamentos: [lancamentoCompleto] }
    expect(mutacao.lancamentos[0]).not.toHaveProperty('id')
    expect(mutacao.lancamentos[0].natureza).toBe('RR')
  })

  // TL-39: Aviso.mutacaoProposta aceita uma Mutacao de 'adicionar' com lançamentos completos
  it("Aviso.mutacaoProposta aceita uma Mutacao de 'adicionar' com lançamentos completos (TL-39)", () => {
    const aviso: Aviso = {
      id: 'aviso-vr',
      tipo: 'proposta',
      origem: 'vr',
      mensagem: 'teste',
      alvo: [],
      permanece: [],
      estado: 'pendente',
      mutacaoProposta: {
        verbo: 'adicionar',
        lancamentos: [
          {
            fonte: 'form_vr',
            data: '2024-01-31',
            transcricao: '',
            valor: -50,
            iniciais: 'ES',
            natureza: 'ALM',
            descricao: 'Despesa VR',
          },
        ],
      },
    }
    expect(aviso.mutacaoProposta?.verbo).toBe('adicionar')
  })

  // TL-40: regressão zero — Mutacao continua aceitando o verbo 'remover' após a extensão da união
  it("Mutacao continua aceitando { verbo: 'remover'; alvo: number[] } após a extensão da união (TL-40)", () => {
    const mutacao: Mutacao = { verbo: 'remover', alvo: [1, 2] }
    expect(mutacao.verbo).toBe('remover')
    expect(mutacao.alvo).toEqual([1, 2])
  })
})

// TL-35 a TL-36: Aviso.candidatos (spec conciliacao-robusta, Task 5 / Decisão 2-3 do ADR)
describe('Aviso.candidatos', () => {
  it('aceita uma lista de candidatos com alvo e resumo por item (TL-35)', () => {
    const aviso: Aviso = {
      id: 'aviso-8',
      tipo: 'informativo',
      origem: 'conciliacao',
      mensagem: 'Fatura não conciliada exatamente: candidatos próximos encontrados',
      alvo: [],
      permanece: [],
      estado: 'pendente',
      candidatos: [
        { alvo: 'lanc-10', resumo: 'R$ 150,00 em 2024-01-10' },
        { alvo: 'lanc-11', resumo: 'R$ 149,50 em 2024-01-12' },
      ],
    }
    expect(aviso.candidatos).toHaveLength(2)
    expect(aviso.candidatos?.[0]).toEqual({ alvo: 'lanc-10', resumo: 'R$ 150,00 em 2024-01-10' })
  })

  it('é opcional — Aviso sem candidatos continua válido (TL-36)', () => {
    const aviso: Aviso = {
      id: 'aviso-9',
      tipo: 'proposta',
      origem: 'conciliacao',
      mensagem: 'teste',
      alvo: [],
      permanece: [],
      estado: 'pendente',
      mutacaoProposta: { verbo: 'remover', alvo: [1] },
    }
    expect(aviso.candidatos).toBeUndefined()
  })
})
