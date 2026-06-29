# Conta de Gastos — Decisões de Projeto

App web que ingere extratos/faturas, deixa o usuário revisar como num Google Sheets e
exporta um `.xlsx` no modelo fixo. **Zero retenção: o dado nunca sai do navegador.**

## Stack

- **100% client-side**, site estático. **TypeScript + React**. Sem backend, sem banco, sem tier pago.
- **Parsing:** CSV nativo; PDF via `pdf.js` (lazy load — só baixa quando há PDF).
- **Geração do `.xlsx`:** patch cirúrgico do `Modelo.xlsx` (template imutável) via lib de zip leve
  (`fflate`). Injeta **apenas** as células permitidas; nunca reserializa o workbook.
- **Grid de revisão:** componente de planilha virtualizado (seleção múltipla estilo Sheets).
- **Deploy:** Cloudflare Pages / Vercel / Netlify / GitHub Pages (estático, grátis).
- **Disciplina:** DRY, KISS, SOLID, TDD. Parsers do legado Python = especificação de referência.

## Arquitetura de repositório

Hexagonal mínima. **O único ponto de extensão é o `Parser`** — todo o resto é concreto e fixo.

```
src/
├── dominio/        # Lancamento + regras puras (classificar, normalizar, detectar transferências/investimentos)
├── parsers/        # ÚNICO ponto extensível: 1 arquivo por banco/formato + registro + detectar()
├── excel/          # injeção no template Modelo.xlsx + leitura/escrita da aba Dicionário
├── ui/             # grid de revisão, drag-and-drop, telas
└── Modelo.xlsx     # template imutável (versionado)
```

- **TDD:** todo parser tem fixture sintética + testes de `aceita()` e `parsear()`.
- **Não abstrair o que é fixo:** Excel e UI são concretos, sem ports/interfaces.

## Arquitetura de dados

- **`Lancamento`** = `{ fonte, data, transcricao, valor, iniciais, natureza, descricao }`.
- **Dicionário** = chave `(chave, fonte) → { natureza, descricao, iniciais, vezes, ambiguo }`.
  - `chave` = transcrição **normalizada** (remove sufixo de data, ex. ` 12/03`).
  - **Vive na aba `Dicionário` do próprio `.xlsx`**, visível e humano-legível
    (`Fonte · Transcrição · Iniciais · Natureza · Descrição · Vezes`). **O workbook É o banco.**
  - O usuário sobe o arquivo do mês anterior como dicionário do mês atual (opcional).
- **Enriquecimento:** viu igual → `vezes++`; viu diferente → marca `ambiguo` e **para de
  auto-preencher** aquela chave. Vale para Natureza/Descrição **e** Iniciais (mesmo mecanismo).

## Regras de domínio

- O sistema preenche, a partir do parser: **Fonte, Data, Transcrição, Valor** (para o usuário
  conferir contra os documentos base) e **Iniciais** com default = iniciais do usuário.
- **Natureza e Descrição** são auto-preenchidas pelo dicionário **só quando não-ambíguas**;
  senão ficam em branco para decisão humana.
- **Iniciais por exceção:** quando um lançamento não é do usuário, ele informa as iniciais da
  pessoa vinculada; o sistema aprende o override por chave (conflito → ambíguo, pergunta de novo).
- **Transferências entre contas próprias** do mesmo usuário: detectadas por palavra-chave.
- **Investimentos:** aplicação/resgate destacados em **vermelho** (regra de classificação extra).
- **Validação (espelha o CF do modelo):** linha precisa de atenção se Natureza vazia com dados,
  ou código fora da lista de naturezas válidas (`Y8:Y37` do modelo). A grid usa essa mesma regra.
- **Saldo final** vem da fórmula do modelo (`saldo inicial + soma dos valores`) — não recalcular.
- **Aprendizado e exportação só ficam disponíveis se o usuário finalizar a classificação no site.**
- **Arquivo exportado:** `AAAA-MM-INICIAIS.xlsx`.

## Injeção no Excel

- `Modelo.xlsx` é **imutável**. O sistema escreve **somente**: `B2` (Iniciais da Configuração)
  e o corpo da `Tabela1`. Ajusta o `ref` da `Tabela1` ao nº de linhas. Tudo o mais (fórmulas
  `LET/REDUCE/LAMBDA/XLOOKUP`, totais, formatação condicional, estilos, tabelas) fica intacto.
- A aba `Dicionário` é (re)escrita visível e legível.
- ⚠️ **A confirmar:** a Fonte é a coluna **A**, então o corpo de dados é `A8:G503` (você citou
  `B8:G503` — provável lapso, já que Fonte/A é preenchida pelo sistema).

## Regras de UI (tela de revisão, sensação Google Sheets)

- Grid mostrando Fonte/Data/Transcrição/Valor (conferência) + Iniciais/Natureza/Descrição (edição).
- **Seleção múltipla de células** com os atalhos típicos do Sheets.
- **Visualizador de soma** das células selecionadas.
- **Editar valor**, **excluir linha**, **mover linha** (cima/baixo), preencher Iniciais.
- **Desfazer (undo)** para edição de valor, exclusão de linha e demais operações.
- **Realce vermelho** das linhas que precisam de atenção (mesma regra de validação do modelo).

## Regras de UX

- **Zero-retenção como garantia estrutural** — não há servidor; o dado nunca trafega.
- Estética **clean, minimalista e elegante**; o app deve transmitir alívio, calma e simplicidade.
- **Drag-and-drop** dos extratos/faturas e (opcional) do arquivo do mês anterior como dicionário.
- O usuário confronta o que foi parseado com os documentos originais antes de exportar.

## Parsers (Protocol — único ponto escalável)

Cada parser: `aceita(arquivo) -> bool` e `parsear(arquivo) -> Lancamento[]`; `detectar()` escolhe.

| Parser            | Fonte               | Formato  |
|-------------------|---------------------|----------|
| `extrato_nubank`  | Extrato Nubank      | CSV      |
| `fatura_nubank`   | Fatura Nubank (CC)  | CSV      |
| `extrato_itau`    | Extrato Itaú        | PDF, TXT |
| `fatura_itau`     | Fatura Itaú (CC)    | PDF      |

A comunidade adiciona bancos implementando um novo parser + fixture + testes. Zero mudança no resto.
