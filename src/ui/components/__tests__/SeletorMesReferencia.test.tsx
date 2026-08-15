// ADR: see spec/fundacao-operacoes.adr.md
// ADR: see Docs/specs/mes-referencia-ui.adr.md

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SeletorMesReferencia } from '../SeletorMesReferencia'

// ---------------------------------------------------------------------------
// Task T12-bis (spec fundacao-operacoes) — extração comportamento-preservante
// de App.tsx. Prova isolada dos dois selects controlados (mês + ano) e do
// callback de composição da string YYYY-MM (D5 do ADR mes-referencia-ui).
// ---------------------------------------------------------------------------

describe('SeletorMesReferencia', () => {
  it('deriva o valor de cada select a partir de mesEscolhido (YYYY-MM)', () => {
    render(<SeletorMesReferencia mesEscolhido="2024-03" onChange={vi.fn()} />)

    expect(screen.getByTestId('select-mes')).toHaveValue('03')
    expect(screen.getByTestId('select-ano')).toHaveValue('2024')
  })

  it('select de mês lista as 12 opções 01–12', () => {
    render(<SeletorMesReferencia mesEscolhido="2024-03" onChange={vi.fn()} />)

    const select = screen.getByTestId('select-mes') as HTMLSelectElement
    expect(select.options).toHaveLength(12)
    expect(select.options[0].value).toBe('01')
    expect(select.options[11].value).toBe('12')
  })

  it('select de ano lista 6 opções (ano corrente + 1 até ano corrente - 4)', () => {
    render(<SeletorMesReferencia mesEscolhido="2024-03" onChange={vi.fn()} />)

    const select = screen.getByTestId('select-ano') as HTMLSelectElement
    const anoCorrente = new Date().getFullYear()
    const valores = Array.from(select.options).map((o) => o.value)
    expect(valores).toEqual(
      Array.from({ length: 6 }, (_, i) => String(anoCorrente + 1 - i)),
    )
  })

  it('mudar o select de mês chama onChange com o ano preservado e o novo mês', () => {
    const onChange = vi.fn()
    render(<SeletorMesReferencia mesEscolhido="2024-03" onChange={onChange} />)

    fireEvent.change(screen.getByTestId('select-mes'), { target: { value: '07' } })

    expect(onChange).toHaveBeenCalledWith('2024-07')
  })

  it('mudar o select de ano chama onChange com o mês preservado e o novo ano', () => {
    const onChange = vi.fn()
    render(<SeletorMesReferencia mesEscolhido="2024-03" onChange={onChange} />)

    fireEvent.change(screen.getByTestId('select-ano'), { target: { value: '2022' } })

    expect(onChange).toHaveBeenCalledWith('2022-03')
  })

  it('selects carregam aria-label descritivo para mês e ano', () => {
    render(<SeletorMesReferencia mesEscolhido="2024-03" onChange={vi.fn()} />)

    expect(screen.getByLabelText('Mês de referência')).toBeInTheDocument()
    expect(screen.getByLabelText('Ano de referência')).toBeInTheDocument()
  })

  it('cada opção do select de mês exibe o número e o nome abreviado em pt-BR', () => {
    render(<SeletorMesReferencia mesEscolhido="2024-03" onChange={vi.fn()} />)

    const select = screen.getByTestId('select-mes') as HTMLSelectElement
    const textos = Array.from(select.options).map((o) => o.textContent)
    expect(textos).toEqual([
      '01 · jan',
      '02 · fev',
      '03 · mar',
      '04 · abr',
      '05 · mai',
      '06 · jun',
      '07 · jul',
      '08 · ago',
      '09 · set',
      '10 · out',
      '11 · nov',
      '12 · dez',
    ])
  })

  it('o valor de cada option do select de mês permanece o número puro (não muda o contrato de exportação)', () => {
    render(<SeletorMesReferencia mesEscolhido="2024-03" onChange={vi.fn()} />)

    const select = screen.getByTestId('select-mes') as HTMLSelectElement
    const valores = Array.from(select.options).map((o) => o.value)
    expect(valores).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'])
  })
})

describe('SeletorMesReferenciaProps', () => {
  it('a interface de props não declara mais usuarioEditou (prop morta removida — Task B11)', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const caminho = path.resolve(__dirname, '../SeletorMesReferencia.tsx')
    const codigoFonte = fs.readFileSync(caminho, 'utf-8')
    expect(codigoFonte).not.toMatch(/usuarioEditou/)
  })
})
