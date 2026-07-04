// ADR: see Docs/specs/grid-revisao.adr.md

import { useState, useRef, useEffect } from 'react'
import { useAppStore } from './ui/store/appStore'
import {
  produzirLancamentos,
  gerarAPartirDosRevisados,
  computarNomeArquivo,
} from './ui/PipelineState'
import { lerNaturezas } from './excel/reader/leitor'
import { ReviewGrid } from './ui/components/ReviewGrid'
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

  // Actions do store
  const setIniciais = useAppStore((s) => s.setIniciais)
  const setNomeUsuario = useAppStore((s) => s.setNomeUsuario)
  const setLancamentos = useAppStore((s) => s.setLancamentos)
  const setDic = useAppStore((s) => s.setDic)
  const addAviso = useAppStore((s) => s.addAviso)
  const clearAvisos = useAppStore((s) => s.clearAvisos)
  const undo = useAppStore((s) => s.undo)
  const redo = useAppStore((s) => s.redo)

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

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

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
      const resp = await fetch('/Modelo.xlsx')
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

    const xlsxBytes = gerarAPartirDosRevisados(modeloBytes, iniciais, lancamentos, dicEntries)

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
    URL.revokeObjectURL(url) // revoke imediato — zero-retenção
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: emRevisao ? '32px 24px' : '56px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {/* Âncora invisível para trigger de download */}
      {/* eslint-disable-next-line jsx-a11y/anchor-has-content */}
      <a ref={anchorRef} style={{ display: 'none' }} aria-hidden="true" />

      {/* ------------------------------------------------------------------ */}
      {/* Etapa 1 — Upload (visível enquanto não há lançamentos no store)     */}
      {/* ------------------------------------------------------------------ */}
      {!emRevisao && (
        <div className="dc-card" style={{ width: '100%', maxWidth: 760 }}>
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
              Seus dados nunca saem do navegador
            </span>
          </div>

          {/* Body */}
          <div style={{ padding: '40px 48px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
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
                onChange={(e) => setCsvArquivos(Array.from(e.target.files ?? []))}
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
              <span
                style={{
                  marginTop: 16,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  background: '#f6efe0',
                  border: '1px solid #ece0c6',
                  color: '#8a6d33',
                  padding: '6px 12px',
                  borderRadius: 16,
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                <IconeAlerta cor="#b08a3e" />
                Apenas CSV ou TXT por enquanto — suporte a PDF em breve
              </span>
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
        <div className="dc-card" style={{ width: '100%', maxWidth: 1180 }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="dc-btn dc-btn-secundario" onClick={undo}>
                <IconeDesfazer />
                Desfazer
              </button>
              <button className="dc-btn dc-btn-secundario" onClick={redo}>
                <IconeRefazer />
                Refazer
              </button>
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
            <Swatch cor="var(--linha-atencao)" borda="#e7c9bc" rotulo="Precisa de atenção" />
            <Swatch cor="var(--linha-transferencia)" borda="#cbdae4" rotulo="Transferência própria" />
            <Swatch cor="var(--linha-investimento)" borda="#cadbca" rotulo="Investimento" />
            <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
              Selecione células para somar
            </span>
          </div>

          <div style={{ height: '66vh', minHeight: 400 }}>
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
function IconeAlerta({ cor }: { cor: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
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
