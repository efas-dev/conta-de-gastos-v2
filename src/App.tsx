// ADR: see Docs/specs/grid-revisao.adr.md

import { useState, useRef } from 'react'
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
  const csvArquivo = useAppStore((s) => s.csvArquivo)

  // Actions do store
  const setIniciais = useAppStore((s) => s.setIniciais)
  const setNomeUsuario = useAppStore((s) => s.setNomeUsuario)
  const setCSV = useAppStore((s) => s.setCSV)
  const setLancamentos = useAppStore((s) => s.setLancamentos)
  const setDic = useAppStore((s) => s.setDic)
  const addAviso = useAppStore((s) => s.addAviso)
  const clearAvisos = useAppStore((s) => s.clearAvisos)
  const undo = useAppStore((s) => s.undo)

  // ---------------------------------------------------------------------------
  // Estado local (só em memória — zero-retenção)
  // ---------------------------------------------------------------------------

  /**
   * Arquivo do dicionário .xlsx (opcional) mantido em estado local porque o
   * store só armazena as entradas parseadas (`dicEntries`), não o File bruto.
   */
  const [dicArquivo, setDicArquivo] = useState<File | null>(null)

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

  const podaProduzir = iniciais !== '' && csvArquivo !== null
  const podaGerar = lancamentos.length > 0 && modeloBytes !== null
  const emRevisao = lancamentos.length > 0
  const splitLancamento = splitIndice !== null ? lancamentos[splitIndice] : null

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
    if (!csvArquivo) return

    clearAvisos()

    const csvConteudo = await csvArquivo.text()

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

    const {
      lancamentos: lans,
      dicEntries: dic,
      avisos: avs,
    } = produzirLancamentos(csvConteudo, dicBytes, iniciais, nomeUsuario || undefined)

    const naturezas = lerNaturezas(modelo)

    setLancamentos(lans)
    setDic(dic)
    // `setNaturezasValidas` não é exposto como action nominada no store — usa
    // o setState do Zustand diretamente, que é o mecanismo canônico para campos
    // sem action própria (D5 do ADR — store minimalista).
    useAppStore.setState({ naturezasValidas: naturezas })

    for (const av of avs) {
      addAviso(av)
    }

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
              onChange={(e) => {
                const val = e.target.value.trim().toUpperCase()
                if (val) setIniciais(val)
              }}
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

          {/* Input CSV (obrigatório) */}
          <label>
            <span>Extrato CSV (obrigatório):</span>
            <br />
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0]
                setCSV(file ?? null)
              }}
              style={{ marginTop: '0.25rem' }}
            />
            {csvArquivo && (
              <span style={{ marginLeft: '0.5rem', fontSize: '0.875rem', color: '#555' }}>
                {csvArquivo.name}
              </span>
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

          {/* Grid de revisão — lê lancamentos e naturezasValidas do store */}
          <ReviewGrid onSplitDetectado={(indice) => setSplitIndice(indice)} />

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
