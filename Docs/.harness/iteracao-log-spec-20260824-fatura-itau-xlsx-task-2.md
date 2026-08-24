## [2026-08-24 18:30] iteracao 1 — Task T2 (Contrato ParserBinario + array parsersBinarios) — APROVADO

### Test List

- [unit] `parsersBinarios` é exportado como array e começa vazio (nenhum parser binário concreto
  implementado ainda — `fatura_itau_cc` é task futura/paralela T3).
- [unit] A interface `ParserBinario` aceita uma implementação com `aceita(bytes: Uint8Array): boolean`
  e `parsear(bytes: Uint8Array): ResultadoParse` — provado empurrando um parser binário mock para
  dentro de `parsersBinarios` e chamando `aceita`/`parsear` sobre ele.
- [unit] `parsear` de uma implementação de `ParserBinario` retorna o mesmo formato de
  `ResultadoParse` reaproveitado de `../types` (não uma redefinição local) — provado via mock que
  retorna `{ lancamentos, linhasIgnoradas, excluidosPendentes }` e type-check aceita.
- [unit] `src/parsers/index.ts` permanece com assinatura e comportamento inalterados: `Parser`
  (aceita/parsear sobre `string`), array `parsers` com os 5 parsers de texto, `detectar()` continua
  reconhecendo os mesmos formatos — provado rodando a suíte existente `src/parsers/__tests__/
  index.test.ts` sem modificação e por um teste dedicado em `binario.test.ts` que importa `parsers`
  de `../index` e confirma `parsers.length === 5`.

Baseline nesta worktree antes da task: 82 arquivos de teste, 1310 testes passando (`npx vitest run`),
`node_modules` reaproveitado via symlink do checkout principal (mesmo `package-lock.json`, sem
`npm install`).

### Decisões arquiteturais não-óbvias
- `parsersBinarios` começa vazio nesta task, propositalmente — os parsers binários concretos
  (`fatura_itau_cc`) são entregues por T3/T4/T5/T6/T7, tasks paralelas/futuras desta mesma spec.
  Ref: `src/parsers/binario.ts:26` (comentário). Motivo: a Decomposição da spec lista T2 como
  paralela a T1 e T11, ambas sem dependência do parser concreto.

### Pressupostos assumidos
- O arquivo de teste companion `src/parsers/__tests__/binario.test.ts` foi criado mesmo a task
  listando `Áreas tocadas` como só `src/parsers/binario.ts` — assumido como implícito, já que a
  Definition of done da própria task exige "confirmar (com um teste...)". Ref:
  `spec/fatura-itau-xlsx.spec.md:129-134`. Risco se errado: nenhum — `harness-judge` e
  `code-reviewer` avaliaram o arquivo de teste como parte legítima do escopo, sem flag.

### Escolhas locais
- A prova de que `src/parsers/index.ts` permanece inalterado foi feita por dupla via: (1) o arquivo
  não foi tocado (confirmado por `git diff`/`git status`); (2) um teste dedicado que exercita
  `detectar()` via `faturaNumbank`/`ErroArquivoNaoReconhecido`, em vez de importar o array `parsers`
  (que não é exportado por `index.ts` e não deveria passar a ser, para não alterar sua assinatura
  pública). Ref: `src/parsers/__tests__/binario.test.ts:58-67`. Valor/alternativa: teste
  comportamental via `detectar()` em vez de exportar `parsers` só para o teste (rejeitado por seria
  uma alteração de `index.ts` fora do escopo da task).

### Verify mecânico
- Suíte: 83 arquivos, 1315 testes, todos verdes (`npx vitest run`).
- Typecheck: `npx tsc -p tsconfig.app.json --noEmit` limpo.
- Lint: N/A (declarado) — `package.json` script `lint` é `echo 'lint: sem linter configurado'`.
- Cobertura: N/A (declarado) — nenhum comando/threshold de cobertura em `CLAUDE.md`.
- Critérios de verificação [integration]/[e2e]: não aplicável a esta task (T2 não é a última task
  da spec).
- `code-reviewer`: pass nos 3 sinais (loops_without_progress, unrequested_functionality,
  test_manipulation).
- `harness-judge`: pass nos 3 critérios (consistência arquitetural, escopo respeitado, padrão de
  código — 5 camadas).
