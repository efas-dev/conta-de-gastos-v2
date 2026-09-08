// ADR: see Docs/specs/dominio-transferencia-investimento-iniciais.adr.md
// ADR: see Docs/specs/fundacao-operacoes.adr.md

import { describe, it, expect } from 'vitest'
import { detectarTransferenciaInterna, detectarTransferenciaInternaAvisos } from '../transferencia'
import { detectarReembolsoAvisos } from '../pares'
import { criarAvisosSlice, type StoreComAvisos } from '../../ui/store/avisosSlice'
import type { Lancamento } from '../../types'
import {
  lancamentoOpenBanking,
  lancamentoPagFatura,
  lancamentoItauBlack,
  lancamentoPixNominalMatch,
  lancamentoPixNominalNoMatch,
  lancamentoComum,
  lancamentoPixNominalCaseInsensitive,
  lancamentoTranscricaoVazia,
} from './fixtures/transferencia'

describe('detectarTransferenciaInterna', () => {
  describe('padrões genéricos de palavras-chave', () => {
    it('retorna true para transcrição com "Open Banking" (TL-1)', () => {
      expect(detectarTransferenciaInterna(lancamentoOpenBanking)).toBe(true)
    })

    it('retorna true para "ITAU BLACK" (TL-3)', () => {
      expect(detectarTransferenciaInterna(lancamentoItauBlack)).toBe(true)
    })
  })

  describe('Pix nominal com nomeUsuario', () => {
    it('retorna true quando nomeUsuario está presente e casa com a transcrição (TL-4)', () => {
      expect(detectarTransferenciaInterna(lancamentoPixNominalMatch, 'Eduardo Santos')).toBe(true)
    })

    it('retorna false quando nomeUsuario presente mas transcrição não contém o nome (TL-5)', () => {
      expect(detectarTransferenciaInterna(lancamentoPixNominalNoMatch, 'Eduardo Santos')).toBe(false)
    })

    it('retorna false quando nomeUsuario ausente — não infere transferência (TL-6)', () => {
      expect(detectarTransferenciaInterna(lancamentoPixNominalMatch)).toBe(false)
    })

    it('comparação de nome é case-insensitive (TL-8)', () => {
      expect(detectarTransferenciaInterna(lancamentoPixNominalCaseInsensitive, 'Eduardo Santos')).toBe(true)
    })
  })

  describe('lançamentos que devem retornar false', () => {
    it('retorna false para lançamento comum sem palavras-chave (TL-7)', () => {
      expect(detectarTransferenciaInterna(lancamentoComum)).toBe(false)
    })

    it('retorna false para transcrição vazia (TL-9)', () => {
      expect(detectarTransferenciaInterna(lancamentoTranscricaoVazia)).toBe(false)
    })

    /**
     * TL-2 (redefinido, Task T14, decisão de domínio 2026-08-04): "Pagamento de
     * fatura" deixou de ser transferência interna. Ligar o registry ao fluxo real
     * de produção revelou colisão com `detectarConciliacaoRegistry` — a mesma
     * linha do extrato gerava duas propostas concorrentes (conciliação E
     * transferência interna). Conciliação (item 26) já é dona dessa linha via
     * correlação fatura×extrato; `/Pagamento de fatura/i` foi removido de
     * `PADROES_INTERNOS` (`../transferencia.ts`). Antes desta task, este mesmo
     * fixture (`lancamentoPagFatura`) provava o oposto (`toBe(true)`).
     */
    it('retorna false para "Pagamento de fatura" — conciliação já é dona dessa linha (TL-2)', () => {
      expect(detectarTransferenciaInterna(lancamentoPagFatura)).toBe(false)
    })
  })
})

/**
 * `detectarTransferenciaInternaAvisos` — Task T07-bis (ver ADR `fundacao-operacoes`, Decisão 4).
 *
 * Fixtures desta suíte SEMPRE atribuem `id` explicitamente (mesmo padrão da T07 —
 * `lancamentoComId` — não reaproveitando os fixtures acima, que não têm `id`):
 * `mutacaoProposta.alvo` é `number[]` de `Lancamento.id`, e o gap de fixtures-sem-id
 * (registrado no iteração-log, Task T03) tornaria o alvo inconsistente se um `id` fosse
 * `undefined`.
 */
function lancamentoComId(overrides: Partial<Lancamento> & { id: number }): Lancamento {
  return {
    fonte: 'Nubank',
    data: '2026-08-01',
    transcricao: 'Compra teste',
    valor: -10,
    iniciais: 'AB',
    natureza: '',
    descricao: '',
    ...overrides,
  }
}

describe('detectarTransferenciaInternaAvisos', () => {
  it('retorna [] quando nenhum lançamento é transferência interna (TL-25)', () => {
    const lancamentos = [
      lancamentoComId({ id: 1, transcricao: 'Compra mercado' }),
      lancamentoComId({ id: 2, transcricao: 'Uber' }),
    ]
    expect(detectarTransferenciaInternaAvisos(lancamentos)).toEqual([])
  })

  it('gera um Aviso tipo proposta com mutacaoProposta remover [id] para padrão genérico (Open Banking) (TL-26)', () => {
    const transferencia = lancamentoComId({
      id: 42,
      transcricao: 'Transferência de Eduardo pelo Pix - Banco Inter Open Banking',
      valor: -500,
    })
    const [aviso] = detectarTransferenciaInternaAvisos([transferencia])

    expect(aviso.tipo).toBe('proposta')
    expect(aviso.origem).toBe('transferencia-interna')
    expect(aviso.mutacaoProposta).toEqual({ verbo: 'remover', alvo: [42] })
  })

  it('gera um Aviso para Pix nominal quando nomeUsuario casa com a transcrição (TL-27)', () => {
    const pixNominal = lancamentoComId({
      id: 43,
      transcricao: 'Transferência enviada pelo Pix - Eduardo Santos',
      valor: -200,
    })
    const [aviso] = detectarTransferenciaInternaAvisos([pixNominal], 'Eduardo Santos')

    expect(aviso.tipo).toBe('proposta')
    expect(aviso.origem).toBe('transferencia-interna')
    expect(aviso.mutacaoProposta).toEqual({ verbo: 'remover', alvo: [43] })
  })

  it('gera um Aviso por lançamento de transferência interna, cada um mirando o próprio id — "Pagamento de fatura" NÃO gera proposta (conciliação já é dona dessa linha, Task T14) (TL-28)', () => {
    const comum = lancamentoComId({ id: 1, transcricao: 'Compra mercado' })
    const openBanking = lancamentoComId({
      id: 2,
      transcricao: 'Transferência via Open Banking',
      valor: -300,
    })
    const pagFatura = lancamentoComId({ id: 3, transcricao: 'Pagamento de fatura Nubank', valor: -1200 })
    const avisos = detectarTransferenciaInternaAvisos([comum, openBanking, pagFatura])

    expect(avisos).toHaveLength(1)
    expect(avisos.map((a) => a.mutacaoProposta?.alvo)).toEqual([[2]])
  })

  it('Aviso.alvo (legado) contém o id como string e Aviso.permanece é sempre [] (TL-29)', () => {
    const transferencia = lancamentoComId({ id: 7, transcricao: 'ITAU BLACK pagamento fatura', valor: -100 })
    const [aviso] = detectarTransferenciaInternaAvisos([transferencia])

    expect(aviso.alvo).toEqual(['7'])
    expect(aviso.permanece).toEqual([])
  })

  it('Aviso nasce com estado pendente (TL-30)', () => {
    // Fixture trocada de "Pagamento de fatura Nubank" p/ "ITAU BLACK pagamento fatura"
    // (Task T14): o padrão genérico de fatura sem correlação de conciliação
    // continua ativo; só "Pagamento de fatura" (dono: conciliação) foi removido.
    const transferencia = lancamentoComId({ id: 8, transcricao: 'ITAU BLACK pagamento fatura', valor: -100 })
    const [aviso] = detectarTransferenciaInternaAvisos([transferencia])

    expect(aviso.estado).toBe('pendente')
  })

  it('mensagem menciona a transcrição do lançamento (TL-31)', () => {
    // Fixture trocada de "Pagamento de fatura Nubank" p/ "ITAU BLACK pagamento fatura"
    // pelo mesmo motivo do TL-30 acima.
    const transferencia = lancamentoComId({
      id: 9,
      transcricao: 'ITAU BLACK pagamento fatura',
      valor: -1234.56,
    })
    const [aviso] = detectarTransferenciaInternaAvisos([transferencia])

    expect(aviso.mensagem).toContain('ITAU BLACK pagamento fatura')
  })

  it('id do Aviso é determinístico e único por lançamento (TL-32)', () => {
    const transferencia1 = lancamentoComId({ id: 5, transcricao: 'ITAU BLACK pagamento fatura', valor: -50 })
    const transferencia2 = lancamentoComId({ id: 6, transcricao: 'ITAU BLACK pagamento fatura', valor: -50 })
    const avisos = detectarTransferenciaInternaAvisos([transferencia1, transferencia2])

    expect(avisos[0].id).not.toBe(avisos[1].id)
    expect(new Set(avisos.map((a) => a.id)).size).toBe(2)
  })

  it('nomeUsuario ausente não gera falso positivo de Pix nominal — sem inferência (TL-33)', () => {
    const pixNominal = lancamentoComId({
      id: 12,
      transcricao: 'Transferência enviada pelo Pix - Eduardo Santos',
      valor: -200,
    })
    expect(detectarTransferenciaInternaAvisos([pixNominal])).toEqual([])
  })

  it('não altera a marcação de coloração (detectarTransferenciaInterna por lançamento continua igual) (TL-34)', () => {
    const transferencia = lancamentoComId({ id: 11, transcricao: 'ITAU BLACK pagamento fatura', valor: -50 })
    // detectarTransferenciaInternaAvisos não muta o lançamento original nem seu campo `transferenciaInterna`.
    detectarTransferenciaInternaAvisos([transferencia])
    expect(detectarTransferenciaInterna(transferencia)).toBe(true)
    expect(transferencia.transferenciaInterna).toBeUndefined()
  })

  /**
   * TL-35 — integração: o Aviso produzido é aplicável/desfazível pelo caminho genérico do
   * avisosSlice (T03), que casa por `Lancamento.id` via `mutacaoProposta`, não por posição.
   * Prova end-to-end de que transferência interna não precisa de nenhum código específico no slice.
   */
  it('Aviso de transferência interna é aplicável e desfazível via avisosSlice.aplicar/desfazer (TL-35)', () => {
    const comum = lancamentoComId({ id: 1, transcricao: 'Compra mercado' })
    const openBanking = lancamentoComId({
      id: 2,
      transcricao: 'Transferência via Open Banking',
      valor: -500,
    })
    const outroComum = lancamentoComId({ id: 3, transcricao: 'Uber' })
    const lancamentos = [comum, openBanking, outroComum]
    const [aviso] = detectarTransferenciaInternaAvisos([openBanking])

    let estado: StoreComAvisos = {
      lancamentos,
      avisosAcionaveis: { avisos: [aviso], removidos: {}, avisoEmInspecao: null },
    }
    const get = () => estado
    const set = (
      partial: Partial<StoreComAvisos> | ((s: StoreComAvisos) => Partial<StoreComAvisos>),
    ) => {
      const parcial = typeof partial === 'function' ? partial(estado) : partial
      estado = { ...estado, ...parcial }
    }
    const acoes = criarAvisosSlice(set, get)

    acoes.aplicar(aviso.id)
    expect(get().lancamentos).toEqual([comum, outroComum])
    expect(get().avisosAcionaveis.avisos[0].estado).toBe('aplicado')

    acoes.desfazer(aviso.id)
    expect(get().lancamentos).toEqual([comum, openBanking, outroComum])
    expect(get().avisosAcionaveis.avisos[0].estado).toBe('pendente')
  })
})

/**
 * `detectarTransferenciaInternaAvisos` — integração com o motor de pares (Task 3, ADR
 * `motor-de-pares`, Decisões 1, 2, 5, 6, 17). A partir desta task, a função consulta
 * `encontrarPares` (`../pares`) para casar as duas pernas de uma transferência antes de propor
 * a remoção — em vez de tratar cada lançamento isoladamente.
 */
describe('detectarTransferenciaInternaAvisos — integração com o motor de pares (Task 3)', () => {
  it('par de transferência com a perna POSITIVA batendo no padrão emite UM aviso com os 2 ids (TL3-1)', () => {
    const perna1 = lancamentoComId({
      id: 101,
      data: '2026-08-01',
      transcricao: 'Transferência via Open Banking',
      valor: 500,
    })
    const perna2 = lancamentoComId({
      id: 102,
      data: '2026-08-03',
      transcricao: 'Pix enviado para conta própria',
      valor: -500,
    })
    const avisos = detectarTransferenciaInternaAvisos([perna1, perna2])

    expect(avisos).toHaveLength(1)
    expect(avisos[0].origem).toBe('transferencia-interna')
    expect(avisos[0].tipo).toBe('proposta')
    expect(avisos[0].mutacaoProposta).toEqual({ verbo: 'remover', alvo: [101, 102] })
    expect(avisos[0].permanece).toEqual([])
  })

  it('simetria de D2 — par com a perna NEGATIVA batendo no padrão também emite UM aviso com os 2 ids (TL3-2)', () => {
    const perna1 = lancamentoComId({
      id: 201,
      data: '2026-08-01',
      transcricao: 'Recebimento de terceiro',
      valor: 800,
    })
    const perna2 = lancamentoComId({
      id: 202,
      data: '2026-08-02',
      transcricao: 'ITAU BLACK pagamento fatura',
      valor: -800,
    })
    const avisos = detectarTransferenciaInternaAvisos([perna1, perna2])

    expect(avisos).toHaveLength(1)
    expect(avisos[0].origem).toBe('transferencia-interna')
    expect(avisos[0].mutacaoProposta).toEqual({ verbo: 'remover', alvo: [201, 202] })
  })

  it('perna de transferência sem contrapartida mantém proposta isolada, mas declara explicitamente a ausência de par (TL3-3)', () => {
    const semPar = lancamentoComId({
      id: 301,
      transcricao: 'Transferência via Open Banking',
      valor: -700,
    })
    const [aviso] = detectarTransferenciaInternaAvisos([semPar])

    expect(aviso.origem).toBe('transferencia-interna')
    expect(aviso.mutacaoProposta).toEqual({ verbo: 'remover', alvo: [301] })
    expect(aviso.mensagem.toLowerCase()).toContain('não foi encontrada a contrapartida')
  })

  it('grupo ambíguo envolvendo perna de transferência vira informativo desta origem, não proposta (TL3-4)', () => {
    const ancoraTransferencia = lancamentoComId({
      id: 401,
      data: '2026-08-10',
      transcricao: 'Transferência via Open Banking',
      valor: 900,
    })
    const candidato1 = lancamentoComId({
      id: 402,
      data: '2026-08-08',
      transcricao: 'Restaurante A',
      valor: -900,
    })
    const candidato2 = lancamentoComId({
      id: 403,
      data: '2026-08-12',
      transcricao: 'Restaurante B',
      valor: -900,
    })
    const avisos = detectarTransferenciaInternaAvisos([ancoraTransferencia, candidato1, candidato2])

    expect(avisos).toHaveLength(1)
    expect(avisos[0].tipo).toBe('informativo')
    expect(avisos[0].mutacaoProposta).toBeUndefined()
    expect(avisos[0].candidatos?.map((candidato) => candidato.alvo)).toEqual(['402', '403'])
  })

  it('padrão de exclusão de auto-sweep (D5) impede o par: perna de transferência cai no caso "não achou" (TL3-5)', () => {
    const transferencia = lancamentoComId({
      id: 501,
      data: '2026-08-01',
      transcricao: 'Transferência via Open Banking',
      valor: -300,
    })
    const rdb = lancamentoComId({
      id: 502,
      data: '2026-08-02',
      transcricao: 'Aplicação RDB automática',
      valor: 300,
    })
    const avisos = detectarTransferenciaInternaAvisos([transferencia, rdb])

    expect(avisos).toHaveLength(1)
    expect(avisos[0].mutacaoProposta).toEqual({ verbo: 'remover', alvo: [501] })
    expect(avisos[0].mensagem.toLowerCase()).toContain('não foi encontrada a contrapartida')
  })

  it('múltiplos pares de transferência simultâneos geram avisos independentes, sem interferência (TL3-6)', () => {
    const par1Positivo = lancamentoComId({
      id: 601,
      data: '2026-08-01',
      transcricao: 'Transferência via Open Banking',
      valor: 100,
    })
    const par1Negativo = lancamentoComId({
      id: 602,
      data: '2026-08-02',
      transcricao: 'Pix conta própria',
      valor: -100,
    })
    const par2Positivo = lancamentoComId({
      id: 603,
      data: '2026-08-05',
      transcricao: 'Recebimento diverso',
      valor: 250,
    })
    const par2Negativo = lancamentoComId({
      id: 604,
      data: '2026-08-06',
      transcricao: 'ITAU BLACK pagamento fatura',
      valor: -250,
    })
    const avisos = detectarTransferenciaInternaAvisos([
      par1Positivo,
      par1Negativo,
      par2Positivo,
      par2Negativo,
    ])

    expect(avisos).toHaveLength(2)
    const alvos = avisos.map((a) => a.mutacaoProposta?.alvo).sort((a, b) => (a?.[0] ?? 0) - (b?.[0] ?? 0))
    expect(alvos).toEqual([
      [601, 602],
      [603, 604],
    ])
  })
})

/**
 * Grupo ambíguo (empate exato de distância — ADR `motor-de-pares`, Decisões 7 e 9) cuja âncora
 * ou candidato bate no sinal textual de transferência. `detectarReembolsoAvisos` (`../pares`)
 * pula deliberadamente esses grupos, porque pelo rótulo da Decisão 2 eles são transferência
 * própria, não reembolso — logo a política desta origem é a única que pode falar deles. Sem o
 * informativo coberto aqui, a perna não gera aviso de ninguém e desaparece da revisão, o que
 * regride o comportamento anterior à spec (toda perna reconhecida virava proposta).
 */
describe('detectarTransferenciaInternaAvisos — grupo ambíguo com sinal de transferência', () => {
  const ancora = lancamentoComId({
    id: 701,
    data: '2026-01-10',
    transcricao: 'Transferência via Open Banking',
    valor: 100,
  })
  const candidatoAnterior = lancamentoComId({
    id: 702,
    data: '2026-01-05',
    transcricao: 'Compra mercado',
    valor: -100,
  })
  const candidatoPosterior = lancamentoComId({
    id: 703,
    data: '2026-01-15',
    transcricao: 'Compra farmácia',
    valor: -100,
  })
  const lancamentos = [ancora, candidatoAnterior, candidatoPosterior]

  it('emite um informativo em vez de deixar a perna ambígua sem aviso algum', () => {
    const avisos = detectarTransferenciaInternaAvisos(lancamentos)

    expect(avisos).toHaveLength(1)
    expect(avisos[0].origem).toBe('transferencia-interna')
    expect(avisos[0].tipo).toBe('informativo')
  })

  it('não propõe mutação — escolher entre candidatos empatados é do usuário (D7)', () => {
    const [aviso] = detectarTransferenciaInternaAvisos(lancamentos)

    expect(aviso.mutacaoProposta).toBeUndefined()
  })

  it('lista os dois candidatos empatados para escolha manual', () => {
    const [aviso] = detectarTransferenciaInternaAvisos(lancamentos)

    expect(aviso.candidatos?.map((candidato) => candidato.alvo)).toEqual(['702', '703'])
  })

  it('não duplica com pares.ts, que ignora grupos com sinal de transferência', () => {
    expect(detectarReembolsoAvisos(lancamentos, {})).toHaveLength(0)
  })
})
