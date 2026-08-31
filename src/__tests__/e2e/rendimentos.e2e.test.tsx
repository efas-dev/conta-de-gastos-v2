// ADR: see Docs/specs/rendimentos.adr.md

/**
 * Prova E2E — Task 13 do ADR/spec `rendimentos` (F8): a jornada completa do lançamento de
 * rendimentos contra a fiação REAL de produção (registry com o detector `'rendimentos'` sempre
 * presente e ÚLTIMO, T9; `FormRendimentos` real, T10; `CentralDeAvisos` real abrindo o form no
 * clique do card, T11; leitura real de `saldoAnterior` via upload de um `.xlsx`-dicionário com B5,
 * T1/T4; ciclo `aplicar` do verbo `'adicionar'`, reusado do VR; export real via `handleGerar`).
 *
 * Cenário 1 (fluxo completo, F6 — diferença positiva): upload de fatura+extrato sintéticos +
 * dicionário `.xlsx` com B2 (iniciais) e B5 (saldo anterior) → "Produzir revisão" → aviso
 * `'rendimentos'` aparece por ÚLTIMO na Central de Avisos (após `'vr'`, penúltimo) → clique no
 * card abre `FormRendimentos` → preenche conta corrente + aplicações com SOMA INLINE (`+`) →
 * sanity check não dispara (diferença abaixo do limiar de 5%) → confirma → grid ganha 1 lançamento
 * `RR` novo (`fonte:'form_rendimentos'`) → `saldo_calculado` (recomputado via
 * `calcularSaldoCalculado`) passa a igualar `saldo_informado` → export final inclui o lançamento
 * RR no `.xlsx` gerado.
 *
 * Cenário 2 (F6/Decisão 6 do ADR — diferença negativa): mesmo upload, mas o usuário informa um
 * saldo MENOR que o saldo calculado — nenhum lançamento `RR` é produzido, a grid permanece
 * inalterada, e o form exibe a orientação de conciliação manual (conferir o grid contra os apps do
 * banco/investimentos), sem lançar nada "na dúvida".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import React from 'react'
import { unzipSync, zipSync, strToU8 } from 'fflate'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { App } from '../../App'
import { useAppStore } from '../../ui/store/appStore'
import { reiniciarContadorIds } from '../../parsers/idSerial'
import { detectores } from '../../dominio/registry'
import { calcularSaldoCalculado } from '../../dominio/rendimentos'

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
const SALDO_ANTERIOR_B5 = 1000 // saldo do mês anterior lido de B5 do xlsx-dicionário

// ---------------------------------------------------------------------------
// Fixtures inline — Área tocada da Task 13 é literalmente este arquivo. Fatura
// + extrato mínimos produzindo 1 proposta de conciliação limpa (total exato:
// 58,90 + 41,00 = 99,90), mesmo par usado pela prova E2E da Task 9 do VR
// (`vr.e2e.test.tsx`) — reaproveita o cenário já validado para manter o ruído
// de detectores previsível (`conciliacao` + `vr` + `rendimentos`, sem
// valor-pendente/investimento).
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

/**
 * Constrói um `.xlsx`-dicionário sintético com aba "Dicionario" (mínima, só cabeçalho — suficiente
 * para `ehDicionario`/`lerDicionario` reconhecerem o arquivo) e aba "Extrato" com B2 (iniciais,
 * lida por `lerIniciais`) e B5 (saldo anterior, lida por `lerSaldoAnterior`, T1) preenchidas. Mesmo
 * padrão estrutural de `criarXlsxDicionarioComExtratoB5` em
 * `TelaImportacao.saldoAnterior.integration.test.tsx` (Task 4), duplicado localmente aqui por essa
 * função ser privada e aquele arquivo estar fora das `Áreas tocadas` desta task.
 */
function criarXlsxDicionarioComIniciaisESaldoAnterior(iniciais: string, saldoAnterior: number): Uint8Array {
  const dicSheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>chave</t></is></c>
      <c r="B1" t="inlineStr"><is><t>fonte</t></is></c>
      <c r="C1" t="inlineStr"><is><t>natureza</t></is></c>
      <c r="D1" t="inlineStr"><is><t>descricao</t></is></c>
      <c r="E1" t="inlineStr"><is><t>iniciais</t></is></c>
    </row>
  </sheetData>
</worksheet>`

  const extratoSheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>Mês</t></is></c></row>
    <row r="2"><c r="B2" t="inlineStr"><is><t>${iniciais}</t></is></c></row>
    <row r="5"><c r="B5"><v>${saldoAnterior}</v></c></row>
  </sheetData>
</worksheet>`

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Dicionario" sheetId="1" r:id="rId1"/>
    <sheet name="Extrato" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"
    Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"
    Target="worksheets/sheet2.xml"/>
</Relationships>`

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="xl/workbook.xml"/>
</Relationships>`

  return zipSync({
    '[Content_Types].xml': strToU8(contentTypesXml),
    '_rels/.rels': strToU8(rootRelsXml),
    'xl/workbook.xml': strToU8(workbookXml),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRelsXml),
    'xl/worksheets/sheet1.xml': strToU8(dicSheetXml),
    'xl/worksheets/sheet2.xml': strToU8(extratoSheetXml),
  })
}

function resetarStore(): void {
  useAppStore.setState({
    lancamentos: [],
    iniciais: '',
    nomeUsuario: '',
    naturezasValidas: [],
    naturezasRicas: [],
    dicEntries: [],
    avisos: [],
    historico: [],
    futuro: [],
    csvArquivo: null,
    sujo: false,
    saldoAnterior: null,
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

function criarFileXlsx(nome: string, bytes: Uint8Array): File {
  const file = new File([bytes], nome, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
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

describe('E2E — Task 13: fluxo completo rendimentos (F6/F8) + diferença negativa (D6)', () => {
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

  /**
   * Upload de fatura+extrato+dicionário (com B2/B5) e "Produzir revisão". O dicionário popula
   * `iniciais` (habilita o botão, `podaProduzir`) e `saldoAnterior` (T1/T4) num único evento de
   * seleção de arquivos, mesmo roteamento único já provado por `App.dicionarioUnificado.test.tsx`.
   */
  async function uploadEProduzir(): Promise<void> {
    render(<App />)

    const fatura = criarFileTexto('fatura-sintetica-t13.csv', FATURA_CSV)
    const extrato = criarFileTexto('extrato-sintetico-t13.csv', EXTRATO_CSV)
    const dicionario = criarFileXlsx(
      'dicionario-t13.xlsx',
      criarXlsxDicionarioComIniciaisESaldoAnterior('ES', SALDO_ANTERIOR_B5),
    )

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [fatura, extrato, dicionario] } })
    })

    await waitFor(() => {
      expect(useAppStore.getState().saldoAnterior).toBe(SALDO_ANTERIOR_B5)
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

  it('último aviso rendimentos → form → soma inline → sanity check → lançamento RR → saldo bate → export inclui RR', async () => {
    await uploadEProduzir()

    abrirCentralDeAvisos()

    // ---- 1. Posição do aviso rendimentos: ÚLTIMO (vr é o penúltimo) ---------
    expect(detectores[detectores.length - 2].origem).toBe('vr')
    expect(detectores[detectores.length - 1].origem).toBe('rendimentos')

    await waitFor(() => {
      const propostas = useAppStore
        .getState()
        .avisosAcionaveis.avisos.filter((a) => a.tipo === 'proposta')
      expect(propostas.map((a) => a.origem)).toEqual(['conciliacao', 'vr', 'rendimentos'])
      expect(propostas.every((a) => a.estado === 'pendente')).toBe(true)
    })

    // ---- 2. Clique no card do aviso rendimentos abre o FormRendimentos ------
    expect(screen.queryByTestId('form-rendimentos')).toBeNull()

    const cardRendimentos = cardPorTexto(/lançar rendimentos do mês/i)
    fireEvent.click(cardRendimentos)

    expect(screen.getByTestId('form-rendimentos')).toBeInTheDocument()

    // ---- 3. Preencher conta corrente + aplicações (soma inline via '+') -----
    // saldo_calculado = saldoAnterior(1000) + soma dos 3 lançamentos do grid
    // (-58,90 -41,00 -99,90 = -199,80, extrato registra a saída da fatura como
    // débito) = 800,20. saldo_informado = 700 + (80+50) = 830. Diferença =
    // 29,80, abaixo do limiar de 5% de 830 (41,50) — sanity check NÃO dispara.
    const formRendimentos = within(cardRendimentos)

    fireEvent.change(formRendimentos.getByLabelText('Conta corrente'), {
      target: { value: '700' },
    })
    fireEvent.change(formRendimentos.getByLabelText('Aplicações'), {
      target: { value: '80+50' },
    })

    // Feedback visual: soma inline reconhecida como válida.
    expect(formRendimentos.getByLabelText('Aplicações')).toHaveAttribute('data-soma-valida', 'true')

    // Sanity check não exibido (diferença abaixo do limiar).
    expect(within(cardRendimentos).queryByRole('status')).toBeNull()

    const lancamentosAntesAplicar = useAppStore.getState().lancamentos
    expect(lancamentosAntesAplicar).toHaveLength(3)

    // ---- 4. Submeter -----------------------------------------------------
    await act(async () => {
      fireEvent.click(formRendimentos.getByRole('button', { name: 'Lançar rendimento' }))
    })

    // ---- 5. Grid ganha 1 lançamento RR novo ---------------------------------
    await waitFor(() => {
      expect(useAppStore.getState().lancamentos).toHaveLength(4)
    })

    const lancamentoRR = useAppStore
      .getState()
      .lancamentos.find((l) => l.fonte === 'form_rendimentos')
    expect(lancamentoRR).toBeDefined()
    expect(lancamentoRR?.natureza).toBe('RR')
    expect(lancamentoRR?.valor).toBe(29.8)
    expect(lancamentoRR?.data).toBe('2026-06-30')

    await waitFor(() => {
      const avisoRendimentos = useAppStore
        .getState()
        .avisosAcionaveis.avisos.find((a) => a.origem === 'rendimentos')
      expect(avisoRendimentos?.estado).toBe('aplicado')
    })

    // ---- 6. saldo_calculado == saldo_informado ------------------------------
    const saldoCalculadoFinal = calcularSaldoCalculado(
      SALDO_ANTERIOR_B5,
      useAppStore.getState().lancamentos,
    )
    expect(saldoCalculadoFinal).toBe(830)

    // ---- 7. Export final inclui o lançamento RR -----------------------------
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

    expect(sheet1).toContain('Rendimento de aplicações (RR)')
    expect(sheet1).toContain('Livraria Fictícia')
    expect(sheet1).toContain('Farmácia Fictícia')
    expect(sheet1).toContain('Pagamento de fatura')
  })

  it('D6 — diferença negativa não lança RR e orienta conciliação manual, grid permanece inalterada', async () => {
    await uploadEProduzir()

    abrirCentralDeAvisos()

    const cardRendimentos = cardPorTexto(/lançar rendimentos do mês/i)
    fireEvent.click(cardRendimentos)
    expect(screen.getByTestId('form-rendimentos')).toBeInTheDocument()

    // saldo_calculado = 800,20 (mesmo cenário do cenário 1, antes de qualquer
    // aplicação). saldo_informado = 200 + 100 = 300 — abaixo do calculado,
    // diferença negativa (D6).
    const formRendimentos = within(cardRendimentos)
    fireEvent.change(formRendimentos.getByLabelText('Conta corrente'), {
      target: { value: '200' },
    })
    fireEvent.change(formRendimentos.getByLabelText('Aplicações'), {
      target: { value: '100' },
    })

    const lancamentosAntes = useAppStore.getState().lancamentos
    expect(lancamentosAntes).toHaveLength(3)

    await act(async () => {
      fireEvent.click(formRendimentos.getByRole('button', { name: 'Lançar rendimento' }))
    })

    // Nenhum lançamento novo, nenhuma Mutacao aplicada.
    expect(useAppStore.getState().lancamentos).toEqual(lancamentosAntes)
    expect(useAppStore.getState().lancamentos.some((l) => l.fonte === 'form_rendimentos')).toBe(
      false,
    )

    const avisoRendimentos = useAppStore
      .getState()
      .avisosAcionaveis.avisos.find((a) => a.origem === 'rendimentos')
    expect(avisoRendimentos?.estado).toBe('pendente')

    // Orientação de conciliação manual exibida no form.
    expect(within(cardRendimentos).getByRole('alert')).toHaveTextContent(/conciliação manual/i)
  })
})
