// ADR: see spec/grid-autocomplete-aviso-saida.adr.md

/**
 * GhostEditorCore — editor inline com ghost-text para as colunas de texto da grid.
 *
 * Responsabilidades:
 * - Exibir ghost-text sobreposto ao texto digitado quando `calcularSugestoes` retorna candidato.
 * - Ao abrir COL_DESCRICAO com natureza preenchida (ou COL_NATUREZA com descrição preenchida),
 *   exibir ghost-text automático do par mais frequente sem precisar de prefixo.
 * - Tab e → com cursor no fim aceitam a sugestão sem disparar `onFinishedEditing` (D5 do ADR).
 * - Enter chama `onFinishedEditing` com o texto atual do input e movement [0, 1] (D8 do ADR).
 * - Natureza aceita qualquer valor — sem validação restritiva aqui (D1/F7 do ADR).
 * - Zero dependências npm novas (D9 do ADR).
 */

import { useState, useRef, useMemo } from 'react'
import type { DicEntry, Lancamento } from '../../types'
import { calcularSugestoes } from '../../dominio/sugestoes'

// ---------------------------------------------------------------------------
// Constantes de coluna — espelhadas de ReviewGrid.tsx para evitar import circular
// ---------------------------------------------------------------------------

const COL_NATUREZA = 4
const COL_DESCRICAO = 5

// ---------------------------------------------------------------------------
// Helper interno: sugestão automática ao abrir com input vazio mas irmã preenchida
// ---------------------------------------------------------------------------

/**
 * Busca a sugestão mais frequente no dicionário dado o contexto de irmã.
 *
 * Usado ao abrir o editor com prefixo vazio mas coluna irmã já preenchida (D4 do ADR).
 * Sem prefixo, `calcularSugestoes` retorna [] — este helper faz a busca direta.
 */
function encontrarSugestaoAutomatica(
  dicEntries: DicEntry[],
  naturezaIrma?: string,
  descricaoIrma?: string,
): string | null {
  if (naturezaIrma) {
    const filtradas = dicEntries
      .filter((e) => e.natureza === naturezaIrma && e.descricao)
      .sort((a, b) => b.vezes - a.vezes)
    return filtradas[0]?.descricao ?? null
  }
  if (descricaoIrma) {
    const filtradas = dicEntries
      .filter((e) => e.descricao === descricaoIrma && e.natureza)
      .sort((a, b) => b.vezes - a.vezes)
    return filtradas[0]?.natureza ?? null
  }
  return null
}

// ---------------------------------------------------------------------------
// Props e componente
// ---------------------------------------------------------------------------

/** Props do GhostEditorCore — testável sem depender da API do Glide. */
export interface GhostEditorCoreProps {
  /** Índice da coluna sendo editada (COL_INICIAIS=3, COL_NATUREZA=4, COL_DESCRICAO=5). */
  col: number
  /** Índice da linha sendo editada. */
  row: number
  /** Valor atual na célula (antes de qualquer edição nesta sessão). */
  valorAtual: string
  /** Primeiro caractere digitado pelo usuário ao abrir o editor (Glide `initialValue`). */
  valorInicial?: string
  /** Lista de lançamentos (para derivar histórico da coluna e valores da linha irmã). */
  lancamentos: Lancamento[]
  /** Entradas do dicionário carregado. */
  dicEntries: DicEntry[]
  /**
   * Chamada ao confirmar a edição.
   * @param texto  Texto atual no input (nunca o ghost-text auto-aplicado).
   * @param movement  Sempre [0, 1] (desce uma linha) conforme D5 do ADR.
   */
  onFinishedEditing: (texto: string, movement: readonly [-1 | 0 | 1, -1 | 0 | 1]) => void
}

/**
 * Editor inline com ghost-text para as colunas de texto da grid.
 *
 * Usado como componente inner de `provideEditor` no Glide DataEditor (ReviewGrid.tsx).
 * Extraído para arquivo separado para testabilidade independente do canvas do Glide.
 */
export function GhostEditorCore({
  col,
  row,
  valorAtual,
  valorInicial,
  lancamentos,
  dicEntries,
  onFinishedEditing,
}: GhostEditorCoreProps) {
  // Texto inicial: valorInicial (primeiro char digitado para abrir) ou valorAtual (célula)
  const textoInicial = valorInicial ?? valorAtual

  const [texto, setTexto] = useState(textoInicial)
  const inputRef = useRef<HTMLInputElement>(null)

  // Contexto da linha: valores da coluna irmã para o viés Nat×Desc (D4 do ADR)
  const linha = lancamentos[row]
  const naturezaIrma = col === COL_DESCRICAO ? (linha?.natureza ?? '') : undefined
  const descricaoIrma = col === COL_NATUREZA ? (linha?.descricao ?? '') : undefined

  // Histórico da coluna atual (todos os valores já preenchidos na sessão)
  const historicoColunaAtual = useMemo<string[]>(() => {
    const valores = lancamentos.map((l) => {
      if (col === COL_DESCRICAO) return l.descricao
      if (col === COL_NATUREZA) return l.natureza
      return l.iniciais
    })
    return [...new Set(valores.filter(Boolean))]
  }, [lancamentos, col])

  // Sugestões via prefixo (requer texto não-vazio)
  const sugestoesPrefixo = useMemo<string[]>(() => {
    if (!texto) return []
    return calcularSugestoes(texto, dicEntries, historicoColunaAtual, naturezaIrma, descricaoIrma)
  }, [texto, dicEntries, historicoColunaAtual, naturezaIrma, descricaoIrma])

  // Sugestão automática ao abrir com prefixo vazio mas irmã preenchida (D4 do ADR)
  const sugestaoAutomatica = useMemo<string | null>(() => {
    if (texto) return null
    return encontrarSugestaoAutomatica(dicEntries, naturezaIrma ?? '', descricaoIrma ?? '')
  }, [texto, dicEntries, naturezaIrma, descricaoIrma])

  // Candidato efetivo: prefixo primeiro, depois automático
  const candidato = sugestoesPrefixo.length > 0 ? sugestoesPrefixo[0] : sugestaoAutomatica

  // Sufixo do ghost: o que vem depois do que o usuário digitou
  const ghostSufixo = useMemo<string>(() => {
    if (!candidato) return ''
    if (!texto) return candidato // prefixo vazio → ghost = candidato inteiro
    const candNorm = candidato.toLowerCase()
    const texNorm = texto.toLowerCase()
    if (!candNorm.startsWith(texNorm)) return ''
    return candidato.slice(texto.length)
  }, [candidato, texto])

  // Aceita a sugestão: preenche o input com o candidato completo, sem confirmar
  const aceitarSugestao = (): boolean => {
    if (!candidato) return false
    setTexto(candidato)
    return true
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      if (ghostSufixo) {
        // Há sugestão pendente: Tab aceita sem sair da célula (D5 do ADR)
        aceitarSugestao()
      } else {
        // Nada a aceitar: Tab confirma e navega para a célula à direita,
        // como no Sheets (achado da inspeção manual de 2026-07-15 — o ghost
        // engolia o Tab mesmo sem sugestão, travando a navegação).
        onFinishedEditing(texto, [1, 0])
      }
    } else if (e.key === 'ArrowRight') {
      // → aceita somente quando cursor está no fim do texto (D5 do ADR)
      const input = inputRef.current
      const noCursorNoFim = !input || input.selectionStart === input.value.length
      if (noCursorNoFim && ghostSufixo) {
        e.preventDefault()
        aceitarSugestao()
      }
    } else if (e.key === 'Enter') {
      // Enter grava o texto digitado atual (não o ghost), desce uma linha (D8 do ADR)
      e.preventDefault()
      onFinishedEditing(texto, [0, 1])
    }
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        // minHeight garante altura visível mesmo quando o container de overlay do Glide
        // não propaga altura (senão `height:100%` resolve para 0 e o texto fica invisível).
        minHeight: '2.2em',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {/* Input principal — texto digitado pelo usuário (por cima do ghost) */}
      <input
        ref={inputRef}
        data-testid="ghost-input"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontSize: 'inherit',
          fontFamily: 'inherit',
          padding: '0 14px',
          boxSizing: 'border-box',
          color: 'inherit',
          zIndex: 1,
        }}
      />

      {/*
        Ghost-text visual: sobreposição ATRÁS do input, renderizada só quando há sufixo (D8 do ADR).
        O prefixo digitado é renderizado transparente para empurrar o sufixo à posição exata após
        o texto do usuário; o sufixo aparece em cor atenuada. `data-testid="ghost-text"` cobre SÓ o
        sufixo (contrato dos testes). Em jsdom não há layout — altura/alinhamento se verificam manualmente.
      */}
      {ghostSufixo && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            padding: '0 14px',
            pointerEvents: 'none',
            whiteSpace: 'pre',
            fontSize: 'inherit',
            fontFamily: 'inherit',
            zIndex: 0,
          }}
        >
          {/* Prefixo digitado, invisível: alinha o sufixo logo após o texto do usuário */}
          <span style={{ color: 'transparent' }}>{texto}</span>
          <span data-testid="ghost-text" style={{ color: 'rgba(44,42,38,0.35)' }}>
            {ghostSufixo}
          </span>
        </div>
      )}
    </div>
  )
}
