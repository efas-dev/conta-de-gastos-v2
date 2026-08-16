// ADR: see spec/fundacao-operacoes.adr.md

import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../appStore'
import { estadoInicialAvisos } from '../avisosSlice'
import type { Aviso, Lancamento } from '../../../types'

// ---------------------------------------------------------------------------
// Prova dedicada — Task T15 (ADR fundacao-operacoes, Decisão 2: id serial de
// nascimento, nunca índice de array).
//
// Fecha a lacuna registrada pela Task T13 (iteração-log, "Pressupostos
// assumidos"): nenhum teste até então exercitava desfazer ENTRELAÇADO entre
// dois avisos DIFERENTES cujas âncoras (`ancoraId`) se cruzam entre si — só
// cadeias dentro do mesmo aviso (`removidos[id]`) tinham prova. Todos os
// lançamentos aqui usam `id` explícito atribuído (fixture `lancamento()`
// abaixo), nunca dependendo do gap de fixtures-sem-id documentado na Task T03.
//
// Camada de teste: integration (per Decomposição da spec) — exercita o store
// Zustand real (`useAppStore`), não um mock local de `set`/`get`.
// ---------------------------------------------------------------------------

let proximoIdLancamento = 1

function lancamento(parcial: Partial<Lancamento> = {}): Lancamento {
  return {
    id: proximoIdLancamento++,
    fonte: 'Nubank',
    data: '2025-03-15',
    transcricao: 'Mercado',
    valor: -150,
    iniciais: 'ES',
    natureza: 'Alimentação',
    descricao: 'Supermercado',
    ...parcial,
  }
}

function proposta(parcial: Partial<Aviso> = {}): Aviso {
  return {
    id: 'aviso-1',
    tipo: 'proposta',
    origem: 'conciliacao',
    mensagem: 'Proposta de teste',
    alvo: [],
    estado: 'pendente',
    ...parcial,
  }
}

function resetarStore(lancamentos: Lancamento[]): void {
  useAppStore.setState({
    lancamentos,
    avisosAcionaveis: estadoInicialAvisos,
  })
}

describe('avisosSlice — prova dedicada: ids sob undo/redo e reordenação (Task T15)', () => {
  beforeEach(() => {
    proximoIdLancamento = 1
  })

  describe('aplicar→desfazer preserva identidade e ordem via id, não por posição', () => {
    it('remove e restaura por id contra o store real, mesmo com mutacaoProposta multi-alvo', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const l2 = lancamento({ transcricao: 'Item 2' })
      const l3 = lancamento({ transcricao: 'Item 3' })
      resetarStore([l0, l1, l2, l3])
      useAppStore.getState().adicionarAvisos([
        proposta({
          id: 'a1',
          mutacaoProposta: { verbo: 'remover', alvo: [l1.id, l2.id] },
        }),
      ])

      useAppStore.getState().aplicar('a1')
      expect(useAppStore.getState().lancamentos.map((l) => l.id)).toEqual([l0.id, l3.id])

      useAppStore.getState().desfazer('a1')
      expect(useAppStore.getState().lancamentos.map((l) => l.id)).toEqual([
        l0.id,
        l1.id,
        l2.id,
        l3.id,
      ])
      expect(useAppStore.getState().lancamentos).toEqual([l0, l1, l2, l3])
    })
  })

  describe('reordenação da grid preservando id', () => {
    it('aplicar casa por id mesmo depois da grid ter sido reordenada antes da aplicação, e desfazer restaura relativo ao estado (já reordenado) vigente', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const l2 = lancamento({ transcricao: 'Item 2' })
      resetarStore([l0, l1, l2])

      // Reordenação da grid (ex.: drag-and-drop) ANTES de qualquer aplicar —
      // l2 passa a ficar entre l1 e l0.
      useAppStore.setState({ lancamentos: [l1, l2, l0] })

      useAppStore.getState().adicionarAvisos([
        proposta({ id: 'a1', mutacaoProposta: { verbo: 'remover', alvo: [l2.id] } }),
      ])

      useAppStore.getState().aplicar('a1')
      // l2 é removido de onde ele estava na lista JÁ reordenada — não do índice
      // que ocupava antes da reordenação.
      expect(useAppStore.getState().lancamentos).toEqual([l1, l0])
      expect(useAppStore.getState().avisosAcionaveis.removidos['a1']).toEqual([
        { ancoraId: l1.id, lancamento: l2 },
      ])

      useAppStore.getState().desfazer('a1')
      // Reinserido logo após l1 (sua âncora), preservando a ordem reordenada —
      // nunca de volta à ordem original [l0, l1, l2].
      expect(useAppStore.getState().lancamentos).toEqual([l1, l2, l0])
    })

    it('desfazer continua correto quando a grid é reordenada de novo entre aplicar e desfazer', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const l2 = lancamento({ transcricao: 'Item 2' })
      const l3 = lancamento({ transcricao: 'Item 3' })
      resetarStore([l0, l1, l2, l3])

      useAppStore.getState().adicionarAvisos([
        proposta({ id: 'a1', mutacaoProposta: { verbo: 'remover', alvo: [l1.id] } }),
      ])
      useAppStore.getState().aplicar('a1')
      expect(useAppStore.getState().lancamentos).toEqual([l0, l2, l3])

      // Duas reordenações sucessivas da grid depois de aplicar, antes de desfazer.
      useAppStore.setState({ lancamentos: [l3, l0, l2] })
      useAppStore.setState({ lancamentos: [l2, l3, l0] })

      useAppStore.getState().desfazer('a1')

      // l1 é reinserido logo após l0 (sua âncora), onde quer que l0 esteja no
      // estado vigente no momento do desfazer — não na posição original.
      expect(useAppStore.getState().lancamentos).toEqual([l2, l3, l0, l1])
    })
  })

  describe('buracos na numeração após remoção — comportamento correto, não regenerado', () => {
    it('ids remanescentes não são renumerados: o id de cada lançamento é estável antes e depois de uma remoção no meio da lista', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const l2 = lancamento({ transcricao: 'Item 2' })
      const l3 = lancamento({ transcricao: 'Item 3' })
      resetarStore([l0, l1, l2, l3])
      expect([l0.id, l1.id, l2.id, l3.id]).toEqual([1, 2, 3, 4])

      useAppStore.getState().adicionarAvisos([
        proposta({ id: 'a1', mutacaoProposta: { verbo: 'remover', alvo: [l1.id] } }),
      ])
      useAppStore.getState().aplicar('a1')

      // A lista remanescente tem um BURACO na sequência de ids (1, 3, 4 —
      // sem o 2) em vez de ser recompactada para (1, 2, 3). Isso é o
      // comportamento correto por design (ADR fundacao-operacoes, Decisão 2,
      // "Consequências"), não um bug a corrigir.
      expect(useAppStore.getState().lancamentos.map((l) => l.id)).toEqual([1, 3, 4])
      // l2 e l3 mantêm o MESMO id de antes da remoção — nenhuma renumeração.
      expect(useAppStore.getState().lancamentos[1].id).toBe(l2.id)
      expect(useAppStore.getState().lancamentos[2].id).toBe(l3.id)
    })

    it('desfazer preenche o buraco de volta sem alterar o id de nenhum lançamento remanescente', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const l2 = lancamento({ transcricao: 'Item 2' })
      resetarStore([l0, l1, l2])
      useAppStore.getState().adicionarAvisos([
        proposta({ id: 'a1', mutacaoProposta: { verbo: 'remover', alvo: [l1.id] } }),
      ])

      useAppStore.getState().aplicar('a1')
      expect(useAppStore.getState().lancamentos.map((l) => l.id)).toEqual([l0.id, l2.id])

      useAppStore.getState().desfazer('a1')

      // Buraco fechado — sequência de ids volta a ser contígua, mas porque o
      // MESMO id (l1.id) foi reinserido, não porque algo foi renumerado.
      expect(useAppStore.getState().lancamentos.map((l) => l.id)).toEqual([
        l0.id,
        l1.id,
        l2.id,
      ])
    })
  })

  describe('desfazer entrelaçado entre dois avisos com âncoras cruzadas', () => {
    // Cenário: [l0, l1, l2]. Aviso A remove l2 (âncora vira l1). Aviso B,
    // aplicado DEPOIS de A, remove l1 (âncora vira l0) — a âncora do removido
    // de A (l1) é, ela própria, removida por um aviso B distinto. Nenhum
    // teste anterior (T13) exercitava esse cruzamento entre avisos
    // diferentes — só cadeias dentro do MESMO aviso (mesmo `removidos[id]`).
    function montarCenarioEntrelacado() {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const l2 = lancamento({ transcricao: 'Item 2' })
      resetarStore([l0, l1, l2])

      useAppStore.getState().adicionarAvisos([
        proposta({ id: 'A', mutacaoProposta: { verbo: 'remover', alvo: [l2.id] } }),
      ])
      useAppStore.getState().aplicar('A')
      expect(useAppStore.getState().avisosAcionaveis.removidos['A']).toEqual([
        { ancoraId: l1.id, lancamento: l2 },
      ])

      useAppStore.getState().adicionarAvisos([
        proposta({ id: 'B', mutacaoProposta: { verbo: 'remover', alvo: [l1.id] } }),
      ])
      useAppStore.getState().aplicar('B')
      expect(useAppStore.getState().avisosAcionaveis.removidos['B']).toEqual([
        { ancoraId: l0.id, lancamento: l1 },
      ])

      // Com os dois avisos aplicados, só l0 restou — confirma que as âncoras
      // realmente se cruzam (a âncora de A não está mais em `lancamentos`).
      expect(useAppStore.getState().lancamentos).toEqual([l0])

      return { l0, l1, l2 }
    }

    it('desfeito em ordem LIFO (mais recente primeiro: B depois A) reconstrói a ordem original', () => {
      const { l0, l1, l2 } = montarCenarioEntrelacado()

      useAppStore.getState().desfazer('B')
      useAppStore.getState().desfazer('A')

      expect(useAppStore.getState().lancamentos).toEqual([l0, l1, l2])
    })

    it('desfeito em ordem NÃO-LIFO (mais antigo primeiro: A depois B) também reconstrói a ordem original ao final', () => {
      const { l0, l1, l2 } = montarCenarioEntrelacado()

      useAppStore.getState().desfazer('A')
      useAppStore.getState().desfazer('B')

      expect(useAppStore.getState().lancamentos).toEqual([l0, l1, l2])
    })
  })
})
