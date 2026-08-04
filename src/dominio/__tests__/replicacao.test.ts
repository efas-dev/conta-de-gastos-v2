/**
 * Testes de `detectarReplicacao` — sugere replicar a classificação de uma linha
 * para as demais de transcrição idêntica ainda sem Natureza (item 36).
 */

import { describe, it, expect } from 'vitest'
import { detectarReplicacao } from '../replicacao'
import type { Lancamento } from '../../types'

function L(transcricao: string, natureza = '', descricao = ''): Lancamento {
  return { fonte: 'extrato_bb', data: '2026-07-01', transcricao, valor: -10, iniciais: 'ES', natureza, descricao }
}

describe('detectarReplicacao', () => {
  it('TL-REP-1: sugere replicar para as linhas iguais sem Natureza', () => {
    const lancs = [
      L('RAIA DROGASIL SA', 'SA', 'Farmácia'), // base classificada (índice 0)
      L('RAIA DROGASIL SA'), // alvo
      L('MERCADO'), // diferente
      L('RAIA DROGASIL SA'), // alvo
    ]
    const s = detectarReplicacao(lancs, 0)
    expect(s).not.toBeNull()
    expect(s!.natureza).toBe('SA')
    expect(s!.descricao).toBe('Farmácia')
    expect(s!.alvos).toEqual([1, 3])
    expect(s!.exemplo).toBe('RAIA DROGASIL SA')
  })

  it('TL-REP-2: não inclui linhas já classificadas nos alvos', () => {
    const lancs = [
      L('RAIA DROGASIL SA', 'SA'),
      L('RAIA DROGASIL SA', 'AL'), // já classificada → não é alvo
      L('RAIA DROGASIL SA'), // alvo
    ]
    const s = detectarReplicacao(lancs, 0)
    expect(s!.alvos).toEqual([2])
  })

  it('TL-REP-3: casa por transcrição normalizada (sufixo de data removido)', () => {
    const lancs = [
      L('IFOOD 05/07', 'AL', 'Almoço'),
      L('IFOOD 12/07'), // mesma chave após remover a data
    ]
    const s = detectarReplicacao(lancs, 0)
    expect(s!.alvos).toEqual([1])
  })

  it('TL-REP-4: base sem Natureza não gera sugestão', () => {
    const lancs = [L('RAIA DROGASIL SA'), L('RAIA DROGASIL SA')]
    expect(detectarReplicacao(lancs, 0)).toBeNull()
  })

  it('TL-REP-5: sem nenhuma outra linha igual não classificada → null', () => {
    const lancs = [L('RAIA DROGASIL SA', 'SA'), L('MERCADO')]
    expect(detectarReplicacao(lancs, 0)).toBeNull()
  })

  it('TL-REP-6: transcrição vazia (chave vazia) não gera sugestão', () => {
    const lancs = [L('', 'AL'), L('')]
    expect(detectarReplicacao(lancs, 0)).toBeNull()
  })
})
