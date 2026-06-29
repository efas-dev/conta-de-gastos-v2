# CLAUDE.md

Este arquivo fornece orientações para o Claude Code ao trabalhar neste repositório.

> **Placeholder instalado pelo Optimus.** Este é o esqueleto da constituição do projeto — o documento que o agente lê **toda sessão** como instrução operacional. Rode `/projeto-fundar` para preenchê-lo via Q&A socrático (e, junto, preencher `Docs/ARCHITECTURE.md`). Em projetos brownfield, rode antes a fase 5A (`/arqueologia-iniciar`) para que `/projeto-fundar` consolide a arquitetura a partir do material documentado.

> **Contrato enxuto (hub, não enciclopédia).** Por ser lido toda sessão, o `CLAUDE.md` é um ponto de entrada: alvo **≤150 linhas, cap ≤200**. Carregue só o que o agente precisa em toda sessão e **aponte** para o resto — `Docs/index.md` (catálogo da documentação) e `Docs/ARCHITECTURE.md` (estrutura + invariantes). Não reescreva aqui camada, contrato ou invariante que já vive no `ARCHITECTURE.md`; referencie. Se algo não cabe, é sinal de que pertence a uma página em `Docs/` linkada pelo índice.

## O que é este projeto

(a preencher) — identidade em um parágrafo: o que é, o que **não** é, quem consome.

## Convenções

(a preencher) — linguagem(ns), estilo, nomenclatura, idiomas que o agente deve seguir. Idioma do conteúdo gerado (Docs, specs, ADRs, dívida, commits).

## Como rodar testes/validações

(a preencher) — os comandos exatos. Se não houver suite automatizada, declarar explicitamente: "validação é manual: …".

## Fases do harness ativas

(a preencher) — quais fachadas este projeto usa (`/spec-iniciar`, `/spec-implementar`, `/spec-documentar`, arqueologia, `/harness-lint`) e qualquer gate específico do projeto.

> As **regras sagradas do projeto** (invariantes globais que nenhuma spec, task ou iteração pode violar) vivem em [`Docs/ARCHITECTURE.md`](Docs/ARCHITECTURE.md), seção `## Invariantes globais` — lida pelos agentes do harness na fase 2 (Decomposição), fase 3 (Plan e juiz final). Mantenha-a preenchida.

## Notas operacionais para o Claude

(a preencher) — as regras não-óbvias em que um agente novo tropeçaria. Inclua aqui a disciplina de aprovação, gotchas de ambiente, e o que **não** fazer.

## Referências

- [`Docs/index.md`](Docs/index.md) — catálogo da documentação: módulos, conceitos, decisões (ADRs).
- [`Docs/ARCHITECTURE.md`](Docs/ARCHITECTURE.md) — referência estrutural: camadas, contratos transversais e `## Invariantes globais` (regras sagradas lidas pelos juízes do harness).
