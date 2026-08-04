// ADR: see spec/fundacao-operacoes.adr.md

/**
 * Prova — Task T16 do ADR `fundacao-operacoes`: o export gerado a partir do MESMO
 * conjunto final de lançamentos produz `.xlsx` idêntico, independentemente de QUAIS
 * propostas/operações foram aplicadas/dispensadas antes de chegar nesse conjunto
 * final. `gerarXlsx`/`gerarAPartirDosRevisados` são funções puras do estado final —
 * não recebem nem consultam histórico algum.
 *
 * Investigação prévia (documentada no iteração-log, Task T16): `gerarXlsx` em si não
 * usa `Date.now()`/`Math.random()`, mas a chamada final a `fflate.zipSync` grava
 * `mtime = Date.now()` por entrada do zip quando não fornecido
 * (`node_modules/fflate/esm/index.mjs:1902`). Isso significa que dois exports
 * disparados em segundos-relógio DOS diferentes NÃO são byte-idênticos — só o campo
 * mtime diverge, nunca dado de negócio. Por isso os testes abaixo provam duas coisas
 * separadamente: (a) byte-identidade completa sob relógio controlado
 * (`vi.setSystemTime`) — o cenário real de um único clique de export; e (b)
 * invariância do CONTEÚDO de cada parte do zip (hash por parte descompactada) mesmo
 * quando os instantes mockados são diferentes — isola que a única fonte possível de
 * divergência entre dois exports do mesmo conjunto final é o carimbo de tempo do
 * zip, nunca os dados injetados.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { unzipSync } from 'fflate'
import { gerarXlsx } from '../gerador.js'
import type { Lancamento, DicEntry } from '../../../types.js'

const FIXTURE_PATH = resolve(__dirname, 'fixtures/Modelo.xlsx')

function hashSha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

/** Compara o conteúdo de cada parte descompactada de dois .xlsx, parte a parte. */
function hashesPorParte(bytes: Uint8Array): Record<string, string> {
  const parts = unzipSync(bytes)
  const out: Record<string, string> = {}
  for (const nome of Object.keys(parts)) {
    out[nome] = hashSha256(parts[nome])
  }
  return out
}

function lancamento(overrides: Partial<Lancamento> & { id: number }): Lancamento {
  return {
    fonte: 'Nubank',
    data: '2024-01-15',
    transcricao: 'Compra genérica',
    valor: -10,
    iniciais: 'ES',
    natureza: '',
    descricao: '',
    ...overrides,
  }
}

describe('gerarXlsx — invariância ao histórico que produziu o conjunto final (Task T16)', () => {
  let modeloBytes: Uint8Array

  beforeAll(() => {
    modeloBytes = new Uint8Array(readFileSync(FIXTURE_PATH))
  })

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('mesmo conjunto final construído por dois caminhos de código diferentes (remover A→B vs. B→A) gera .xlsx com conteúdo idêntico em todas as partes', () => {
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'))

    const base: Lancamento[] = [
      lancamento({ id: 1, transcricao: 'Padaria' }),
      lancamento({ id: 2, transcricao: 'Farmácia' }),
      lancamento({ id: 3, transcricao: 'Mercado' }),
      lancamento({ id: 4, transcricao: 'Livraria' }),
    ]
    const dicEntries: DicEntry[] = []

    // Caminho A: aplica proposta que remove id=2 primeiro, depois dispensa/remove id=4.
    const caminhoA = base.filter((l) => l.id !== 2).filter((l) => l.id !== 4)

    // Caminho B: remove id=4 primeiro (outra proposta), depois id=2 — ordem inversa.
    const caminhoB = base.filter((l) => l.id !== 4).filter((l) => l.id !== 2)

    // Ambos convergem ao mesmo conjunto final por id (mesma ordem relativa, já que
    // filter preserva a ordem original em ambos os casos).
    expect(caminhoA.map((l) => l.id)).toEqual(caminhoB.map((l) => l.id))

    const resultadoA = gerarXlsx(modeloBytes, 'ES', caminhoA, dicEntries, '2026-01')
    const resultadoB = gerarXlsx(modeloBytes, 'ES', caminhoB, dicEntries, '2026-01')

    expect(hashesPorParte(resultadoA)).toEqual(hashesPorParte(resultadoB))
  })

  it('sob relógio controlado (mesmo instante), o mesmo conjunto final produz .xlsx byte-idêntico', () => {
    vi.setSystemTime(new Date('2026-02-10T12:00:00Z'))

    const lancamentos: Lancamento[] = [
      lancamento({ id: 1, transcricao: 'Cinema', valor: -40 }),
      lancamento({ id: 2, transcricao: 'Streaming', valor: -25 }),
    ]
    const dicEntries: DicEntry[] = [
      { chave: 'cinema', fonte: 'Nubank', natureza: 'Lazer', descricao: 'Cinema', iniciais: 'ES', vezes: 1, ambiguo: false },
    ]

    const resultado1 = gerarXlsx(modeloBytes, 'ES', lancamentos, dicEntries, '2026-02')
    const resultado2 = gerarXlsx(modeloBytes, 'ES', lancamentos, dicEntries, '2026-02')

    expect(hashSha256(resultado1)).toBe(hashSha256(resultado2))
    expect(Buffer.from(resultado1).equals(Buffer.from(resultado2))).toBe(true)
  })

  it('em instantes-relógio diferentes, os bytes crus do zip podem divergir (mtime), mas o conteúdo de cada parte permanece idêntico — isola a causa raiz no mtime do fflate, não em dado de negócio', () => {
    const lancamentos: Lancamento[] = [lancamento({ id: 1, transcricao: 'Padaria' })]
    const dicEntries: DicEntry[] = []

    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'))
    const resultadoInstanteA = gerarXlsx(modeloBytes, 'ES', lancamentos, dicEntries, '2026-03')

    vi.setSystemTime(new Date('2026-03-01T00:05:00Z'))
    const resultadoInstanteB = gerarXlsx(modeloBytes, 'ES', lancamentos, dicEntries, '2026-03')

    // Conteúdo de cada parte (sheet1/sheet2/table1/workbook e as demais preservadas)
    // é idêntico — nenhum dado de negócio depende do relógio.
    expect(hashesPorParte(resultadoInstanteA)).toEqual(hashesPorParte(resultadoInstanteB))
  })

  it('gerarAPartirDosRevisados: mesmo lancamentosRevisados + mesmo dicEntriesAnterior (independente de qual histórico os produziu) gera .xlsx com conteúdo idêntico', async () => {
    vi.setSystemTime(new Date('2026-04-01T09:00:00Z'))

    const { gerarAPartirDosRevisados } = await import('../../../ui/PipelineState.js')

    const dicEntriesAnterior: DicEntry[] = [
      { chave: 'mercado', fonte: 'Nubank', natureza: 'Alimentação', descricao: 'Compra', iniciais: 'ES', vezes: 2, ambiguo: false },
    ]

    const lancamentosFinais: Lancamento[] = [
      lancamento({ id: 1, transcricao: 'Mercado', natureza: 'Alimentação', descricao: 'Compra' }),
      lancamento({ id: 2, transcricao: 'Farmácia', natureza: 'Saúde', descricao: 'Remédio' }),
    ]

    // Dois "caminhos" que só diferem na ordem de construção do array em memória,
    // mas resultam no MESMO conjunto final (mesmos objetos, mesma ordem).
    const caminho1 = [...lancamentosFinais]
    const caminho2 = lancamentosFinais.map((l) => ({ ...l }))

    const resultado1 = gerarAPartirDosRevisados(modeloBytes, 'ES', caminho1, dicEntriesAnterior, '2026-04')
    const resultado2 = gerarAPartirDosRevisados(modeloBytes, 'ES', caminho2, dicEntriesAnterior, '2026-04')

    expect(hashSha256(resultado1)).toBe(hashSha256(resultado2))
  })
})
