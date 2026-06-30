# Conta de Gastos — Decisões de Projeto

App web que ingere extratos/faturas, deixa o usuário revisar como num Google Sheets e
exporta um `.xlsx` no modelo fixo. **Zero retenção: o dado nunca sai do navegador.**

## Princípios

DRY, KISS, SOLID, **test-first inegociável**. Mínimo de código próprio: usar bibliotecas
open source prontas e **não reinventar a roda**. Só abstrair o que realmente varia.

## Stack

- **App:** Vite + **React** + TypeScript, 100% client-side, site estático. Sem backend, sem banco, sem tier pago.
- **CSV:** PapaParse. **PDF:** `pdf.js` (lazy load — só baixa quando há PDF; caminho best-effort).
- **Grid de revisão:** **Glide Data Grid** (canvas, virtualizado, seleção de range estilo Sheets) — não reinventar.
- **Estado + undo:** Zustand + immer (undo por patches), não máquina de estados própria.
- **Geração do `.xlsx`:** preencher o template `Modelo.xlsx` sem perda. Usar a **lib mais leve que
  comprovadamente preserva o nosso modelo** (`xlsx-populate` / ExcelJS / SheetJS); cair para patch
  artesanal com `fflate` **só se o spike provar** que todas mutilam fórmulas dinâmicas/CF/tabelas.
- **Testes:** Vitest. **Deploy:** Cloudflare Pages / Vercel / Netlify (estático, grátis).

## Arquitetura de repositório

**Não é hexagonal.** São módulos simples com **um único encaixe de plugin: o registro de parsers**.
Não há ports/adapters — abstrair o que é fixo seria overengineering.

```
src/
├── dominio/        # Lancamento + regras puras (classificar, normalizar, split, detectar transferências/investimentos)
├── parsers/        # ÚNICO ponto extensível: 1 arquivo por banco/formato + registro + detectar()
├── excel/          # preenchimento do template Modelo.xlsx (abas Extrato + Dicionario)
├── ui/             # grid de revisão, telas de upload e revisão
└── Modelo.xlsx     # template imutável; 3 abas: Extrato, Dicionario (vazia), Naturezas (referência) — versionado
```

- **TDD do núcleo puro** (parsers, normalização, classificação, enriquecimento, split, validação,
  injeção dado fixture de bytes). A grid em canvas testa-se pelos redutores de estado, não pelo desenho.
- Todo parser tem fixture sintética + testes de `aceita()` e `parsear()`.

## Arquitetura de dados

- **`Lancamento`** = `{ fonte, data, transcricao, valor, iniciais, natureza, descricao }`.
- **Dicionário** = chave `(chave, fonte) → { natureza, descricao, iniciais, vezes, ambiguo }`.
  - `chave` = transcrição **normalizada** (remove sufixo de data, ex. ` 12/03`).
  - Valor **não** entra na chave: quase nada casaria e mataria o auto-preenchimento (caso de uso principal).
  - **Vive na aba `Dicionario` do próprio `.xlsx`**, visível e humano-legível
    (`Fonte · Transcrição · Iniciais · Natureza · Descrição · Vezes`). **O workbook É o banco.**
  - O usuário sobe o arquivo do mês anterior como dicionário do mês atual (opcional).
- **Enriquecimento:** viu igual → `vezes++`; viu diferente → marca `ambiguo` e **para de
  auto-preencher** aquela chave. Vale para Natureza/Descrição **e** Iniciais (mesmo mecanismo).

## Regras de domínio

- O sistema preenche, a partir do parser: **Fonte, Data, Transcrição, Valor** (para conferência
  contra os documentos base) e **Iniciais** com default = iniciais do usuário.
- **Natureza e Descrição** são auto-preenchidas pelo dicionário **só quando não-ambíguas**;
  senão ficam em branco para decisão humana.
- **Iniciais por exceção:** quando um lançamento não é do usuário, ele informa as iniciais da
  pessoa vinculada; o sistema aprende o override por chave (conflito → ambíguo, pergunta de novo).
- **Múltiplas iniciais (split):** se as Iniciais contêm `/` (gatilho de detecção), pop-up confirma
  a divisão. Se confirmado: divide o Valor por N (nº de iniciais), duplica a linha N vezes — cada
  uma com uma das iniciais e Valor/N. **Arredondamento:** a última linha absorve a sobra, de modo
  que a somatória feche exatamente o valor original. Demais colunas idênticas.
- **Transferências entre contas próprias** do mesmo usuário: detectadas por palavra-chave.
- **Investimentos:** aplicação/resgate destacados em **vermelho** no Excel (classificação extra).
- **Validação (espelha o CF do modelo):** linha precisa de atenção se Natureza vazia com dados,
  ou código fora da lista de naturezas válidas (aba `Naturezas`, `B3:B32`). A grid usa essa mesma regra.
- **Saldo final** vem da fórmula do modelo (`saldo inicial + soma dos valores`) — não recalcular.
- **Export sempre disponível** (inclusive antes de finalizar a classificação). O **aprendizado**
  (enriquecer o dicionário) só ocorre se o usuário finalizar a classificação no site. Em export
  antecipado, a aba `Dicionario` recebe **apenas o dicionário do arquivo enviado** (se houver), sem enriquecer.
- **Arquivo exportado:** `AAAA-MM-INICIAIS.xlsx`.

## Injeção no Excel

- `Modelo.xlsx` é **imutável**. O sistema escreve **somente**: `B2` (Iniciais da Configuração),
  o corpo da `Tabela1` em **`A8:G503`**, e a aba `Dicionario`. Ajusta o `ref` da `Tabela1` ao nº de
  linhas. Tudo o mais (fórmulas `LET/REDUCE/LAMBDA/XLOOKUP`, totais, CF, estilos, tabelas) fica intacto.
- A aba `Dicionario` já existe vazia no template → injeção é só escrever valores, sem cirurgia de OPC.
- A aba `Naturezas` é **referência intocada** — alimenta fórmulas internas em células que o sistema nunca escreve.

### Como validar a abordagem técnica (fase futura)

Spike comparativo antes de escolher a biblioteca de geração. Para cada candidata
(`xlsx-populate`, ExcelJS, SheetJS, e `fflate` artesanal):

1. Carregar `Modelo.xlsx` → injetar um **fixture sintético** de linhas + dicionário → salvar → reabrir.
2. **Critérios de aprovação (o que não pode quebrar):** fórmulas dinâmicas (`LET/REDUCE/LAMBDA/XLOOKUP`)
   intactas e recalculando; formatação condicional (realce); `Tabela1` com `ref` ajustado; estilos;
   abas `Naturezas` e fórmulas de totais intactas; **abrir no Excel real sem prompt de reparo**.
3. **Verificação:** (a) abertura no Excel/365 real = fonte da verdade; (b) `diff` do XML descompactado —
   tudo que não foi tocado deve ser idêntico; só mudam `sheetData` de Extrato/Dicionario e o `ref` da tabela.
4. **Decisão:** menor footprint que passa em todos os critérios; `fflate` artesanal só se nenhuma lib passar.

## Regras de UI

### Tela de upload
- **Drag-and-drop** dos extratos/faturas e (opcional) do arquivo do mês anterior como dicionário.
- Lista cada arquivo enviado com **banco detectado (fonte)** e **período de referência** (min–max das datas).
- **Falha de parser** (banco não identificado ou erro ao parsear) é sinalizada **visualmente** no arquivo.

### Tela de revisão (sensação Google Sheets)
- Grid com Fonte/Data/Transcrição/Valor (conferência) + Iniciais/Natureza/Descrição (edição).
- **Seleção múltipla de células** (atalhos típicos do Sheets) + **visualizador de soma** da seleção.
- **Editar valor**, **excluir linha**, **mover linha** (cima/baixo), preencher Iniciais.
- **Desfazer (undo)** para edição de valor, exclusão de linha e demais operações.
- **Realce vermelho** das linhas que precisam de atenção (mesma regra de validação do modelo).
- **Destaque visual** para transferências entre contas próprias e para aplicação/resgate de
  investimentos — pista de UX para acelerar o trabalho do usuário.
- **Pop-up de split** ao detectar `/` nas Iniciais: o usuário revê as iniciais-alvo e pode
  **adicionar / remover / editar** cada uma, **confirmar** ou **cancelar** a operação.

## Regras de UX

- **Zero-retenção como garantia estrutural** — não há servidor; o dado nunca trafega.
- Estética **clean, minimalista e elegante**; o app deve transmitir alívio, calma e simplicidade.
- **Incentivar o envio em CSV/TXT** (mais confiável que PDF; PDF é best-effort e pode falhar).
- O usuário confronta o que foi parseado com os documentos originais antes de exportar.

## Parsers (único ponto escalável)

Cada parser: `aceita(arquivo) -> bool` e `parsear(arquivo) -> Lancamento[]`; `detectar()` escolhe.

| Parser            | Fonte               | Formato  |
|-------------------|---------------------|----------|
| `extrato_nubank`  | Extrato Nubank      | CSV      |
| `fatura_nubank`   | Fatura Nubank (CC)  | CSV      |
| `extrato_itau`    | Extrato Itaú        | PDF, TXT |
| `fatura_itau`     | Fatura Itaú (CC)    | PDF      |

A comunidade adiciona bancos implementando um novo parser + fixture + testes. Zero mudança no resto.

## Itens de ação / a confirmar

- [x] Modelo com abas `Dicionario` (vazia) e `Naturezas` (referência).
- [ ] Spike de fidelidade (ver "Como validar a abordagem técnica") — fase futura.
