// ADR: see Docs/specs/grid-revisao.adr.md

import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../appStore'
import type { CampoEditavel } from '../appStore'
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
    futuro: [],
    csvArquivo: null,
    sujo: false,
    filtroFontes: [],
    filtroNaturezas: [],
    filtroSoIncompletos: false,
    ordenacaoColuna: null,
    ordenacaoDirecao: 'asc',
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

// ---------------------------------------------------------------------------
// lancamentosVisiveis — TL-T1-06 a TL-T1-11
// ---------------------------------------------------------------------------

describe('lancamentosVisiveis', () => {
  beforeEach(resetarStore)

  // TL-T1-06: sem filtro retorna todos os lançamentos
  it('sem filtro retorna todos os lançamentos na ordem original', () => {
    const lista = [
      lancamento({ transcricao: 'A' }),
      lancamento({ transcricao: 'B' }),
      lancamento({ transcricao: 'C' }),
    ]
    useAppStore.getState().setLancamentos(lista)
    const visiveis = useAppStore.getState().lancamentosVisiveis
    expect(visiveis).toHaveLength(3)
    expect(visiveis[0].transcricao).toBe('A')
    expect(visiveis[2].transcricao).toBe('C')
  })

  // TL-T1-07: filtro por fonte reduz a lista
  it('filtro por fonte retorna apenas lançamentos da fonte selecionada', () => {
    useAppStore.getState().setLancamentos([
      lancamento({ transcricao: 'A', fonte: 'Nubank' }),
      lancamento({ transcricao: 'B', fonte: 'Itaú' }),
      lancamento({ transcricao: 'C', fonte: 'Nubank' }),
    ])
    useAppStore.getState().setFiltroFontes(['Nubank'])
    const visiveis = useAppStore.getState().lancamentosVisiveis
    expect(visiveis).toHaveLength(2)
    expect(visiveis.every((l) => l.fonte === 'Nubank')).toBe(true)
  })

  // TL-T1-08: filtro por natureza reduz a lista
  it('filtro por natureza retorna apenas lançamentos da natureza selecionada', () => {
    useAppStore.getState().setLancamentos([
      lancamento({ transcricao: 'A', natureza: 'Alimentação' }),
      lancamento({ transcricao: 'B', natureza: 'Moradia' }),
      lancamento({ transcricao: 'C', natureza: 'Alimentação' }),
    ])
    useAppStore.getState().setFiltroNaturezas(['Moradia'])
    const visiveis = useAppStore.getState().lancamentosVisiveis
    expect(visiveis).toHaveLength(1)
    expect(visiveis[0].transcricao).toBe('B')
  })

  // TL-T1-09: filtroSoIncompletos mostra apenas lançamentos com natureza ou iniciais vazias
  it('filtroSoIncompletos mostra apenas lançamentos com natureza ou iniciais vazios', () => {
    useAppStore.getState().setLancamentos([
      lancamento({ transcricao: 'A', natureza: 'Alimentação', iniciais: 'ES' }),
      lancamento({ transcricao: 'B', natureza: '', iniciais: 'ES' }),
      lancamento({ transcricao: 'C', natureza: 'Moradia', iniciais: '' }),
    ])
    useAppStore.getState().setFiltroSoIncompletos(true)
    const visiveis = useAppStore.getState().lancamentosVisiveis
    expect(visiveis).toHaveLength(2)
    expect(visiveis.map((l) => l.transcricao)).toEqual(['B', 'C'])
  })

  // TL-T1-10: ordenação asc/desc por coluna
  it('ordenação por valor asc ordena do menor para o maior', () => {
    useAppStore.getState().setLancamentos([
      lancamento({ transcricao: 'A', valor: -300 }),
      lancamento({ transcricao: 'B', valor: -100 }),
      lancamento({ transcricao: 'C', valor: -200 }),
    ])
    useAppStore.getState().setOrdenacao('valor', 'asc')
    const visiveis = useAppStore.getState().lancamentosVisiveis
    expect(visiveis[0].valor).toBe(-300)
    expect(visiveis[1].valor).toBe(-200)
    expect(visiveis[2].valor).toBe(-100)
  })

  it('ordenação por valor desc ordena do maior para o menor', () => {
    useAppStore.getState().setLancamentos([
      lancamento({ transcricao: 'A', valor: -300 }),
      lancamento({ transcricao: 'B', valor: -100 }),
      lancamento({ transcricao: 'C', valor: -200 }),
    ])
    useAppStore.getState().setOrdenacao('valor', 'desc')
    const visiveis = useAppStore.getState().lancamentosVisiveis
    expect(visiveis[0].valor).toBe(-100)
    expect(visiveis[1].valor).toBe(-200)
    expect(visiveis[2].valor).toBe(-300)
  })

  // TL-T1-11: múltiplos filtros combinados (fonte + natureza)
  it('múltiplos filtros combinados restringem a lista cumulativamente', () => {
    useAppStore.getState().setLancamentos([
      lancamento({ transcricao: 'A', fonte: 'Nubank', natureza: 'Alimentação' }),
      lancamento({ transcricao: 'B', fonte: 'Itaú', natureza: 'Alimentação' }),
      lancamento({ transcricao: 'C', fonte: 'Nubank', natureza: 'Moradia' }),
    ])
    useAppStore.getState().setFiltroFontes(['Nubank'])
    useAppStore.getState().setFiltroNaturezas(['Alimentação'])
    const visiveis = useAppStore.getState().lancamentosVisiveis
    expect(visiveis).toHaveLength(1)
    expect(visiveis[0].transcricao).toBe('A')
  })

  // TL-T1-17: lancamentos permanece inalterado por filtro/ordenação
  it('o array lancamentos permanece inalterado quando filtros estão ativos', () => {
    const lista = [
      lancamento({ transcricao: 'A', fonte: 'Nubank' }),
      lancamento({ transcricao: 'B', fonte: 'Itaú' }),
      lancamento({ transcricao: 'C', fonte: 'Nubank' }),
    ]
    useAppStore.getState().setLancamentos(lista)
    useAppStore.getState().setFiltroFontes(['Nubank'])
    expect(useAppStore.getState().lancamentos).toHaveLength(3)
    expect(useAppStore.getState().lancamentosVisiveis).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Filtros fora do histórico — TL-T1-16
// ---------------------------------------------------------------------------

describe('filtros fora do histórico de undo/redo', () => {
  beforeEach(() => {
    resetarStore()
    useAppStore.getState().setLancamentos([
      lancamento({ fonte: 'Nubank' }),
      lancamento({ fonte: 'Itaú' }),
    ])
    useAppStore.setState({ historico: [], futuro: [] })
  })

  // TL-T1-16: mudanças nos campos de filtro NÃO geram entradas no historico
  it('setFiltroFontes não gera entrada no histórico', () => {
    useAppStore.getState().setFiltroFontes(['Nubank'])
    expect(useAppStore.getState().historico).toHaveLength(0)
  })

  it('setFiltroNaturezas não gera entrada no histórico', () => {
    useAppStore.getState().setFiltroNaturezas(['Alimentação'])
    expect(useAppStore.getState().historico).toHaveLength(0)
  })

  it('setFiltroSoIncompletos não gera entrada no histórico', () => {
    useAppStore.getState().setFiltroSoIncompletos(true)
    expect(useAppStore.getState().historico).toHaveLength(0)
  })

  it('setOrdenacao não gera entrada no histórico', () => {
    useAppStore.getState().setOrdenacao('valor', 'desc')
    expect(useAppStore.getState().historico).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// preencherIntervalo — TL-T1-01 a TL-T1-05, TL-T1-18
// ---------------------------------------------------------------------------

describe('preencherIntervalo', () => {
  beforeEach(resetarStore)

  // TL-T1-01: aplica valor em campo editável em intervalo completo sem filtro
  it('sem filtro preenche campo editável em todas as linhas do intervalo', () => {
    useAppStore.getState().setLancamentos([
      lancamento({ transcricao: 'A', natureza: 'Alimentação' }),
      lancamento({ transcricao: 'B', natureza: 'Alimentação' }),
      lancamento({ transcricao: 'C', natureza: 'Alimentação' }),
    ])
    useAppStore.getState().preencherIntervalo(0, 2, 'natureza', 'Moradia')
    const lancamentos = useAppStore.getState().lancamentos
    expect(lancamentos[0].natureza).toBe('Moradia')
    expect(lancamentos[1].natureza).toBe('Moradia')
    expect(lancamentos[2].natureza).toBe('Moradia')
  })

  // TL-T1-02: ignora colunas somente leitura
  it('ignora coluna "fonte" (somente leitura) e não altera nada', () => {
    useAppStore.getState().setLancamentos([
      lancamento({ fonte: 'Nubank' }),
      lancamento({ fonte: 'Nubank' }),
    ])
    useAppStore.getState().preencherIntervalo(0, 1, 'fonte' as CampoEditavel, 'Itaú')
    expect(useAppStore.getState().lancamentos[0].fonte).toBe('Nubank')
    expect(useAppStore.getState().lancamentos[1].fonte).toBe('Nubank')
  })

  it('ignora coluna "data" (somente leitura) e não altera nada', () => {
    useAppStore.getState().setLancamentos([lancamento({ data: '2025-01-01' })])
    useAppStore.getState().preencherIntervalo(0, 0, 'data' as CampoEditavel, '2030-01-01')
    expect(useAppStore.getState().lancamentos[0].data).toBe('2025-01-01')
  })

  it('ignora coluna "transcricao" (somente leitura) e não altera nada', () => {
    useAppStore.getState().setLancamentos([lancamento({ transcricao: 'Original' })])
    useAppStore.getState().preencherIntervalo(0, 0, 'transcricao' as CampoEditavel, 'Novo')
    expect(useAppStore.getState().lancamentos[0].transcricao).toBe('Original')
  })

  // TL-T1-03: com filtro ativo aplica apenas nas linhas visíveis
  it('com filtro ativo preenche apenas as linhas visíveis no intervalo', () => {
    useAppStore.getState().setLancamentos([
      lancamento({ transcricao: 'A', fonte: 'Nubank', natureza: 'Alimentação' }),
      lancamento({ transcricao: 'B', fonte: 'Itaú', natureza: 'Alimentação' }),
      lancamento({ transcricao: 'C', fonte: 'Nubank', natureza: 'Alimentação' }),
    ])
    // Visíveis: A (visual 0, real 0), C (visual 1, real 2)
    useAppStore.getState().setFiltroFontes(['Nubank'])
    // Preenche todo o intervalo visual [0, 1]
    useAppStore.getState().preencherIntervalo(0, 1, 'natureza', 'Moradia')
    const lancamentos = useAppStore.getState().lancamentos
    expect(lancamentos[0].natureza).toBe('Moradia') // A — visível — atualizado
    expect(lancamentos[1].natureza).toBe('Alimentação') // B — oculto — intocado
    expect(lancamentos[2].natureza).toBe('Moradia') // C — visível — atualizado
  })

  // TL-T1-04: ignora linhas fora do intervalo
  it('não preenche linhas fora do intervalo [startRow, endRow]', () => {
    useAppStore.getState().setLancamentos([
      lancamento({ transcricao: 'A', natureza: 'Alimentação' }),
      lancamento({ transcricao: 'B', natureza: 'Alimentação' }),
      lancamento({ transcricao: 'C', natureza: 'Alimentação' }),
    ])
    useAppStore.getState().preencherIntervalo(1, 1, 'natureza', 'Moradia')
    const lancamentos = useAppStore.getState().lancamentos
    expect(lancamentos[0].natureza).toBe('Alimentação') // fora — intocado
    expect(lancamentos[1].natureza).toBe('Moradia')     // dentro — atualizado
    expect(lancamentos[2].natureza).toBe('Alimentação') // fora — intocado
  })

  // TL-T1-05: sem efeito quando intervalo não cobre nenhuma linha visível
  it('sem efeito quando nenhuma linha visível está no intervalo informado', () => {
    useAppStore.getState().setLancamentos([
      lancamento({ transcricao: 'A', fonte: 'Nubank', natureza: 'Alimentação' }),
      lancamento({ transcricao: 'B', fonte: 'Itaú', natureza: 'Alimentação' }),
    ])
    // Visíveis: apenas B (visual 0, real 1)
    useAppStore.getState().setFiltroFontes(['Itaú'])
    const historicoAntes = useAppStore.getState().historico.length
    // startRow=5 endRow=10 — sem linhas visíveis neste intervalo
    useAppStore.getState().preencherIntervalo(5, 10, 'natureza', 'Moradia')
    expect(useAppStore.getState().historico).toHaveLength(historicoAntes)
    expect(useAppStore.getState().lancamentos[0].natureza).toBe('Alimentação')
    expect(useAppStore.getState().lancamentos[1].natureza).toBe('Alimentação')
  })

  // TL-T1-18: empilha entrada de undo
  it('preencherIntervalo empilha pelo menos uma entrada no histórico de undo', () => {
    useAppStore.getState().setLancamentos([
      lancamento({ natureza: 'Alimentação' }),
      lancamento({ natureza: 'Alimentação' }),
    ])
    useAppStore.setState({ historico: [] })
    useAppStore.getState().preencherIntervalo(0, 1, 'natureza', 'Moradia')
    expect(useAppStore.getState().historico.length).toBeGreaterThan(0)
    // Undo reverte as mudanças
    const historicoLen = useAppStore.getState().historico.length
    for (let i = 0; i < historicoLen; i++) {
      useAppStore.getState().undo()
    }
    const lancamentos = useAppStore.getState().lancamentos
    expect(lancamentos[0].natureza).toBe('Alimentação')
    expect(lancamentos[1].natureza).toBe('Alimentação')
  })
})

// ---------------------------------------------------------------------------
// ciclarOrdenacao — ordenação por clique no cabeçalho (decisão humana 2026-07-15)
// ---------------------------------------------------------------------------

describe('ciclarOrdenacao', () => {
  beforeEach(resetarStore)

  it('primeiro clique numa coluna ativa asc', () => {
    useAppStore.getState().ciclarOrdenacao('valor')
    expect(useAppStore.getState().ordenacaoColuna).toBe('valor')
    expect(useAppStore.getState().ordenacaoDirecao).toBe('asc')
  })

  it('segundo clique na mesma coluna vira desc', () => {
    useAppStore.getState().ciclarOrdenacao('valor')
    useAppStore.getState().ciclarOrdenacao('valor')
    expect(useAppStore.getState().ordenacaoColuna).toBe('valor')
    expect(useAppStore.getState().ordenacaoDirecao).toBe('desc')
  })

  it('terceiro clique na mesma coluna remove a ordenação', () => {
    useAppStore.getState().ciclarOrdenacao('valor')
    useAppStore.getState().ciclarOrdenacao('valor')
    useAppStore.getState().ciclarOrdenacao('valor')
    expect(useAppStore.getState().ordenacaoColuna).toBeNull()
  })

  it('clicar em outra coluna reinicia o ciclo em asc', () => {
    useAppStore.getState().ciclarOrdenacao('valor')
    useAppStore.getState().ciclarOrdenacao('valor') // valor desc
    useAppStore.getState().ciclarOrdenacao('data')
    expect(useAppStore.getState().ordenacaoColuna).toBe('data')
    expect(useAppStore.getState().ordenacaoDirecao).toBe('asc')
  })

  it('re-deriva a visão: asc por valor reordena lancamentosVisiveis', () => {
    useAppStore.getState().setLancamentos([
      lancamento({ valor: -300 }),
      lancamento({ valor: -100 }),
      lancamento({ valor: -200 }),
    ])
    useAppStore.getState().ciclarOrdenacao('valor')
    const valores = useAppStore.getState().lancamentosVisiveis.map((l) => l.valor)
    expect(valores).toEqual([-300, -200, -100])
  })

  it('não gera entrada no histórico de undo', () => {
    useAppStore.getState().setLancamentos([lancamento()])
    const antes = useAppStore.getState().historico.length
    useAppStore.getState().ciclarOrdenacao('valor')
    expect(useAppStore.getState().historico.length).toBe(antes)
  })
})
