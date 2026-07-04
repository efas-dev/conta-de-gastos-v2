// ADR: see Docs/specs/grid-revisao.adr.md

import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../appStore'
import {
  calcularTemaLinha,
  TEMA_ERRO,
  TEMA_INVESTIMENTO,
  TEMA_TRANSFERENCIA,
} from '../../components/ReviewGrid'
import type { Lancamento, DicEntry } from '../../../types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function lancamento(parcial: Partial<Lancamento> = {}): Lancamento {
  return {
    fonte: 'Nubank',
    data: '2025-03-15',
    transcricao: 'Mercado',
    valor: -150,
    iniciais: 'ES',
    natureza: 'Alimentação',
    descricao: 'Supermercado',
    transferenciaInterna: false,
    investimento: null,
    ...parcial,
  }
}

function dicEntry(parcial: Partial<DicEntry> = {}): DicEntry {
  return {
    chave: 'mercado',
    fonte: 'Nubank',
    natureza: 'Alimentação',
    descricao: 'Supermercado',
    iniciais: 'ES',
    vezes: 1,
    ambiguo: false,
    ...parcial,
  }
}

// ---------------------------------------------------------------------------
// Utilitário de reset — isola cada teste
// ---------------------------------------------------------------------------

function resetarStore(): void {
  useAppStore.setState({
    lancamentos: [],
    iniciais: '',
    nomeUsuario: '',
    naturezasValidas: [],
    dicEntries: [],
    avisos: [],
    historico: [],
    csvArquivo: null,
    sujo: false,
  })
}

// ---------------------------------------------------------------------------
// 1–7. Setters simples
// ---------------------------------------------------------------------------

describe('setLancamentos', () => {
  beforeEach(resetarStore)

  it('substitui o array de lancamentos no estado', () => {
    const lista = [lancamento(), lancamento({ valor: -200 })]
    useAppStore.getState().setLancamentos(lista)
    expect(useAppStore.getState().lancamentos).toEqual(lista)
  })

  it('aceita array vazio para limpar lancamentos', () => {
    useAppStore.getState().setLancamentos([lancamento()])
    useAppStore.getState().setLancamentos([])
    expect(useAppStore.getState().lancamentos).toHaveLength(0)
  })
})

describe('setIniciais', () => {
  beforeEach(resetarStore)

  it('persiste iniciais no estado', () => {
    useAppStore.getState().setIniciais('JF')
    expect(useAppStore.getState().iniciais).toBe('JF')
  })
})

describe('setNomeUsuario', () => {
  beforeEach(resetarStore)

  it('persiste nomeUsuario no estado', () => {
    useAppStore.getState().setNomeUsuario('João Ferreira')
    expect(useAppStore.getState().nomeUsuario).toBe('João Ferreira')
  })
})

describe('setCSV', () => {
  beforeEach(resetarStore)

  it('persiste arquivo CSV no estado', () => {
    const file = new File(['Data,Valor\n'], 'extrato.csv', { type: 'text/csv' })
    useAppStore.getState().setCSV(file)
    expect(useAppStore.getState().csvArquivo).toBe(file)
  })

  it('aceita null para limpar o arquivo', () => {
    const file = new File([''], 'extrato.csv')
    useAppStore.getState().setCSV(file)
    useAppStore.getState().setCSV(null)
    expect(useAppStore.getState().csvArquivo).toBeNull()
  })
})

describe('setDic', () => {
  beforeEach(resetarStore)

  it('substitui as entradas do dicionário no estado', () => {
    const entries = [dicEntry(), dicEntry({ chave: 'farmacia' })]
    useAppStore.getState().setDic(entries)
    expect(useAppStore.getState().dicEntries).toEqual(entries)
  })
})

describe('addAviso', () => {
  beforeEach(resetarStore)

  it('adiciona aviso ao fim do array', () => {
    useAppStore.getState().addAviso('Aviso 1')
    useAppStore.getState().addAviso('Aviso 2')
    expect(useAppStore.getState().avisos).toEqual(['Aviso 1', 'Aviso 2'])
  })
})

describe('clearAvisos', () => {
  beforeEach(resetarStore)

  it('esvazia o array de avisos', () => {
    useAppStore.getState().addAviso('aviso qualquer')
    useAppStore.getState().clearAvisos()
    expect(useAppStore.getState().avisos).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 8–12. editarCelula
// ---------------------------------------------------------------------------

describe('editarCelula', () => {
  beforeEach(() => {
    resetarStore()
    useAppStore.getState().setLancamentos([lancamento()])
  })

  it('persiste iniciais editadas', () => {
    useAppStore.getState().editarCelula(0, 'iniciais', 'JF')
    expect(useAppStore.getState().lancamentos[0].iniciais).toBe('JF')
  })

  it('persiste natureza editada', () => {
    useAppStore.getState().editarCelula(0, 'natureza', 'Moradia')
    expect(useAppStore.getState().lancamentos[0].natureza).toBe('Moradia')
  })

  it('persiste descricao editada', () => {
    useAppStore.getState().editarCelula(0, 'descricao', 'Aluguel')
    expect(useAppStore.getState().lancamentos[0].descricao).toBe('Aluguel')
  })

  it('persiste valor numérico finito', () => {
    useAppStore.getState().editarCelula(0, 'valor', -200)
    expect(useAppStore.getState().lancamentos[0].valor).toBe(-200)
  })

  it('persiste valor passado como string numérica', () => {
    useAppStore.getState().editarCelula(0, 'valor', '-300')
    expect(useAppStore.getState().lancamentos[0].valor).toBe(-300)
  })

  it('rejeita NaN no campo valor — estado inalterado', () => {
    const valorOriginal = useAppStore.getState().lancamentos[0].valor
    useAppStore.getState().editarCelula(0, 'valor', NaN)
    expect(useAppStore.getState().lancamentos[0].valor).toBe(valorOriginal)
  })

  it('rejeita Infinity no campo valor — estado inalterado', () => {
    const valorOriginal = useAppStore.getState().lancamentos[0].valor
    useAppStore.getState().editarCelula(0, 'valor', Infinity)
    expect(useAppStore.getState().lancamentos[0].valor).toBe(valorOriginal)
  })

  it('rejeita string não-numérica no campo valor — estado inalterado', () => {
    const valorOriginal = useAppStore.getState().lancamentos[0].valor
    useAppStore.getState().editarCelula(0, 'valor', 'nao-e-numero')
    expect(useAppStore.getState().lancamentos[0].valor).toBe(valorOriginal)
  })
})

// ---------------------------------------------------------------------------
// 13. excluirLinha
// ---------------------------------------------------------------------------

describe('excluirLinha', () => {
  beforeEach(() => {
    resetarStore()
    useAppStore.getState().setLancamentos([
      lancamento({ transcricao: 'A' }),
      lancamento({ transcricao: 'B' }),
      lancamento({ transcricao: 'C' }),
    ])
  })

  it('remove a linha na posição informada', () => {
    useAppStore.getState().excluirLinha(1)
    const lancamentos = useAppStore.getState().lancamentos
    expect(lancamentos).toHaveLength(2)
    expect(lancamentos[0].transcricao).toBe('A')
    expect(lancamentos[1].transcricao).toBe('C')
  })

  it('remove a primeira linha corretamente', () => {
    useAppStore.getState().excluirLinha(0)
    expect(useAppStore.getState().lancamentos[0].transcricao).toBe('B')
  })

  it('remove a última linha corretamente', () => {
    useAppStore.getState().excluirLinha(2)
    expect(useAppStore.getState().lancamentos).toHaveLength(2)
    expect(useAppStore.getState().lancamentos[1].transcricao).toBe('B')
  })
})

// ---------------------------------------------------------------------------
// 14–17. moverLinha
// ---------------------------------------------------------------------------

describe('moverLinha', () => {
  beforeEach(() => {
    resetarStore()
    useAppStore.getState().setLancamentos([
      lancamento({ transcricao: 'A' }),
      lancamento({ transcricao: 'B' }),
      lancamento({ transcricao: 'C' }),
    ])
  })

  it("'cima' troca a linha com a anterior", () => {
    useAppStore.getState().moverLinha(1, 'cima')
    const lancamentos = useAppStore.getState().lancamentos
    expect(lancamentos[0].transcricao).toBe('B')
    expect(lancamentos[1].transcricao).toBe('A')
    expect(lancamentos[2].transcricao).toBe('C')
  })

  it("'baixo' troca a linha com a seguinte", () => {
    useAppStore.getState().moverLinha(1, 'baixo')
    const lancamentos = useAppStore.getState().lancamentos
    expect(lancamentos[0].transcricao).toBe('A')
    expect(lancamentos[1].transcricao).toBe('C')
    expect(lancamentos[2].transcricao).toBe('B')
  })

  it("'cima' no índice 0 não altera o estado", () => {
    const antes = useAppStore.getState().lancamentos.map((l) => l.transcricao)
    useAppStore.getState().moverLinha(0, 'cima')
    const depois = useAppStore.getState().lancamentos.map((l) => l.transcricao)
    expect(depois).toEqual(antes)
  })

  it("'baixo' no último índice não altera o estado", () => {
    const antes = useAppStore.getState().lancamentos.map((l) => l.transcricao)
    useAppStore.getState().moverLinha(2, 'baixo')
    const depois = useAppStore.getState().lancamentos.map((l) => l.transcricao)
    expect(depois).toEqual(antes)
  })
})

// ---------------------------------------------------------------------------
// 18. aplicarSplit
// ---------------------------------------------------------------------------

describe('aplicarSplit', () => {
  beforeEach(() => {
    resetarStore()
    useAppStore.getState().setLancamentos([
      lancamento({ valor: -100 }),
      lancamento({ transcricao: 'Outro', valor: -50 }),
    ])
  })

  it('substitui a linha pela lista resultante de ratearSplit (N=2)', () => {
    useAppStore.getState().aplicarSplit(0, [{ iniciais: 'ES' }, { iniciais: 'JF' }])
    const lancamentos = useAppStore.getState().lancamentos
    // A linha 0 expandiu para 2 + linha original 1 → total 3
    expect(lancamentos).toHaveLength(3)
    expect(lancamentos[0].iniciais).toBe('ES')
    expect(lancamentos[1].iniciais).toBe('JF')
    expect(lancamentos[2].transcricao).toBe('Outro')
  })

  it('soma dos valores das linhas resultantes é igual ao valor original', () => {
    useAppStore.getState().aplicarSplit(0, [{ iniciais: 'ES' }, { iniciais: 'JF' }, { iniciais: 'MR' }])
    const lancamentos = useAppStore.getState().lancamentos
    const soma = lancamentos.slice(0, 3).reduce((acc, l) => acc + l.valor, 0)
    // Valor original era -100; as 3 primeiras linhas são o split, a 4ª é 'Outro'
    expect(soma).toBe(-100)
  })

  it('N=1 alvo substitui a linha por lista unitária com valor idêntico', () => {
    useAppStore.getState().aplicarSplit(0, [{ iniciais: 'ES' }])
    const lancamentos = useAppStore.getState().lancamentos
    expect(lancamentos).toHaveLength(2)
    expect(lancamentos[0].valor).toBe(-100)
  })
})

// ---------------------------------------------------------------------------
// 19–23. undo
// ---------------------------------------------------------------------------

describe('undo', () => {
  beforeEach(() => {
    resetarStore()
    useAppStore.getState().setLancamentos([
      lancamento({ transcricao: 'A', valor: -100 }),
      lancamento({ transcricao: 'B', valor: -200 }),
    ])
  })

  it('reverte editarCelula — estado volta ao anterior', () => {
    useAppStore.getState().editarCelula(0, 'natureza', 'Moradia')
    expect(useAppStore.getState().lancamentos[0].natureza).toBe('Moradia')
    useAppStore.getState().undo()
    expect(useAppStore.getState().lancamentos[0].natureza).toBe('Alimentação')
  })

  it('reverte excluirLinha — linha reintegrada no mesmo índice', () => {
    useAppStore.getState().excluirLinha(0)
    expect(useAppStore.getState().lancamentos).toHaveLength(1)
    useAppStore.getState().undo()
    expect(useAppStore.getState().lancamentos).toHaveLength(2)
    expect(useAppStore.getState().lancamentos[0].transcricao).toBe('A')
  })

  it('reverte moverLinha — posições restauradas', () => {
    useAppStore.getState().moverLinha(0, 'baixo')
    expect(useAppStore.getState().lancamentos[0].transcricao).toBe('B')
    useAppStore.getState().undo()
    expect(useAppStore.getState().lancamentos[0].transcricao).toBe('A')
    expect(useAppStore.getState().lancamentos[1].transcricao).toBe('B')
  })

  it('reverte aplicarSplit — linha original restaurada', () => {
    useAppStore.getState().aplicarSplit(0, [{ iniciais: 'ES' }, { iniciais: 'JF' }])
    expect(useAppStore.getState().lancamentos).toHaveLength(3)
    useAppStore.getState().undo()
    expect(useAppStore.getState().lancamentos).toHaveLength(2)
    expect(useAppStore.getState().lancamentos[0].valor).toBe(-100)
  })

  it('undo consecutivo reverte múltiplas operações em ordem inversa', () => {
    useAppStore.getState().editarCelula(0, 'natureza', 'Moradia')
    useAppStore.getState().editarCelula(0, 'natureza', 'Saúde')
    useAppStore.getState().undo()
    expect(useAppStore.getState().lancamentos[0].natureza).toBe('Moradia')
    useAppStore.getState().undo()
    expect(useAppStore.getState().lancamentos[0].natureza).toBe('Alimentação')
  })

  it('sem efeito quando histórico está vazio', () => {
    expect(useAppStore.getState().historico).toHaveLength(0)
    const antes = useAppStore.getState().lancamentos.map((l) => l.transcricao)
    useAppStore.getState().undo()
    const depois = useAppStore.getState().lancamentos.map((l) => l.transcricao)
    expect(depois).toEqual(antes)
  })
})

describe('redo', () => {
  beforeEach(() => {
    resetarStore()
    useAppStore.getState().setLancamentos([
      lancamento({ transcricao: 'A', valor: -100 }),
      lancamento({ transcricao: 'B', valor: -200 }),
    ])
  })

  it('refaz editarCelula após undo — valor reaplicado', () => {
    useAppStore.getState().editarCelula(0, 'natureza', 'Moradia')
    useAppStore.getState().undo()
    expect(useAppStore.getState().lancamentos[0].natureza).toBe('Alimentação')
    useAppStore.getState().redo()
    expect(useAppStore.getState().lancamentos[0].natureza).toBe('Moradia')
  })

  it('refaz excluirLinha após undo — linha removida de novo', () => {
    useAppStore.getState().excluirLinha(0)
    useAppStore.getState().undo()
    expect(useAppStore.getState().lancamentos).toHaveLength(2)
    useAppStore.getState().redo()
    expect(useAppStore.getState().lancamentos).toHaveLength(1)
    expect(useAppStore.getState().lancamentos[0].transcricao).toBe('B')
  })

  it('nova mutação invalida o redo (futuro é zerado)', () => {
    useAppStore.getState().editarCelula(0, 'natureza', 'Moradia')
    useAppStore.getState().undo()
    expect(useAppStore.getState().futuro).toHaveLength(1)
    useAppStore.getState().editarCelula(1, 'natureza', 'Saúde')
    expect(useAppStore.getState().futuro).toHaveLength(0)
    // redo agora é no-op — a natureza do índice 0 permanece revertida
    useAppStore.getState().redo()
    expect(useAppStore.getState().lancamentos[0].natureza).toBe('Alimentação')
  })

  it('sem efeito quando futuro está vazio', () => {
    const antes = useAppStore.getState().lancamentos.map((l) => l.natureza)
    useAppStore.getState().redo()
    const depois = useAppStore.getState().lancamentos.map((l) => l.natureza)
    expect(depois).toEqual(antes)
  })
})

// ---------------------------------------------------------------------------
// Flag `sujo` — Task 3 da spec grid-autocomplete-aviso-saida
// ---------------------------------------------------------------------------

describe('flag sujo', () => {
  beforeEach(() => {
    resetarStore()
    useAppStore.getState().setLancamentos([lancamento()])
    // Após setLancamentos com não-vazio, sujo fica true.
    // Resetar manualmente para testar a partir de estado limpo nos casos que precisam.
    useAppStore.setState({ sujo: false })
  })

  it('sujo liga após editarCelula', () => {
    expect(useAppStore.getState().sujo).toBe(false)
    useAppStore.getState().editarCelula(0, 'natureza', 'Moradia')
    expect(useAppStore.getState().sujo).toBe(true)
  })

  it('sujo liga após setLancamentos com array não-vazio', () => {
    expect(useAppStore.getState().sujo).toBe(false)
    useAppStore.getState().setLancamentos([lancamento()])
    expect(useAppStore.getState().sujo).toBe(true)
  })

  it('sujo desliga após marcarLimpo()', () => {
    useAppStore.getState().editarCelula(0, 'natureza', 'Moradia')
    expect(useAppStore.getState().sujo).toBe(true)
    useAppStore.getState().marcarLimpo()
    expect(useAppStore.getState().sujo).toBe(false)
  })

  // TL-T5-01: undo não limpa o flag sujo (D6 do ADR — sujo fora de EstadoMutavel)
  it('undo após editarCelula mantém sujo: true — undo NÃO limpa o flag', () => {
    expect(useAppStore.getState().sujo).toBe(false)
    useAppStore.getState().editarCelula(0, 'natureza', 'Moradia')
    expect(useAppStore.getState().sujo).toBe(true)
    useAppStore.getState().undo()
    // Undo restaura o valor de natureza, mas sujo permanece true (D6)
    expect(useAppStore.getState().lancamentos[0].natureza).toBe('Alimentação')
    expect(useAppStore.getState().sujo).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// calcularTemaLinha — Task 5 da spec grid-autocomplete-aviso-saida
// Precedência: investimento > transferência interna > erro de validação
// ---------------------------------------------------------------------------

describe('calcularTemaLinha', () => {
  const naturezasValidas = ['Alimentação', 'Moradia', 'Transporte']

  function lancamentoBase(parcial: Partial<Lancamento> = {}): Lancamento {
    return {
      fonte: 'Nubank',
      data: '2025-03-15',
      transcricao: 'Compra',
      valor: -50,
      iniciais: 'ES',
      natureza: 'Alimentação',
      descricao: 'Supermercado',
      transferenciaInterna: false,
      investimento: null,
      ...parcial,
    }
  }

  // TL-T5-02: TEMA_INVESTIMENTO quando investimento != null (precedência máxima)
  it('retorna TEMA_INVESTIMENTO quando investimento != null', () => {
    const l = lancamentoBase({ investimento: 'Tesouro Direto' })
    expect(calcularTemaLinha(l, naturezasValidas)).toBe(TEMA_INVESTIMENTO)
  })

  // TL-T5-03: investimento vence transferenciaInterna (precedência máxima)
  it('retorna TEMA_INVESTIMENTO mesmo quando transferenciaInterna é true — investimento tem precedência', () => {
    const l = lancamentoBase({ investimento: 'CDB', transferenciaInterna: true })
    expect(calcularTemaLinha(l, naturezasValidas)).toBe(TEMA_INVESTIMENTO)
  })

  // TL-T5-04: TEMA_TRANSFERENCIA quando transferenciaInterna=true e investimento=null
  it('retorna TEMA_TRANSFERENCIA quando transferenciaInterna é true e investimento é null', () => {
    const l = lancamentoBase({ transferenciaInterna: true, investimento: null })
    expect(calcularTemaLinha(l, naturezasValidas)).toBe(TEMA_TRANSFERENCIA)
  })

  // TL-T5-05: TEMA_ERRO quando natureza inválida (sem investimento, sem transferência)
  it('retorna TEMA_ERRO quando natureza é inválida e linha não é investimento nem transferência', () => {
    const l = lancamentoBase({ natureza: 'NaturezaDesconhecida' })
    expect(calcularTemaLinha(l, naturezasValidas)).toBe(TEMA_ERRO)
  })

  it('retorna undefined quando linha é normal (natureza válida, sem investimento, sem transferência)', () => {
    const l = lancamentoBase({ natureza: 'Alimentação' })
    expect(calcularTemaLinha(l, naturezasValidas)).toBeUndefined()
  })
})
