// ADR: see spec/mvp-vertical-nubank.adr.md

import { useReducer, useRef } from 'react'
import { estadoInicial, reduzir, executarPipeline } from './ui/PipelineState'
import { AvisoList } from './ui/components/AvisoList'

/**
 * App — Pipeline UI sem tela de revisão (Task 6, Decisão 2 do ADR).
 *
 * Fluxo: iniciais + CSV obrigatório + .xlsx opcional → botão Gerar → download imediato.
 * Sem retenção de dados: o Blob é criado, linkado e o objectURL é revogado imediatamente
 * após o clique no <a download>. Zero-retenção (invariante do projeto).
 */
export function App() {
  const [estado, dispatch] = useReducer(reduzir, estadoInicial)
  const anchorRef = useRef<HTMLAnchorElement>(null)

  const podaGerar = estado.iniciais !== '' && estado.csvPronto

  async function handleGerar() {
    if (!estado.csvArquivo) return

    dispatch({ tipo: 'LIMPAR_AVISOS' })

    // Ler o CSV como texto
    const csvConteudo = await estado.csvArquivo.text()

    // Ler o dicionário .xlsx (opcional) como bytes
    let dicBytes: Uint8Array | null = null
    if (estado.dicArquivo) {
      const dicBuffer = await estado.dicArquivo.arrayBuffer()
      dicBytes = new Uint8Array(dicBuffer)
    }

    // Buscar o Modelo.xlsx base (servido pela Vite de public/)
    let modeloBytes: Uint8Array
    try {
      const resp = await fetch('/Modelo.xlsx')
      modeloBytes = new Uint8Array(await resp.arrayBuffer())
    } catch (err) {
      console.error('[App] Falha ao carregar Modelo.xlsx:', err)
      dispatch({ tipo: 'ADICIONAR_AVISO', mensagem: 'Erro ao carregar Modelo.xlsx — verifique o servidor' })
      return
    }

    await executarPipeline(
      csvConteudo,
      dicBytes,
      modeloBytes,
      estado.iniciais,
      // onDownload — trigger via <a download> e revoke imediato (zero-retenção)
      (blob, nome) => {
        const url = URL.createObjectURL(blob)
        const a = anchorRef.current
        if (!a) return
        a.href = url
        a.download = nome
        a.click()
        URL.revokeObjectURL(url)
      },
      // onAviso — acumula no estado para renderização
      (msg) => dispatch({ tipo: 'ADICIONAR_AVISO', mensagem: msg }),
    )
  }

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: '600px', margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Conta de Gastos — Importar Extrato</h1>

      {/* Âncora invisível para trigger de download */}
      {/* eslint-disable-next-line jsx-a11y/anchor-has-content */}
      <a ref={anchorRef} style={{ display: 'none' }} aria-hidden="true" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Campo iniciais (obrigatório) */}
        <label>
          <span>Iniciais (obrigatório):</span>
          <br />
          <input
            type="text"
            value={estado.iniciais}
            placeholder="Ex.: ES"
            onChange={(e) => {
              const val = e.target.value.trim().toUpperCase()
              if (val) dispatch({ tipo: 'SET_INICIAIS', valor: val })
            }}
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
              if (file) dispatch({ tipo: 'SET_CSV', arquivo: file })
            }}
            style={{ marginTop: '0.25rem' }}
          />
          {estado.csvArquivo && (
            <span style={{ marginLeft: '0.5rem', fontSize: '0.875rem', color: '#555' }}>
              {estado.csvArquivo.name}
            </span>
          )}
        </label>

        {/* Input .xlsx anterior (opcional) */}
        <label>
          <span>Dicionário .xlsx do mês anterior (opcional):</span>
          <br />
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) dispatch({ tipo: 'SET_DIC', arquivo: file })
            }}
            style={{ marginTop: '0.25rem' }}
          />
          {estado.dicArquivo && (
            <span style={{ marginLeft: '0.5rem', fontSize: '0.875rem', color: '#555' }}>
              {estado.dicArquivo.name}
            </span>
          )}
        </label>

        {/* Botão Gerar (desabilitado até iniciais + CSV presentes) */}
        <button
          onClick={handleGerar}
          disabled={!podaGerar}
          style={{ padding: '0.5rem 1rem', cursor: podaGerar ? 'pointer' : 'not-allowed' }}
        >
          Gerar
        </button>
      </div>

      {/* Área de avisos */}
      <AvisoList avisos={estado.avisos} />
    </main>
  )
}
