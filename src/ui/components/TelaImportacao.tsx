// ADR: see spec/fundacao-operacoes.adr.md
// ADR: see spec/conciliacao-robusta.adr.md

import { useRef, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { selecionarContagemPendentes } from '../store/avisosSlice'
import {
  lerTextoArquivo,
  criarAvisoInformativo,
  handleProduzir as handleProduzirPipeline,
} from '../handlersPipeline'
import { lerDicionario, ehDicionario, lerIniciais, lerSaldoAnterior } from '../../excel/reader/leitor'
import { detectarMesSugerido, classificarFontePorPrefixo } from '../../dominio/mes'
import { detectar } from '../../parsers/index'
import type { Lancamento } from '../../types'
import { FonteRotulo } from './FonteRotulo'
import { Cabecalho } from './Cabecalho'
import { PainelLateral, type AbaPainelLateral } from './PainelLateral'
import { CartaoDicionario } from './CartaoDicionario'
import { CartaoBancosSuportados } from './CartaoBancosSuportados'
import { SeletorMesReferencia } from './SeletorMesReferencia'
import { IconeUpload, IconeArquivo, IconeSeta } from './Icones'

interface TelaImportacaoProps {
  /** Mês de referência escolhido — estado compartilhado com `TelaRevisao` (D9 do ADR mes-referencia-ui). */
  mesEscolhido: string
  /** Flag de edição manual do mês — compartilhada com `TelaRevisao` (D7 do ADR). */
  usuarioEditouMes: boolean
  /** Atualiza `mesEscolhido` e marca `usuarioEditouMes=true` — mesmo handler usado por `TelaRevisao`. */
  onMudarMes: (novoMes: string) => void
  /** Bytes do Modelo.xlsx carregados no "Produzir" — precisam sobreviver à transição para `TelaRevisao`. */
  setModeloBytes: (bytes: Uint8Array | null) => void
  /** Aba ativa do `PainelLateral` — compartilhada com `TelaRevisao` (persiste entre as duas telas). */
  painel: AbaPainelLateral
  setPainel: React.Dispatch<React.SetStateAction<AbaPainelLateral>>
}

/**
 * Etapa 1 — Upload (visível enquanto não há lançamentos no store).
 *
 * Task T12-bis (spec `fundacao-operacoes`): extraído de `App.tsx` — comportamento
 * preservado; estado que era local a `App.tsx` mas só usado por esta tela
 * (`csvArquivos`, `dicionarioCarregado`, `lancamentosAntecipados`,
 * `usuarioEditouIniciais`, `arrastando`, os refs de drag/input) passou a viver
 * aqui, mais próximo do seu uso. `mesEscolhido`/`usuarioEditouMes`/`painel`
 * continuam compartilhados com `TelaRevisao` via props (D9 do ADR
 * `mes-referencia-ui` mantém o mês fora do `appStore`).
 */
export function TelaImportacao({
  mesEscolhido,
  usuarioEditouMes,
  onMudarMes,
  setModeloBytes,
  painel,
  setPainel,
}: TelaImportacaoProps) {
  const iniciais = useAppStore((s) => s.iniciais)
  const nomeUsuario = useAppStore((s) => s.nomeUsuario)
  const dicEntries = useAppStore((s) => s.dicEntries)
  const naturezasRicas = useAppStore((s) => s.naturezasRicas)
  const avisosAcionaveis = useAppStore((s) => s.avisosAcionaveis)
  const contagemAvisosPendentes = useAppStore(selecionarContagemPendentes)

  const setIniciais = useAppStore((s) => s.setIniciais)
  const setNomeUsuario = useAppStore((s) => s.setNomeUsuario)
  const setLancamentos = useAppStore((s) => s.setLancamentos)
  const setDic = useAppStore((s) => s.setDic)
  const setNaturezasRicas = useAppStore((s) => s.setNaturezasRicas)
  const setSaldoAnterior = useAppStore((s) => s.setSaldoAnterior)
  const addAviso = useAppStore((s) => s.addAviso)
  const adicionarAvisosAcionaveis = useAppStore((s) => s.adicionarAvisos)
  /** Ação do avisosSlice (T09) que zera `avisosAcionaveis` — política D8, cutover T14. */
  const limparAvisosAcionaveis = useAppStore((s) => s.limparAvisos)

  /** Flag: usuário editou manualmente o campo de iniciais na sessão (não sobrescrito por lerIniciais). */
  const [usuarioEditouIniciais, setUsuarioEditouIniciais] = useState<boolean>(false)

  /** Extratos/faturas CSV selecionados (um ou vários bancos de uma vez). */
  const [csvArquivos, setCsvArquivos] = useState<File[]>([])

  /** Metadados do dicionário `.xlsx` carregado, exibidos por `CartaoDicionario`. */
  const [dicionarioCarregado, setDicionarioCarregado] = useState<{ nome: string; entradas: number } | null>(
    null,
  )

  /** Lançamentos coletados na leitura antecipada, indexados por nome de arquivo (D10, D11 do ADR mes-referencia-ui). */
  const [lancamentosAntecipados, setLancamentosAntecipados] = useState<
    Record<string, Lancamento[]>
  >({})

  /** Input de arquivo único (upload unificado) — usado também pelo clique em `CartaoDicionario`. */
  const inputArquivoRef = useRef<HTMLInputElement>(null)

  /** Arrasto de arquivos sobre o dropzone em andamento (feedback visual — item 21). */
  const [arrastando, setArrastando] = useState<boolean>(false)

  /** Profundidade de dragEnter acumulada — evita desligar ao atravessar filhos do label. */
  const profundidadeArrastoRef = useRef(0)

  const podaProduzir = iniciais !== '' && csvArquivos.length > 0

  // D5 do ADR colinha-naturezas: lista filtrada — somente naturezas com descrição preenchida.
  const naturezasDescritas = naturezasRicas.filter((n) => n.descricao !== '')

  function togglePainel(aba: Exclude<AbaPainelLateral, null>) {
    setPainel((atual) => (atual === aba ? null : aba))
  }

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
          const saldoDoDic = lerSaldoAnterior(bytes)
          if (saldoDoDic !== null) {
            setSaldoAnterior(saldoDoDic)
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
    if (mesSugerido !== null && !usuarioEditouMes) {
      onMudarMes(mesSugerido)
    }
  }

  /**
   * Etapa 1 — Parse + enriquecimento.
   *
   * Delega para `handlersPipeline.ts` (Task T11, spec `fundacao-operacoes`) — o
   * corpo real (parse por arquivo, detecção de valor-pendente/pagamento-recebido/
   * conciliação, população do store) vive no módulo extraído; este wrapper só
   * conecta o estado local/store desta tela às dependências explícitas da
   * função extraída.
   */
  async function handleProduzir() {
    useAppStore.getState().clearAvisos()
    await handleProduzirPipeline({
      csvArquivos,
      dicEntries,
      iniciais,
      nomeUsuario,
      mesEscolhido,
      addAviso,
      adicionarAvisosAcionaveis,
      limparAvisos: limparAvisosAcionaveis,
      setLancamentos,
      setNaturezasRicas,
      setNaturezasValidas: (siglas) => useAppStore.setState({ naturezasValidas: siglas }),
      setModeloBytes,
    })
  }

  return (
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
                                tipo={classificarFontePorPrefixo(fonte)}
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
                  <SeletorMesReferencia mesEscolhido={mesEscolhido} onChange={onMudarMes} />
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
          <PainelLateral aba={painel} setAba={setPainel} naturezas={naturezasDescritas} fechavel />
        </div>
      )}
    </div>
  )
}
