// ADR: see spec/fundacao-operacoes.adr.md

/**
 * Prova E2E — Task T17 do ADR `fundacao-operacoes`: a jornada inteira ponta a
 * ponta, contra a fiação REAL de produção (registry dos 5 detectores ligado
 * em produção pela T14; gatilho de obsolescência ligado via `excluirLinha`
 * pela T12; política "produzir limpa e re-detecta do zero" — D8/T09).
 *
 * Cenário único:
 *
 *  1. Upload real de fatura+extrato sintéticos (inline nesta task — não
 *     reaproveita `./fixtures/*.csv` de outras tasks para não arriscar
 *     alterar o conjunto de propostas que os testes de T7/T16 já dependem;
 *     ver "Decisões arquiteturais" no iteração-log desta task) → "Produzir
 *     revisão" → registry real detecta 3 propostas (`valor-pendente`,
 *     `conciliacao`, `investimento`).
 *  2. APLICAR a proposta de conciliação (remove a linha do extrato).
 *  3. DESFAZER essa mesma proposta (restaura a linha na posição original).
 *  4. DISPENSAR a proposta de valor pendente (não altera `lancamentos`).
 *  5. Excluir manualmente (`excluirLinha`, ação de grid real) a linha alvo da
 *     proposta de investimento, ainda pendente — vira `'obsoleto'`, some dos
 *     pendentes/badge.
 *  6. RE-PRODUZIR (D8): `avisosAcionaveis` é zerado e re-detectado do zero —
 *     a linha excluída manualmente volta (reparse do arquivo original,
 *     intocado), e nenhuma decisão anterior (aplicado/dispensado/obsoleto)
 *     sobrevive.
 *  7. Aplica a proposta de conciliação (fresca) e EXPORTA — o `.xlsx`
 *     gerado reflete o conjunto final de lançamentos.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import React from 'react'
import { unzipSync } from 'fflate'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { App } from '../../App'
import { useAppStore } from '../../ui/store/appStore'
import { selecionarContagemPendentes } from '../../ui/store/avisosSlice'
import { handleProduzir } from '../../ui/handlersPipeline'
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
    defaultMes: vi.fn(() => '2026-06'),
  }
})

const MES_ESCOLHIDO = '2026-06' // igual ao mock de defaultMes() acima

// ---------------------------------------------------------------------------
// Fixtures inline — não reaproveitam `./fixtures/*.csv` (Área tocada de T17 é
// literalmente `src/__tests__/e2e/*.test.ts`; alterar os .csv compartilhados
// arriscaria o conjunto de propostas que T7/T16 já verificam). Mesmos rótulos
// e valores da fatura/extrato sintéticos de T7 (fatura soma R$ 99,90 = extrato
// "Pagamento de fatura"), mais uma linha extra de extrato ("APLICACAO CDB...")
// para produzir uma proposta de `investimento` — o único detector (junto de
// `transferencia-interna`) que popula `mutacaoProposta`, pré-requisito para a
// transição a `'obsoleto'` via `reconciliarObsoletos` (ver
// `src/ui/store/avisosSlice.ts`: avisos legados sem `mutacaoProposta`, como
// `valor-pendente`/`conciliacao`, não são tocados por essa reconciliação).
// ---------------------------------------------------------------------------

const FATURA_CSV = [
  'date,title,amount',
  '2026-04-02,Valor pendente do mês anterior,32.10',
  '2026-04-05,Livraria Fictícia,58.90',
  '2026-04-12,Farmácia Fictícia,41.00',
].join('\n')

const EXTRATO_CSV = [
  'Data,Valor,Identificador,Descrição',
  '05/06/2026,-99.90,pag001,Pagamento de fatura',
  '10/06/2026,-15.00,out002,Outro débito fictício',
  '12/06/2026,-500.00,inv003,APLICACAO CDB LIQUIDEZ DIARIA',
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

describe('E2E — Task T17: jornada completa ponta a ponta', () => {
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
    // Só captura os bytes do .xlsx que `handleGerar` embrulha em Blob para o
    // download — `URL.createObjectURL` acima já ignora o conteúdo, então o
    // fake abaixo não precisa de comportamento real de Blob.
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

  function abrirCentralDeAvisos(): void {
    fireEvent.click(screen.getByRole('button', { name: /^avisos/i }))
  }

  function cardPorTexto(regex: RegExp): HTMLElement {
    const secaoPropostas = screen.getByRole('region', { name: 'Propostas' })
    const item = within(secaoPropostas).getByText(regex).closest('li')
    expect(item).not.toBeNull()
    return item as HTMLElement
  }

  it('upload → propostas → aplicar/desfazer/dispensar → obsoleto → re-produzir → export reflete o conjunto final', async () => {
    // ---- 1. Upload real + "Produzir revisão" -------------------------------
    render(<App />)

    const fatura = criarFileTexto('fatura-sintetica-t17.csv', FATURA_CSV)
    const extrato = criarFileTexto('extrato-sintetico-t17.csv', EXTRATO_CSV)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [fatura, extrato] } })
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Produzir revisão'))
    })

    await waitFor(() => {
      expect(useAppStore.getState().lancamentos).toHaveLength(6)
    })

    await waitFor(() => {
      const propostas = useAppStore
        .getState()
        .avisosAcionaveis.avisos.filter((a) => a.tipo === 'proposta')
      // 4ª proposta: 'vr' (Task 4, spec vr-despesas) — detector sempre presente, independente
      // do conteúdo dos lançamentos importados.
      expect(propostas).toHaveLength(4)
      expect(propostas.map((a) => a.origem).sort()).toEqual([
        'conciliacao',
        'investimento',
        'valor-pendente',
        'vr',
      ])
      expect(propostas.every((a) => a.estado === 'pendente')).toBe(true)
    })

    abrirCentralDeAvisos()

    // ---- 2. Aplicar a proposta de conciliação (remove a linha do extrato) --
    const lancamentosAntesAplicar = useAppStore.getState().lancamentos
    expect(lancamentosAntesAplicar.some((l) => /pagamento de fatura/i.test(l.transcricao))).toBe(
      true,
    )

    const cardConciliacao = cardPorTexto(/pagamento de fatura/i)
    await act(async () => {
      fireEvent.click(within(cardConciliacao).getByRole('button', { name: /aprovar/i }))
    })

    await waitFor(() => {
      const aviso = useAppStore.getState().avisosAcionaveis.avisos.find((a) => a.origem === 'conciliacao')
      expect(aviso?.estado).toBe('aplicado')
    })
    expect(
      useAppStore.getState().lancamentos.some((l) => /pagamento de fatura/i.test(l.transcricao)),
    ).toBe(false)
    expect(useAppStore.getState().lancamentos).toHaveLength(5)

    // ---- 3. Desfazer — restaura a linha na posição original ----------------
    await act(async () => {
      fireEvent.click(within(cardPorTexto(/pagamento de fatura/i)).getByRole('button', { name: /desfazer/i }))
    })

    await waitFor(() => {
      const aviso = useAppStore.getState().avisosAcionaveis.avisos.find((a) => a.origem === 'conciliacao')
      expect(aviso?.estado).toBe('pendente')
    })
    expect(useAppStore.getState().lancamentos).toEqual(lancamentosAntesAplicar)

    // ---- 4. Dispensar a proposta de valor pendente --------------------------
    const lancamentosAntesDispensar = useAppStore.getState().lancamentos
    const cardValorPendente = cardPorTexto(/valor pendente/i)
    await act(async () => {
      fireEvent.click(within(cardValorPendente).getByRole('button', { name: /dispensar/i }))
    })

    await waitFor(() => {
      const aviso = useAppStore
        .getState()
        .avisosAcionaveis.avisos.find((a) => a.origem === 'valor-pendente')
      expect(aviso?.estado).toBe('dispensado')
    })
    // Dispensar não altera lancamentos.
    expect(useAppStore.getState().lancamentos).toEqual(lancamentosAntesDispensar)

    // ---- 5. Excluir manualmente o alvo da proposta de investimento (ainda ---
    //         pendente) → transiciona a 'obsoleto' (fora dos pendentes/badge).
    const indiceInvestimento = useAppStore
      .getState()
      .lancamentos.findIndex((l) => /APLICACAO CDB/i.test(l.transcricao))
    expect(indiceInvestimento).toBeGreaterThanOrEqual(0)

    const avisoInvestimentoAntes = useAppStore
      .getState()
      .avisosAcionaveis.avisos.find((a) => a.origem === 'investimento')
    expect(avisoInvestimentoAntes?.estado).toBe('pendente')

    await act(async () => {
      useAppStore.getState().excluirLinha(indiceInvestimento)
    })

    const avisoInvestimentoDepois = useAppStore
      .getState()
      .avisosAcionaveis.avisos.find((a) => a.origem === 'investimento')
    expect(avisoInvestimentoDepois?.estado).toBe('obsoleto')
    expect(
      useAppStore.getState().lancamentos.some((l) => /APLICACAO CDB/i.test(l.transcricao)),
    ).toBe(false)

    // Fora dos pendentes: conciliação (voltou a pendente no passo 3) + 'vr' (sempre presente,
    // Task 4 spec vr-despesas) seguem pendentes — valor-pendente foi dispensado, investimento é
    // obsoleto.
    expect(selecionarContagemPendentes(useAppStore.getState())).toBe(2)

    await waitFor(() => {
      expect(screen.getByLabelText('2 propostas pendentes')).toBeInTheDocument()
    })

    // O card do aviso obsoleto continua listado (não desaparece), mas sem
    // nenhuma ação disponível (Aprovar/Dispensar/Desfazer somem — ver
    // `AcoesProposta` em `CentralDeAvisos.tsx`, que retorna `null` fora de
    // 'pendente'/'aplicado'/'dispensado').
    const cardInvestimentoObsoleto = cardPorTexto(/investimento/i)
    expect(within(cardInvestimentoObsoleto).queryByRole('button')).toBeNull()

    // ---- 6. Re-produzir (D8): zera avisos e re-detecta do zero --------------
    // A UI não oferece um segundo clique real em "Produzir revisão": uma vez
    // que `lancamentos.length > 0`, `App.tsx` (`emRevisao`) desmonta
    // `TelaImportacao` (e o botão junto) em favor de `TelaRevisao`, sem
    // nenhum caminho de volta na tela de revisão. O único jeito 100% real de
    // clicar o botão de novo seria excluir manualmente TODOS os lançamentos
    // restantes até `lancamentos.length` voltar a zero — uma volta forçada,
    // não representativa da intenção real de "re-produzir" desta task.
    // Chamar `handleProduzir` diretamente com a mesma fiação de dependências
    // que `TelaImportacao.tsx::handleProduzir` usa (mesmas actions reais do
    // store, nenhuma reimplementação de lógica) é a representação fiel do que
    // o clique do botão faria — mesmo precedente de T16, que chamou
    // `gerarAPartirDosRevisados` diretamente quando o caminho de UI completo
    // não era necessário para provar o comportamento em questão.
    // `reiniciarContadorIds()` (restrito a isolamento de teste, ver
    // `src/parsers/idSerial.ts`) evita que o contador global de id diverja
    // entre a primeira e a segunda chamada de "produzir" nesta mesma execução
    // de teste (achado documentado no iteração-log de T16) — os arquivos
    // originais (intocados) são reparseados do zero, então resetar o
    // contador faz os ids do segundo parse coincidirem com os do primeiro.
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

    await waitFor(() => {
      expect(useAppStore.getState().lancamentos).toHaveLength(6)
    })
    // A linha excluída manualmente no passo 5 volta — o reparse é do arquivo
    // original intocado, não carrega a edição manual da rodada anterior.
    expect(
      useAppStore.getState().lancamentos.some((l) => /APLICACAO CDB/i.test(l.transcricao)),
    ).toBe(true)

    const propostasReproduzidas = useAppStore
      .getState()
      .avisosAcionaveis.avisos.filter((a) => a.tipo === 'proposta')
    // +1 'vr' pelo mesmo motivo do passo 1 (detector sempre presente, Task 4 spec vr-despesas).
    expect(propostasReproduzidas).toHaveLength(4)
    // D8: nenhuma decisão da rodada anterior sobrevive — tudo volta a
    // 'pendente', incluindo o que era 'obsoleto' e o que era 'dispensado'.
    expect(propostasReproduzidas.every((a) => a.estado === 'pendente')).toBe(true)
    expect(useAppStore.getState().avisosAcionaveis.avisoEmInspecao).toBeNull()

    // ---- 7. Aplicar a conciliação (fresca) + exportar ------------------------
    // O painel de avisos já está aberto desde o passo 1 (nunca foi fechado) —
    // `togglePainel` fecharia se clicado de novo; só espera o conteúdo
    // re-renderizar com as propostas frescas do re-produzir.
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Propostas' })).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(
        within(cardPorTexto(/pagamento de fatura/i)).getByRole('button', { name: /aprovar/i }),
      )
    })

    await waitFor(() => {
      expect(
        useAppStore.getState().lancamentos.some((l) => /pagamento de fatura/i.test(l.transcricao)),
      ).toBe(false)
    })
    expect(useAppStore.getState().lancamentos).toHaveLength(5)

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

    // O .xlsx capturado no download reflete o conjunto final (5 lançamentos:
    // a linha "Pagamento de fatura" saiu; as demais 5 permanecem).
    const parts = unzipSync(capturedXlsxBytes as Uint8Array)
    const sheet1 = decodePart(parts, 'xl/worksheets/sheet1.xml')

    expect(sheet1).not.toContain('Pagamento de fatura')
    expect(sheet1).toContain('Valor pendente do mês anterior')
    expect(sheet1).toContain('Livraria Fictícia')
    expect(sheet1).toContain('Farmácia Fictícia')
    expect(sheet1).toContain('Outro débito fictício')
    expect(sheet1).toContain('APLICACAO CDB LIQUIDEZ DIARIA')
  })
})
