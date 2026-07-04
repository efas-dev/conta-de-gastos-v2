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
        fontFamily: 'sans-serif',
        maxWidth: emRevisao ? '100%' : '600px',
        margin: '2rem auto',
        padding: '0 1rem',
      }}
    >
      <h1>Conta de Gastos — Importar Extrato</h1>

      {/* Âncora invisível para trigger de download */}
      {/* eslint-disable-next-line jsx-a11y/anchor-has-content */}
      <a ref={anchorRef} style={{ display: 'none' }} aria-hidden="true" />

      {/* ------------------------------------------------------------------ */}
      {/* Etapa 1 — Upload (visível enquanto não há lançamentos no store)     */}
      {/* ------------------------------------------------------------------ */}
      {!emRevisao && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Campo iniciais (obrigatório) */}
          <label>
            <span>Iniciais (obrigatório):</span>
            <br />
            <input
              type="text"
              value={iniciais}
              placeholder="Ex.: ES"
              onChange={(e) => setIniciais(e.target.value.trim().toUpperCase())}
              style={{ marginTop: '0.25rem' }}
            />
          </label>

          {/* Campo nome do usuário (opcional) */}
          <label>
            <span>Seu nome (opcional — para detectar Pix nominais para conta própria):</span>
            <br />
            <input
              type="text"
              value={nomeUsuario}
              placeholder="Ex.: Eduardo"
              onChange={(e) => setNomeUsuario(e.target.value)}
              style={{ marginTop: '0.25rem' }}
            />
          </label>

          {/* Input de extratos/faturas — aceita CSV (Nubank) e TXT (Itaú), vários de uma vez */}
          <label>
            <span>Extratos/faturas (obrigatório — CSV ou TXT, pode selecionar vários):</span>
            <br />
            <input
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              multiple
              onChange={(e) => {
                setCsvArquivos(Array.from(e.target.files ?? []))
              }}
              style={{ marginTop: '0.25rem' }}
            />
            {csvArquivos.length > 0 && (
              <ul style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#555' }}>
                {csvArquivos.map((f) => (
                  <li key={f.name}>{f.name}</li>
                ))}
              </ul>
            )}
          </label>

          {/* Input dicionário .xlsx do mês anterior (opcional) */}
          <label>
            <span>Dicionário .xlsx do mês anterior (opcional):</span>
            <br />
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                const file = e.target.files?.[0]
                setDicArquivo(file ?? null)
              }}
              style={{ marginTop: '0.25rem' }}
            />
            {dicArquivo && (
              <span style={{ marginLeft: '0.5rem', fontSize: '0.875rem', color: '#555' }}>
                {dicArquivo.name}
              </span>
            )}
          </label>

          {/* Botão Produzir — habilita após iniciais + CSV */}
          <button
            onClick={handleProduzir}
            disabled={!podaProduzir}
            style={{ padding: '0.5rem 1rem', cursor: podaProduzir ? 'pointer' : 'not-allowed' }}
          >
            Produzir
          </button>

          <AvisoList avisos={avisos} />
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Etapa 2 — Revisão (visível quando há lançamentos no store)          */}
      {/* ------------------------------------------------------------------ */}
      {emRevisao && (
        <div>
          {/* Barra de ações */}
          <div
            style={{
              marginBottom: '0.75rem',
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
            }}
          >
            <strong>{lancamentos.length} lançamentos</strong>

            <button onClick={undo} style={{ padding: '0.25rem 0.75rem' }}>
              Desfazer
            </button>

            <button onClick={redo} style={{ padding: '0.25rem 0.75rem' }}>
              Refazer
            </button>

            <button
              onClick={handleGerar}
              disabled={!podaGerar}
              style={{
                padding: '0.5rem 1rem',
                cursor: podaGerar ? 'pointer' : 'not-allowed',
              }}
            >
              Gerar
            </button>
          </div>

          <AvisoList avisos={avisos} />

          {/* Grid de revisão — lê lancamentos e naturezasValidas do store.
              A Glide Data Grid é um canvas virtualizado: precisa de altura
              concreta no container, senão o `height: 100%` interno colapsa
              para 0 e as linhas não aparecem (só a soma, que fica fora do canvas). */}
          <div style={{ height: '70vh', minHeight: 400 }}>
            <ReviewGrid onSplitDetectado={(indice) => setSplitIndice(indice)} />
          </div>

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
