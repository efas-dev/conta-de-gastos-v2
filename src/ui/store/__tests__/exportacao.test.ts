// ADR: see spec/grid-ux-filtros.adr.md

/**
 * Testes de invariância da exportação — critério [3] da spec:
 * "Exportar com filtro ativo e sem filtro produz .xlsx byte-idêntico
 * (mesmo array de lançamentos na ordem original dos parsers)."
 *
 * D4 do ADR: exportação usa sempre `lancamentos` (completo), nunca `lancamentosVisiveis`.
 * D5 do ADR: ordem original dos parsers, independente da ordenação visual ativa.
 *
 * Estratégia: demonstrar que com filtro ativo `lancamentos` e `lancamentosVisiveis` diferem;
 * mostrar que chamar `gerarAPartirDosRevisados` com `lancamentos` produz resultado invariante
 * entre as duas chamadas (com e sem filtro), e que chamar com `lancamentosVisiveis` produziria
 * resultado diferente — comprovando que App.tsx deve usar `lancamentos`.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useAppStore } from '../appStore'
import { gerarAPartirDosRevisados } from '../../PipelineState'
import type { Lancamento } from '../../../types'

// Reutiliza o mesmo fixture do writer — fonte de verdade já estabelecida
const FIXTURE_PATH = resolve(
  __dirname,
  '../../../excel/writer/__tests__/fixtures/Modelo.xlsx',
)

// ---------------------------------------------------------------------------
// Fixtures de lançamentos
// ---------------------------------------------------------------------------

function fazerLancamento(overrides: Partial<Lancamento>): Lancamento {
  return {
    fonte: 'Nubank',
    data: '2026-01-15',
    transcricao: 'Supermercado',
    descricao: '',
    valor: -150.0,
    natureza: 'Alimentação',
    iniciais: 'ES',
    transferenciaInterna: false,
    investimento: false,
    aprendizado: false,
    ...overrides,
  }
}

describe('exportacao — invariância ao filtro', () => {
  let modeloBytes: Uint8Array

  beforeAll(() => {
    modeloBytes = new Uint8Array(readFileSync(FIXTURE_PATH))
  })

  beforeEach(() => {
    // Reseta o store para estado limpo entre testes
    useAppStore.setState({
      lancamentos: [],
      filtroFontes: [],
      filtroNaturezas: [],
      filtroSoIncompletos: false,
      ordenacaoColuna: null,
      ordenacaoDirecao: 'asc',
      lancamentosVisiveis: [],
      mapaIndiceVisualReal: [],
      historico: [],
      futuro: [],
      sujo: false,
    })
  })

  // Test List item 1 — filtro por fonte: exportação invariante ao usar lancamentos
  it('gerarAPartirDosRevisados com filtro por fonte ativo: lancamentos != lancamentosVisiveis e exportacao com lancamentos é invariante (D4)', () => {
    const lancamentos: Lancamento[] = [
      fazerLancamento({ fonte: 'Nubank', natureza: 'Alimentação', valor: -50 }),
      fazerLancamento({ fonte: 'Itaú', natureza: 'Transporte', valor: -30 }),
      fazerLancamento({ fonte: 'Nubank', natureza: 'Lazer', valor: -80 }),
    ]

    const store = useAppStore.getState()
    store.setLancamentos(lancamentos)

    // Exporta sem filtro (usando lancamentos completo)
    const resultadoSemFiltro = gerarAPartirDosRevisados(
      modeloBytes,
      'ES',
      useAppStore.getState().lancamentos,
      [],
      '2026-01',
    )

    // Ativa filtro por fonte — lancamentosVisiveis fica com 2 lançamentos (apenas Nubank)
    store.setFiltroFontes(['Nubank'])
    const estadoFiltrado = useAppStore.getState()

    // Confirma que filtro está ativo: lancamentosVisiveis difere de lancamentos
    expect(estadoFiltrado.lancamentosVisiveis).toHaveLength(2)
    expect(estadoFiltrado.lancamentos).toHaveLength(3)

    // Usando lancamentos (correto — D4): resultado deve ser idêntico ao sem filtro
    const resultadoComFiltro_usandoLancamentos = gerarAPartirDosRevisados(
      modeloBytes,
      'ES',
      estadoFiltrado.lancamentos,
      [],
      '2026-01',
    )
    expect(resultadoComFiltro_usandoLancamentos).toEqual(resultadoSemFiltro)

    // Usando lancamentosVisiveis (errado — violaria D4): resultado difere
    const resultadoComFiltro_usandoVisiveis = gerarAPartirDosRevisados(
      modeloBytes,
      'ES',
      estadoFiltrado.lancamentosVisiveis,
      [],
      '2026-01',
    )
    // Se usasse lancamentosVisiveis, o resultado seria diferente (demonstra por que D4 importa)
    expect(resultadoComFiltro_usandoVisiveis).not.toEqual(resultadoSemFiltro)
  })

  // Test List item 2 — ordenação ativa: exportação invariante à ordem visual ao usar lancamentos
  it('gerarAPartirDosRevisados com ordenação ativa: lancamentos mantém ordem original e exportacao é invariante (D5)', () => {
    const lancamentos: Lancamento[] = [
      fazerLancamento({ valor: -300, natureza: 'Lazer' }),
      fazerLancamento({ valor: -50, natureza: 'Alimentação' }),
      fazerLancamento({ valor: -150, natureza: 'Transporte' }),
    ]

    const store = useAppStore.getState()
    store.setLancamentos(lancamentos)

    // Exporta sem ordenação (usando lancamentos na ordem original)
    const resultadoSemOrdenacao = gerarAPartirDosRevisados(
      modeloBytes,
      'ES',
      useAppStore.getState().lancamentos,
      [],
      '2026-01',
    )

    // Ativa ordenação por valor asc — lancamentosVisiveis reordena
    store.setOrdenacao('valor', 'asc')
    const estadoOrdenado = useAppStore.getState()

    // Confirma que a visão está reordenada (mais negativo = menor, fica primeiro)
    expect(estadoOrdenado.lancamentosVisiveis[0].valor).toBe(-300)
    expect(estadoOrdenado.lancamentosVisiveis[1].valor).toBe(-150)
    expect(estadoOrdenado.lancamentosVisiveis[2].valor).toBe(-50)

    // Confirma que lancamentos mantém ordem original (D5)
    expect(estadoOrdenado.lancamentos[0].valor).toBe(-300)
    expect(estadoOrdenado.lancamentos[1].valor).toBe(-50)
    expect(estadoOrdenado.lancamentos[2].valor).toBe(-150)

    // A visão reordenada difere da original (a reordenação de fato aconteceu)
    const visiveis = estadoOrdenado.lancamentosVisiveis.map((l) => l.valor)
    const originais = estadoOrdenado.lancamentos.map((l) => l.valor)
    expect(visiveis).not.toEqual(originais)

    // Usando lancamentos (correto — D5): resultado deve ser idêntico ao sem ordenação
    const resultadoComOrdenacao = gerarAPartirDosRevisados(
      modeloBytes,
      'ES',
      estadoOrdenado.lancamentos,
      [],
      '2026-01',
    )
    expect(resultadoComOrdenacao).toEqual(resultadoSemOrdenacao)
  })

  // Test List item 3 — filtroSoIncompletos: exportação invariante ao usar lancamentos
  it('gerarAPartirDosRevisados com filtroSoIncompletos ativo: lancamentos completo mantém o resultado (D4)', () => {
    const lancamentos: Lancamento[] = [
      fazerLancamento({ natureza: 'Alimentação', iniciais: 'ES' }),
      fazerLancamento({ natureza: '', iniciais: '' }),   // incompleto
      fazerLancamento({ natureza: 'Lazer', iniciais: 'ES' }),
    ]

    const store = useAppStore.getState()
    store.setLancamentos(lancamentos)

    // Exporta sem filtro (usando lancamentos completo)
    const resultadoSemFiltro = gerarAPartirDosRevisados(
      modeloBytes,
      'ES',
      useAppStore.getState().lancamentos,
      [],
      '2026-01',
    )

    // Ativa filtro soIncompletos — lancamentosVisiveis fica com 1 lançamento
    store.setFiltroSoIncompletos(true)
    const estadoFiltrado = useAppStore.getState()
    expect(estadoFiltrado.lancamentosVisiveis).toHaveLength(1)
    expect(estadoFiltrado.lancamentos).toHaveLength(3)

    // Usando lancamentos (correto — D4): resultado deve ser idêntico ao sem filtro
    const resultadoComFiltro = gerarAPartirDosRevisados(
      modeloBytes,
      'ES',
      estadoFiltrado.lancamentos,
      [],
      '2026-01',
    )
    expect(resultadoComFiltro).toEqual(resultadoSemFiltro)

    // Usando lancamentosVisiveis (errado — violaria D4): resultado difere
    const resultadoVisiveis = gerarAPartirDosRevisados(
      modeloBytes,
      'ES',
      estadoFiltrado.lancamentosVisiveis,
      [],
      '2026-01',
    )
    expect(resultadoVisiveis).not.toEqual(resultadoSemFiltro)
  })
})
