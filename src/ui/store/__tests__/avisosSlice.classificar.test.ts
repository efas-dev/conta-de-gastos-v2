// ADR: see spec/dicionario-chave-canonica.adr.md

import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../appStore'
import { estadoInicialAvisos } from '../avisosSlice'
import type { Aviso, Lancamento } from '../../../types'

function lancamento(parcial: Partial<Lancamento> = {}): Lancamento {
  return {
    id: 1,
    fonte: 'extrato_itau',
    data: '2026-06-10',
    transcricao: 'PIX TRANSF JOAO AUG',
    valor: 2950,
    iniciais: 'ES',
    natureza: '',
    descricao: '',
    ...parcial,
  }
}

function propostaClassificar(parcial: Partial<Aviso> = {}): Aviso {
  return {
    id: 'classificacao-similaridade-1',
    tipo: 'proposta',
    origem: 'classificacao-similaridade',
    mensagem: 'parece ser Pensão residentes',
    alvo: ['1'],
    permanece: [],
    estado: 'pendente',
    mutacaoProposta: {
      verbo: 'classificar',
      alvo: [1],
      natureza: 'OT',
      descricao: 'Pensão residentes',
      iniciais: 'ES',
    },
    ...parcial,
  }
}

/**
 * T12 da spec `dicionario-chave-canonica`.
 *
 * O verbo `classificar` é o primeiro que não mexe na quantidade de linhas: ele sobrescreve três
 * campos de linhas que continuam onde estavam. Por isso o que `desfazer` precisa restaurar é o
 * valor anterior desses campos — normalmente vazio, já que a proposta só nasce para linhas que o
 * dicionário não classificou.
 */
describe('avisosSlice — verbo classificar (T12)', () => {
  beforeEach(() => {
    useAppStore.setState({
      lancamentos: [lancamento()],
      avisosAcionaveis: { ...estadoInicialAvisos, avisos: [propostaClassificar()] },
    })
  })

  it('CL-01: aplicar grava natureza, descrição e iniciais no lançamento alvo', () => {
    useAppStore.getState().aplicar('classificacao-similaridade-1')

    const [linha] = useAppStore.getState().lancamentos
    expect(linha.natureza).toBe('OT')
    expect(linha.descricao).toBe('Pensão residentes')
    expect(linha.iniciais).toBe('ES')
  })

  it('CL-02: aplicar NÃO remove nem adiciona linhas', () => {
    useAppStore.getState().aplicar('classificacao-similaridade-1')
    expect(useAppStore.getState().lancamentos).toHaveLength(1)
  })

  it('CL-03: aplicar marca o aviso como aplicado', () => {
    useAppStore.getState().aplicar('classificacao-similaridade-1')
    expect(useAppStore.getState().avisosAcionaveis.avisos[0].estado).toBe('aplicado')
  })

  it('CL-04: desfazer restaura os campos vazios que havia antes', () => {
    const store = useAppStore.getState()
    store.aplicar('classificacao-similaridade-1')
    useAppStore.getState().desfazer('classificacao-similaridade-1')

    const [linha] = useAppStore.getState().lancamentos
    expect(linha.natureza).toBe('')
    expect(linha.descricao).toBe('')
  })

  it('CL-05: desfazer restaura classificação anterior NÃO vazia', () => {
    useAppStore.setState({
      lancamentos: [lancamento({ natureza: 'GO', descricao: 'Classificação antiga' })],
      avisosAcionaveis: { ...estadoInicialAvisos, avisos: [propostaClassificar()] },
    })

    useAppStore.getState().aplicar('classificacao-similaridade-1')
    expect(useAppStore.getState().lancamentos[0].descricao).toBe('Pensão residentes')

    useAppStore.getState().desfazer('classificacao-similaridade-1')
    const [linha] = useAppStore.getState().lancamentos
    expect(linha.natureza).toBe('GO')
    expect(linha.descricao).toBe('Classificação antiga')
  })

  it('CL-06: desfazer devolve o aviso a pendente e limpa o snapshot', () => {
    useAppStore.getState().aplicar('classificacao-similaridade-1')
    useAppStore.getState().desfazer('classificacao-similaridade-1')

    const { avisos, classificados } = useAppStore.getState().avisosAcionaveis
    expect(avisos[0].estado).toBe('pendente')
    expect(classificados['classificacao-similaridade-1']).toBeUndefined()
  })

  it('CL-07: aplicar → desfazer → aplicar é estável', () => {
    const acao = () => {
      useAppStore.getState().aplicar('classificacao-similaridade-1')
      useAppStore.getState().desfazer('classificacao-similaridade-1')
    }
    acao()
    acao()
    useAppStore.getState().aplicar('classificacao-similaridade-1')

    expect(useAppStore.getState().lancamentos).toHaveLength(1)
    expect(useAppStore.getState().lancamentos[0].descricao).toBe('Pensão residentes')
  })

  it('CL-08: linhas fora do alvo ficam intocadas', () => {
    useAppStore.setState({
      lancamentos: [lancamento(), lancamento({ id: 2, transcricao: 'Outra', natureza: 'CM', descricao: 'Intocada' })],
      avisosAcionaveis: { ...estadoInicialAvisos, avisos: [propostaClassificar()] },
    })

    useAppStore.getState().aplicar('classificacao-similaridade-1')
    const outra = useAppStore.getState().lancamentos.find((l) => l.id === 2)
    expect(outra?.descricao).toBe('Intocada')
  })

  it('CL-09: aplicar sobre alvo inexistente não quebra nem altera linhas', () => {
    useAppStore.setState({
      lancamentos: [lancamento({ id: 99 })],
      avisosAcionaveis: { ...estadoInicialAvisos, avisos: [propostaClassificar()] },
    })

    useAppStore.getState().aplicar('classificacao-similaridade-1')
    expect(useAppStore.getState().lancamentos[0].natureza).toBe('')
    expect(useAppStore.getState().avisosAcionaveis.avisos[0].estado).toBe('aplicado')
  })
})
