// ADR: see Docs/specs/avisos-acionaveis.adr.md

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  criarAvisosSlice,
  estadoInicialAvisos,
  selecionarContagemPendentes,
  type StoreComAvisos,
} from '../avisosSlice'
import { reiniciarContadorIds } from '../../../parsers/idSerial'
import type { Aviso, Lancamento } from '../../../types'

// ---------------------------------------------------------------------------
// Fixtures
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
    alvo: ['0'],
    estado: 'pendente',
    ...parcial,
  }
}

function informativo(parcial: Partial<Aviso> = {}): Aviso {
  return {
    id: 'aviso-info',
    tipo: 'informativo',
    origem: 'valor-pendente',
    mensagem: 'Aviso informativo de teste',
    alvo: [],
    estado: 'pendente',
    ...parcial,
  }
}

// ---------------------------------------------------------------------------
// Store de teste mínimo — implementa StoreComAvisos com set/get reais
// ---------------------------------------------------------------------------

function criarStoreDeTeste(lancamentos: Lancamento[] = []) {
  let estado: StoreComAvisos = {
    lancamentos,
    avisosAcionaveis: { ...estadoInicialAvisos },
  }

  const get = () => estado

  const set = (
    partial: Partial<StoreComAvisos> | ((s: StoreComAvisos) => Partial<StoreComAvisos>),
  ) => {
    const parcial = typeof partial === 'function' ? partial(estado) : partial
    estado = { ...estado, ...parcial }
  }

  const acoes = criarAvisosSlice(set, get)

  return { get, set, acoes }
}

describe('avisosSlice', () => {
  beforeEach(() => {
    reiniciarContadorIds()
  })

  describe('adicionarAvisos', () => {
    it('adiciona avisos ao estado do slice em modo append', () => {
      const { get, acoes } = criarStoreDeTeste()
      acoes.adicionarAvisos([proposta({ id: 'a1' })])
      acoes.adicionarAvisos([proposta({ id: 'a2' })])

      expect(get().avisosAcionaveis.avisos.map((a) => a.id)).toEqual(['a1', 'a2'])
    })

    it('parte de estadoInicialAvisos vazio', () => {
      expect(estadoInicialAvisos).toEqual({
        avisos: [],
        removidos: {},
        adicionados: {},
        avisoEmInspecao: null,
      })
    })
  })

  describe('aplicar', () => {
    it('remove de lancamentos os itens cujos índices estão em alvo e marca o aviso como aplicado', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const { get, acoes } = criarStoreDeTeste([l0, l1])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['0'] })])

      acoes.aplicar('a1')

      expect(get().lancamentos).toEqual([l1])
      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('aplicado')
    })

    it('é idempotente — chamar aplicar duas vezes não remove nada de novo nem duplica remoção', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const { get, acoes } = criarStoreDeTeste([l0, l1])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['0'] })])

      acoes.aplicar('a1')
      acoes.aplicar('a1')

      expect(get().lancamentos).toEqual([l1])
      expect(get().avisosAcionaveis.removidos['a1']).toHaveLength(1)
    })

    it('não tem efeito em aviso do tipo informativo', () => {
      const l0 = lancamento()
      const { get, acoes } = criarStoreDeTeste([l0])
      acoes.adicionarAvisos([informativo({ id: 'info-1', alvo: ['0'] })])

      acoes.aplicar('info-1')

      expect(get().lancamentos).toEqual([l0])
      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'info-1')?.estado).toBe('pendente')
    })

    it('não tem efeito em aviso inexistente', () => {
      const l0 = lancamento()
      const { get, acoes } = criarStoreDeTeste([l0])

      acoes.aplicar('nao-existe')

      expect(get().lancamentos).toEqual([l0])
    })
  })

  describe('desfazer', () => {
    it('restaura os lançamentos removidos nas posições originais', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const l2 = lancamento({ transcricao: 'Item 2' })
      const { get, acoes } = criarStoreDeTeste([l0, l1, l2])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['1'] })])

      acoes.aplicar('a1')
      expect(get().lancamentos).toEqual([l0, l2])

      acoes.desfazer('a1')

      expect(get().lancamentos).toEqual([l0, l1, l2])
    })

    it('volta o estado do aviso de aplicado para pendente', () => {
      const l0 = lancamento()
      const { get, acoes } = criarStoreDeTeste([l0])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['0'] })])

      acoes.aplicar('a1')
      acoes.desfazer('a1')

      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('pendente')
    })

    it('é idempotente — desfazer em aviso que não está aplicado não tem efeito', () => {
      const l0 = lancamento()
      const { get, acoes } = criarStoreDeTeste([l0])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['0'] })])

      acoes.desfazer('a1')

      expect(get().lancamentos).toEqual([l0])
      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('pendente')
    })

    it('aplicar novamente após desfazer volta a remover (não fica travado)', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const { get, acoes } = criarStoreDeTeste([l0, l1])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['0'] })])

      acoes.aplicar('a1')
      acoes.desfazer('a1')
      acoes.aplicar('a1')

      expect(get().lancamentos).toEqual([l1])
      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('aplicado')
    })
  })

  describe('mutação genérica (mutacaoProposta) — Task T03 (ADR fundacao-operacoes, Decisão 1)', () => {
    it('aplicar casa o alvo por lancamento.id via mutacaoProposta, não pela posição no array', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      // Array reordenado (l1 na posição 0) e `alvo` legado deliberadamente vazio —
      // se a implementação ainda casasse por índice, nada seria removido.
      const { get, acoes } = criarStoreDeTeste([l1, l0])
      acoes.adicionarAvisos([
        proposta({ id: 'a1', alvo: [], mutacaoProposta: { verbo: 'remover', alvo: [l0.id] } }),
      ])

      acoes.aplicar('a1')

      expect(get().lancamentos).toEqual([l1])
      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('aplicado')
    })

    it('aplicar com mutacaoProposta ignora o `alvo` legado quando ambos estão presentes', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const { get, acoes } = criarStoreDeTeste([l0, l1])
      // `alvo` legado aponta para o índice 0 (l0); `mutacaoProposta` aponta para l1 por id.
      acoes.adicionarAvisos([
        proposta({
          id: 'a1',
          alvo: ['0'],
          mutacaoProposta: { verbo: 'remover', alvo: [l1.id] },
        }),
      ])

      acoes.aplicar('a1')

      expect(get().lancamentos).toEqual([l0])
    })

    it('desfazer reverte uma mutacaoProposta aplicada, reinserindo na posição original', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const { get, acoes } = criarStoreDeTeste([l1, l0])
      acoes.adicionarAvisos([
        proposta({ id: 'a1', alvo: [], mutacaoProposta: { verbo: 'remover', alvo: [l0.id] } }),
      ])

      acoes.aplicar('a1')
      expect(get().lancamentos).toEqual([l1])

      acoes.desfazer('a1')

      expect(get().lancamentos).toEqual([l1, l0])
      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('pendente')
    })

    it('aplicar com mutacaoProposta cujo alvo não existe mais em lancamentos não remove nada nem quebra', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const { get, acoes } = criarStoreDeTeste([l0])
      acoes.adicionarAvisos([
        proposta({ id: 'a1', alvo: [], mutacaoProposta: { verbo: 'remover', alvo: [9999] } }),
      ])

      acoes.aplicar('a1')

      expect(get().lancamentos).toEqual([l0])
      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('aplicado')
    })

    it('aplicar sobre aviso legado (sem mutacaoProposta) segue funcionando via ponte de compatibilidade, traduzindo o índice de `alvo` para o id do lançamento no momento da aplicação', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const l2 = lancamento({ transcricao: 'Item 2' })
      const { get, acoes } = criarStoreDeTeste([l0, l1, l2])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['1'] })])

      acoes.aplicar('a1')

      expect(get().lancamentos).toEqual([l0, l2])
    })
  })

  describe("mutação 'adicionar' (Task 3, ADR vr-despesas Decisão 1)", () => {
    function despesaSemId(parcial: Partial<Omit<Lancamento, 'id'>> = {}): Omit<Lancamento, 'id'> {
      return {
        fonte: 'form_vr',
        data: '2025-03-31',
        transcricao: 'VR',
        valor: -50,
        iniciais: 'ES',
        natureza: 'Alimentação',
        descricao: 'Despesa VR',
        ...parcial,
      }
    }

    it('TL-41/TL-42: aplicar insere N lançamentos com ids seriais novos ao final e marca o aviso aplicado', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const { get, acoes } = criarStoreDeTeste([l0])
      const novos = [despesaSemId({ descricao: 'Padaria' }), despesaSemId({ descricao: 'Farmácia' })]
      acoes.adicionarAvisos([
        proposta({ id: 'a1', origem: 'vr', alvo: [], mutacaoProposta: { verbo: 'adicionar', lancamentos: novos } }),
      ])

      acoes.aplicar('a1')

      const estado = get()
      expect(estado.lancamentos).toHaveLength(3)
      expect(estado.lancamentos[0]).toEqual(l0)
      expect(estado.lancamentos[1]).toMatchObject({ descricao: 'Padaria' })
      expect(estado.lancamentos[2]).toMatchObject({ descricao: 'Farmácia' })
      expect(typeof estado.lancamentos[1].id).toBe('number')
      expect(typeof estado.lancamentos[2].id).toBe('number')
      expect(estado.lancamentos[1].id).not.toBe(estado.lancamentos[2].id)
      expect(estado.avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('aplicado')
    })

    it('TL-43: desfazer remove exatamente os ids inseridos e volta o aviso a pendente', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const { get, acoes } = criarStoreDeTeste([l0])
      const novos = [despesaSemId({ descricao: 'Padaria' }), despesaSemId({ descricao: 'Farmácia' })]
      acoes.adicionarAvisos([
        proposta({ id: 'a1', origem: 'vr', alvo: [], mutacaoProposta: { verbo: 'adicionar', lancamentos: novos } }),
      ])

      acoes.aplicar('a1')
      expect(get().lancamentos).toHaveLength(3)

      acoes.desfazer('a1')

      expect(get().lancamentos).toEqual([l0])
      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('pendente')
    })

    it('TL-44: novo aplicar após desfazer gera um novo lote de ids, sem reaproveitar os anteriores', () => {
      const { get, acoes } = criarStoreDeTeste([])
      const novos = [despesaSemId({ descricao: 'Padaria' })]
      acoes.adicionarAvisos([
        proposta({ id: 'a1', origem: 'vr', alvo: [], mutacaoProposta: { verbo: 'adicionar', lancamentos: novos } }),
      ])

      acoes.aplicar('a1')
      const primeiroId = get().lancamentos[0].id
      acoes.desfazer('a1')
      expect(get().lancamentos).toEqual([])

      acoes.aplicar('a1')
      const segundoId = get().lancamentos[0].id

      expect(segundoId).not.toBe(primeiroId)
      expect(get().lancamentos).toHaveLength(1)
    })

    it('TL-45: aplicar é idempotente — chamar duas vezes seguidas não insere um segundo lote', () => {
      const { get, acoes } = criarStoreDeTeste([])
      const novos = [despesaSemId({ descricao: 'Padaria' })]
      acoes.adicionarAvisos([
        proposta({ id: 'a1', origem: 'vr', alvo: [], mutacaoProposta: { verbo: 'adicionar', lancamentos: novos } }),
      ])

      acoes.aplicar('a1')
      acoes.aplicar('a1')

      expect(get().lancamentos).toHaveLength(1)
    })

    it('não usa `removidos` para o aviso de adicionar — o registro fica em `adicionados`', () => {
      const { get, acoes } = criarStoreDeTeste([])
      const novos = [despesaSemId({ descricao: 'Padaria' })]
      acoes.adicionarAvisos([
        proposta({ id: 'a1', origem: 'vr', alvo: [], mutacaoProposta: { verbo: 'adicionar', lancamentos: novos } }),
      ])

      acoes.aplicar('a1')

      expect(get().avisosAcionaveis.removidos['a1']).toBeUndefined()
      expect(get().avisosAcionaveis.adicionados['a1']).toEqual([get().lancamentos[0].id])
    })
  })

  describe('âncora por id em `removidos` (Task T13, ADR fundacao-operacoes)', () => {
    it('grava `ancoraId: null` quando o lançamento removido era o primeiro da lista', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const { get, acoes } = criarStoreDeTeste([l0, l1])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['0'] })])

      acoes.aplicar('a1')

      expect(get().avisosAcionaveis.removidos['a1']).toEqual([{ ancoraId: null, lancamento: l0 }])
    })

    it('grava `ancoraId` igual ao id do lançamento imediatamente anterior quando não é o primeiro', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const l2 = lancamento({ transcricao: 'Item 2' })
      const { get, acoes } = criarStoreDeTeste([l0, l1, l2])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['1'] })])

      acoes.aplicar('a1')

      expect(get().avisosAcionaveis.removidos['a1']).toEqual([
        { ancoraId: l0.id, lancamento: l1 },
      ])
    })

    it('aplicar→desfazer removendo múltiplos lançamentos adjacentes de uma vez preserva a ordem relativa entre eles (cadeia de âncoras)', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const l2 = lancamento({ transcricao: 'Item 2' })
      const l3 = lancamento({ transcricao: 'Item 3' })
      const { get, acoes } = criarStoreDeTeste([l0, l1, l2, l3])
      acoes.adicionarAvisos([
        proposta({
          id: 'a1',
          alvo: [],
          mutacaoProposta: { verbo: 'remover', alvo: [l1.id, l2.id] },
        }),
      ])

      acoes.aplicar('a1')
      expect(get().lancamentos).toEqual([l0, l3])

      acoes.desfazer('a1')

      expect(get().lancamentos).toEqual([l0, l1, l2, l3])
    })

    it('aplicar→desfazer preserva a ordem correta mesmo quando `lancamentos` foi reordenado entre a remoção e o desfazer', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const l2 = lancamento({ transcricao: 'Item 2' })
      const { get, set, acoes } = criarStoreDeTeste([l0, l1, l2])
      acoes.adicionarAvisos([
        proposta({ id: 'a1', alvo: [], mutacaoProposta: { verbo: 'remover', alvo: [l1.id] } }),
      ])

      acoes.aplicar('a1')
      expect(get().lancamentos).toEqual([l0, l2])

      // Reordena a lista (ex.: drag-and-drop na grid) antes de desfazer — a âncora deve
      // continuar apontando para l0 por id, não pela posição atual (que agora é 1).
      set({ lancamentos: [l2, l0] })

      acoes.desfazer('a1')

      expect(get().lancamentos.map((l) => l.transcricao)).toEqual(['Item 2', 'Item 0', 'Item 1'])
    })

    it('desfazer restaura corretamente quando dois lançamentos removidos compartilham o mesmo id (fixtures degeneradas) — casa pela última ocorrência', () => {
      const l0 = lancamento({ transcricao: 'Item 0', id: 500 })
      const l1 = lancamento({ transcricao: 'Item 1', id: 500 })
      const l2 = lancamento({ transcricao: 'Item 2', id: 500 })
      const { get, acoes } = criarStoreDeTeste([l0, l1, l2])
      // Ponte legada (índice posicional) — mesmo padrão da fixture sem `id` real usada em
      // `inspecao.integracao.test.tsx` (Task T03, "Debugging gate"), aqui reproduzido com `id`
      // duplicado em vez de `undefined` para provar o mesmo caso dentro da Área tocada desta task.
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['2'] })])

      acoes.aplicar('a1')
      expect(get().lancamentos).toEqual([l0, l1])

      acoes.desfazer('a1')

      expect(get().lancamentos).toEqual([l0, l1, l2])
    })

    it('desfazer não perde dados quando o lançamento-âncora foi excluído por fora do ciclo aplicar/desfazer — insere o remanescente ao final', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const l2 = lancamento({ transcricao: 'Item 2' })
      const { get, set, acoes } = criarStoreDeTeste([l0, l1, l2])
      acoes.adicionarAvisos([
        proposta({ id: 'a1', alvo: [], mutacaoProposta: { verbo: 'remover', alvo: [l1.id] } }),
      ])

      acoes.aplicar('a1')
      expect(get().lancamentos).toEqual([l0, l2])

      // l0 (âncora de l1) é excluído por fora do ciclo aplicar/desfazer (ex.: exclusão manual
      // de linha na grid, via appStore.excluirLinha — fora do escopo desta task).
      set({ lancamentos: [l2] })

      acoes.desfazer('a1')

      expect(get().lancamentos).toEqual([l2, l1])
    })
  })

  describe('dispensar', () => {
    it('marca aviso pendente como dispensado sem alterar lancamentos', () => {
      const l0 = lancamento()
      const { get, acoes } = criarStoreDeTeste([l0])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['0'] })])

      acoes.dispensar('a1')

      expect(get().lancamentos).toEqual([l0])
      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('dispensado')
    })

    it('não tem efeito em aviso que não está pendente', () => {
      const l0 = lancamento()
      const { get, acoes } = criarStoreDeTeste([l0])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['0'] })])

      acoes.aplicar('a1')
      acoes.dispensar('a1')

      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('aplicado')
    })
  })

  describe('inspeção (D14/D15 do ADR inspecao-proposta-conciliacao)', () => {
    it('entrarInspecao define o aviso ativo; sairInspecao volta a nenhum', () => {
      const { get, acoes } = criarStoreDeTeste()
      acoes.adicionarAvisos([proposta({ id: 'a1' })])

      acoes.entrarInspecao('a1')
      expect(get().avisosAcionaveis.avisoEmInspecao).toBe('a1')

      acoes.sairInspecao()
      expect(get().avisosAcionaveis.avisoEmInspecao).toBeNull()
    })

    it('entrar em inspeção de outro aviso troca a ativa — nunca duas simultâneas', () => {
      const { get, acoes } = criarStoreDeTeste()
      acoes.adicionarAvisos([proposta({ id: 'a1' }), proposta({ id: 'a2' })])

      acoes.entrarInspecao('a1')
      acoes.entrarInspecao('a2')

      expect(get().avisosAcionaveis.avisoEmInspecao).toBe('a2')
    })

    it('aplicar sobre o aviso inspecionado encerra a inspeção', () => {
      const l0 = lancamento()
      const { get, acoes } = criarStoreDeTeste([l0])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['0'] })])
      acoes.entrarInspecao('a1')

      acoes.aplicar('a1')

      expect(get().avisosAcionaveis.avisoEmInspecao).toBeNull()
    })

    it('dispensar sobre o aviso inspecionado encerra a inspeção', () => {
      const l0 = lancamento()
      const { get, acoes } = criarStoreDeTeste([l0])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['0'] })])
      acoes.entrarInspecao('a1')

      acoes.dispensar('a1')

      expect(get().avisosAcionaveis.avisoEmInspecao).toBeNull()
    })

    it('desfazer sobre o aviso inspecionado encerra a inspeção', () => {
      const l0 = lancamento()
      const { get, acoes } = criarStoreDeTeste([l0])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['0'] })])
      acoes.aplicar('a1')
      acoes.entrarInspecao('a1')

      acoes.desfazer('a1')

      expect(get().avisosAcionaveis.avisoEmInspecao).toBeNull()
    })

    it('aplicar/dispensar/desfazer sobre um aviso diferente do inspecionado não encerram a inspeção ativa', () => {
      const l0 = lancamento()
      const l1 = lancamento()
      const { get, acoes } = criarStoreDeTeste([l0, l1])
      acoes.adicionarAvisos([
        proposta({ id: 'a1', alvo: ['0'] }),
        proposta({ id: 'a2', alvo: ['1'] }),
      ])
      acoes.entrarInspecao('a1')

      acoes.dispensar('a2')

      expect(get().avisosAcionaveis.avisoEmInspecao).toBe('a1')
    })
  })

  describe('desfazer de dispensa (D14 do ADR inspecao-proposta-conciliacao)', () => {
    it('trata dispensado→pendente como transição pura, sem tocar lancamentos nem removidos', () => {
      const l0 = lancamento()
      const { get, acoes } = criarStoreDeTeste([l0])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['0'] })])
      acoes.dispensar('a1')

      acoes.desfazer('a1')

      expect(get().lancamentos).toEqual([l0])
      expect(get().avisosAcionaveis.removidos).toEqual({})
      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('pendente')
    })

    it('não regride o comportamento existente de desfazer aplicado→pendente restaurando removidos', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const { get, acoes } = criarStoreDeTeste([l0, l1])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['0'] })])
      acoes.aplicar('a1')

      acoes.desfazer('a1')

      expect(get().lancamentos).toEqual([l0, l1])
      expect(get().avisosAcionaveis.removidos['a1']).toBeUndefined()
      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('pendente')
    })
  })

  describe('selecionarContagemPendentes (D15 do ADR inspecao-proposta-conciliacao)', () => {
    it('conta só propostas pendentes em um cenário misto', () => {
      const { get, acoes } = criarStoreDeTeste()
      acoes.adicionarAvisos([
        proposta({ id: 'a1', estado: 'pendente' }),
        proposta({ id: 'a2', estado: 'aplicado' }),
        proposta({ id: 'a3', estado: 'dispensado' }),
        proposta({ id: 'a4', estado: 'pendente' }),
        informativo({ id: 'info-1', estado: 'pendente' }),
      ])

      expect(selecionarContagemPendentes(get())).toBe(2)
    })
  })

  describe('reconciliarObsoletos (Task T08, ADR fundacao-operacoes Decisão 7)', () => {
    it('transiciona para obsoleto um aviso pendente cujo alvo por id não existe mais em lancamentos', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const { get, acoes } = criarStoreDeTeste([l0])
      acoes.adicionarAvisos([
        proposta({ id: 'a1', alvo: [], mutacaoProposta: { verbo: 'remover', alvo: [l0.id] } }),
      ])

      // Simula exclusão manual da linha na grid (fora do avisosSlice — appStore.ts, T08 não toca).
      acoes.reconciliarObsoletos([])

      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('obsoleto')
    })

    it('transiciona para obsoleto quando só parte dos alvos multi-id sumiu — nunca aplicável pela metade', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const { get, acoes } = criarStoreDeTeste([l0, l1])
      acoes.adicionarAvisos([
        proposta({
          id: 'a1',
          alvo: [],
          mutacaoProposta: { verbo: 'remover', alvo: [l0.id, l1.id] },
        }),
      ])

      // l1 continua existindo — só l0 foi excluído manualmente.
      acoes.reconciliarObsoletos([l1])

      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('obsoleto')
    })

    it('permanece pendente quando todos os alvos por id ainda existem em lancamentos', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const { get, acoes } = criarStoreDeTeste([l0])
      acoes.adicionarAvisos([
        proposta({ id: 'a1', alvo: [], mutacaoProposta: { verbo: 'remover', alvo: [l0.id] } }),
      ])

      acoes.reconciliarObsoletos([l0])

      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('pendente')
    })

    it('não afeta aviso já aplicado, mesmo que o alvo original não exista mais em lancamentos', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const { get, acoes } = criarStoreDeTeste([l0])
      acoes.adicionarAvisos([
        proposta({ id: 'a1', alvo: [], mutacaoProposta: { verbo: 'remover', alvo: [l0.id] } }),
      ])
      acoes.aplicar('a1')

      acoes.reconciliarObsoletos([])

      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('aplicado')
    })

    it('não afeta aviso dispensado, mesmo que o alvo original não exista mais em lancamentos', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const { get, acoes } = criarStoreDeTeste([l0])
      acoes.adicionarAvisos([
        proposta({ id: 'a1', alvo: [], mutacaoProposta: { verbo: 'remover', alvo: [l0.id] } }),
      ])
      acoes.dispensar('a1')

      acoes.reconciliarObsoletos([])

      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('dispensado')
    })

    it('não afeta aviso pendente sem mutacaoProposta (legado/informativo)', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const { get, acoes } = criarStoreDeTeste([l0])
      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['0'] })])

      acoes.reconciliarObsoletos([])

      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('pendente')
    })

    it('é idempotente — chamar reconciliarObsoletos duas vezes não altera nada além da primeira transição', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const { get, acoes } = criarStoreDeTeste([l0])
      acoes.adicionarAvisos([
        proposta({ id: 'a1', alvo: [], mutacaoProposta: { verbo: 'remover', alvo: [l0.id] } }),
      ])

      acoes.reconciliarObsoletos([])
      acoes.reconciliarObsoletos([])

      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('obsoleto')
    })

    it('exclui avisos obsoletos de selecionarContagemPendentes', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const { get, acoes } = criarStoreDeTeste([l0, l1])
      acoes.adicionarAvisos([
        proposta({ id: 'a1', alvo: [], mutacaoProposta: { verbo: 'remover', alvo: [l0.id] } }),
        proposta({ id: 'a2', alvo: [], mutacaoProposta: { verbo: 'remover', alvo: [l1.id] } }),
      ])
      expect(selecionarContagemPendentes(get())).toBe(2)

      // l0 excluído manualmente — a1 fica obsoleto, a2 continua pendente.
      acoes.reconciliarObsoletos([l1])

      expect(selecionarContagemPendentes(get())).toBe(1)
    })

    it('aplicar sobre um aviso obsoleto é no-op — sem remoção de lancamentos, sem mudança de estado', () => {
      const l0 = lancamento({ transcricao: 'Item 0' })
      const l1 = lancamento({ transcricao: 'Item 1' })
      const { get, acoes } = criarStoreDeTeste([l0, l1])
      acoes.adicionarAvisos([
        proposta({ id: 'a1', alvo: [], mutacaoProposta: { verbo: 'remover', alvo: [l0.id] } }),
      ])
      acoes.reconciliarObsoletos([l1])
      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('obsoleto')

      acoes.aplicar('a1')

      expect(get().lancamentos).toEqual([l0, l1])
      expect(get().avisosAcionaveis.avisos.find((a) => a.id === 'a1')?.estado).toBe('obsoleto')
    })
  })

  describe('zero-retenção (D0 do ADR)', () => {
    it('nenhuma ação do slice chama localStorage', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
      const l0 = lancamento()
      const { acoes } = criarStoreDeTeste([l0])

      acoes.adicionarAvisos([proposta({ id: 'a1', alvo: ['0'] })])
      acoes.aplicar('a1')
      acoes.desfazer('a1')
      acoes.dispensar('a1')

      expect(setItemSpy).not.toHaveBeenCalled()
      setItemSpy.mockRestore()
    })
  })
})
