// ADR: see spec/grid-autocomplete-aviso-saida.adr.md

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GhostEditorCore } from '../GhostEditor'
import type { Lancamento, DicEntry } from '../../../types'

// Índices de colunas — espelham as constantes de ReviewGrid.tsx
const COL_INICIAIS = 3
const COL_NATUREZA = 4
const COL_DESCRICAO = 5

// -----------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------

const dicAli: DicEntry = {
  chave: 'mercado',
  fonte: 'Nubank',
  natureza: 'ALI',
  descricao: 'Alimentos',
  iniciais: 'ES',
  vezes: 5,
  ambiguo: false,
}

const dicTra: DicEntry = {
  chave: 'combustivel',
  fonte: 'Nubank',
  natureza: 'TRA',
  descricao: 'Transporte',
  iniciais: 'JF',
  vezes: 3,
  ambiguo: false,
}

function lancamento(natureza = '', descricao = ''): Lancamento {
  return {
    fonte: 'Nubank',
    data: '2024-01-01',
    transcricao: 'Mercado',
    valor: -50,
    iniciais: 'ES',
    natureza,
    descricao,
  }
}

// -----------------------------------------------------------------------
// Testes da Test List (Canon TDD — Task 2)
// -----------------------------------------------------------------------

describe('GhostEditorCore', () => {
  let onFinishedEditing: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onFinishedEditing = vi.fn()
  })

  // 1. ghost-aparece-com-candidato
  // Usa COL_DESCRICAO com natureza="ALI" na linha → calcularSugestoes extrai descricao
  // prefixo "ali" → candidato "Alimentos" → ghost sufixo "mentos"
  it('ghost-text aparece quando calcularSugestoes retorna candidato', () => {
    render(
      <GhostEditorCore
        col={COL_DESCRICAO}
        row={0}
        valorAtual=""
        valorInicial="ali"
        lancamentos={[lancamento('ALI', '')]}
        dicEntries={[dicAli]}
        onFinishedEditing={onFinishedEditing}
      />,
    )
    const ghost = screen.getByTestId('ghost-text')
    expect(ghost).toBeInTheDocument()
    // "ali" + candidato "Alimentos" → sufixo ghost = "mentos"
    expect(ghost.textContent).toBe('mentos')
  })

  // 2. ghost-nao-aparece-sem-candidato
  it('ghost-text NÃO aparece quando calcularSugestoes retorna []', () => {
    render(
      <GhostEditorCore
        col={COL_DESCRICAO}
        row={0}
        valorAtual=""
        valorInicial="xyz"
        lancamentos={[lancamento('ALI', '')]}
        dicEntries={[dicAli]}
        onFinishedEditing={onFinishedEditing}
      />,
    )
    // "xyz" não é prefixo de "Alimentos"
    expect(screen.queryByTestId('ghost-text')).not.toBeInTheDocument()
  })

  // 3. tab-aceita-sem-onFinishedEditing
  it('Tab aceita a sugestão completando o input sem disparar onFinishedEditing', () => {
    render(
      <GhostEditorCore
        col={COL_DESCRICAO}
        row={0}
        valorAtual=""
        valorInicial="ali"
        lancamentos={[lancamento('ALI', '')]}
        dicEntries={[dicAli]}
        onFinishedEditing={onFinishedEditing}
      />,
    )
    const input = screen.getByTestId('ghost-input') as HTMLInputElement
    fireEvent.keyDown(input, { key: 'Tab' })

    // Input deve mostrar texto completo do candidato
    expect(input.value).toBe('Alimentos')
    // onFinishedEditing NÃO deve ter sido chamado
    expect(onFinishedEditing).not.toHaveBeenCalled()
  })

  // 4. seta-direita-no-fim-aceita-sem-onFinishedEditing
  it('ArrowRight com cursor no fim aceita a sugestão sem disparar onFinishedEditing', () => {
    render(
      <GhostEditorCore
        col={COL_DESCRICAO}
        row={0}
        valorAtual=""
        valorInicial="ali"
        lancamentos={[lancamento('ALI', '')]}
        dicEntries={[dicAli]}
        onFinishedEditing={onFinishedEditing}
      />,
    )
    const input = screen.getByTestId('ghost-input') as HTMLInputElement
    // Cursor no fim: selectionStart = input.value.length
    Object.defineProperty(input, 'selectionStart', { get: () => input.value.length, configurable: true })
    fireEvent.keyDown(input, { key: 'ArrowRight' })

    expect(input.value).toBe('Alimentos')
    expect(onFinishedEditing).not.toHaveBeenCalled()
  })

  // 5. enter-grava-texto-digitado-nao-ghost
  it('Enter grava o texto digitado (não o ghost) com movement [0, 1]', () => {
    render(
      <GhostEditorCore
        col={COL_DESCRICAO}
        row={0}
        valorAtual=""
        valorInicial="ali"
        lancamentos={[lancamento('ALI', '')]}
        dicEntries={[dicAli]}
        onFinishedEditing={onFinishedEditing}
      />,
    )
    const input = screen.getByTestId('ghost-input') as HTMLInputElement
    // Ghost está visível (sufixo "mentos"), mas não foi aceito via Tab
    expect(screen.getByTestId('ghost-text')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Enter' })

    // Grava "ali" (texto digitado), NÃO "Alimentos" (ghost)
    expect(onFinishedEditing).toHaveBeenCalledWith('ali', [0, 1])
  })

  // 6. enter-apos-tab-grava-texto-aceito
  it('Enter após Tab grava o texto aceito com movement [0, 1]', () => {
    render(
      <GhostEditorCore
        col={COL_DESCRICAO}
        row={0}
        valorAtual=""
        valorInicial="ali"
        lancamentos={[lancamento('ALI', '')]}
        dicEntries={[dicAli]}
        onFinishedEditing={onFinishedEditing}
      />,
    )
    const input = screen.getByTestId('ghost-input') as HTMLInputElement

    // Aceita com Tab
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(input.value).toBe('Alimentos')

    // Confirma com Enter
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onFinishedEditing).toHaveBeenCalledWith('Alimentos', [0, 1])
  })

  // 7. ghost-automatico-descricao-com-natureza
  it('ghost automático ao abrir COL_DESCRICAO com natureza preenchida na linha', () => {
    // Linha já tem natureza="ALI" → dicionário tem par ALI/Alimentos
    // Mesmo com input vazio, ghost deve exibir "Alimentos"
    render(
      <GhostEditorCore
        col={COL_DESCRICAO}
        row={0}
        valorAtual=""
        valorInicial={undefined}
        lancamentos={[lancamento('ALI', '')]}
        dicEntries={[dicAli, dicTra]}
        onFinishedEditing={onFinishedEditing}
      />,
    )
    const ghost = screen.getByTestId('ghost-text')
    expect(ghost).toBeInTheDocument()
    expect(ghost.textContent).toBe('Alimentos')
  })

  // 8. ghost-automatico-natureza-com-descricao
  it('ghost automático ao abrir COL_NATUREZA com descricao preenchida na linha', () => {
    // Linha já tem descricao="Alimentos" → dicionário tem par ALI/Alimentos
    // Mesmo com input vazio, ghost deve exibir "ALI"
    render(
      <GhostEditorCore
        col={COL_NATUREZA}
        row={0}
        valorAtual=""
        valorInicial={undefined}
        lancamentos={[lancamento('', 'Alimentos')]}
        dicEntries={[dicAli, dicTra]}
        onFinishedEditing={onFinishedEditing}
      />,
    )
    const ghost = screen.getByTestId('ghost-text')
    expect(ghost).toBeInTheDocument()
    expect(ghost.textContent).toBe('ALI')
  })

  // 9. tab-sem-sugestao-confirma-e-navega (achado da inspeção manual 2026-07-15)
  it('Tab sem sugestão pendente confirma o texto e navega para a próxima célula [1, 0]', () => {
    // Sem dicionário e sem histórico → nenhum ghost; Tab deve se comportar
    // como no Sheets: confirmar a edição e mover para a célula à direita.
    render(
      <GhostEditorCore
        col={COL_NATUREZA}
        row={0}
        valorAtual=""
        valorInicial="zz"
        lancamentos={[lancamento('', '')]}
        dicEntries={[]}
        onFinishedEditing={onFinishedEditing}
      />,
    )
    const input = screen.getByTestId('ghost-input') as HTMLInputElement
    fireEvent.keyDown(input, { key: 'Tab' })

    expect(onFinishedEditing).toHaveBeenCalledWith('zz', [1, 0])
  })

  // 10. segundo-tab-apos-aceitar-confirma-e-navega
  it('segundo Tab após aceitar a sugestão confirma o texto aceito e navega [1, 0]', () => {
    render(
      <GhostEditorCore
        col={COL_DESCRICAO}
        row={0}
        valorAtual=""
        valorInicial="ali"
        lancamentos={[lancamento('ALI', '')]}
        dicEntries={[dicAli]}
        onFinishedEditing={onFinishedEditing}
      />,
    )
    const input = screen.getByTestId('ghost-input') as HTMLInputElement

    // 1º Tab: aceita a sugestão (não confirma)
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(input.value).toBe('Alimentos')
    expect(onFinishedEditing).not.toHaveBeenCalled()

    // 2º Tab: nada mais a aceitar → confirma e navega
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(onFinishedEditing).toHaveBeenCalledWith('Alimentos', [1, 0])
  })
})
