# Spike — Seleção da biblioteca de geração de `.xlsx`

Sandbox **descartável e arquivado** que investigou qual biblioteca usar para preencher o
template fixo `Modelo.xlsx` sem corromper suas fórmulas dinâmicas, formatação condicional,
estilos, tabela nomeada (`Tabela1`) e a aba `Naturezas`. O código fica preservado aqui como
**referência** para a futura implementação do módulo `excel/` de produção — não é código de
produção e não é importado pelo app.

## Decisão: `fflate` artesanal ✅

Quatro candidatas foram avaliadas contra 9 critérios (ver `../spec/xlsx-spike-decision.md`).
Resultado dos critérios automatizáveis (C3–C9):

| Candidata | Preserva byte-a-byte? | Bundle | Veredito |
|---|---|---:|---|
| **fflate** | **sim** (C3–C8 pass) | **796 KB** | **vencedora** |
| xlsx-populate | não (regenera `[Content_Types].xml`) | 14,4 MB | reprovada |
| SheetJS | não (reescreve o ZIP, descarta partes) | 7,1 MB | reprovada |
| ExcelJS | não (crash na formatação condicional) | 20,8 MB | reprovada |

A abordagem vencedora (`src/candidate-fflate.ts`) é **cirúrgica**: `fflate.unzipSync`
descompacta o ZIP virgem, substitui **apenas** o `<sheetData>` de Extrato (`sheet1.xml`) e
Dicionario (`sheet2.xml`) e o `ref` da `Tabela1` (`table1.xml`), e recompacta com
`fflate.zipSync`. Todas as outras ~19 partes do ZIP passam intocadas.

## ⚠️ Requisito de produção: forçar recálculo na abertura (`fullCalcOnLoad`)

Achado da verificação manual no Excel real (C2). Como o `.xlsx` é escrito "na mão" via
fflate, as células de fórmula são gravadas com o `<f>` (a fórmula) mas **sem o `<v>`** (o
valor em cache). Por desempenho, o Excel exibe o valor em cache ao abrir e **não recalcula**
por padrão — então as fórmulas aparecem em branco até a célula ser forçada a recalcular
(entrar na fórmula e apertar Enter dispara o cálculo).

**Solução (a aplicar no módulo `excel/` de produção):** no `xl/workbook.xml`, no elemento
`<calcPr>`, adicionar o atributo `fullCalcOnLoad="1"`:

```xml
<calcPr fullCalcOnLoad="1"/>
```

Isso instrui o Excel a recalcular toda a pasta ao abrir, contornando o cache ausente — é a
mesma técnica que openpyxl/ExcelJS usam. Esta é a 4ª modificação permitida ao ZIP (além de
`sheetData` de Extrato/Dicionario e do `ref` da `Tabela1`).

> Nota: o spike preservado **não** aplica esse fix (o `assertXmlParity` deste sandbox trata
> qualquer mudança em `workbook.xml` como divergência). O fix pertence ao módulo de produção,
> onde o `workbook.xml/calcPr` passa a ser uma mudança esperada.

## Estrutura

- `src/` — extrator do golden + as 4 candidatas.
- `tests/` — testes por candidata + `helpers/` (harness de verificação: `assertXmlParity`,
  `assertDataMatch`, `zipDiff`).
- `fixtures/virgem-parts/` — as 22 partes XML do `Modelo.xlsx` virgem (baseline de comparação).
- `output/*-report.json` — relatórios de critérios/bundle/tempo por candidata.

## Dados pessoais — fora do git

Para manter o repositório público sem dados financeiros pessoais, **não são versionados**
(ver `.gitignore` na raiz):

- `fixtures/dataset.json` — os lançamentos reais extraídos do golden.
- `output/*.xlsx` — os arquivos gerados (contêm os lançamentos injetados).

## Como rodar os testes localmente

Os testes dependem de dois arquivos que existem apenas localmente:

1. `Modelo.xlsx` (virgem) na raiz do repositório.
2. `Modelo_preenchido.xlsx` (golden com os lançamentos) na raiz — gitignored.

Passos:

```bash
cd spike
npm install
# regenera fixtures/dataset.json a partir do Modelo_preenchido.xlsx local:
npx tsx src/extract-golden.ts   # ou o runner equivalente do extrator
npm test
```

Sem esses goldens locais, os testes que comparam dados não rodam — o código permanece como
referência da abordagem.
