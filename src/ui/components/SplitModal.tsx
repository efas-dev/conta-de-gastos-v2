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
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(44,42,38,0.44)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        fontFamily: "'Manrope', system-ui, sans-serif",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#faf8f3',
          border: '1px solid #e1dcd1',
          borderRadius: 20,
          padding: 28,
          minWidth: 400,
          maxWidth: 500,
          boxShadow: '0 30px 60px -30px rgba(44,42,38,0.5)',
          color: '#2c2a26',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em' }}>
          Rateio de lançamento
        </h2>
        <p style={{ margin: '8px 0 20px', fontSize: 14.5, color: '#6b675e' }}>
          <strong style={{ color: '#2c2a26' }}>{lancamento.transcricao}</strong>
          {' — '}
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
            {lancamento.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto auto',
            gap: '10px 12px',
            alignItems: 'center',
            marginBottom: 18,
          }}
        >
          <span className="dc-rotulo">Iniciais</span>
          <span className="dc-rotulo" style={{ textAlign: 'right' }}>
            Valor
          </span>
          <span />
          {alvos.map((alvo, i) => (
            <Linha
              key={i}
              i={i}
              valor={preview[i]?.valor}
              iniciais={alvo.iniciais}
              onEdit={(v) => handleEditarIniciais(i, v)}
              onRemove={alvos.length > 1 ? () => handleRemoverAlvo(i) : undefined}
            />
          ))}
        </div>

        <button
          className="dc-btn dc-btn-secundario"
          onClick={handleAdicionarAlvo}
          style={{ marginBottom: 22 }}
        >
          + Adicionar alvo
        </button>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="dc-btn dc-btn-secundario" onClick={onClose}>
            Cancelar
          </button>
          <button className="dc-btn dc-btn-primario" onClick={handleConfirmar}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

/** Uma linha da tabela de rateio (input de iniciais + valor previsto + remover). */
function Linha({
  i,
  iniciais,
  valor,
  onEdit,
  onRemove,
}: {
  i: number
  iniciais: string
  valor: number | undefined
  onEdit: (v: string) => void
  onRemove?: () => void
}) {
  return (
    <>
      <input
        className="dc-input"
        aria-label={`Iniciais do alvo ${i + 1}`}
        value={iniciais}
        onChange={(e) => onEdit(e.target.value)}
        style={{ padding: '9px 12px' }}
      />
      <span
        style={{
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 700,
          color: valor !== undefined && valor < 0 ? '#b4654a' : '#4e6a53',
          minWidth: 96,
        }}
      >
        {valor !== undefined
          ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
          : '—'}
      </span>
      {onRemove ? (
        <button
          aria-label={`Remover alvo ${i + 1}`}
          onClick={onRemove}
          style={{
            border: '1px solid #dad4c8',
            background: '#fff',
            color: '#b4654a',
            borderRadius: 8,
            width: 30,
            height: 30,
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          ×
        </button>
      ) : (
        <span style={{ width: 30 }} />
      )}
    </>
  )
}
