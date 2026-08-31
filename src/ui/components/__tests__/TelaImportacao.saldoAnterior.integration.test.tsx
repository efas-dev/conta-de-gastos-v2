// ADR: see Docs/specs/rendimentos.adr.md

/**
 * Teste de integração — Task 4, item 3 (spec `rendimentos`).
 *
 * Diferente de `TelaImportacao.test.tsx` (que mocka `../../store/appStore` e
 * `../../../excel/reader/leitor` inteiros), este arquivo renderiza `TelaImportacao`
 * com o `useAppStore` REAL (Zustand, sem mock) e o módulo `leitor` REAL (sem mock) —
 * prova ponta a ponta que o upload de um `.xlsx` reconhecido como dicionário chama
 * `lerSaldoAnterior` de verdade sobre os bytes do arquivo e popula `saldoAnterior`
 * no store real via `setSaldoAnterior`, conforme a Definition of done da Task 4.
 *
 * Fixture: `.xlsx` sintético com DUAS abas — "Dicionario" (mínima, só cabeçalho,
 * necessária para `ehDicionario`/`lerDicionario` reconhecerem o arquivo) e "Extrato"
 * (com B5 numérica, lida por `lerSaldoAnterior`, T1).
 *
 * Test List (Playbook 1 — iteração 5):
 * - TL4-INT-01: upload do fixture com B5 preenchida -> `saldoAnterior` reflete o valor de B5.
 * - TL4-INT-02: upload do fixture SEM célula B5 -> `saldoAnterior` permanece `null`.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { render, fireEvent, waitFor, act } from '@testing-library/react'
import { zipSync, strToU8 } from 'fflate'
import { TelaImportacao } from '../TelaImportacao'
import { useAppStore } from '../../store/appStore'
import { estadoInicialAvisos } from '../../store/avisosSlice'

// ---------------------------------------------------------------------------
// Fixture: .xlsx com aba "Dicionario" (mínima) + aba "Extrato" (com/sem B5)
// ---------------------------------------------------------------------------

function criarXlsxDicionarioComExtratoB5(valorB5: number | null): Uint8Array {
  const dicSheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>chave</t></is></c>
      <c r="B1" t="inlineStr"><is><t>fonte</t></is></c>
      <c r="C1" t="inlineStr"><is><t>natureza</t></is></c>
      <c r="D1" t="inlineStr"><is><t>descricao</t></is></c>
      <c r="E1" t="inlineStr"><is><t>iniciais</t></is></c>
    </row>
  </sheetData>
</worksheet>`

  const b5Cell = valorB5 === null ? '' : `<c r="B5"><v>${valorB5}</v></c>`
  const extratoSheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>Mês</t></is></c></row>
    <row r="5">${b5Cell}</row>
  </sheetData>
</worksheet>`

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Dicionario" sheetId="1" r:id="rId1"/>
    <sheet name="Extrato" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"
    Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"
    Target="worksheets/sheet2.xml"/>
</Relationships>`

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="xl/workbook.xml"/>
</Relationships>`

  return zipSync({
    '[Content_Types].xml': strToU8(contentTypesXml),
    '_rels/.rels': strToU8(rootRelsXml),
    'xl/workbook.xml': strToU8(workbookXml),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRelsXml),
    'xl/worksheets/sheet1.xml': strToU8(dicSheetXml),
    'xl/worksheets/sheet2.xml': strToU8(extratoSheetXml),
  })
}

/** Cria um File sintético de .xlsx com arrayBuffer() funcional (jsdom não implementa). */
function xlsxFile(bytes: Uint8Array, nome = 'dicionario.xlsx'): File {
  const file = new File([bytes], nome, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(bytes.buffer),
    writable: true,
  })
  return file
}

function props() {
  return {
    mesEscolhido: '2024-03',
    usuarioEditouMes: false,
    onMudarMes: () => {},
    setModeloBytes: () => {},
    painel: null,
    setPainel: () => {},
  } as React.ComponentProps<typeof TelaImportacao>
}

function resetarStore(): void {
  useAppStore.setState({
    iniciais: '',
    nomeUsuario: '',
    dicEntries: [],
    naturezasRicas: [],
    saldoAnterior: null,
    avisosAcionaveis: estadoInicialAvisos,
  })
}

beforeEach(() => {
  resetarStore()
})

describe('TelaImportacao — integração real do wiring de lerSaldoAnterior (Task 4, item 3)', () => {
  it('TL4-INT-01: upload de .xlsx-dicionário com B5 preenchida popula saldoAnterior real no store', async () => {
    const bytes = criarXlsxDicionarioComExtratoB5(4321.9)
    const { container } = render(<TelaImportacao {...props()} />)

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [xlsxFile(bytes)] } })
    })

    await waitFor(() => expect(useAppStore.getState().saldoAnterior).toBe(4321.9))
  })

  it('TL4-INT-02: upload de .xlsx-dicionário sem célula B5 mantém saldoAnterior null', async () => {
    const bytes = criarXlsxDicionarioComExtratoB5(null)
    const { container } = render(<TelaImportacao {...props()} />)

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [xlsxFile(bytes)] } })
    })

    await waitFor(() => expect(useAppStore.getState().dicEntries).toEqual([]))
    expect(useAppStore.getState().saldoAnterior).toBeNull()
  })
})
