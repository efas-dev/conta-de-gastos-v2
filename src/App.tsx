// ADR: see Docs/specs/grid-revisao.adr.md
// ADR: see spec/grid-ux-filtros.adr.md

import { useState, useRef, useEffect } from 'react'
import { useAppStore } from './ui/store/appStore'
import {
  produzirLancamentos,
  gerarAPartirDosRevisados,
  computarNomeArquivo,
} from './ui/PipelineState'
import { lerNaturezas } from './excel/reader/leitor'
import { defaultMes, detectarMesSugerido, classificarFonte } from './dominio/mes'
import { detectar } from './parsers/index'
import type { Lancamento } from './types'
import { ReviewGrid } from './ui/components/ReviewGrid'
import { FiltroBar } from './ui/components/FiltroBar'
import { SplitModal } from './ui/components/SplitModal'
import { AvisoList } from './ui/components/AvisoList'

/**
 * App — Orquestra o fluxo de três etapas:
 *
 * 1. Upload: iniciais + nome opcional + CSV + dicionário opcional → botão "Produzir".
 * 2. Revisão: `ReviewGrid` editável com avisos e botão "Desfazer".
 * 3. Geração: botão "Gerar" → download imediato com revoke do objectURL (zero-retenção).
 *
 * Estado de UI vive exclusivamente no `useAppStore` (Zustand).
 * Sem persistência além da sessão — invariante zero-retenção do projeto.
 */
export function App() {
  // ---------------------------------------------------------------------------
  // Estado do store
  // ---------------------------------------------------------------------------

  const lancamentos = useAppStore((s) => s.lancamentos)
  const iniciais = useAppStore((s) => s.iniciais)
  const nomeUsuario = useAppStore((s) => s.nomeUsuario)
  const avisos = useAppStore((s) => s.avisos)
  const dicEntries = useAppStore((s) => s.dicEntries)
  const sujo = useAppStore((s) => s.sujo)

  // Actions do store
  const setIniciais = useAppStore((s) => s.setIniciais)
  const setNomeUsuario = useAppStore((s) => s.setNomeUsuario)
  const setLancamentos = useAppStore((s) => s.setLancamentos)
  const setDic = useAppStore((s) => s.setDic)
  const addAviso = useAppStore((s) => s.addAviso)
  const clearAvisos = useAppStore((s) => s.clearAvisos)
  const undo = useAppStore((s) => s.undo)
  const redo = useAppStore((s) => s.redo)
  const marcarLimpo = useAppStore((s) => s.marcarLimpo)

  // ---------------------------------------------------------------------------
  // Estado local (só em memória — zero-retenção)
  // ---------------------------------------------------------------------------

  /**
   * Arquivo do dicionário .xlsx (opcional) mantido em estado local porque o
   * store só armazena as entradas parseadas (`dicEntries`), não o File bruto.
   */
  const [dicArquivo, setDicArquivo] = useState<File | null>(null)

  /**
   * Extratos/faturas CSV selecionados (um ou vários bancos de uma vez).
   * Mantidos em estado local — o store só guarda os `lancamentos` já parseados
   * e mesclados, não os Files brutos (mesmo padrão de `dicArquivo`).
   */
  const [csvArquivos, setCsvArquivos] = useState<File[]>([])

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
   * Índice do lançamento que abriu o SplitModal (null = modal fechado).
   */
  const [splitIndice, setSplitIndice] = useState<number | null>(null)

  /** Âncora invisível usada para disparar o download sem abrir nova aba. */
  const anchorRef = useRef<HTMLAnchorElement>(null)

  // ---------------------------------------------------------------------------
  // Derivações
  // ---------------------------------------------------------------------------

  const podaProduzir = iniciais !== '' && csvArquivos.length > 0
  const podaGerar = lancamentos.length > 0 && modeloBytes !== null
  const emRevisao = lancamentos.length > 0
  const splitLancamento = splitIndice !== null ? lancamentos[splitIndice] : null

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
  }, [lancamentos, mesEscolhido])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handler de seleção de arquivos CSV/TXT.
   *
   * Além de armazenar os arquivos no estado local, realiza uma leitura antecipada
   * best-effort: parseia cada arquivo e coleta os lançamentos para detectar o mês
   * sugerido. Se detectarMesSugerido retornar um valor e o usuário ainda não tiver
   * editado o campo manualmente (usuarioEditou=false), atualiza mesEscolhido.
   * Erros de leitura ou parse são silenciados — não interrompem o fluxo de upload.
   */
  async function handleCsvChange(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? [])
    setCsvArquivos(arquivos)

    if (arquivos.length === 0) return

    const todosLancamentos: Lancamento[] = []
    for (const arquivo of arquivos) {
      try {
        const conteudo = await arquivo.text()
        const parser = detectar(conteudo)
        const { lancamentos: lans } = parser.parsear(conteudo)
        todosLancamentos.push(...lans)
      } catch {
        // best-effort: erro silenciado — não quebra o fluxo de upload
      }
    }

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

    let dicBytes: Uint8Array | null = null
    if (dicArquivo) {
      const buf = await dicArquivo.arrayBuffer()
      dicBytes = new Uint8Array(buf)
    }

    let modelo: Uint8Array
    try {
      // BASE_URL resolve o subcaminho do GitHub Pages ('/' em dev)
      const resp = await fetch(`${import.meta.env.BASE_URL}Modelo.xlsx`)
      modelo = new Uint8Array(await resp.arrayBuffer())
    } catch (err) {
      console.error('[App] Falha ao carregar Modelo.xlsx:', err)
      addAviso('Erro ao carregar Modelo.xlsx — verifique o servidor')
      return
    }

    // Cada arquivo é parseado independentemente (pode ser de banco/formato
    // diferente — `detectar` roda por arquivo) e os lançamentos são concatenados
    // na ordem dos arquivos selecionados. O dicionário e as naturezas são os
    // mesmos para todos (fonte única: o dicionário anterior + o Modelo).
    const todosLancamentos: typeof lancamentos = []
    let dicMesclado: typeof dicEntries = []
    for (const arquivo of csvArquivos) {
      const csvConteudo = await arquivo.text()
      const { lancamentos: lans, dicEntries: dic, avisos: avs } =
        produzirLancamentos(csvConteudo, dicBytes, iniciais, nomeUsuario || undefined)
      todosLancamentos.push(...lans)
      dicMesclado = dic
      for (const av of avs) {
        addAviso(`${arquivo.name}: ${av}`)
      }
    }

    const naturezas = lerNaturezas(modelo)

    setLancamentos(todosLancamentos)
    setDic(dicMesclado)
    // `setNaturezasValidas` não é exposto como action nominada no store — usa
    // o setState do Zustand diretamente, que é o mecanismo canônico para campos
    // sem action própria (D5 do ADR — store minimalista).
    useAppStore.setState({ naturezasValidas: naturezas })

    setModeloBytes(modelo)
  }

  /**
   * Etapa 3 — Aprendizado do dicionário + geração do .xlsx.
   *
   * Chama `gerarAPartirDosRevisados` com os lançamentos revisados do store,
   * cria o Blob, dispara o download via `<a download>` e revoga o objectURL
   * imediatamente — zero-retenção (invariante do projeto).
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
          className="dc-card"
          style={{
            width: '100%',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 0,
            border: 'none',
            boxShadow: 'none',
          }}
        >
          {/* Top bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '22px 34px',
              borderBottom: '1px solid var(--borda-2)',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: 'var(--verde)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <IconeMenu />
              </span>
              <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.01em' }}>
                Conta de Gastos
              </span>
            </div>
            <span className="dc-pill-privado">
              <IconeCadeado />
              Seus dados nunca saem do seu computador
            </span>
          </div>

          {/* Body */}
          <div
            style={{
              flex: 1,
              padding: '40px 48px 48px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ maxWidth: 560, textAlign: 'center' }}>
              <h1 className="dc-titulo">Importe seus extratos e faturas</h1>
              <p className="dc-subtitulo">
                Solte os arquivos, confira num piscar de olhos e exporte a planilha pronta. Sem
                copiar e colar, sem enviar nada para lugar nenhum.
              </p>
            </div>

            {/* Dropzone (label clicável envolvendo o input escondido) */}
            <label
              style={{
                width: '100%',
                maxWidth: 640,
                marginTop: 30,
                border: '1.5px dashed #c9cfc5',
                background: 'var(--branco)',
                borderRadius: 18,
                padding: '40px 32px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                cursor: 'pointer',
              }}
            >
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                multiple
                onChange={handleCsvChange}
                style={{ display: 'none' }}
              />
              <span
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: 'var(--verde-suave)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <IconeUpload />
              </span>
              <div style={{ marginTop: 16, fontSize: 17, fontWeight: 700 }}>
                Arraste extratos e faturas aqui
              </div>
              <div style={{ marginTop: 6, fontSize: 14, color: 'var(--muted)' }}>
                ou clique para escolher · CSV ou TXT · vários de uma vez
              </div>
            </label>

            {/* Lista de arquivos selecionados */}
            {csvArquivos.length > 0 && (
              <div
                style={{
                  width: '100%',
                  maxWidth: 640,
                  marginTop: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {csvArquivos.map((f) => (
                  <div
                    key={f.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      background: 'var(--branco)',
                      border: '1px solid var(--borda-2)',
                      borderRadius: 13,
                      padding: '14px 16px',
                    }}
                  >
                    <span
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: 'var(--verde-suave)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <IconeArquivo />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.name}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>
                        Pronto para revisar
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        setCsvArquivos((prev) => prev.filter((x) => x !== f))
                      }}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: 'var(--terracota)',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Config: iniciais + nome */}
            <div
              style={{
                width: '100%',
                maxWidth: 640,
                marginTop: 26,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
              }}
            >
              <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="dc-rotulo">
                  Suas iniciais <span style={{ color: 'var(--terracota)' }}>*</span>
                </span>
                <input
                  className="dc-input"
                  type="text"
                  value={iniciais}
                  placeholder="Ex.: ES"
                  onChange={(e) => setIniciais(e.target.value.trim().toUpperCase())}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="dc-rotulo">
                  Seu nome <span className="dc-opcional">(opcional)</span>
                </span>
                <input
                  className="dc-input"
                  type="text"
                  value={nomeUsuario}
                  placeholder="Ex.: Eduardo"
                  onChange={(e) => setNomeUsuario(e.target.value)}
                />
              </label>
            </div>

            {/* Dicionário do mês anterior */}
            <div style={{ width: '100%', maxWidth: 640, marginTop: 14 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="dc-rotulo">
                  Dicionário do mês anterior{' '}
                  <span className="dc-opcional">(opcional — reaproveita suas classificações)</span>
                </span>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    border: '1px dashed var(--borda-3)',
                    borderRadius: 'var(--raio-campo)',
                    background: 'var(--branco)',
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                >
                  <input
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(e) => setDicArquivo(e.target.files?.[0] ?? null)}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      opacity: 0,
                      cursor: 'pointer',
                    }}
                  />
                  <IconeArquivo cor="var(--muted)" />
                  <span style={{ fontSize: 14, color: 'var(--texto-3)', fontWeight: 600 }}>
                    {dicArquivo ? dicArquivo.name : 'Escolher arquivo .xlsx'}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
                    {dicArquivo ? 'Trocar' : ''}
                  </span>
                </div>
              </label>
            </div>

            {/* Campo de mês de referência — D5, D6 do ADR */}
            <div style={{ width: '100%', maxWidth: 640, marginTop: 14 }}>
              <span className="dc-rotulo" style={{ display: 'block', marginBottom: 8 }}>
                Mês de referência
              </span>
              <SeletorMesReferencia
                mesEscolhido={mesEscolhido}
                onChange={(novoMes) => {
                  setMesEscolhido(novoMes)
                  setUsuarioEditou(true)
                }}
              />
            </div>

            {/* CTA */}
            <button
              className="dc-btn dc-btn-primario dc-btn-cta"
              onClick={handleProduzir}
              disabled={!podaProduzir}
              style={{ maxWidth: 640, marginTop: 30 }}
            >
              Produzir revisão
              <IconeSeta />
            </button>

            <div style={{ width: '100%', maxWidth: 640 }}>
              <AvisoList avisos={avisos} />
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Etapa 2 — Revisão (visível quando há lançamentos no store)          */}
      {/* ------------------------------------------------------------------ */}
      {emRevisao && (
        <div
          className="dc-card"
          style={{
            width: '100%',
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 0,
            border: 'none',
            boxShadow: 'none',
          }}
        >
          {/* Barra de ações */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              padding: '20px 28px',
              borderBottom: '1px solid var(--borda-2)',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>
                {lancamentos.length}
              </span>
              <span style={{ fontSize: 15, color: 'var(--texto-3)', fontWeight: 600 }}>
                lançamentos para revisar
              </span>
            </div>
            <span
              style={{
                fontSize: 12.5,
                color: 'var(--texto-3)',
                fontWeight: 500,
                flex: 1,
                textAlign: 'center',
              }}
            >
              Os dados vivem apenas nesta aba — exporte antes de fechar ou recarregar.
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="dc-btn dc-btn-secundario" onClick={undo}>
                <IconeDesfazer />
                Desfazer
              </button>
              <button className="dc-btn dc-btn-secundario" onClick={redo}>
                <IconeRefazer />
                Refazer
              </button>
              {/* Seletores de mês de referência — D5 do ADR (dois selects) */}
              <SeletorMesReferencia
                mesEscolhido={mesEscolhido}
                usuarioEditou={usuarioEditou}
                onChange={(novoMes) => {
                  setMesEscolhido(novoMes)
                  setUsuarioEditou(true)
                }}
              />
              <button
                className="dc-btn dc-btn-primario"
                onClick={handleGerar}
                disabled={!podaGerar}
                style={{ padding: '10px 18px' }}
              >
                <IconeExportar />
                Exportar .xlsx
              </button>
            </div>
          </div>

          {/* Legenda de cores */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 22,
              padding: '12px 28px',
              background: 'var(--barra)',
              borderBottom: '1px solid var(--borda-2)',
              fontSize: 12.5,
              fontWeight: 600,
              color: 'var(--texto-3)',
              flexWrap: 'wrap',
            }}
          >
            {/* Chips de filtro à esquerda, legenda à direita — barra única
                (decisão humana de 2026-07-15) */}
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

          <div style={{ flex: 1, minHeight: 0 }}>
            <ReviewGrid onSplitDetectado={(indice) => setSplitIndice(indice)} />
          </div>

          {avisos.length > 0 && (
            <div style={{ padding: '0 28px 16px' }}>
              <AvisoList avisos={avisos} />
            </div>
          )}

          {/* Modal de split — abre quando onSplitDetectado dispara */}
          {splitIndice !== null && splitLancamento && (
            <SplitModal
              lancamento={splitLancamento}
              indice={splitIndice}
              onClose={() => setSplitIndice(null)}
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

function IconeMenu() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#faf8f3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7h18M3 12h18M3 17h10" />
    </svg>
  )
}
function IconeCadeado() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--verde)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
function IconeUpload() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--verde)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        className="dc-input"
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
        className="dc-input"
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
