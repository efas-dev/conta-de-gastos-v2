// ADR: see Docs/specs/injecao-xlsx-mes-referencia.adr.md
// ADR: see Docs/specs/dicionario-ponta-a-ponta.adr.md
// ADR: see Docs/specs/dicionario-chave-canonica.adr.md
import { unzipSync, zipSync } from 'fflate'
import type { Lancamento, DicEntry } from '../../types.js'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * Data fixa carimbada no cabeçalho DOS de cada entrada do .xlsx gerado.
 *
 * Sem isso, `zipSync` usa `Date.now()`: o mesmo insumo produzia bytes diferentes conforme o
 * relógio — o campo guarda os segundos em passos de 2 (`seconds >> 1`), então duas gerações
 * seguidas batiam dentro do mesmo balde e divergiam em 2 bytes ao cruzar a fronteira. Era o flake
 * intermitente de `src/ui/store/__tests__/exportacao.test.ts`, que compara dois .xlsx byte a byte.
 *
 * O valor precisa cair na faixa 1980–2099 do formato DOS (`mtime: 0` = 1970 e o fflate lança
 * "date not in range 1980-2099"). O Excel ignora o carimbo das entradas do zip; o que se ganha é
 * uma propriedade real: mesmo insumo, mesmos bytes.
 */
const MTIME_FIXO = Date.UTC(2020, 0, 1, 12, 0, 0)

/**
 * Escapa caracteres especiais XML no conteúdo de texto de células.
 * Necessário para embutir valores como inline strings sem corromper o XML.
 */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Gera o XML de uma célula de string inline.
 * Formato: <c r="REF" [s="STYLE"] t="inlineStr"><is><t>VALUE</t></is></c>
 *
 * Valor vazio → célula **genuinamente em branco** (`<c r="REF" s="STYLE"/>`),
 * igual ao Modelo virgem. Uma célula com string vazia inline (`<is><t></t></is>`)
 * é tratada pelo Excel como valor `""` (não-branco), o que quebra a formatação
 * condicional (a regra `$E="" ...` / `ISBLANK`) e funções como `COUNTA`.
 */
function celulaStr(ref: string, style: string | null, value: string): string {
  const styleAttr = style ? ` s="${style}"` : ''
  if (value === '') {
    return `<c r="${ref}"${styleAttr}/>`
  }
  return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`
}

/**
 * Gera o XML de uma célula numérica.
 * Formato: <c r="REF" [s="STYLE"]><v>VALUE</v></c>
 * Quando style é null, omite o atributo s (célula sem estilo explícito).
 *
 * Guarda de última linha contra valor não-finito: `Infinity`/`NaN` interpolados crus produziriam
 * `<v>Infinity</v>`, que NÃO é conteúdo numérico válido em OOXML — o Excel não reclama da célula,
 * recusa o arquivo INTEIRO como corrompido, e o usuário só descobre ao abrir o .xlsx já baixado.
 * Este é o choke point que produz o arquivo, então é onde a garantia vale: falhar alto, sem
 * entregar artefato ruim. As fronteiras de entrada (forms, store) já barram antes; se algo chegar
 * aqui, é bug de código novo, não entrada de usuário.
 */
function celulaNum(ref: string, style: string | null, value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Valor não-finito na célula ${ref}: ${value}. O .xlsx não foi gerado.`)
  }
  const styleAttr = style ? ` s="${style}"` : ''
  return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`
}

/**
 * Primeira e última linha do corpo da `Tabela1` na aba Extrato (cabeçalho na linha 8).
 *
 * Acima de `LINHA_FINAL` o Modelo ainda tem linhas no XML, mas elas estão fora da tabela e sem as
 * células das colunas de dados — escrever lá não alimenta nenhuma fórmula.
 */
const LINHA_INICIAL = 9
const LINHA_FINAL = 504
const CAPACIDADE = LINHA_FINAL - LINHA_INICIAL + 1 // 496 lançamentos

/**
 * Substitui a célula `ref` na planilha, PRESERVANDO o índice de estilo que o arquivo declara
 * para ela, e falha alto quando a célula não existe.
 *
 * Por que não casar a string literal `<c r="A9" s="42"/>`, como era antes: o `s` é a posição do
 * formato na tabela `cellXfs` do `styles.xml`, e o Excel reescreve essa tabela a cada salvamento.
 * A coluna Fonte já foi `s="42"`, `s="44"` e `s="35"` em três versões do mesmo Modelo. E o modo de
 * falha é traiçoeiro: `String.replace` com um literal que não casa devolve o XML intacto **sem
 * erro nenhum** — o .xlsx saía com a grid em branco, o Excel abria sem reclamar, e o usuário só
 * descobria conferindo a planilha. Ler o estilo do próprio arquivo torna a injeção imune ao
 * re-save; lançar no que falta troca o silêncio por uma mensagem.
 *
 * @param construir  Recebe o `s` lido da célula (ou `null` se ela não tiver estilo) e devolve o
 *                   XML completo da célula nova.
 */
function substituirCelula(
  xml: string,
  ref: string,
  construir: (estilo: string | null) => string,
): string {
  // `[\s\S]` em vez de `.`: sheet1.xml do Modelo tem quebras de linha.
  const padrao = new RegExp(`<c r="${ref}"(?:([^>]*?)/>|([^>]*?)>[\\s\\S]*?</c>)`)
  const achado = xml.match(padrao)
  if (!achado) {
    throw new Error(
      `Célula ${ref} não encontrada na aba Extrato do Modelo.xlsx. ` +
        'O .xlsx não foi gerado (gerar sem ela produziria uma planilha incompleta em silêncio).',
    )
  }

  const atributos = achado[1] ?? achado[2] ?? ''
  const estilo = atributos.match(/\bs="(\d+)"/)?.[1] ?? null
  return xml.replace(padrao, () => construir(estilo))
}

/**
 * Número do mês (1–12) a gravar na coluna `Mês`, derivado do mês de REFERÊNCIA.
 *
 * Não é o mês da data da linha: uma compra de abril que cai na fatura de maio pertence ao
 * fechamento de maio, exatamente como já acontece na coluna `Ref.`. As fórmulas de apoio do Modelo
 * fazem a mesma leitura (`RIGHT(Tabela1[Ref.];2)`), então a coluna nova concorda com elas.
 *
 * Formato fora de `YYYY-MM` (ou mês fora de 1–12) é erro: a coluna faz parte do corpo da tabela e
 * um valor não derivável sairia como célula vazia no meio de lançamentos preenchidos.
 */
function mesDaReferencia(mesReferencia: string): number {
  const casado = mesReferencia.trim().match(/^\d{4}-(\d{2})$/)
  const mes = casado ? Number(casado[1]) : NaN
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new Error(
      `Mês de referência inválido: "${mesReferencia}". Esperado YYYY-MM com mês entre 01 e 12.`,
    )
  }
  return mes
}

/**
 * Injeta iniciais em B2, mês de referência em B3, saldo inicial em B4 e os lançamentos nas linhas
 * A9:I{8+n} de sheet1.xml — layout do Modelo de 2026-09-28 (`Tabela1` = `A8:I504`).
 *
 * Colunas do corpo da tabela, na ordem do Modelo:
 *   A Fonte · B Data · C Transcrição · D Ref. (mesReferencia literal) · E Mês (número 1–12) ·
 *   F Descrição · G Valor (número) · H Natureza · I Iniciais
 *
 * B5 é o saldo FINAL e é FÓRMULA (`B4+SUM(G9:G1004)`) — intocável. Nenhum endereço de estilo
 * aparece aqui de propósito: cada célula é reescrita com o `s` que o próprio Modelo declara (ver
 * `substituirCelula`).
 */
function injetarSheet1(
  xml: string,
  iniciais: string,
  lancamentos: Lancamento[],
  mesReferencia: string,
  saldoAnterior: number | null,
): string {
  if (lancamentos.length > CAPACIDADE) {
    throw new Error(
      `${lancamentos.length} lançamentos excedem as ${CAPACIDADE} linhas da Tabela1 ` +
        `(${LINHA_INICIAL}–${LINHA_FINAL}). O .xlsx não foi gerado.`,
    )
  }

  const mes = mesDaReferencia(mesReferencia)
  let result = xml

  // B2: iniciais do usuário
  result = substituirCelula(result, 'B2', (s) => celulaStr('B2', s, iniciais))

  // B3: mês de referência. A célula pode vir vazia ou como shared string, conforme o re-save —
  // `substituirCelula` cobre as duas formas.
  result = substituirCelula(result, 'B3', (s) => celulaStr('B3', s, mesReferencia))

  // B4: saldo inicial (item 49). Sem saldo lido do .xlsx do mês anterior a célula fica em branco,
  // exatamente como no Modelo virgem — e B5 (fórmula) resolve o saldo final como se o mês
  // começasse do zero.
  if (saldoAnterior !== null) {
    result = substituirCelula(result, 'B4', (s) => celulaNum('B4', s, saldoAnterior))
  }

  // Uma linha da Tabela1 por lançamento, a partir da linha 9
  for (let i = 0; i < lancamentos.length; i++) {
    const n = i + LINHA_INICIAL
    const l = lancamentos[i]

    result = substituirCelula(result, `A${n}`, (s) => celulaStr(`A${n}`, s, l.fonte))
    result = substituirCelula(result, `B${n}`, (s) => celulaStr(`B${n}`, s, l.data))
    result = substituirCelula(result, `C${n}`, (s) => celulaStr(`C${n}`, s, l.transcricao))
    result = substituirCelula(result, `D${n}`, (s) => celulaStr(`D${n}`, s, mesReferencia))
    result = substituirCelula(result, `E${n}`, (s) => celulaNum(`E${n}`, s, mes))
    result = substituirCelula(result, `F${n}`, (s) => celulaStr(`F${n}`, s, l.descricao))
    result = substituirCelula(result, `G${n}`, (s) => celulaNum(`G${n}`, s, l.valor))
    result = substituirCelula(result, `H${n}`, (s) => celulaStr(`H${n}`, s, l.natureza))
    result = substituirCelula(result, `I${n}`, (s) => celulaStr(`I${n}`, s, l.iniciais))
  }

  return result
}

/**
 * Títulos amigáveis da aba Dicionario, escritos na linha 1.
 * Ordem: Chave, Fonte, Natureza, Descrição, Iniciais, Vezes, Ambíguo, Valor
 *
 * `Valor` (coluna H) entrou com a spec `dicionario-chave-canonica` (Decisão 17). Acrescentar a
 * coluna é seguro: a aba `Dicionario` do `Modelo.xlsx` não tem tabela definida nem `_rels`, e não
 * é referenciada por fórmula em `Extrato` nem `Naturezas` — a `Tabela1` (`A8:I504`) pertence à aba
 * `Extrato`.
 */
const TITULOS_DICIONARIO = [
  'Chave',
  'Fonte',
  'Natureza',
  'Descrição',
  'Iniciais',
  'Vezes',
  'Ambíguo',
  'Valor',
]

/**
 * Letras de coluna para as 8 colunas da aba Dicionario.
 */
const COLUNAS_DICIONARIO = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

/**
 * Gera o bloco <sheetData> completo para a aba Dicionario com as entradas passadas.
 *
 * Linha 1: cabeçalho com títulos amigáveis (Chave, Fonte, Natureza, Descrição, Iniciais, Vezes, Ambíguo).
 * Linhas 2+: dados de cada entrada.
 * Colunas: A=chave, B=fonte, C=natureza, D=descricao, E=iniciais, F=vezes (num), G=ambiguo (str)
 */
function gerarSheetDataDicionario(dicEntries: DicEntry[]): string {
  if (dicEntries.length === 0) {
    return '<sheetData/>'
  }

  // Linha 1: cabeçalho com os 8 títulos amigáveis
  const cabecalhoCells = TITULOS_DICIONARIO.map((titulo, i) =>
    celulaStr(`${COLUNAS_DICIONARIO[i]}1`, null, titulo),
  ).join('')
  const cabecalho = `<row r="1" spans="1:8">${cabecalhoCells}</row>`

  // Linhas de dados a partir de n=2
  const rows = dicEntries.map((entry, i) => {
    const n = i + 2
    const cells = [
      celulaStr(`A${n}`, null, entry.chave),
      celulaStr(`B${n}`, null, entry.fonte),
      celulaStr(`C${n}`, null, entry.natureza),
      celulaStr(`D${n}`, null, entry.descricao),
      celulaStr(`E${n}`, null, entry.iniciais),
      celulaNum(`F${n}`, null, entry.vezes),
      celulaStr(`G${n}`, null, entry.ambiguo ? 'true' : 'false'),
      // Decisão 17: a célula H é OMITIDA quando não há valor, em vez de gravada vazia ou zerada.
      // É o que faz ausência sobreviver ao round-trip como ausência — zero é um valor legítimo
      // neste domínio e não pode ser confundido com "não sei".
      entry.valor === undefined ? '' : celulaNum(`H${n}`, null, entry.valor),
    ].join('')
    return `<row r="${n}" spans="1:8">${cells}</row>`
  })

  return `<sheetData>${cabecalho}${rows.join('')}</sheetData>`
}

/**
 * Substitui <sheetData/> da aba Dicionario pelas entradas geradas.
 */
function injetarDicionario(xml: string, dicEntries: DicEntry[]): string {
  return xml.replace('<sheetData/>', gerarSheetDataDicionario(dicEntries))
}

/**
 * Atualiza o atributo ref em table1.xml para o range correto com n linhas de dados.
 * A tabela tem cabeçalho na linha 8 e dados a partir da 9 — layout do Modelo de 2026-09-28,
 * com 9 colunas (A..I, desde que `Mês` entrou):
 * - ref = A8:I{8+n} (mínimo A8:I8 quando n=0, apenas cabeçalho)
 *
 * Substitui TODOS os atributos ref="..." (tabela e autoFilter).
 */
function atualizarRefTabela1(xml: string, n: number): string {
  const ultimaLinha = 8 + n
  return xml.replace(/\bref="[^"]*"/g, () => `ref="A8:I${ultimaLinha}"`)
}

/**
 * Adiciona fullCalcOnLoad="1" ao elemento <calcPr> de workbook.xml.
 * O Modelo.xlsx virgem tem: <calcPr calcId="191029"/>
 * Resultado esperado: <calcPr calcId="191029" fullCalcOnLoad="1"/>
 */
function injetarFullCalcOnLoad(xml: string): string {
  return xml.replace(/<calcPr([^>]*)\/>/, (_match, attrs) => {
    if (attrs.includes('fullCalcOnLoad')) return `<calcPr${attrs}/>`
    return `<calcPr${attrs} fullCalcOnLoad="1"/>`
  })
}

/**
 * Força a aba Extrato (índice 0) como ativa no workbook.xml.
 * O Modelo.xlsx pode vir salvo com outra aba ativa (activeTab="1" = Dicionario);
 * o gerado deve sempre abrir na Extrato, independente de como o Modelo foi salvo.
 */
function forcarAbaExtratoAtiva(xml: string): string {
  if (/<workbookView[^>]*\bactiveTab=/.test(xml)) {
    return xml.replace(/(<workbookView[^>]*?)\s+activeTab="[^"]*"/, '$1 activeTab="0"')
  }
  // Sem o atributo o default já é 0, mas gravar explícito mantém o gerado
  // determinístico independente de como o Modelo foi salvo
  return xml.replace(/<workbookView\b/, '<workbookView activeTab="0"')
}

/**
 * Garante que o sheetView tenha (ou não) a seleção de aba (tabSelected="1").
 * Usado para mover a seleção herdada do Modelo: sheet1 (Extrato) ganha,
 * sheet2 (Dicionario) perde — em par com o activeTab="0" do workbook.
 */
function definirTabSelected(xml: string, selecionada: boolean): string {
  const semSelecao = xml.replace(/(<sheetView[^>]*?)\s+tabSelected="[^"]*"/, '$1')
  if (!selecionada) return semSelecao
  return semSelecao.replace(/<sheetView\b/, '<sheetView tabSelected="1"')
}

/**
 * Gera um novo arquivo .xlsx por injeção cirúrgica no Modelo.xlsx.
 *
 * Estratégia: descompactar o ZIP com fflate.unzipSync, modificar cirurgicamente
 * apenas as 4 partes declaradas (sheet1.xml, sheet2.xml, table1.xml, workbook.xml),
 * e recompactar com fflate.zipSync. Todas as demais partes passam intactas —
 * seus SHA256 devem ser idênticos ao do Modelo.xlsx original.
 *
 * @param modelo - Bytes do Modelo.xlsx original (lido como Uint8Array)
 * @param iniciais - Iniciais do usuário, gravadas em B2 da aba Extrato
 * @param lancamentos - Lançamentos a injetar a partir da linha A9
 * @param dicEntries - Entradas do dicionário a injetar na aba Dicionario
 * @param mesReferencia - Mês de referência no formato YYYY-MM, gravado em B3 e na coluna `Ref.`
 *                        de cada linha; seu número de mês alimenta a coluna `Mês` (obrigatório)
 * @param saldoAnterior - Saldo final do mês anterior (`lerSaldoAnterior`/B5 do .xlsx
 *                        importado), gravado em B4 como saldo inicial. `null`/omitido
 *                        deixa B4 em branco, como no Modelo virgem (item 49 do TODO).
 * @returns Bytes do .xlsx gerado
 */
export function gerarXlsx(
  modelo: Uint8Array,
  iniciais: string,
  lancamentos: Lancamento[],
  dicEntries: DicEntry[],
  mesReferencia: string,
  saldoAnterior: number | null = null,
): Uint8Array {
  if (mesReferencia.trim() === '') {
    throw new Error('mesReferencia é obrigatório')
  }

  const parts = unzipSync(modelo)

  // 1. Modificar sheet1.xml (aba Extrato): B2, B3, B4, linhas de dados A9:I{8+n}
  //    e seleção de aba (item 19 — o gerado abre na Extrato)
  const sheet1Xml = decoder.decode(parts['xl/worksheets/sheet1.xml'])
  parts['xl/worksheets/sheet1.xml'] = encoder.encode(
    definirTabSelected(
      injetarSheet1(sheet1Xml, iniciais, lancamentos, mesReferencia, saldoAnterior),
      true,
    ),
  )

  // 2. Modificar sheet2.xml (aba Dicionario): substituir <sheetData/> com entradas
  //    e remover a seleção de aba herdada do Modelo
  const sheet2Xml = decoder.decode(parts['xl/worksheets/sheet2.xml'])
  parts['xl/worksheets/sheet2.xml'] = encoder.encode(
    definirTabSelected(injetarDicionario(sheet2Xml, dicEntries), false),
  )

  // 3. Modificar table1.xml: ajustar ref para o número exato de linhas
  const table1Xml = decoder.decode(parts['xl/tables/table1.xml'])
  parts['xl/tables/table1.xml'] = encoder.encode(
    atualizarRefTabela1(table1Xml, lancamentos.length),
  )

  // 4. Modificar workbook.xml: fullCalcOnLoad="1" em <calcPr> e aba Extrato ativa
  const workbookXml = decoder.decode(parts['xl/workbook.xml'])
  parts['xl/workbook.xml'] = encoder.encode(
    forcarAbaExtratoAtiva(injetarFullCalcOnLoad(workbookXml)),
  )

  // 5. Seleção ÚNICA: só a aba Extrato (sheet1) pode ficar com tabSelected.
  //    Se o Modelo foi salvo com abas AGRUPADAS (ex.: sheet3/Naturezas com
  //    tabSelected="1"), o gerado sairia com duas abas selecionadas = grupo, e o
  //    Excel BLOQUEIA editar/excluir linhas em modo grupo. sheet1 já recebeu
  //    tabSelected acima; aqui limpamos qualquer outra aba selecionada. A reescrita
  //    é condicional (só quando há o que limpar) para não alterar bytes de abas já
  //    limpas — preserva o contrato de "partes intactas" (SHA256).
  for (const nome of Object.keys(parts)) {
    if (nome === 'xl/worksheets/sheet1.xml') continue
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(nome)) continue
    const xml = decoder.decode(parts[nome])
    if (xml.includes('tabSelected')) {
      parts[nome] = encoder.encode(definirTabSelected(xml, false))
    }
  }

  // `mtime` fixo: sem ele o zip carimba `Date.now()` e o mesmo insumo sai com bytes diferentes
  // conforme a hora da geração (ver `MTIME_FIXO`).
  return zipSync(parts, { mtime: MTIME_FIXO })
}
