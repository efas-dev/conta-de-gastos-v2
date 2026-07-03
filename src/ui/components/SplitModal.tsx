// ADR: see Docs/specs/grid-revisao.adr.md

import { useState } from 'react'
import type { Lancamento } from '../../types'
import { ratearSplit, type AlvoSplit } from '../../dominio/split'
import { useAppStore } from '../store/appStore'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SplitModalProps {
  /** Lançamento a ser rateado. */
  lancamento: Lancamento
  /**
   * Índice do lançamento no array do store — passado para `aplicarSplit`
   * para que o store saiba qual linha substituir.
   */
  indice: number
  /** Callback de fechamento invocado tanto em Confirmar quanto em Cancelar. */
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

/**
 * Modal de rateio de lançamento (pop-up de split).
 *
 * Abre quando o usuário coloca `/` nas Iniciais de um lançamento (frase 8 do ADR).
 * Exibe uma lista editável de alvos derivada das iniciais separadas por `/`,
 * mostra a prévia de como o valor será dividido e oferece Confirmar/Cancelar.
 *
 * Não usa `alert`/`confirm` nativos do browser — é um overlay React em `<div>`.
 */
export function SplitModal({ lancamento, indice, onClose }: SplitModalProps) {
  const aplicarSplit = useAppStore((s) => s.aplicarSplit)

  // Inicializa alvos a partir das iniciais do lançamento separadas por '/'.
  // Se não houver '/', cria lista unitária com as iniciais originais.
  const [alvos, setAlvos] = useState<AlvoSplit[]>(() => {
    const partes = lancamento.iniciais.split('/').filter(Boolean)
    return partes.length > 0 ? partes.map((ini) => ({ iniciais: ini })) : [{ iniciais: '' }]
  })

  // Prévia do rateio: calculada a partir dos alvos atuais.
  const preview = ratearSplit(lancamento, alvos.length > 0 ? alvos : [{ iniciais: '' }])

  function handleEditarIniciais(i: number, valor: string) {
    setAlvos((prev) => prev.map((a, idx) => (idx === i ? { ...a, iniciais: valor } : a)))
  }

  function handleAdicionarAlvo() {
    setAlvos((prev) => [...prev, { iniciais: '' }])
  }

  function handleRemoverAlvo(i: number) {
    setAlvos((prev) => prev.filter((_, idx) => idx !== i))
  }

  function handleConfirmar() {
    aplicarSplit(indice, alvos)
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rateio de lançamento"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: 24,
          minWidth: 360,
          maxWidth: 480,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Rateio de lançamento</h2>
        <p style={{ margin: '4px 0 12px' }}>
          <strong>{lancamento.transcricao}</strong>
          {' — R$ '}
          {lancamento.valor.toFixed(2)}
        </p>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', paddingBottom: 4 }}>Iniciais</th>
              <th style={{ textAlign: 'right', paddingBottom: 4 }}>Valor (R$)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {alvos.map((alvo, i) => (
              <tr key={i}>
                <td>
                  <input
                    aria-label={`Iniciais do alvo ${i + 1}`}
                    value={alvo.iniciais}
                    onChange={(e) => handleEditarIniciais(i, e.target.value)}
                    style={{ width: '90%' }}
                  />
                </td>
                <td style={{ textAlign: 'right' }}>
                  {preview[i] !== undefined ? preview[i].valor.toFixed(2) : '—'}
                </td>
                <td>
                  {alvos.length > 1 && (
                    <button
                      aria-label={`Remover alvo ${i + 1}`}
                      onClick={() => handleRemoverAlvo(i)}
                    >
                      X
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button onClick={handleAdicionarAlvo} style={{ marginBottom: 16 }}>
          Adicionar alvo
        </button>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Cancelar</button>
          <button onClick={handleConfirmar}>Confirmar</button>
        </div>
      </div>
    </div>
  )
}
