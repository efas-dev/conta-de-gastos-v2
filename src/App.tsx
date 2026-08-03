// ADR: see Docs/specs/grid-revisao.adr.md
// ADR: see Docs/specs/grid-ux-filtros.adr.md
// ADR: see Docs/specs/mes-referencia-ui.adr.md
// ADR: see Docs/specs/dicionario-ponta-a-ponta.adr.md
// ADR: see Docs/specs/colinha-naturezas.adr.md
// ADR: see Docs/specs/inspecao-proposta-conciliacao.adr.md
// ADR: see Docs/specs/redesign-frontend-claude-design.adr.md

import { useState, useRef, useEffect } from 'react'
import { useAppStore } from './ui/store/appStore'
import { selecionarContagemPendentes } from './ui/store/avisosSlice'
import {
  produzirLancamentos,
  gerarAPartirDosRevisados,
  computarNomeArquivo,
} from './ui/PipelineState'
import { lerNaturezas, lerDicionario, ehDicionario, lerIniciais } from './excel/reader/leitor'
import { validarLinha } from './dominio/validacao'
import { defaultMes, detectarMesSugerido, classificarFonte } from './dominio/mes'
import { detectar } from './parsers/index'
import { decodificarCsv } from './parsers/decodificar'
import { detectarConciliacao, detectarValorPendente, detectarPagamentoRecebido } from './dominio/deteccoes'
import type { Aviso, Lancamento } from './types'
import { ReviewGrid } from './ui/components/ReviewGrid'
import { FiltroBar } from './ui/components/FiltroBar'
import { SplitModal } from './ui/components/SplitModal'
import { FonteRotulo } from './ui/components/FonteRotulo'
import { Cabecalho } from './ui/components/Cabecalho'
import { ToolbarRevisao } from './ui/components/ToolbarRevisao'
import { PainelLateral, type AbaPainelLateral } from './ui/components/PainelLateral'
import { BannerInspecao } from './ui/components/BannerInspecao'
import { ExportModal } from './ui/components/ExportModal'
import { CartaoDicionario } from './ui/components/CartaoDicionario'
import { CartaoBancosSuportados } from './ui/components/CartaoBancosSuportados'

/**
 * Constrói um `Aviso` informativo dispensável para os 5 avisos legados migrados ao
 * canal único (sheet `PainelLateral`/aba Avisos, D18 do ADR `inspecao-proposta-conciliacao`
 * — Task T9). Convive com o canal legado `avisos: string[]` (`addAviso`/`clearAvisos`)
 * nos call-sites que ainda o alimentam — este helper só adiciona a via nova.
 */
/**
 * Lê um arquivo CSV/TXT como texto, decodificando o encoding de forma robusta.
 *
 * Não usa `File.text()` (que assume UTF-8): alguns bancos exportam em ISO-8859-1
 * (ex.: Banco do Brasil), e a decodificação com fallback (`decodificarCsv`)
 * evita acentos corrompidos. Ver `parsers/decodificar.ts`.
 */
async function lerTextoArquivo(arquivo: File): Promise<string> {
  const bytes = new Uint8Array(await arquivo.arrayBuffer())
  return decodificarCsv(bytes)
}

function criarAvisoInformativo(id: string, origem: string, mensagem: string): Aviso {
  return {
    id,
    tipo: 'informativo',
    origem,
    mensagem,
    alvo: [],
    permanece: [],
    estado: 'pendente',
  }
}

/**
 * App — Orquestra o fluxo de três etapas:
 *
 * 1. Upload: iniciais + nome opcional + CSV + dicionário opcional → botão "Produzir".
 * 2. Revisão: `ReviewGrid` editável com avisos e botão "Desfazer".
 * 3. Geração: `ExportModal` (fase confirmar → botão "Baixar" chama a geração real e
 *    dispara o download com revoke do objectURL, zero-retenção).
 *
 * Estado de UI vive exclusivamente no `useAppStore` (Zustand), mais um pequeno grupo
 * de estados locais de apresentação (arquivos brutos, mês escolhido, aba do painel
 * lateral, fase do modal de export) — nenhuma persistência além da sessão.
 *
 * Task T11 (spec `redesign-frontend-claude-design`): ponto único de montagem dos
 * componentes de apresentação extraídos em T1-T10 — `Cabecalho`, `ToolbarRevisao`,
 * `PainelLateral`, `BannerInspecao`, `ExportModal`, `CartaoDicionario`,
 * `CartaoBancosSuportados`. Nenhuma lógica de domínio/pipeline foi alterada; é
 * reestruturação de apresentação sobre os handlers já existentes.
 */
export function App() {
  // ---------------------------------------------------------------------------
  // Estado do store
  // ---------------------------------------------------------------------------

  const lancamentos = useAppStore((s) => s.lancamentos)
  const iniciais = useAppStore((s) => s.iniciais)
  const nomeUsuario = useAppStore((s) => s.nomeUsuario)
  const dicEntries = useAppStore((s) => s.dicEntries)
  const naturezasValidas = useAppStore((s) => s.naturezasValidas)
  const naturezasRicas = useAppStore((s) => s.naturezasRicas)
  const avisosAcionaveis = useAppStore((s) => s.avisosAcionaveis)
  const contagemAvisosPendentes = useAppStore(selecionarContagemPendentes)

  // Actions do store
  const setIniciais = useAppStore((s) => s.setIniciais)
  const setNomeUsuario = useAppStore((s) => s.setNomeUsuario)
  const setLancamentos = useAppStore((s) => s.setLancamentos)
  const setDic = useAppStore((s) => s.setDic)
  const setNaturezasRicas = useAppStore((s) => s.setNaturezasRicas)
  const addAviso = useAppStore((s) => s.addAviso)
  // Callback real do slice de avisos acionáveis — despachado ao pipeline em
  // handleProduzir (Decisão 5 do ADR avisos-acionaveis: PipelineState não
  // conhece o store; o call-site em App.tsx é quem faz a ligação real).
  const adicionarAvisosAcionaveis = useAppStore((s) => s.adicionarAvisos)
  const clearAvisos = useAppStore((s) => s.clearAvisos)
  const aplicarAviso = useAppStore((s) => s.aplicar)
  const dispensarAviso = useAppStore((s) => s.dispensar)
  const sairInspecao = useAppStore((s) => s.sairInspecao)
  const undo = useAppStore((s) => s.undo)
  const redo = useAppStore((s) => s.redo)
  const marcarLimpo = useAppStore((s) => s.marcarLimpo)

  // ---------------------------------------------------------------------------
  // Estado local (só em memória — zero-retenção)
  // ---------------------------------------------------------------------------

  /**
   * Flag que indica se o usuário editou manualmente o campo de iniciais na sessão.
   * Quando true, o preenchimento automático via lerIniciais (dicionário .xlsx)
   * não sobrescreve a escolha manual do usuário.
   */
  const [usuarioEditouIniciais, setUsuarioEditouIniciais] = useState<boolean>(false)

  /**
   * Extratos/faturas CSV selecionados (um ou vários bancos de uma vez).
   * Mantidos em estado local — o store só guarda os `lancamentos` já parseados
   * e mesclados, não os Files brutos (mesmo padrão de `dicArquivo`).
   */
  const [csvArquivos, setCsvArquivos] = useState<File[]>([])

  /** Metadados do dicionário `.xlsx` carregado, exibidos por `CartaoDicionario` (T11). */
  const [dicionarioCarregado, setDicionarioCarregado] = useState<{ nome: string; entradas: number } | null>(
    null,
  )

  /**
   * Bytes do Modelo.xlsx carregados no "Produzir" e reusados no "Gerar".
   * Mantido em estado local — o store não tem campo para bytes de template.
   */
  const [modeloBytes, setModeloBytes] = useState<Uint8Array | null>(null)

  /**
   * Mês de referência escolhido pelo usuário (formato YYYY-MM).
   * Inicializa com o mês anterior ao corrente via defaultMes() (nunca vazio — D6 do ADR).
   * Estado local — não vai para o appStore (D9 do ADR).
   */
  const [mesEscolhido, setMesEscolhido] = useState<string>(defaultMes())

  /**
   * Flag que indica se o usuário editou manualmente o campo de mês na sessão.
   * Quando true, a detecção automática (T4) não sobrescreve a escolha (D7 do ADR).
   */
  const [usuarioEditou, setUsuarioEditou] = useState<boolean>(false)

  /**
   * Lançamentos coletados na leitura antecipada, indexados por nome de arquivo.
   * Permite derivar as fontes presentes em cada arquivo e calcular os rótulos
   * fatura/extrato por fonte (D10, D11 do ADR mes-referencia-ui).
   */
  const [lancamentosAntecipados, setLancamentosAntecipados] = useState<
    Record<string, Lancamento[]>
  >({})

  /**
   * Índice do lançamento que abriu o SplitModal (null = modal fechado).
   */
  const [splitIndice, setSplitIndice] = useState<number | null>(null)

  /** Âncora invisível usada para disparar o download sem abrir nova aba. */
  const anchorRef = useRef<HTMLAnchorElement>(null)

  /** Input de arquivo único (upload unificado) — usado também pelo clique em `CartaoDicionario`. */
  const inputArquivoRef = useRef<HTMLInputElement>(null)

  /** Arrasto de arquivos sobre o dropzone em andamento (feedback visual — item 21). */
  const [arrastando, setArrastando] = useState<boolean>(false)

  /** Profundidade de dragEnter acumulada — evita desligar ao atravessar filhos do label. */
  const profundidadeArrastoRef = useRef(0)

  /**
   * Aba ativa do `PainelLateral` — Task T11. `null` = painel fechado. Substitui os
   * toggles próprios antigos de `CentralDeAvisos`/`PainelNaturezas` (D3/D4 das
   * frases de intenção, item 4).
   */
  const [painel, setPainel] = useState<AbaPainelLateral>(null)

  /** Fase do `ExportModal` — `null` = fechado (Task T11). */
  const [exportFase, setExportFase] = useState<'confirmar' | 'feito' | null>(null)

  /** Container da grid — observado para recalcular a largura do Glide (Task T11). */
  const gridWrapRef = useRef<HTMLDivElement>(null)

  // ---------------------------------------------------------------------------
  // Derivações
  // ---------------------------------------------------------------------------

  const podaProduzir = iniciais !== '' && csvArquivos.length > 0
  const podaGerar = lancamentos.length > 0 && modeloBytes !== null
  const emRevisao = lancamentos.length > 0
  const splitLancamento = splitIndice !== null ? lancamentos[splitIndice] : null

  // D5 do ADR colinha-naturezas: lista filtrada — somente naturezas com descrição preenchida.
  const naturezasDescritas = naturezasRicas.filter((n) => n.descricao !== '')

  const avisoEmInspecao =
    avisosAcionaveis.avisos.find((a) => a.id === avisosAcionaveis.avisoEmInspecao) ?? null

  const lancamentosPendentes = lancamentos.filter((l) => validarLinha(l, naturezasValidas)).length

  const nomeArquivoExport = emRevisao ? computarNomeArquivo(lancamentos, iniciais) : ''

  // ---------------------------------------------------------------------------
  // Atalhos de teclado (estilo Google Sheets) — desfazer/refazer
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!emRevisao) return
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      // Não sequestrar o desfazer nativo quando o foco está em campo de texto
      // (input do formulário ou overlay de edição da grid).
      const alvo = e.target as HTMLElement | null
      const tag = alvo?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || alvo?.isContentEditable) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [emRevisao, undo, redo])

  // Intercepta fechamento/recarga quando há mutações não exportadas (zero-retenção:
  // não persiste nada, só aciona o prompt nativo do navegador via preventDefault).
  const sujo = useAppStore((s) => s.sujo)
  useEffect(() => {
    if (!sujo) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [sujo])

  // Aviso não bloqueante de fatura — D4 do ADR mes-referencia-ui.
  // Recalcula quando os lançamentos carregados ou o mês de referência mudam.
  // Antes de inserir, remove avisos anteriores da mesma categoria (idempotente).
  useEffect(() => {
    // Prefixo interno para identificar a categoria do aviso — não visível ao usuário.
    const PREFIXO_FATURA = '[fatura-aviso]'

    // Coleta as fontes distintas presentes nos lançamentos
    const fontes = Array.from(new Set(lancamentos.map((l) => l.fonte)))

    const fontesFatura = fontes.filter(
      (fonte) => classificarFonte(fonte, lancamentos, mesEscolhido) === 'fatura',
    )

    // Remove avisos anteriores desta categoria antes de inserir (sem duplicatas)
    useAppStore.setState((state) => ({
      avisos: state.avisos.filter((a) => !a.startsWith(PREFIXO_FATURA)),
    }))

    if (fontesFatura.length === 0) return

    const listagem = fontesFatura.join(', ')
    const mensagem =
      `${PREFIXO_FATURA}Atenção: ${listagem} parece${fontesFatura.length > 1 ? 'm' : ''} ser` +
      ` fatura — cont${fontesFatura.length > 1 ? 'êm' : 'ém'} transações anteriores ao mês de referência (${mesEscolhido}).` +
      ` Verifique se o mês de referência está correto antes de exportar.`

    useAppStore.setState((state) => ({
      avisos: [...state.avisos, mensagem],
    }))

    // Canal único (T9, D18): mesma mensagem, migrada para o slice como informativo
    // dispensável, id fixo `'fatura-aviso'` — se um aviso com esse id já existe
    // (pendente ou já dispensado pelo usuário), NÃO recria: a dispensa precisa
    // persistir na sessão mesmo com o efeito rodando de novo a cada re-render/mudança
    // de mesEscolhido (mecanismo decidido localmente, ver iteração-log de T9).
    const jaExisteAvisoDeFatura = useAppStore
      .getState()
      .avisosAcionaveis.avisos.some((a) => a.id === 'fatura-aviso')
    if (!jaExisteAvisoDeFatura) {
      const mensagemSemPrefixo = mensagem.slice(PREFIXO_FATURA.length)
      adicionarAvisosAcionaveis([
        criarAvisoInformativo('fatura-aviso', 'fatura-aviso', mensagemSemPrefixo),
      ])
    }
  }, [lancamentos, mesEscolhido, adicionarAvisosAcionaveis])

  // Recalcula a largura da grid Glide ao abrir/fechar o PainelLateral (Task T11):
  // o container da grid vive num flex que muda de largura quando `painel` alterna
  // entre `null` e uma aba — o `DataEditor` do glide-data-grid (`width="100%"`,
  // `ReviewGrid.tsx`) observa o próprio container via ResizeObserver interno e
  // redesenha o canvas sozinho a cada mudança de tamanho; este efeito só existe
  // para deixar o gatilho explícito (o wrapper muda de largura de fato quando
  // `painel` muda, o que já é suficiente para o observer interno do Glide disparar
  // — não há API pública de "remeasure" externo em `DataEditorRef`, ver
  // iteração-log). Não falha quando `gridWrapRef` ainda não montou (tela de
  // importação, sem grid).
  useEffect(() => {
    const el = gridWrapRef.current
    if (!el) return
    // Força um reflow síncrono do container após a mudança de `painel` — garante
    // que o layout já refletiu a nova largura antes do próximo paint, mesmo em
    // navegadores que atrasariam o ResizeObserver por um frame.
    void el.offsetWidth
  }, [painel])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handler unificado de seleção de arquivos (CSV, TXT e XLSX).
   *
   * Para cada arquivo selecionado:
   * - Se extensão for `.xlsx`: chama ehDicionario(bytes).
   *   - true → lerDicionario + setDic; lerIniciais → preenche campo de iniciais se
   *     !usuarioEditouIniciais; se já havia dicionário carregado, emite aviso "último vence".
   *   - false → addAviso com mensagem de não reconhecido, sem interromper o fluxo.
   * - Demais extensões (.csv, .txt): roteados para o pipeline de parse CSV/TXT existente,
   *   com leitura antecipada best-effort para detectar o mês sugerido.
   *
   * Erros de leitura ou parse são silenciados (best-effort) — não quebram o fluxo.
   */
  async function handleUploadChange(e: React.ChangeEvent<HTMLInputElement>) {
    await processarArquivos(Array.from(e.target.files ?? []))
  }

  /**
   * Arrastar-e-soltar na tela de importação INTEIRA — mesmo roteamento do
   * input escondido. Os handlers vivem no container da tela (não só no
   * dropzone): soltar em qualquer ponto funciona, e o dragOver precisa de
   * preventDefault para o navegador permitir o drop (sem ele, soltar o
   * arquivo abre-o na aba).
   *
   * Feedback visual (item 21): `arrastando` liga em dragEnter e desliga em
   * dragLeave/drop, exibindo um overlay de tela cheia. dragEnter/dragLeave
   * disparam também ao atravessar filhos — o contador de profundidade evita
   * o pisca-pisca (só desliga quando o leave zera as entradas acumuladas).
   */
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault()
    profundidadeArrastoRef.current++
    setArrastando(true)
  }

  function handleDragLeave() {
    profundidadeArrastoRef.current = Math.max(0, profundidadeArrastoRef.current - 1)
    if (profundidadeArrastoRef.current === 0) setArrastando(false)
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    profundidadeArrastoRef.current = 0
    setArrastando(false)
    await processarArquivos(Array.from(e.dataTransfer.files ?? []))
  }

  async function processarArquivos(arquivos: File[]) {
    // Separa arquivos .xlsx dos demais
    const arquivosXlsx = arquivos.filter((f) => f.name.toLowerCase().endsWith('.xlsx'))
    const arquivosCsv = arquivos.filter((f) => !f.name.toLowerCase().endsWith('.xlsx'))

    // --- Processa arquivos .xlsx ---
    // Controla se já havia dicionário carregado antes deste upload
    let dicCarregado = dicEntries.length > 0
    for (const arquivo of arquivosXlsx) {
      try {
        const buf = await arquivo.arrayBuffer()
        const bytes = new Uint8Array(buf)
        const reconhecido = await ehDicionario(bytes)
        if (reconhecido) {
          if (dicCarregado) {
            const mensagem = `${arquivo.name}: dicionário substituído — último vence`
            addAviso(mensagem)
            adicionarAvisosAcionaveis([
              criarAvisoInformativo(crypto.randomUUID(), 'dic-ultimo-vence', mensagem),
            ])
          }
          const entradas = lerDicionario(bytes)
          setDic(entradas)
          setDicionarioCarregado({ nome: arquivo.name, entradas: entradas.length })
          dicCarregado = true
          const inicialsDoDic = await lerIniciais(bytes)
          if (inicialsDoDic !== null && !usuarioEditouIniciais) {
            setIniciais(inicialsDoDic)
          }
        } else {
          const mensagem = `${arquivo.name}: arquivo .xlsx não reconhecido como dicionário — ignorado`
          addAviso(mensagem)
          adicionarAvisosAcionaveis([
            criarAvisoInformativo(crypto.randomUUID(), 'xlsx-nao-reconhecido', mensagem),
          ])
        }
      } catch {
        // best-effort: erro silenciado — não quebra o fluxo
        const mensagem = `${arquivo.name}: erro ao processar arquivo .xlsx — ignorado`
        addAviso(mensagem)
        adicionarAvisosAcionaveis([
          criarAvisoInformativo(crypto.randomUUID(), 'erro-processar-xlsx', mensagem),
        ])
      }
    }

    // --- Processa arquivos CSV/TXT ---
    // Upload incremental (item 22): cada seleção ACUMULA na lista existente,
    // com dedup por nome (re-selecionar o mesmo arquivo substitui — último
    // vence). Seleção só de .xlsx não mexe na lista nem nos antecipados.
    if (arquivosCsv.length === 0) return

    const nomesNovos = new Set(arquivosCsv.map((f) => f.name))
    const listaAcumulada = [
      ...csvArquivos.filter((f) => !nomesNovos.has(f.name)),
      ...arquivosCsv,
    ]
    setCsvArquivos(listaAcumulada)

    const porArquivo: Record<string, Lancamento[]> = {}
    for (const arquivo of arquivosCsv) {
      try {
        const conteudo = await lerTextoArquivo(arquivo)
        const parser = detectar(conteudo)
        const { lancamentos: lans } = parser.parsear(conteudo)
        porArquivo[arquivo.name] = lans
      } catch {
        // best-effort: erro silenciado — não quebra o fluxo de upload
        porArquivo[arquivo.name] = []
      }
    }

    // Antecipados acumulados seguem a lista: só arquivos ainda presentes,
    // com os recém-lidos por cima (mesma regra "último vence" do dedup)
    const antecipadosAcumulados: Record<string, Lancamento[]> = {}
    for (const f of listaAcumulada) {
      const lans = porArquivo[f.name] ?? lancamentosAntecipados[f.name]
      if (lans) antecipadosAcumulados[f.name] = lans
    }
    setLancamentosAntecipados(antecipadosAcumulados)

    // Mês sugerido considera o CONJUNTO acumulado, não só o lote recém-solto
    const todosLancamentos: Lancamento[] = Object.values(antecipadosAcumulados).flat()
    const mesSugerido = detectarMesSugerido(todosLancamentos)
    if (mesSugerido !== null && !usuarioEditou) {
      setMesEscolhido(mesSugerido)
    }
  }

  /**
   * Etapa 1 — Parse + enriquecimento.
   *
   * Lê CSV como texto, carrega dicionário opcional como bytes,
   * busca Modelo.xlsx, chama `produzirLancamentos` e povoa o store.
   * Também lê `lerNaturezas` do modelo e grava `naturezasValidas` no store.
   */
  async function handleProduzir() {
    if (csvArquivos.length === 0) return

    clearAvisos()

    let modelo: Uint8Array
    try {
      // BASE_URL resolve o subcaminho do GitHub Pages ('/' em dev)
      const resp = await fetch(`${import.meta.env.BASE_URL}Modelo.xlsx`)
      modelo = new Uint8Array(await resp.arrayBuffer())
    } catch (err) {
      console.error('[App] Falha ao carregar Modelo.xlsx:', err)
      const mensagem = 'Erro ao carregar Modelo.xlsx — verifique o servidor'
      addAviso(mensagem)
      adicionarAvisosAcionaveis([
        criarAvisoInformativo(crypto.randomUUID(), 'erro-modelo-xlsx', mensagem),
      ])
      return
    }

    // Cada arquivo é parseado independentemente (pode ser de banco/formato
    // diferente — `detectar` roda por arquivo) e os lançamentos são concatenados
    // na ordem dos arquivos selecionados. O dicionário (dicEntries do store,
    // carregado pelo upload unificado) e as naturezas são os mesmos para todos.
    const todosLancamentos: typeof lancamentos = []
    for (const arquivo of csvArquivos) {
      const csvConteudo = await lerTextoArquivo(arquivo)
      const { lancamentos: lans, avisos: avs } = produzirLancamentos(
        csvConteudo,
        dicEntries,
        iniciais,
        nomeUsuario || undefined,
        [],
        adicionarAvisosAcionaveis,
      )
      todosLancamentos.push(...lans)
      for (const av of avs) {
        addAviso(`${arquivo.name}: ${av}`)
      }
    }

    // Task T11 do ADR `inspecao-proposta-conciliacao`: valor-pendente/pagamento-recebido
    // precisam ser detectados sobre o array TOTAL já concatenado (`todosLancamentos`),
    // não a sublista per-arquivo — `produzirLancamentos` (acima) parava de fazer isso
    // internamente por rodar por arquivo (T11, ver PipelineState.ts). Como
    // `origemEspecial` está presente em cada lançamento do total, `alvo` já nasce como
    // índice real, sem remapeamento de offset (mesmo padrão de `detectarConciliacao`
    // abaixo, mas sem precisar de `indicesFaturaNoTotal`/`indicesExtratoNoTotal` porque
    // a detecção já roda direto sobre o total). Corrige o bug achado na validação
    // visual manual (2026-08-01): quando a fatura não é o 1º arquivo do lote, o `alvo`
    // relativo à sublista per-arquivo casava com a linha errada em `state.lancamentos`.
    const avisosValorPendente = detectarValorPendente(todosLancamentos)
    const avisosPagamentoRecebido = detectarPagamentoRecebido(todosLancamentos)
    adicionarAvisosAcionaveis([...avisosValorPendente, ...avisosPagamentoRecebido])

    // Task 8 do ADR avisos-acionaveis: correlaciona fatura×extrato pelo campo
    // `fonte` que os parsers já gravam em cada lançamento — sem heurística de
    // nome de arquivo (decisão humana, ver spec Task 8). Reutiliza
    // `classificarFonte` (já usado acima para os rótulos fatura/extrato da
    // lista de arquivos) como única fonte de verdade, em vez de introduzir
    // uma segunda heurística. `produzirLancamentos` sempre roda por arquivo
    // com `lancamentosExtrato=[]` (linha 366: 5º argumento), então
    // `detectarConciliacao` nunca dispara ali — esta é a única chamada,
    // evitando dupla emissão de propostas. Só executa quando o lote produzido
    // tem ao menos uma fonte de cada lado; um único arquivo (só fatura ou só
    // extrato) fica sem proposta e sem o aviso informativo "não conciliada",
    // preservando o comportamento anterior.
    const fontesProduzidas = Array.from(new Set(todosLancamentos.map((l) => l.fonte)))
    const fontesFaturaProduzidas = fontesProduzidas.filter(
      (fonte) => classificarFonte(fonte, todosLancamentos, mesEscolhido) === 'fatura',
    )
    const fontesExtratoProduzidas = fontesProduzidas.filter(
      (fonte) => classificarFonte(fonte, todosLancamentos, mesEscolhido) === 'extrato',
    )

    if (fontesFaturaProduzidas.length > 0 && fontesExtratoProduzidas.length > 0) {
      const lancamentosExtratoTotal = todosLancamentos.filter((l) =>
        fontesExtratoProduzidas.includes(l.fonte),
      )
      // `detectarConciliacao` (T3, função pura) devolve `aviso.alvo` como índice
      // posicional relativo ao array `lancamentosExtrato` que ela recebeu — aqui,
      // o subconjunto filtrado `lancamentosExtratoTotal`, não `todosLancamentos`
      // inteiro. `avisosSlice.aplicar` (T4), por sua vez, interpreta `alvo` como
      // índice posicional em `state.lancamentos`, que é `todosLancamentos` sem
      // filtro (ver `setLancamentos(todosLancamentos)` abaixo). Os dois contratos
      // são internamente corretos, mas divergem no índice-base; sem remapear
      // aqui, `aplicar` removeria o item errado sempre que a fatura precedesse o
      // extrato no lote (evidência: Docs/.harness/iteracao-log-spec-20260720-avisos-acionaveis.md,
      // bloco "Debugging gate" da Task 7, 2ª tentativa). `indicesExtratoNoTotal[i]`
      // traduz o índice i dentro do subconjunto filtrado para o índice real em
      // `todosLancamentos`.
      const indicesExtratoNoTotal = todosLancamentos
        .map((l, indice) => ({ l, indice }))
        .filter(({ l }) => fontesExtratoProduzidas.includes(l.fonte))
        .map(({ indice }) => indice)
      // Par único por fatura (Decisão R2 do ADR): uma chamada de detectarConciliacao
      // por fonte de fatura, nunca as faturas somadas entre si.
      for (const fonteFatura of fontesFaturaProduzidas) {
        const lancamentosDestaFatura = todosLancamentos.filter((l) => l.fonte === fonteFatura)
        // Mesmo padrão de `indicesExtratoNoTotal` acima, agora para o lado da fatura:
        // `aviso.permanece` (T0, ADR `inspecao-proposta-conciliacao`) também é um índice
        // posicional relativo ao subconjunto filtrado que `detectarConciliacao` recebeu —
        // aqui, `lancamentosDestaFatura` — não a `todosLancamentos` inteiro. Sem este
        // remapeamento, `permanece` aponta para a linha errada sempre que a fatura não é o
        // primeiro arquivo do lote (dívida registrada em
        // Docs/debt/tecnica/remapeamento-permanece-ausente-app-tsx.md).
        const indicesFaturaNoTotal = todosLancamentos
          .map((l, indice) => ({ l, indice }))
          .filter(({ l }) => l.fonte === fonteFatura)
          .map(({ indice }) => indice)
        const avisosConciliacao = detectarConciliacao(lancamentosDestaFatura, lancamentosExtratoTotal)
        const avisosRemapeados = avisosConciliacao.map((aviso) => ({
          ...aviso,
          alvo: aviso.alvo.map((indiceStr) => String(indicesExtratoNoTotal[Number(indiceStr)])),
          permanece: aviso.permanece.map((indiceStr) => String(indicesFaturaNoTotal[Number(indiceStr)])),
        }))
        adicionarAvisosAcionaveis(avisosRemapeados)
      }
    }

    // Parseia naturezas uma única vez e deriva ambos os campos (D2 do ADR colinha-naturezas).
    const ricas = lerNaturezas(modelo)

    setLancamentos(todosLancamentos)
    setNaturezasRicas(ricas)
    // `naturezasValidas` derivado das siglas — sem parse adicional (D2 do ADR colinha-naturezas).
    useAppStore.setState({ naturezasValidas: ricas.map((n) => n.sigla) })

    setModeloBytes(modelo)
  }

  /**
   * Etapa 3 — Aprendizado do dicionário + geração do .xlsx.
   *
   * Chama `gerarAPartirDosRevisados` com os lançamentos revisados do store,
   * cria o Blob, dispara o download via `<a download>` e revoga o objectURL
   * imediatamente — zero-retenção (invariante do projeto). Task T11: agora
   * disparado pelo botão "Baixar .xlsx" do `ExportModal` (fase confirmar),
   * não mais diretamente pelo botão "Exportar .xlsx" da toolbar.
   */
  function handleGerar() {
    if (!modeloBytes || lancamentos.length === 0) return

    const xlsxBytes = gerarAPartirDosRevisados(modeloBytes, iniciais, lancamentos, dicEntries, mesEscolhido)

    // `.slice()` materializa Uint8Array<ArrayBuffer> puro a partir do
    // Uint8Array<ArrayBufferLike> do fflate — necessário para BlobPart no TS ≥ 5.7.
    const blob = new Blob([xlsxBytes.slice()], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const nome = computarNomeArquivo(lancamentos, iniciais)

    const url = URL.createObjectURL(blob)
    const a = anchorRef.current
    if (!a) return
    a.href = url
    a.download = nome
    a.click()
    marcarLimpo() // seta sujo=false imediatamente após exportação — D6 do ADR
    URL.revokeObjectURL(url) // revoke imediato — zero-retenção
  }

  /** Confirma a exportação a partir do `ExportModal` (fase confirmar → "Baixar .xlsx"). */
  function handleConfirmarExport() {
    handleGerar()
    setExportFase('feito')
  }

  function togglePainel(aba: Exclude<AbaPainelLateral, null>) {
    setPainel((atual) => (atual === aba ? null : aba))
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main
      style={{
        minHeight: '100vh',
        height: emRevisao ? '100vh' : undefined,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
      }}
    >
      {/* Âncora invisível para trigger de download */}
      {/* eslint-disable-next-line jsx-a11y/anchor-has-content */}
      <a ref={anchorRef} style={{ display: 'none' }} aria-hidden="true" />

      {/* ------------------------------------------------------------------ */}
      {/* Etapa 1 — Upload (visível enquanto não há lançamentos no store)     */}
      {/* ------------------------------------------------------------------ */}
      {!emRevisao && (
        <div
          data-testid="tela-importacao"
          data-arrastando={arrastando}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          // `.tela` do protótipo (`height:100vh; display:flex; flex-direction:column`,
          // `prototipo/Conta de Gastos - Redesign.html:15`) não foi portada para
          // `src/index.css` por T1 (fora da lista de ~26 classes do checklist) — e
          // `src/index.css` está fora das Áreas tocadas de T11. Replicado inline
          // (layout puro, sem cor) até uma task futura portar a classe.
          style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}
        >
          {/* Overlay de tela cheia durante o arrasto (item 21) — pointerEvents:none
              para o drop atravessar até o container que tem os handlers. */}
          {arrastando && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 50,
                background: 'rgba(239, 243, 239, 0.92)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 18,
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 16,
                  border: '2.5px dashed var(--verde)',
                  borderRadius: 24,
                }}
              />
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--verde)' }}>
                Solte os arquivos aqui
              </div>
              <div className="rotulo">CSV, TXT ou dicionário .xlsx — em qualquer lugar da tela</div>
            </div>
          )}

          <Cabecalho etapa={0} />

          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '38px 40px 56px' }}>
            <div style={{ width: '100%', maxWidth: 960 }}>
              <div style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto' }}>
                <h1 className="titulo">Importe seus extratos e faturas</h1>
                <p className="subtitulo">
                  Solte os arquivos, confira num piscar de olhos e exporte a planilha pronta. Sem
                  copiar e colar, sem enviar nada para lugar nenhum.
                </p>
                {avisosAcionaveis.avisos.length > 0 && (
                  <button
                    type="button"
                    className={'btn sec' + (painel === 'avisos' ? ' ativo' : '')}
                    style={{ marginTop: 14 }}
                    onClick={() => togglePainel('avisos')}
                  >
                    Avisos
                    {contagemAvisosPendentes > 0 && (
                      <span className="badge">{contagemAvisosPendentes}</span>
                    )}
                  </button>
                )}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 340px',
                  gap: 18,
                  marginTop: 30,
                  alignItems: 'start',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Dropzone (label clicável envolvendo o input escondido; o arrasto é
                      tratado pela tela inteira — handlers no container tela-importacao) */}
                  <label className="dropzone">
                    <input
                      ref={inputArquivoRef}
                      type="file"
                      accept=".csv,.txt,.xlsx"
                      multiple
                      onChange={handleUploadChange}
                      style={{ display: 'none' }}
                    />
                    <span className="icone-drop">
                      <IconeUpload />
                    </span>
                    <div style={{ marginTop: 14, fontSize: 16.5, fontWeight: 700 }}>
                      Arraste extratos e faturas aqui
                    </div>
                    <div className="rotulo">ou clique para escolher · CSV ou TXT · vários de uma vez</div>
                  </label>

                  {/* Lista de arquivos selecionados */}
                  {csvArquivos.map((f) => {
                    // Fontes distintas detectadas na leitura antecipada deste arquivo.
                    // Recalcula sempre que mesEscolhido muda (D10, D11 do ADR).
                    const lansArquivo = lancamentosAntecipados[f.name] ?? []
                    const fontesArquivo = Array.from(new Set(lansArquivo.map((l) => l.fonte)))

                    return (
                      <div key={f.name} className="arquivo">
                        <span className="icone-arq">
                          <IconeArquivo />
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {f.name}
                          </div>
                          <div className="rotulo" style={{ marginTop: 4 }}>
                            {fontesArquivo.length > 0 ? (
                              <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                {fontesArquivo.map((fonte) => (
                                  <FonteRotulo
                                    key={fonte}
                                    fonte={fonte}
                                    tipo={classificarFonte(fonte, lansArquivo, mesEscolhido)}
                                  />
                                ))}
                              </span>
                            ) : (
                              'Pronto para revisar'
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn-remover"
                          onClick={(e) => {
                            e.preventDefault()
                            setCsvArquivos((prev) => prev.filter((x) => x !== f))
                          }}
                        >
                          Remover
                        </button>
                      </div>
                    )
                  })}

                  {/* Config: iniciais + nome + mês de referência */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      gap: 14,
                      marginTop: 10,
                    }}
                  >
                    <label className="campo">
                      <span className="rotulo">
                        Suas iniciais <em>*</em>
                      </span>
                      <input
                        className="input"
                        type="text"
                        value={iniciais}
                        placeholder="Ex.: ES"
                        onChange={(e) => {
                          setIniciais(e.target.value.trim().toUpperCase())
                          setUsuarioEditouIniciais(true)
                        }}
                      />
                    </label>
                    <label className="campo">
                      <span className="rotulo">
                        Seu nome <span className="opcional">(opcional)</span>
                      </span>
                      <input
                        className="input"
                        type="text"
                        value={nomeUsuario}
                        placeholder="Ex.: Eduardo"
                        onChange={(e) => setNomeUsuario(e.target.value)}
                      />
                    </label>
                    <div className="campo">
                      <span className="rotulo">Mês de referência</span>
                      <SeletorMesReferencia
                        mesEscolhido={mesEscolhido}
                        onChange={(novoMes) => {
                          setMesEscolhido(novoMes)
                          setUsuarioEditou(true)
                        }}
                      />
                    </div>
                  </div>

                  {/* CTA */}
                  <button
                    className="btn pri cta"
                    onClick={handleProduzir}
                    disabled={!podaProduzir}
                    style={{ marginTop: 8 }}
                  >
                    Produzir revisão
                    <IconeSeta />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <CartaoDicionario
                    dicionario={dicionarioCarregado}
                    onCarregar={() => inputArquivoRef.current?.click()}
                  />
                  <CartaoBancosSuportados />
                </div>
              </div>
            </div>
          </div>

          {painel && (
            // Tela de importação não tem layout de flex-row com a grid para o painel
            // "empurrar" (item 4 das frases de intenção é sobre a tela de revisão) —
            // aqui o `PainelLateral` sobrepõe como painel fixo à direita, mesmo
            // componente/abas, só a posição de ancoragem muda (`position:fixed`
            // aplicado neste wrapper, não no componente em si — T5 removeu
            // `position:fixed` do componente).
            <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 40 }}>
              <PainelLateral aba={painel} setAba={setPainel} naturezas={naturezasDescritas} />
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Etapa 2 — Revisão (visível quando há lançamentos no store)          */}
      {/* ------------------------------------------------------------------ */}
      {emRevisao && (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
          {/* Header único (faixa só): status de progresso à esquerda + ações à
              direita, numa única `.toolbar.compacta` — fiel ao protótipo
              (`prototipo/cdg-revisao.jsx:163-191`), que distribui os dois grupos
              via `justify-content:space-between`. As ações (undo/redo, mês de
              referência, abrir Avisos/Naturezas, Exportar) entram pelo slot
              `children` de `ToolbarRevisao`, não numa segunda faixa empilhada. */}
          <ToolbarRevisao>
            <button
              type="button"
              className="btn sec icone"
              disabled={lancamentos.length === 0}
              onClick={undo}
              title="Desfazer (Ctrl+Z)"
            >
              <IconeDesfazer />
            </button>
            <button
              type="button"
              className="btn sec icone"
              onClick={redo}
              title="Refazer (Ctrl+Shift+Z)"
            >
              <IconeRefazer />
            </button>
            <span className="grupo-mes" title="Mês que dá nome ao arquivo exportado e separa fatura de extrato">
              <span className="grupo-mes-rotulo">Mês ref.</span>
              <SeletorMesReferencia
                mesEscolhido={mesEscolhido}
                usuarioEditou={usuarioEditou}
                onChange={(novoMes) => {
                  setMesEscolhido(novoMes)
                  setUsuarioEditou(true)
                }}
              />
            </span>
            {avisosAcionaveis.avisos.length > 0 && (
              <button
                type="button"
                className={'btn sec' + (painel === 'avisos' ? ' ativo' : '')}
                style={{ position: 'relative' }}
                onClick={() => togglePainel('avisos')}
              >
                Avisos
                {contagemAvisosPendentes > 0 && (
                  <span className="badge">{contagemAvisosPendentes}</span>
                )}
              </button>
            )}
            {naturezasDescritas.length > 0 && (
              <button
                type="button"
                className={'btn sec' + (painel === 'naturezas' ? ' ativo' : '')}
                onClick={() => togglePainel('naturezas')}
              >
                Naturezas
              </button>
            )}
            <button
              type="button"
              className="btn pri"
              onClick={() => setExportFase('confirmar')}
              disabled={!podaGerar}
              style={{ position: 'relative' }}
            >
              <IconeExportar />
              Exportar .xlsx
              {lancamentosPendentes > 0 && <span className="badge peach">{lancamentosPendentes}</span>}
            </button>
          </ToolbarRevisao>

          <div className="rotulo" style={{ textAlign: 'center', padding: '6px 28px' }}>
            {lancamentos.length} lançamentos para revisar · Os dados vivem apenas nesta aba —
            exporte antes de fechar ou recarregar.
          </div>

          {/* Filtros: fonte/natureza (legenda clicável) + legenda de cores */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 22,
              padding: '6px 28px 12px',
              flexWrap: 'wrap',
            }}
          >
            <FiltroBar />
            <span
              style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 22,
                flexShrink: 0,
              }}
            >
              <Swatch cor="var(--linha-atencao)" borda="var(--linha-atencao-borda)" rotulo="Precisa de atenção" />
              <Swatch cor="var(--linha-transferencia)" borda="var(--linha-transferencia-borda)" rotulo="Transferência própria" />
              <Swatch cor="var(--linha-investimento)" borda="var(--linha-investimento-borda)" rotulo="Investimento" />
            </span>
          </div>

          {/* Corpo: grid + painel lateral lado a lado (Task T11 — item 4 das
              frases de intenção: painel lateral empurra a grid em vez de
              sobrepor como overlay position:fixed). */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <BannerInspecao
                aviso={avisoEmInspecao}
                onAprovar={aplicarAviso}
                onDispensar={dispensarAviso}
                onFechar={sairInspecao}
              />
              <div ref={gridWrapRef} style={{ flex: 1, minHeight: 0 }}>
                <ReviewGrid onSplitDetectado={(indice) => setSplitIndice(indice)} />
              </div>
            </div>

            {painel && <PainelLateral aba={painel} setAba={setPainel} naturezas={naturezasDescritas} />}
          </div>

          {/* Modal de split — abre quando onSplitDetectado dispara */}
          {splitIndice !== null && splitLancamento && (
            <SplitModal
              lancamento={splitLancamento}
              indice={splitIndice}
              onClose={() => setSplitIndice(null)}
            />
          )}

          {/* Modal de exportação — Task T11: botão "Exportar .xlsx" abre a fase
              `confirmar`; "Baixar .xlsx" chama a geração real (`handleGerar`,
              núcleo intocado) e avança para a fase `feito`. */}
          {exportFase && (
            <ExportModal
              fase={exportFase}
              nome={nomeArquivoExport}
              pendentes={lancamentosPendentes}
              onConfirmar={handleConfirmarExport}
              onFechar={() => setExportFase(null)}
              onContinuar={() => setExportFase(null)}
            />
          )}
        </div>
      )}
    </main>
  )
}

// ---------------------------------------------------------------------------
// Ícones inline (SVG) — coerentes com o handoff de design
// ---------------------------------------------------------------------------

function IconeUpload({ cor = 'var(--verde)' }: { cor?: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  )
}
function IconeArquivo({ cor = 'var(--verde)' }: { cor?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}
function IconeSeta() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#faf8f3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}
function IconeDesfazer() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--texto-3)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-1" />
    </svg>
  )
}
function IconeRefazer() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--texto-3)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 14 20 9l-5-5" />
      <path d="M20 9H9a5 5 0 0 0 0 10h1" />
    </svg>
  )
}
function IconeExportar() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#faf8f3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V3M7 10l5 5 5-5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  )
}
function Swatch({ cor, borda, rotulo }: { cor: string; borda: string; rotulo: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ width: 11, height: 11, borderRadius: 3, background: cor, border: `1px solid ${borda}` }} />
      {rotulo}
    </span>
  )
}

// ---------------------------------------------------------------------------
// SeletorMesReferencia — dois selects controlados (mês + ano) — D5 do ADR
// ---------------------------------------------------------------------------

const MESES = ['01','02','03','04','05','06','07','08','09','10','11','12'] as const

function anosDisponiveis(): number[] {
  const anoCorrente = new Date().getFullYear()
  const anos: number[] = []
  for (let a = anoCorrente + 1; a >= anoCorrente - 4; a--) {
    anos.push(a)
  }
  return anos
}

interface SeletorMesReferenciaProps {
  mesEscolhido: string // formato YYYY-MM
  onChange: (novoMes: string) => void
  /** Flag de controle — quando true, T4 não sobrescreverá a escolha (D7 do ADR) */
  usuarioEditou?: boolean
}

/**
 * Dois selects controlados (mês 01–12 e ano) que nunca ficam vazios.
 * O estado interno é uma string YYYY-MM derivada da combinação dos dois selects.
 * Decisão D5 e D6 do ADR: nunca vazio; default = mês anterior ao corrente.
 */
function SeletorMesReferencia({ mesEscolhido, onChange }: SeletorMesReferenciaProps) {
  // mesEscolhido é sempre 'YYYY-MM' (garantido por defaultMes e pelos handlers)
  const [anoStr, mesStr] = mesEscolhido.split('-')

  function handleMes(e: React.ChangeEvent<HTMLSelectElement>) {
    onChange(`${anoStr}-${e.target.value}`)
  }

  function handleAno(e: React.ChangeEvent<HTMLSelectElement>) {
    onChange(`${e.target.value}-${mesStr}`)
  }

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <select
        data-testid="select-mes"
        value={mesStr}
        onChange={handleMes}
        className="input"
        style={{ width: 'auto', padding: '6px 8px', fontSize: 13 }}
        aria-label="Mês de referência"
      >
        {MESES.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <select
        data-testid="select-ano"
        value={anoStr}
        onChange={handleAno}
        className="input"
        style={{ width: 'auto', padding: '6px 8px', fontSize: 13 }}
        aria-label="Ano de referência"
      >
        {anosDisponiveis().map((a) => (
          <option key={a} value={String(a)}>{a}</option>
        ))}
      </select>
    </span>
  )
}
