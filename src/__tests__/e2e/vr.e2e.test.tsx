// ADR: see Docs/specs/vr-despesas.adr.md

/**
 * Prova E2E — Task 9 do ADR `vr-despesas`: a jornada completa do registro manual de despesas
 * pagas com VR (vale-refeição), contra a fiação REAL de produção (registry com o detector `'vr'`
 * sempre presente, T4; `FormVR` real, T6/T7/T7-bis; ciclo `aplicar`/`desfazer` do verbo
 * `'adicionar'`, T3; export real via `handleGerar`).
 *
 * Cenário 1 (fluxo completo, F7): upload real de fatura+extrato sintéticos → "Produzir revisão"
 * → aviso `'vr'` aparece na Central de Avisos na posição PENÚLTIMA (o detector `'rendimentos'`,
 * spec `rendimentos` Task 9, passou a ocupar a última posição do array de `detectores`,
 * conforme o Follow-up já previsto na Decisão 5 do ADR `vr-despesas`) → clique no card abre
 * `FormVR` → preenche N=2 despesas →
 * aplica → grid ganha N saídas `form_vr` + 1 entrada `RR` → desfazer remove exatamente as N+1 →
 * export final inclui somente os lançamentos que permaneceram na grid no momento do export (as
 * despesas de VR desfeitas NÃO aparecem no `.xlsx`, provando que o export reflete o estado atual,
 * não o histórico).
 *
 * Cenário 2 (F6/Decisão 6 do ADR — recomposição não preserva `form_vr`): aplica o VR (1 despesa) e
 * então dispara "Produzir revisão" de novo (mesma técnica de chamada direta a `handleProduzir` já
 * usada pela prova E2E da Task T17 de `fundacao-operacoes`, já que a UI não oferece um segundo
 * clique real no botão uma vez que `TelaRevisao` está montada) — verifica explicitamente que os
 * lançamentos `form_vr` sintéticos SOMEM da grid (não são reconstruídos a partir de arquivo-fonte)
 * e que NENHUM aviso de preservação/perda é exibido, consistente com a Decisão 6.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import React from 'react'
import { unzipSync } from 'fflate'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { App } from '../../App'
import { useAppStore } from '../../ui/store/appStore'
import { handleProduzir } from '../../ui/handlersPipeline'
import { reiniciarContadorIds } from '../../parsers/idSerial'
import { detectores } from '../../dominio/registry'

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
    defaultMes: vi.fn(() => '2026-06'),
  }
})

const MES_ESCOLHIDO = '2026-06' // igual ao mock de defaultMes() acima
const ULTIMO_DIA_MES = '2026-06-30' // data automática esperada dos lançamentos VR (D4 do ADR)

// ---------------------------------------------------------------------------
// Fixtures inline — Área tocada da Task 9 é literalmente este arquivo (não
// reaproveita `./fixtures/*.csv` de outras tasks). Fatura+extrato mínimos que
// produzem exatamente 1 proposta de conciliação (total exato: 58,90 + 41,00 =
// 99,90), deliberadamente sem linha de "valor pendente" nem de investimento —
// a lista de propostas fica limpa (`conciliacao` + `vr`), suficiente para
// provar a posição do aviso 'vr' sem ruído de outros detectores.
// ---------------------------------------------------------------------------

const FATURA_CSV = [
  'date,title,amount',
  '2026-04-05,Livraria Fictícia,58.90',
  '2026-04-12,Farmácia Fictícia,41.00',
].join('\n')

const EXTRATO_CSV = [
  'Data,Valor,Identificador,Descrição',
  '05/06/2026,-99.90,pag001,Pagamento de fatura',
].join('\n')

const CAMINHO_MODELO = resolve(__dirname, '../../../public/Modelo.xlsx')

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

function decodePart(parts: Record<string, Uint8Array>, key: string): string {
  const data = parts[key]
  if (!data) throw new Error(`Parte não encontrada: ${key}`)
  return new TextDecoder().decode(data)
}

describe('E2E — Task 9: fluxo completo VR (F7) + F6/D6 (recomposição não preserva form_vr)', () => {
  let modeloBytes: Uint8Array
  let capturedXlsxBytes: Uint8Array | null

  beforeEach(() => {
    resetarStore()
    vi.clearAllMocks()
    reiniciarContadorIds()
    capturedXlsxBytes = null

    modeloBytes = new Uint8Array(readFileSync(CAMINHO_MODELO))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ arrayBuffer: async () => modeloBytes.buffer }) as Response),
    )
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    })
    vi.stubGlobal(
      'Blob',
      vi.fn(function (this: { parts: BlobPart[] }, parts: BlobPart[]) {
        this.parts = parts
        const primeiro = parts[0]
        if (primeiro instanceof Uint8Array) capturedXlsxBytes = primeiro
      }) as unknown as typeof Blob,
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function uploadEProduzir(): Promise<void> {
    render(<App />)

    const fatura = criarFileTexto('fatura-sintetica-t9.csv', FATURA_CSV)
    const extrato = criarFileTexto('extrato-sintetico-t9.csv', EXTRATO_CSV)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [fatura, extrato] } })
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Produzir revisão'))
    })

    await waitFor(() => {
      expect(useAppStore.getState().lancamentos).toHaveLength(3)
    })

    await waitFor(() => {
      expect(screen.getByTestId('review-grid')).toBeInTheDocument()
    })
  }

  function abrirCentralDeAvisos(): void {
    fireEvent.click(screen.getByRole('button', { name: /^sugestões/i }))
  }

  function cardPorTexto(regex: RegExp): HTMLElement {
    const secaoPropostas = screen.getByRole('region', { name: 'Propostas' })
    const item = within(secaoPropostas).getByText(regex).closest('li')
    expect(item).not.toBeNull()
    return item as HTMLElement
  }

  it('aviso VR penúltimo → form → N despesas → aplicar → grid → desfazer → export reflete só quem ficou', async () => {
    await uploadEProduzir()

    abrirCentralDeAvisos()

    // ---- 1. Posição do aviso VR: penúltima — o penúltimo do array atual de -----
    //         `detectores` (F2/Decisão 5 do ADR; `rendimentos`, spec `rendimentos`
    //         Task 9, agora ocupa a última posição). Duas verificações
    //         independentes: (a) no registry, 'vr' é o penúltimo detector
    //         registrado, 'rendimentos' é o último; (b) na Central de Avisos, a
    //         proposta 'vr' aparece antes de 'rendimentos' entre as propostas
    //         efetivamente emitidas para este cenário.
    expect(detectores[detectores.length - 2].origem).toBe('vr')
    expect(detectores[detectores.length - 1].origem).toBe('rendimentos')

    await waitFor(() => {
      const propostas = useAppStore
        .getState()
        .avisosAcionaveis.avisos.filter((a) => a.tipo === 'proposta')
      expect(propostas.map((a) => a.origem)).toEqual(['conciliacao', 'vr', 'rendimentos'])
      expect(propostas.every((a) => a.estado === 'pendente')).toBe(true)
    })

    // ---- 2. Clique no card do aviso VR abre o FormVR -----------------------
    expect(screen.queryByTestId('form-vr')).toBeNull()

    const cardVR = cardPorTexto(/despesas da casa pagas com vale-refeição/i)
    fireEvent.click(cardVR)

    expect(screen.getByTestId('form-vr')).toBeInTheDocument()

    // ---- 3. Preencher N=2 despesas e aplicar --------------------------------
    const formVR = within(cardVR)

    fireEvent.change(formVR.getByLabelText('Valor da despesa 1'), { target: { value: '50' } })
    fireEvent.change(formVR.getByLabelText('Natureza da despesa 1'), {
      target: { value: 'Alimentação' },
    })
    fireEvent.change(formVR.getByLabelText('Descrição da despesa 1'), {
      target: { value: 'Mercado ABC' },
    })

    fireEvent.click(formVR.getByRole('button', { name: '+ Adicionar' }))

    fireEvent.change(formVR.getByLabelText('Valor da despesa 2'), { target: { value: '30' } })
    fireEvent.change(formVR.getByLabelText('Natureza da despesa 2'), {
      target: { value: 'Farmácia' },
    })
    fireEvent.change(formVR.getByLabelText('Descrição da despesa 2'), {
      target: { value: 'Farmácia XYZ' },
    })

    const lancamentosAntesAplicar = useAppStore.getState().lancamentos
    expect(lancamentosAntesAplicar).toHaveLength(3)

    await act(async () => {
      fireEvent.click(formVR.getByRole('button', { name: 'Efetivar lançamentos' }))
    })

    // ---- 4. Grid ganha N=2 saídas `form_vr` + 1 entrada `RR` ----------------
    await waitFor(() => {
      expect(useAppStore.getState().lancamentos).toHaveLength(6)
    })

    const lancamentosVR = useAppStore
      .getState()
      .lancamentos.filter((l) => l.fonte === 'form_vr')
    expect(lancamentosVR).toHaveLength(3)

    const saidas = lancamentosVR.filter((l) => l.valor < 0)
    const entradaRR = lancamentosVR.find((l) => l.valor > 0)

    expect(saidas.map((l) => l.valor).sort((a, b) => a - b)).toEqual([-50, -30].sort((a, b) => a - b))
    expect(saidas.every((l) => l.data === ULTIMO_DIA_MES)).toBe(true)
    expect(saidas.some((l) => l.natureza === 'Alimentação' && l.descricao === 'Mercado ABC')).toBe(
      true,
    )
    expect(saidas.some((l) => l.natureza === 'Farmácia' && l.descricao === 'Farmácia XYZ')).toBe(
      true,
    )

    expect(entradaRR).toBeDefined()
    expect(entradaRR?.natureza).toBe('RR')
    expect(entradaRR?.descricao).toBe('VR utilizado para despesas familiares')
    expect(entradaRR?.valor).toBe(80)
    expect(entradaRR?.data).toBe(ULTIMO_DIA_MES)

    await waitFor(() => {
      const avisoVR = useAppStore.getState().avisosAcionaveis.avisos.find((a) => a.origem === 'vr')
      expect(avisoVR?.estado).toBe('aplicado')
    })

    // ---- 5. Reverter remove exatamente as N+1 --------------------------------
    const cardVRAplicado = cardPorTexto(/despesas da casa pagas com vale-refeição/i)
    await act(async () => {
      fireEvent.click(within(cardVRAplicado).getByRole('button', { name: /reverter/i }))
    })

    await waitFor(() => {
      const avisoVR = useAppStore.getState().avisosAcionaveis.avisos.find((a) => a.origem === 'vr')
      expect(avisoVR?.estado).toBe('pendente')
    })
    expect(useAppStore.getState().lancamentos).toEqual(lancamentosAntesAplicar)
    expect(useAppStore.getState().lancamentos.some((l) => l.fonte === 'form_vr')).toBe(false)

    // ---- 6. Export final inclui só quem ficou na grid -----------------------
    const botaoAbrirExport = screen.getByText('Exportar .xlsx')
    await act(async () => {
      fireEvent.click(botaoAbrirExport)
    })

    const botaoBaixar = screen.getByText('Baixar .xlsx')
    await act(async () => {
      fireEvent.click(botaoBaixar)
    })

    expect(screen.getByText('Planilha exportada')).toBeInTheDocument()
    expect(capturedXlsxBytes).not.toBeNull()

    const parts = unzipSync(capturedXlsxBytes as Uint8Array)
    const sheet1 = decodePart(parts, 'xl/worksheets/sheet1.xml')

    // As despesas VR aplicadas e depois desfeitas NÃO aparecem no export —
    // reflete o estado da grid NO MOMENTO do export, não o histórico da sessão.
    expect(sheet1).not.toContain('Mercado ABC')
    expect(sheet1).not.toContain('Farmácia XYZ')
    expect(sheet1).not.toContain('VR utilizado para despesas familiares')

    // Os 3 lançamentos originais (que permaneceram na grid) aparecem.
    expect(sheet1).toContain('Livraria Fictícia')
    expect(sheet1).toContain('Farmácia Fictícia')
    expect(sheet1).toContain('Pagamento de fatura')
  })

  it('F6/D6 — "Produzir revisão" de novo faz os form_vr sintéticos sumirem, sem aviso de preservação', async () => {
    await uploadEProduzir()

    abrirCentralDeAvisos()

    // ---- 1. Aplica 1 despesa de VR -------------------------------------------
    const cardVR = cardPorTexto(/despesas da casa pagas com vale-refeição/i)
    fireEvent.click(cardVR)

    const formVR = within(cardVR)
    fireEvent.change(formVR.getByLabelText('Valor da despesa 1'), { target: { value: '20' } })
    fireEvent.change(formVR.getByLabelText('Natureza da despesa 1'), {
      target: { value: 'Alimentação' },
    })
    fireEvent.change(formVR.getByLabelText('Descrição da despesa 1'), {
      target: { value: 'Padaria Fictícia' },
    })

    await act(async () => {
      fireEvent.click(formVR.getByRole('button', { name: 'Efetivar lançamentos' }))
    })

    await waitFor(() => {
      expect(useAppStore.getState().lancamentos).toHaveLength(5) // 3 originais + 1 saída + 1 RR
    })
    expect(useAppStore.getState().lancamentos.filter((l) => l.fonte === 'form_vr')).toHaveLength(2)

    await waitFor(() => {
      const avisoVR = useAppStore.getState().avisosAcionaveis.avisos.find((a) => a.origem === 'vr')
      expect(avisoVR?.estado).toBe('aplicado')
    })

    // ---- 2. Dispara "Produzir revisão" de novo -------------------------------
    // A UI não oferece um segundo clique real: uma vez que `lancamentos.length
    // > 0`, `App.tsx` desmonta `TelaImportacao` (e o botão junto) em favor de
    // `TelaRevisao`, sem caminho de volta na tela de revisão. Chamar
    // `handleProduzir` diretamente com a mesma fiação de dependências que
    // `TelaImportacao.tsx::handleProduzir` usaria é a representação fiel do
    // clique do botão — mesmo precedente já usado pela prova E2E da Task T17
    // (spec `fundacao-operacoes`) para o mesmo cenário de "re-produzir".
    // `reiniciarContadorIds()` evita que o contador global de id divirja entre
    // a primeira e a segunda chamada de "produzir" nesta mesma execução.
    const fatura = criarFileTexto('fatura-sintetica-t9-repro.csv', FATURA_CSV)
    const extrato = criarFileTexto('extrato-sintetico-t9-repro.csv', EXTRATO_CSV)

    reiniciarContadorIds()
    await act(async () => {
      useAppStore.getState().clearAvisos()
      await handleProduzir({
        csvArquivos: [fatura, extrato],
        dicEntries: useAppStore.getState().dicEntries,
        iniciais: useAppStore.getState().iniciais,
        nomeUsuario: useAppStore.getState().nomeUsuario,
        mesEscolhido: MES_ESCOLHIDO,
        addAviso: useAppStore.getState().addAviso,
        adicionarAvisosAcionaveis: useAppStore.getState().adicionarAvisos,
        limparAvisos: useAppStore.getState().limparAvisos,
        setLancamentos: useAppStore.getState().setLancamentos,
        setNaturezasRicas: useAppStore.getState().setNaturezasRicas,
        setNaturezasValidas: (siglas) => useAppStore.setState({ naturezasValidas: siglas }),
        setModeloBytes: () => {}, // já populado por App.tsx na primeira produção real
      })
    })

    // ---- 3. Verificação explícita de F6/D6 -----------------------------------
    await waitFor(() => {
      expect(useAppStore.getState().lancamentos).toHaveLength(3) // volta ao conjunto reparseado dos arquivos
    })
    // (a) os lançamentos `form_vr` sintéticos SOMEM — não são reconstruídos a
    //     partir de arquivo-fonte, pois nenhum deles tem origem em arquivo.
    expect(useAppStore.getState().lancamentos.every((l) => l.fonte !== 'form_vr')).toBe(true)
    expect(
      useAppStore.getState().lancamentos.some((l) => l.descricao === 'Padaria Fictícia'),
    ).toBe(false)

    // (b) nenhum aviso de preservação/perda é exibido para esses lançamentos —
    //     o detector 'vr' volta a emitir seu único aviso, sempre 'pendente'
    //     (D6: sem preservação, sem aviso, o usuário simplesmente refaz).
    const avisosDepois = useAppStore.getState().avisosAcionaveis.avisos
    expect(avisosDepois.every((a) => !/perd|preserv/i.test(a.mensagem))).toBe(true)

    const avisoVRDepois = avisosDepois.find((a) => a.origem === 'vr')
    expect(avisoVRDepois).toBeDefined()
    expect(avisoVRDepois?.tipo).toBe('proposta')
    expect(avisoVRDepois?.estado).toBe('pendente')
    expect(avisoVRDepois?.mutacaoProposta).toBeUndefined()
  })
})
