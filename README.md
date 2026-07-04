# Conta de Gastos

App web **100% client-side** que ingere extratos e faturas bancárias (CSV/TXT), deixa você
revisar os lançamentos numa grid estilo Google Sheets e exporta uma planilha `.xlsx` já
preenchida no seu modelo fixo.

> **Zero retenção — o dado nunca sai do navegador.** Não há backend, banco de dados, contas de
> usuário nem telemetria. Tudo roda na sua aba: os arquivos são lidos, processados e exportados
> localmente, e nada trafega para nenhum servidor.

## O que ele faz

1. **Ingestão** — você arrasta seus extratos/faturas (e, opcionalmente, o `.xlsx` do mês
   anterior como dicionário). Cada arquivo é identificado pelo banco (fonte) e período.
2. **Classificação automática** — o dicionário aprende com o seu histórico e auto-preenche
   Natureza, Descrição e Iniciais quando o padrão é inequívoco; casos ambíguos ficam em branco
   para você decidir.
3. **Revisão estilo planilha** — grid com seleção de intervalo, soma da seleção, desfazer,
   realce das linhas que precisam de atenção e destaque para transferências e investimentos.
4. **Rateio (split)** — lançamentos com `/` nas Iniciais abrem um pop-up que divide o valor
   entre as pessoas, com a última linha absorvendo a sobra de centavos.
5. **Exportação** — preenche o template `Modelo.xlsx` **sem tocar** em fórmulas, formatação
   condicional, estilos ou tabelas, gerando `AAAA-MM-INICIAIS.xlsx`.

## Rodando localmente

Requer Node 18+.

```bash
npm install
npm run dev       # servidor de desenvolvimento (Vite)
npm test          # suíte de testes (Vitest) — 232 testes
npm run build     # typecheck + build estático em dist/
npm run preview   # serve o build de produção localmente
```

O resultado do `build` é um site estático — hospedável de graça em Cloudflare Pages, Vercel ou
Netlify, sem nenhuma infraestrutura de servidor.

## Stack

- **App:** Vite + React + TypeScript, 100% client-side.
- **Estado + undo:** Zustand + Immer (desfazer por patches).
- **Grid de revisão:** [Glide Data Grid](https://github.com/glideapps/glide-data-grid) (canvas, virtualizado).
- **Geração do `.xlsx`:** [`fflate`](https://github.com/101arrowz/fflate) — injeção cirúrgica que
  preserva o `Modelo.xlsx` byte a byte (ver [`spike/`](spike/) para o comparativo que motivou a escolha).
- **Testes:** Vitest + Testing Library.

## Arquitetura

Não é hexagonal: são módulos simples com **um único ponto de extensão — o registro de parsers**.

```
src/
├── dominio/     # regras puras: normalização, dicionário, aprendizado,
│                #   split, transferência, investimento, validação
├── parsers/     # ÚNICO ponto extensível: 1 arquivo por banco/formato + registro
├── excel/       # reader (lê dicionário do .xlsx) + writer (preenche o Modelo via fflate)
├── ui/          # store Zustand, grid de revisão, pop-up de split, tela de upload
├── App.tsx      # orquestra upload → revisão → exportação
└── types.ts     # o tipo Lancamento e contratos compartilhados
```

O núcleo puro (parsers, domínio, excel) é desenvolvido com **TDD**. A grid em canvas é testada
pelos redutores de estado, não pelo desenho.

## Parsers suportados

| Parser            | Fonte              | Formato |
|-------------------|--------------------|---------|
| `extrato_nubank`  | Extrato Nubank     | CSV     |
| `fatura_nubank`   | Fatura Nubank (CC) | CSV     |
| `extrato_itau`    | Extrato Itaú       | TXT     |

> Suporte a PDF e a outros bancos está no roadmap — o formato PDF é best-effort. Prefira sempre
> CSV/TXT, que são mais confiáveis.

### Adicionando um banco

Os parsers são o único ponto que a comunidade precisa tocar. Cada um implementa
`aceita(arquivo) -> bool` e `parsear(arquivo) -> Lancamento[]`, registra-se em
[`src/parsers/index.ts`](src/parsers/index.ts) e vem com uma fixture sintética + testes de
`aceita()` e `parsear()`. **Nenhuma outra parte do sistema muda.**

## O modelo (`Modelo.xlsx`)

O template é **imutável e sagrado**. O sistema escreve **somente** a célula `B2` (iniciais), o
corpo da `Tabela1` (`A8:G503`) e a aba `Dicionario`. Fórmulas dinâmicas (`LET/REDUCE/LAMBDA/
XLOOKUP`), formatação condicional, totais, estilos e a aba `Naturezas` (referência das fórmulas)
ficam intactos. O próprio workbook **é o banco de dados** do dicionário — visível e legível na
aba `Dicionario`.

## Documentação

- [`PROJETO.md`](PROJETO.md) — decisões completas de arquitetura, domínio, UI/UX e parsers.
- [`spike/`](spike/) — o comparativo (`xlsx-populate` × ExcelJS × SheetJS × `fflate`) que decidiu
  a biblioteca de geração do `.xlsx`.
- [`legado/`](legado/) — o sistema Python anterior, mantido como especificação de referência dos
  parsers (não é o app atual).

## Privacidade

Zero retenção é uma **garantia estrutural**, não uma promessa: como não existe servidor, não há
para onde o dado ir. Ele é lido, revisado e exportado inteiramente no seu navegador.
