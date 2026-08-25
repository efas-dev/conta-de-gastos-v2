// ADR: see spec/fatura-itau-xlsx.adr.md

/**
 * Prova E2E — Task T12 desta spec (`fatura-itau-xlsx`), quarto item da sua
 * Definition of done: soltar a fixture real da fatura Itaú no app até ver os
 * lançamentos na grid de revisão, contra a fiação REAL de produção (upload
 * unificado de `TelaImportacao.tsx`, T8/T9; roteamento `ehDicionario` →
 * `parsersBinarios`, T8; `fatura_itau_cc.parsear`, T4/T5/T14; `handleProduzir`
 * real de `handlersPipeline.ts`, T9).
 *
 * Cenário único: a fixture `fatura_itau_cc_sintetica.xlsx` (T11/T13) é solta
 * sozinha (sem nenhum extrato bancário acompanhando) — prova ao mesmo tempo o
 * critério de valor de F1 ("arquivo baixado do banco solto no app produz
 * lançamentos revisáveis sem edição intermediária") e a Decisão 6 do ADR
 * (fatura de primeira classe habilita "Produzir revisão" sozinha).
 *
 * Verificação explícita de que o app NÃO confunde a fatura com um dicionário
 * (Decisão 4 do ADR — `ehDicionario` roda primeiro e recusa a fixture): o
 * card de dicionário carregado nunca aparece, e nenhum aviso
 * `dic-ultimo-vence`/`xlsx-nao-reconhecido` é emitido para o arquivo.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { App } from '../../App'
import { useAppStore } from '../../ui/store/appStore'
import { reiniciarContadorIds } from '../../parsers/idSerial'

vi.mock('../../ui/components/ReviewGrid', () => ({
  ReviewGrid: () => React.createElement('div', { 'data-testid': 'review-grid' }),
  TEMA_ERRO: { bgCell: '#f9e2d6' },
  TEMA_TRANSFERENCIA: { bgCell: '#d5e4f2' },
  TEMA_INVESTIMENTO: { bgCell: '#dcedd3' },
  calcularTemaLinha: vi.fn(),
  calcularSomaSelecionados: vi.fn(() => null),
}))

vi.mock('../../ui/components/SplitModal', () => ({
  SplitModal: () => React.createElement('div', { 'data-testid': 'split-modal' }),
}))

vi.mock('../../ui/components/AvisoList', () => ({
  AvisoList: () => React.createElement('div', { 'data-testid': 'aviso-list' }),
}))

vi.mock('../../dominio/mes', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../dominio/mes')>()
  return {
    ...original,
    detectarMesSugerido: vi.fn(() => null),
    defaultMes: vi.fn(() => '2026-07'),
  }
})

const CAMINHO_MODELO = resolve(__dirname, '../../../public/Modelo.xlsx')
const CAMINHO_FIXTURE_FATURA = resolve(
  __dirname,
  '../../parsers/__tests__/fixtures/fatura_itau_cc_sintetica.xlsx',
)

function resetarStore(): void {
  useAppStore.setState({
    lancamentos: [],
    iniciais: 'ES',
    nomeUsuario: '',
    naturezasValidas: [],
    naturezasRicas: [],
    dicEntries: [],
    avisos: [],
    historico: [],
    futuro: [],
    csvArquivo: null,
    sujo: false,
    avisosAcionaveis: { avisos: [], removidos: {}, avisoEmInspecao: null },
  })
}

/** Cria um File `.xlsx` sintético com `arrayBuffer()` funcional (jsdom não implementa). */
function criarFileXlsx(nome: string, bytes: Uint8Array): File {
  const file = new File([bytes], nome, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
    writable: true,
  })
  return file
}

describe('E2E — Task T12: fatura Itaú .xlsx solta sozinha até lançamentos na grid de revisão (F1)', () => {
  let modeloBytes: Uint8Array
  let faturaBytes: Uint8Array

  beforeEach(() => {
    resetarStore()
    vi.clearAllMocks()
    reiniciarContadorIds()

    modeloBytes = new Uint8Array(readFileSync(CAMINHO_MODELO))
    faturaBytes = new Uint8Array(readFileSync(CAMINHO_FIXTURE_FATURA))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ arrayBuffer: async () => modeloBytes.buffer }) as Response),
    )
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('solta a fatura Itaú sozinha → não é confundida com dicionário → habilita Produzir revisão → grid recebe os 10 lançamentos', async () => {
    render(<App />)

    const fatura = criarFileXlsx('fatura-itau-julho-2026.xlsx', faturaBytes)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    await act(async () => {
      fireEvent.change(input, { target: { files: [fatura] } })
    })

    // A fatura aparece na lista de arquivos como arquivo de primeira classe
    // (Decisão 6 do ADR), com card e botão "Remover" — mesmo tratamento dos
    // extratos CSV/TXT.
    await waitFor(() => {
      expect(screen.getByText('fatura-itau-julho-2026.xlsx')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Remover' })).toBeInTheDocument()

    // Não confundida com dicionário (Decisão 4 do ADR): nenhum card de
    // dicionário carregado, nenhum aviso de substituição de dicionário nem de
    // ".xlsx não reconhecido" — o registry binário reconheceu de primeira.
    expect(screen.queryByText(/dicionário carregado/i)).not.toBeInTheDocument()
    expect(useAppStore.getState().dicEntries).toHaveLength(0)
    expect(
      useAppStore.getState().avisosAcionaveis.avisos.some((a) => a.id === 'xlsx-nao-reconhecido'),
    ).toBe(false)
    expect(
      useAppStore.getState().avisosAcionaveis.avisos.some((a) => a.id === 'dic-ultimo-vence'),
    ).toBe(false)

    // Sozinha, já habilita "Produzir revisão" (Decisão 6 do ADR) — sem
    // precisar de nenhum extrato bancário acompanhando (critério de valor F1).
    const botaoProduzir = screen.getByText('Produzir revisão')
    expect(botaoProduzir.closest('button')).not.toBeDisabled()

    await act(async () => {
      fireEvent.click(botaoProduzir)
    })

    // Grid de revisão recebe os 10 lançamentos da fixture (linhas 15 a 24:
    // 1 pagamento + 9 compras/estornos — mesma contagem provada pelo teste
    // unitário de `parsear()` em `fatura_itau_cc.test.ts`).
    await waitFor(() => {
      expect(useAppStore.getState().lancamentos).toHaveLength(10)
    })
    await waitFor(() => {
      expect(screen.getByTestId('review-grid')).toBeInTheDocument()
    })

    const lancamentos = useAppStore.getState().lancamentos
    expect(lancamentos.every((l) => l.fonte === 'fatura_itau_cc')).toBe(true)
    expect(lancamentos.some((l) => l.transcricao === 'Compra Supermercado Alfa')).toBe(true)
    expect(
      lancamentos.some(
        (l) => l.transcricao === 'Pagamento Debito Automatico' && l.origemEspecial === 'pagamento-recebido',
      ),
    ).toBe(true)
  })
})
