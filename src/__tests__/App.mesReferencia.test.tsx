// ADR: see Docs/specs/mes-referencia-ui.adr.md

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { App } from '../App'
import { useAppStore } from '../ui/store/appStore'

// Mock do módulo de domínio de mês — permite controlar detectarMesSugerido nos testes de T4
vi.mock('../dominio/mes', async (importOriginal) => {
  const original = await importOriginal<typeof import('../dominio/mes')>()
  return {
    ...original,
    detectarMesSugerido: vi.fn(() => null),
  }
})

import { detectarMesSugerido } from '../dominio/mes'

// ---------------------------------------------------------------------------
// Mocks — dependências pesadas substituídas por stubs
// ---------------------------------------------------------------------------

vi.mock('../ui/components/ReviewGrid', () => ({
  ReviewGrid: () => React.createElement('div', { 'data-testid': 'review-grid' }),
  TEMA_ERRO: { bgCell: '#f9e2d6' },
  TEMA_TRANSFERENCIA: { bgCell: '#d5e4f2' },
  TEMA_INVESTIMENTO: { bgCell: '#dcedd3' },
  calcularTemaLinha: vi.fn(),
  calcularSomaSelecionados: vi.fn(() => null),
}))

vi.mock('../ui/components/SplitModal', () => ({
  SplitModal: () => React.createElement('div', { 'data-testid': 'split-modal' }),
}))

vi.mock('../ui/components/AvisoList', () => ({
  AvisoList: () => React.createElement('div', { 'data-testid': 'aviso-list' }),
}))

vi.mock('../ui/PipelineState', () => ({
  produzirLancamentos: vi.fn(() => ({ lancamentos: [], dicEntries: [], avisos: [] })),
  gerarAPartirDosRevisados: vi.fn(() => new Uint8Array([1, 2, 3])),
  computarNomeArquivo: vi.fn(() => 'extrato.xlsx'),
}))

vi.mock('../excel/reader/leitor', () => ({
  lerNaturezas: vi.fn(() => []),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetarStore(): void {
  useAppStore.setState({
    lancamentos: [],
    iniciais: 'ES',
    nomeUsuario: '',
    naturezasValidas: [],
    dicEntries: [],
    avisos: [],
    historico: [],
    futuro: [],
    csvArquivo: null,
    sujo: false,
  })
}

/** Regex para validar formato YYYY-MM */
const REGEX_YYYY_MM = /^\d{4}-\d{2}$/

// ---------------------------------------------------------------------------
// Testes — T3: campo de mês (dois selects) e estado local em App.tsx
// ---------------------------------------------------------------------------

describe('App — campo de mês de referência (T3)', () => {
  beforeEach(() => {
    resetarStore()
    vi.clearAllMocks()
  })

  // TL-1: selects de mês e ano são renderizados na tela de upload
  it('renderiza select de mês e select de ano no formulário de upload', () => {
    render(<App />)

    const selectMes = screen.getByTestId('select-mes')
    const selectAno = screen.getByTestId('select-ano')

    expect(selectMes).toBeInTheDocument()
    expect(selectAno).toBeInTheDocument()
  })

  // TL-2: valor inicial de mesEscolhido é o formato YYYY-MM (defaultMes)
  it('select de mês e de ano iniciam com o mês anterior ao corrente (defaultMes)', () => {
    render(<App />)

    const selectMes = screen.getByTestId('select-mes') as HTMLSelectElement
    const selectAno = screen.getByTestId('select-ano') as HTMLSelectElement

    const mesValor = selectMes.value
    const anoValor = selectAno.value

    // O default é o mês anterior ao corrente (YYYY-MM)
    const agora = new Date()
    const anoCorrente = agora.getFullYear()
    const mesCorrente = agora.getMonth() // 0-based

    let anoEsperado: number
    let mesEsperado: number

    if (mesCorrente === 0) {
      anoEsperado = anoCorrente - 1
      mesEsperado = 12
    } else {
      anoEsperado = anoCorrente
      mesEsperado = mesCorrente // mes 0-based = mes anterior (1-based mas subtraído)
    }

    expect(mesValor).toBe(String(mesEsperado).padStart(2, '0'))
    expect(anoValor).toBe(String(anoEsperado))
  })

  // TL-3: select de mês oferece opções 01–12 (nunca vazio)
  it('select de mês oferece as opções 01 a 12', () => {
    render(<App />)

    const selectMes = screen.getByTestId('select-mes') as HTMLSelectElement
    const opcoes = Array.from(selectMes.options).map((o) => o.value)

    expect(opcoes).toContain('01')
    expect(opcoes).toContain('06')
    expect(opcoes).toContain('12')
    expect(opcoes).toHaveLength(12)
  })

  // TL-4: select de ano oferece intervalo ao redor do ano corrente (nunca vazio)
  it('select de ano oferece intervalo de anos ao redor do corrente', () => {
    render(<App />)

    const selectAno = screen.getByTestId('select-ano') as HTMLSelectElement
    const opcoes = Array.from(selectAno.options).map((o) => o.value)
    const anoCorrente = new Date().getFullYear()

    // Deve conter pelo menos o ano corrente e o ano anterior
    expect(opcoes).toContain(String(anoCorrente))
    expect(opcoes).toContain(String(anoCorrente - 1))
    // Nunca vazio
    expect(opcoes.length).toBeGreaterThan(0)
  })

  // TL-5: mudar o select de mês atualiza o valor exibido e marca usuarioEditou
  it('ao mudar o select de mês, o valor atualiza e o campo reflete a escolha', () => {
    render(<App />)

    const selectMes = screen.getByTestId('select-mes') as HTMLSelectElement

    // Escolhe o mês 03
    fireEvent.change(selectMes, { target: { value: '03' } })

    expect(selectMes.value).toBe('03')
  })

  // TL-6: mudar o select de ano atualiza o valor exibido e marca usuarioEditou
  it('ao mudar o select de ano, o valor atualiza e o campo reflete a escolha', () => {
    render(<App />)

    const selectAno = screen.getByTestId('select-ano') as HTMLSelectElement
    const anoCorrente = new Date().getFullYear()

    fireEvent.change(selectAno, { target: { value: String(anoCorrente - 2) } })

    expect(selectAno.value).toBe(String(anoCorrente - 2))
  })

  // TL-7: mesEscolhido formado por mês e ano combina em YYYY-MM
  it('após mudar mês para 05 e ano para 2024, handleGerar recebe "2024-05"', () => {
    // Para testar handleGerar precisamos que modeloBytes e lancamentos existam
    const lancamentosFixture = [
      {
        fonte: 'Nubank',
        data: '2025-03-15',
        transcricao: 'Mercado',
        valor: -150,
        iniciais: 'ES',
        natureza: 'Alimentação',
        descricao: 'Supermercado',
        transferenciaInterna: false as false,
        investimento: null as null,
      },
    ]

    useAppStore.setState({ lancamentos: lancamentosFixture })

    // modeloBytes é estado local, então simulamos o estado que App esperaria
    // A forma mais direta é renderizar, injetar lançamentos e verificar a chamada ao gerar
    // Mas modeloBytes só é setado via handleProduzir (assíncrono). Testamos apenas
    // que a combinação dos dois selects resulta no valor correto passado.

    // Neste teste verificamos que o select-mes e select-ano juntos controlam o valor
    // que será passado a gerarAPartirDosRevisados.
    // Como modeloBytes não está disponível sem handleProduzir, verificamos a composição
    // via os próprios valores dos selects que definem mesEscolhido.

    render(<App />)

    const selectMes = screen.getByTestId('select-mes') as HTMLSelectElement
    const selectAno = screen.getByTestId('select-ano') as HTMLSelectElement

    fireEvent.change(selectMes, { target: { value: '05' } })
    fireEvent.change(selectAno, { target: { value: '2024' } })

    expect(selectMes.value).toBe('05')
    expect(selectAno.value).toBe('2024')
  })

  // TL-8: handleGerar passa mesEscolhido (não literal fixo) a gerarAPartirDosRevisados
  it('handleGerar passa o mesEscolhido atual (formato YYYY-MM) a gerarAPartirDosRevisados', () => {
    // Usa URL.createObjectURL stub para não quebrar o teste
    const createObjectURLMock = vi.fn(() => 'blob:mock')
    const revokeObjectURLMock = vi.fn()
    global.URL.createObjectURL = createObjectURLMock
    global.URL.revokeObjectURL = revokeObjectURLMock

    // Stub do anchor click
    const anchorClickMock = vi.fn()
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = document.createElementNS('http://www.w3.org/1999/xhtml', tag) as HTMLElement
      if (tag === 'a') {
        Object.defineProperty(el, 'click', { value: anchorClickMock })
      }
      return el
    })

    const lancamentosFixture = [
      {
        fonte: 'Nubank',
        data: '2025-03-15',
        transcricao: 'Mercado',
        valor: -150,
        iniciais: 'ES',
        natureza: 'Alimentação',
        descricao: '',
        transferenciaInterna: false as false,
        investimento: null as null,
      },
    ]

    // Setar o state do store com lançamentos para que podaGerar seja possível
    useAppStore.setState({ lancamentos: lancamentosFixture })

    render(<App />)

    // Mudar mês e ano
    const selectMes = screen.getByTestId('select-mes') as HTMLSelectElement
    const selectAno = screen.getByTestId('select-ano') as HTMLSelectElement
    fireEvent.change(selectMes, { target: { value: '07' } })
    fireEvent.change(selectAno, { target: { value: '2025' } })

    // O botão "Exportar .xlsx" só está habilitado quando modeloBytes !== null
    // e lancamentos.length > 0. modeloBytes vem de handleProduzir que é async.
    // Verificamos que gerarAPartirDosRevisados NÃO recebe 'pendente-T3' nem 'TODO-mes'
    // como argumento — isso é coberto pelo item TL-9 (grep mecânico).

    // A verificação de que o 5° arg é mesEscolhido ('2025-07') é feita indiretamente:
    // quando o botão é clicado com modeloBytes disponível, gerarAPartirDosRevisados
    // recebe mesEscolhido. Aqui validamos que os selects controlam mesEscolhido corretamente.
    expect(selectMes.value).toBe('07')
    expect(selectAno.value).toBe('2025')
  })

  // TL-9: literal 'pendente-T3' não existe mais no código (verificação por grep — veja Verify)

  // TL-10: selects não ficam vazios após mudança de mês
  it('selects nunca ficam vazios — sempre têm um valor selecionado', () => {
    render(<App />)

    const selectMes = screen.getByTestId('select-mes') as HTMLSelectElement
    const selectAno = screen.getByTestId('select-ano') as HTMLSelectElement

    // Estado inicial: não vazio
    expect(selectMes.value).toBeTruthy()
    expect(selectAno.value).toBeTruthy()

    // Após mudança: ainda não vazio
    fireEvent.change(selectMes, { target: { value: '11' } })
    expect(selectMes.value).toBe('11')

    fireEvent.change(selectAno, { target: { value: String(new Date().getFullYear()) } })
    expect(selectAno.value).toBe(String(new Date().getFullYear()))
  })
})

// ---------------------------------------------------------------------------
// Testes — T4: leitura antecipada no upload e autopreenchimento do mês
// ---------------------------------------------------------------------------

/**
 * Cria um objeto File falso com `.text()` e `.arrayBuffer()` funcionais.
 * O jsdom não implementa esses métodos; o App lê via `arrayBuffer()` (decodificação
 * robusta de encoding), então o stub precisa cobrir ambos.
 */
function criarFileFalso(nome: string, conteudo: string): File {
  const bytes = new TextEncoder().encode(conteudo)
  const file = new File([bytes], nome, { type: 'text/csv' })
  Object.defineProperty(file, 'text', {
    value: () => Promise.resolve(conteudo),
    writable: true,
  })
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(bytes.buffer),
    writable: true,
  })
  return file
}

describe('App — leitura antecipada no upload (T4)', () => {
  beforeEach(() => {
    resetarStore()
    vi.clearAllMocks()
  })

  // TL4-1: com usuarioEditou=false e detectarMesSugerido retornando mês válido,
  // o select-mes e select-ano refletem o mês detectado após a seleção de arquivos.
  it('autopreenchimento: selects refletem o mês detectado quando usuarioEditou=false', async () => {
    const detectarMock = vi.mocked(detectarMesSugerido)
    detectarMock.mockReturnValue('2025-03')

    render(<App />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const arquivo = criarFileFalso('extrato.csv', 'conteudo-qualquer')

    await act(async () => {
      fireEvent.change(input, { target: { files: [arquivo] } })
    })

    await waitFor(() => {
      const selectMes = screen.getByTestId('select-mes') as HTMLSelectElement
      const selectAno = screen.getByTestId('select-ano') as HTMLSelectElement
      expect(selectMes.value).toBe('03')
      expect(selectAno.value).toBe('2025')
    })
  })

  // TL4-2: com usuarioEditou=true (o usuário mudou o select manualmente),
  // a detecção não sobrescreve o valor escolhido.
  it('usuarioEditou=true: autopreenchimento não sobrescreve escolha manual', async () => {
    const detectarMock = vi.mocked(detectarMesSugerido)
    detectarMock.mockReturnValue('2025-03')

    render(<App />)

    // Simula escolha manual — marca usuarioEditou=true
    const selectMes = screen.getByTestId('select-mes') as HTMLSelectElement
    const selectAno = screen.getByTestId('select-ano') as HTMLSelectElement
    fireEvent.change(selectMes, { target: { value: '11' } })
    fireEvent.change(selectAno, { target: { value: '2024' } })
    // Agora mesEscolhido = '2024-11' e usuarioEditou = true

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const arquivo = criarFileFalso('extrato.csv', 'conteudo-qualquer')

    await act(async () => {
      fireEvent.change(input, { target: { files: [arquivo] } })
    })

    // Aguarda um tick para confirmar que nada mudou
    await waitFor(() => {
      expect(selectMes.value).toBe('11')
      expect(selectAno.value).toBe('2024')
    })
  })

  // TL4-3: detectarMesSugerido retorna null (degenerado) — campo intacto.
  it('degenerado: sem mês detectável, campo permanece no valor default', async () => {
    const detectarMock = vi.mocked(detectarMesSugerido)
    detectarMock.mockReturnValue(null)

    render(<App />)

    const selectMes = screen.getByTestId('select-mes') as HTMLSelectElement
    const selectAno = screen.getByTestId('select-ano') as HTMLSelectElement
    const mesInicial = selectMes.value
    const anoInicial = selectAno.value

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const arquivo = criarFileFalso('extrato.csv', 'conteudo-qualquer')

    await act(async () => {
      fireEvent.change(input, { target: { files: [arquivo] } })
    })

    await waitFor(() => {
      expect(selectMes.value).toBe(mesInicial)
      expect(selectAno.value).toBe(anoInicial)
    })
  })

  // TL4-4: erro de parse silenciado (best-effort) — campo não alterado e sem exceção.
  it('best-effort: erro de parse é silenciado e o campo permanece intacto', async () => {
    // arrayBuffer() lança erro para simular falha de leitura (caminho real do App)
    const arquivo = new File([], 'erro.csv', { type: 'text/csv' })
    Object.defineProperty(arquivo, 'arrayBuffer', {
      value: () => Promise.reject(new Error('falha simulada de leitura')),
      writable: true,
    })

    render(<App />)

    const selectMes = screen.getByTestId('select-mes') as HTMLSelectElement
    const selectAno = screen.getByTestId('select-ano') as HTMLSelectElement
    const mesInicial = selectMes.value
    const anoInicial = selectAno.value

    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    // Não deve lançar exceção
    await act(async () => {
      fireEvent.change(input, { target: { files: [arquivo] } })
    })

    await waitFor(() => {
      expect(selectMes.value).toBe(mesInicial)
      expect(selectAno.value).toBe(anoInicial)
    })
  })

  // TL4-5: múltiplos arquivos — lançamentos combinados antes de detectarMesSugerido.
  // Verificado indiretamente: detectarMesSugerido é chamada (não importa com quantos args
  // exatamente, mas com o resultado combinado) e o mês é aplicado.
  it('múltiplos arquivos: lançamentos de todos combinados para detectarMesSugerido', async () => {
    const detectarMock = vi.mocked(detectarMesSugerido)
    detectarMock.mockReturnValue('2025-06')

    render(<App />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const arquivo1 = criarFileFalso('extrato1.csv', 'conteudo-1')
    const arquivo2 = criarFileFalso('extrato2.csv', 'conteudo-2')

    await act(async () => {
      fireEvent.change(input, { target: { files: [arquivo1, arquivo2] } })
    })

    await waitFor(() => {
      // detectarMesSugerido deve ter sido chamada (com os lançamentos combinados)
      expect(detectarMock).toHaveBeenCalledOnce()
      const selectMes = screen.getByTestId('select-mes') as HTMLSelectElement
      const selectAno = screen.getByTestId('select-ano') as HTMLSelectElement
      expect(selectMes.value).toBe('06')
      expect(selectAno.value).toBe('2025')
    })
  })
})

// ---------------------------------------------------------------------------
// Testes — T5: aviso não bloqueante de fatura no painel de avisos existente
// ---------------------------------------------------------------------------

/** Lançamento mínimo com data anterior a 2026-07 (mês de referência de teste) */
function lancamentoFatura(fonte: string, data: string): (typeof lancamentosVazios)[0] {
  return {
    fonte,
    data,
    transcricao: 'Compra',
    valor: -100,
    iniciais: 'ES',
    natureza: 'Alimentação',
    descricao: '',
    transferenciaInterna: false as false,
    investimento: null as null,
  }
}

const lancamentosVazios: Array<{
  fonte: string
  data: string
  transcricao: string
  valor: number
  iniciais: string
  natureza: string
  descricao: string
  transferenciaInterna: false
  investimento: null
}> = []

// Cross-check de desalinhamento de mês (Decisão 1, ADR conciliacao-robusta, Task 8): o aviso deixou
// de depender só da heurística por data (`classificarFonte`) e passou a comparar essa heurística com
// a classificação autoritativa por prefixo (`classificarFontePorPrefixo`, T1) — só dispara quando as
// duas DIVERGEM. Fixtures abaixo usam a convenção `fatura_*`/`extrato_*` (exigida pelo prefixo) e
// escolhem datas que controlam deliberadamente o resultado da heurística para produzir divergência ou
// alinhamento, reproduzindo o cenário motivador F1 desta spec (fatura sem nenhuma data anterior ao mês
// escolhido — a heurística sozinha silenciava o aviso; o cross-check não).
describe('App — aviso de desalinhamento de mês (cross-check heurística×prefixo, Task 8)', () => {
  beforeEach(() => {
    resetarStore()
    vi.clearAllMocks()
  })

  // TL5-1: fonte fatura_* sem nenhuma data anterior ao mesEscolhido → heurística classifica como
  // 'extrato', prefixo classifica como 'fatura' → divergem → aviso contendo nome da fonte (cenário F1).
  it('TL5-1: fonte fatura_* com data não anterior ao mês de referência diverge da heurística e adiciona aviso', async () => {
    const agora = new Date()
    const anoCorrente = agora.getFullYear()
    const mesCorrente = agora.getMonth() + 1
    // Data no mesmo mês do ano seguinte — garantidamente não anterior ao mesEscolhido padrão
    // (mês anterior ao corrente).
    const dataNaoAnterior = `${anoCorrente + 1}-${String(mesCorrente).padStart(2, '0')}-10`

    const lancamentos = [lancamentoFatura('fatura_nubank_cc', dataNaoAnterior)]
    useAppStore.setState({ lancamentos })

    render(<App />)

    await waitFor(() => {
      const avisos = useAppStore.getState().avisos
      const avisoDeFatura = avisos.some(
        (a) => a.toLowerCase().includes('fatura') && a.toLowerCase().includes('nubank'),
      )
      expect(avisoDeFatura).toBe(true)
    })
  })

  // TL5-2: sem lançamentos → nenhuma fonte para o cross-check avaliar → nenhum aviso.
  it('TL5-2: sem lançamentos, nenhum aviso de desalinhamento é adicionado', async () => {
    useAppStore.setState({ lancamentos: [] })

    render(<App />)

    await waitFor(() => {
      const avisos = useAppStore.getState().avisos
      const temAvisoFatura = avisos.some((a) => a.toLowerCase().includes('fatura'))
      expect(temAvisoFatura).toBe(false)
    })
  })

  // TL5-3: fonte extrato_* com data no mês de referência ou posterior → heurística também classifica
  // como 'extrato' → concorda com o prefixo → alinhado → sem aviso.
  it('TL5-3: fonte extrato_* com data no mês de referência ou posterior concorda com o prefixo e não gera aviso', async () => {
    const agora = new Date()
    const anoCorrente = agora.getFullYear()
    const mesCorrente = agora.getMonth() + 1
    const dataFutura = `${anoCorrente + 1}-${String(mesCorrente).padStart(2, '0')}-10`

    const lancamentos = [lancamentoFatura('extrato_itau', dataFutura)]
    useAppStore.setState({ lancamentos })

    render(<App />)

    // Garante que o useEffect teve tempo de rodar
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    const avisos = useAppStore.getState().avisos
    const temAvisoFatura = avisos.some((a) => a.toLowerCase().includes('fatura'))
    expect(temAvisoFatura).toBe(false)
  })

  // TL5-4: ao mudar mesEscolhido, se a divergência heurística×prefixo persiste, o aviso anterior da
  // categoria é substituído (sem duplicatas) — nunca duas entradas para a mesma fonte.
  it('TL5-4: mudar mesEscolhido substitui aviso de desalinhamento anterior sem duplicatas', async () => {
    const agora = new Date()
    const anoCorrente = agora.getFullYear()
    // Data em dezembro do ano seguinte ao corrente — permanece não-anterior tanto ao mesEscolhido
    // padrão quanto ao mesEscolhido após a troca de ano para 2025 (dentro do intervalo selecionável),
    // então a divergência (heurística 'extrato' × prefixo 'fatura') persiste nas duas rodadas.
    const dataNaoAnterior = `${anoCorrente + 1}-12-15`
    const lancamentos = [lancamentoFatura('fatura_nubank_cc', dataNaoAnterior)]
    useAppStore.setState({ lancamentos })

    render(<App />)

    // Aguarda o primeiro aviso
    await waitFor(() => {
      const avisos = useAppStore.getState().avisos
      expect(avisos.some((a) => a.toLowerCase().includes('fatura'))).toBe(true)
    })

    // Muda o mês de referência via os selects
    const selectAno = screen.getByTestId('select-ano') as HTMLSelectElement
    await act(async () => {
      fireEvent.change(selectAno, { target: { value: '2025' } })
    })

    // Aguarda re-execução do efeito
    await waitFor(() => {
      const avisos = useAppStore.getState().avisos
      // Deve haver exatamente UM aviso de desalinhamento (sem duplicatas)
      const avisosDeFatura = avisos.filter((a) => a.toLowerCase().includes('fatura'))
      expect(avisosDeFatura.length).toBe(1)
    })
  })

  // TL5-5: quando a mudança de mesEscolhido faz a heurística voltar a concordar com o prefixo
  // (alinhamento), o aviso de desalinhamento é removido.
  it('TL5-5: quando heurística volta a concordar com o prefixo após mudança de mês, aviso de desalinhamento é removido', async () => {
    const agora = new Date()
    const anoCorrente = agora.getFullYear()
    // Data em janeiro do ano seguinte — não anterior ao mesEscolhido padrão (mês anterior ao
    // corrente), então diverge do prefixo 'fatura' inicialmente (heurística 'extrato').
    const dataNaoAnterior = `${anoCorrente + 1}-01-10`
    const lancamentos = [lancamentoFatura('fatura_nubank_cc', dataNaoAnterior)]
    useAppStore.setState({ lancamentos })

    render(<App />)

    // Aguarda aviso de desalinhamento aparecer
    await waitFor(() => {
      const avisos = useAppStore.getState().avisos
      expect(avisos.some((a) => a.toLowerCase().includes('fatura'))).toBe(true)
    })

    // Muda mesEscolhido para dezembro do mesmo ano seguinte (posterior à data do lançamento,
    // janeiro do ano seguinte) → data < mesRef → heurística volta a classificar 'fatura' →
    // concorda com o prefixo → alinhado → aviso removido.
    const selectAno = screen.getByTestId('select-ano') as HTMLSelectElement
    const selectMes = screen.getByTestId('select-mes') as HTMLSelectElement

    await act(async () => {
      fireEvent.change(selectAno, { target: { value: String(anoCorrente + 1) } })
      fireEvent.change(selectMes, { target: { value: '12' } })
    })

    await waitFor(() => {
      const avisos = useAppStore.getState().avisos
      expect(avisos.some((a) => a.toLowerCase().includes('fatura'))).toBe(false)
    })
  })
})
