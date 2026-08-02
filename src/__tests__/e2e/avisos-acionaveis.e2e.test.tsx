// ADR: see Docs/specs/avisos-acionaveis.adr.md

/**
 * Teste E2E — Task 7 do spec `avisos-acionaveis`: import fatura+extrato →
 * aviso de valor pendente na CentralDeAvisos → proposta de conciliação →
 * aplicar → lançamento do extrato removido → export .xlsx sem erro.
 *
 * Diferença deliberada em relação aos demais testes de integração de App.tsx
 * desta spec (T5/T6): `../ui/PipelineState` e `../excel/writer/gerador` NÃO
 * são mockados aqui — o teste exercita o parser real (`fatura_nubank`,
 * `extrato_nubank`), as detecções reais (`detectarValorPendente`,
 * `detectarConciliacao`), o `avisosSlice` real e a geração real do .xlsx
 * (`gerarXlsx` contra o `public/Modelo.xlsx` real, mesmo precedente de
 * `App.painelNaturezas.test.tsx`). Só a rede (`fetch` do Modelo.xlsx) e o
 * disparo de download no DOM (`URL.createObjectURL`/clique da âncora) são
 * stubados — não há navegador real neste ambiente de teste.
 *
 * Fixtures sintéticas em `./fixtures/` — valores e nomes inventados, D5/D6 do
 * ADR `avisos-acionaveis` (zero dados de `data_sample/`). Datas escolhidas
 * deliberadamente para que `classificarFonte` (Task 8) classifique cada fonte
 * corretamente contra `mesEscolhido` (default = mês anterior ao corrente,
 * `defaultMes()`): fatura em abril/2026, extrato em junho/2026, com
 * `mesEscolhido` default = '2026-06' — mesmo precedente de
 * `App.conciliacaoFonte.test.tsx` (Task 8).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { App } from '../../App'
import { useAppStore } from '../../ui/store/appStore'

// ---------------------------------------------------------------------------
// Mocks — apenas componentes pesados de UI e wiring de infra de navegador.
// PipelineState, detecções, avisosSlice e gerador de xlsx permanecem reais.
// ---------------------------------------------------------------------------

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
    // Fixa o mês de referência independentemente do relógio da máquina: as
    // fixtures são datadas de abril/junho/2026 e assumem mesEscolhido='2026-06'.
    // Sem este mock, defaultMes() usa a data corrente e os testes quebram quando
    // o dia real sai de julho/2026 (bug de teste flaky por dependência de relógio).
    defaultMes: vi.fn(() => '2026-06'),
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    avisosAcionaveis: { avisos: [], removidos: {} },
  })
}

/** Cria um File sintético com `text()`/`arrayBuffer()` funcionais (jsdom não implementa). */
function criarFileTexto(nome: string, conteudo: string, tipo = 'text/csv'): File {
  const bytes = new TextEncoder().encode(conteudo)
  const file = new File([bytes], nome, { type: tipo })
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(conteudo), writable: true })
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(bytes.buffer),
    writable: true,
  })
  return file
}

const CAMINHO_FATURA = resolve(__dirname, './fixtures/fatura-sintetica-avisos.csv')
const CAMINHO_EXTRATO = resolve(__dirname, './fixtures/extrato-sintetico-avisos.csv')
const CAMINHO_MODELO = resolve(__dirname, '../../../public/Modelo.xlsx')

describe('E2E — Task 7: import fatura+extrato → avisos → conciliação → export', () => {
  beforeEach(() => {
    resetarStore()
    vi.clearAllMocks()

    const modeloBytes = new Uint8Array(readFileSync(CAMINHO_MODELO))
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

  // Checklist: nenhum dado real de data_sample/ nas fixtures versionadas.
  it('fixtures sintéticas não contêm referência a data_sample/', () => {
    const fatura = readFileSync(CAMINHO_FATURA, 'utf-8')
    const extrato = readFileSync(CAMINHO_EXTRATO, 'utf-8')

    expect(fatura).not.toMatch(/data_sample/i)
    expect(extrato).not.toMatch(/data_sample/i)
  })

  /** Faz upload de fatura+extrato sintéticos e clica em "Produzir revisão". */
  async function produzirFaturaEExtrato(): Promise<void> {
    render(<App />)

    const fatura = criarFileTexto(
      'fatura-sintetica-avisos.csv',
      readFileSync(CAMINHO_FATURA, 'utf-8'),
    )
    const extrato = criarFileTexto(
      'extrato-sintetico-avisos.csv',
      readFileSync(CAMINHO_EXTRATO, 'utf-8'),
    )

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [fatura, extrato] } })
    })

    const botaoProduzir = screen.getByText('Produzir revisão')
    await act(async () => {
      fireEvent.click(botaoProduzir)
    })

    await waitFor(() => {
      expect(useAppStore.getState().lancamentos.length).toBeGreaterThan(0)
    })
  }

  /**
   * Abre o sheet lateral colapsável (D12 do ADR `inspecao-proposta-conciliacao`,
   * Task T3a) — a seção "Propostas"/"Informativos" só existe no DOM quando
   * expandido. Mesmo padrão de `CentralDeAvisos.test.tsx`/`App.avisosAcionaveis.test.tsx`.
   */
  function abrirCentralDeAvisos(): void {
    fireEvent.click(screen.getByRole('button', { name: /^avisos/i }))
  }

  it('upload fatura+extrato sintéticos → proposta de valor pendente aparece na CentralDeAvisos', async () => {
    await produzirFaturaEExtrato()

    // Task T2 do spec `inspecao-proposta-conciliacao` (D10 do ADR): valor-pendente
    // promovido de `tipo:'informativo'` para `tipo:'proposta'` — não depende de
    // correlação entre arquivos, roda por arquivo (detectarValorPendente).
    await waitFor(() => {
      const propostas = useAppStore
        .getState()
        .avisosAcionaveis.avisos.filter((a) => a.tipo === 'proposta' && a.origem === 'valor-pendente')
      expect(propostas).toHaveLength(1)
    })

    abrirCentralDeAvisos()

    const secaoPropostas = screen.getByRole('region', { name: 'Propostas' })
    expect(within(secaoPropostas).getByText(/valor pendente do mês anterior/i)).toBeInTheDocument()
  })

  it('upload fatura+extrato sintéticos → proposta de conciliação aparece na CentralDeAvisos', async () => {
    await produzirFaturaEExtrato()

    await waitFor(() => {
      const propostas = useAppStore
        .getState()
        .avisosAcionaveis.avisos.filter((a) => a.tipo === 'proposta' && a.origem === 'conciliacao')
      expect(propostas).toHaveLength(1)
    })

    abrirCentralDeAvisos()

    const secaoPropostas = screen.getByRole('region', { name: 'Propostas' })
    expect(
      within(secaoPropostas).getByText(/pagamento de fatura/i),
    ).toBeInTheDocument()
  })

  /** Localiza o card (li) da proposta de conciliação pelo texto da mensagem, dentro da seção "Propostas". */
  function cardConciliacao(): HTMLElement {
    const secaoPropostas = screen.getByRole('region', { name: 'Propostas' })
    const item = within(secaoPropostas).getByText(/pagamento de fatura/i).closest('li')
    expect(item).not.toBeNull()
    return item as HTMLElement
  }

  it('aplicar (Aprovar) a proposta de conciliação remove o lançamento do extrato (não um da fatura)', async () => {
    await produzirFaturaEExtrato()

    await waitFor(() => {
      const propostas = useAppStore
        .getState()
        .avisosAcionaveis.avisos.filter((a) => a.tipo === 'proposta' && a.origem === 'conciliacao')
      expect(propostas).toHaveLength(1)
    })

    const lancamentosAntes = useAppStore.getState().lancamentos
    expect(lancamentosAntes.some((l) => /pagamento de fatura/i.test(l.transcricao))).toBe(true)

    abrirCentralDeAvisos()
    const botaoAprovar = within(cardConciliacao()).getByRole('button', { name: /aprovar/i })
    await act(async () => {
      fireEvent.click(botaoAprovar)
    })

    await waitFor(() => {
      const proposta = useAppStore
        .getState()
        .avisosAcionaveis.avisos.find((a) => a.origem === 'conciliacao')
      expect(proposta?.estado).toBe('aplicado')
    })

    const lancamentosDepois = useAppStore.getState().lancamentos
    // O lançamento do extrato ("Pagamento de fatura") saiu de `lancamentos".
    expect(lancamentosDepois.some((l) => /pagamento de fatura/i.test(l.transcricao))).toBe(false)
    // Os lançamentos normais da fatura (Livraria/Farmácia) permanecem intactos —
    // prova de que o índice removido é o do extrato, não o da fatura.
    expect(lancamentosDepois.some((l) => /livraria fictícia/i.test(l.transcricao))).toBe(true)
    expect(lancamentosDepois.some((l) => /farmácia fictícia/i.test(l.transcricao))).toBe(true)
    // O outro lançamento do extrato ("Outro débito fictício") não foi tocado.
    expect(lancamentosDepois.some((l) => /outro débito fictício/i.test(l.transcricao))).toBe(true)
    expect(lancamentosDepois).toHaveLength(lancamentosAntes.length - 1)
  })

  it('export .xlsx roda sem erro após aprovar a proposta de conciliação', async () => {
    await produzirFaturaEExtrato()

    await waitFor(() => {
      const propostas = useAppStore
        .getState()
        .avisosAcionaveis.avisos.filter((a) => a.tipo === 'proposta' && a.origem === 'conciliacao')
      expect(propostas).toHaveLength(1)
    })

    abrirCentralDeAvisos()
    const botaoAprovar = within(cardConciliacao()).getByRole('button', { name: /aprovar/i })
    await act(async () => {
      fireEvent.click(botaoAprovar)
    })

    await waitFor(() => {
      const proposta = useAppStore
        .getState()
        .avisosAcionaveis.avisos.find((a) => a.origem === 'conciliacao')
      expect(proposta?.estado).toBe('aplicado')
    })

    // Task T11: "Exportar .xlsx" abre o `ExportModal` (fase confirmar); a geração
    // real só dispara ao clicar em "Baixar .xlsx" dentro do modal.
    const botaoAbrirExport = screen.getByText('Exportar .xlsx')
    await act(async () => {
      fireEvent.click(botaoAbrirExport)
    })

    const botaoBaixar = screen.getByText('Baixar .xlsx')
    expect(() => {
      fireEvent.click(botaoBaixar)
    }).not.toThrow()

    // Fase avança para "feito" após a geração real, sem lançar exceção.
    expect(screen.getByText('Planilha exportada')).toBeInTheDocument()
  })
})
