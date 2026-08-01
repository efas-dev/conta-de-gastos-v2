## [2026-07-31] iteracao 1 — Task T9 (Canal único de avisos: sheet nas 2 telas, migrar 5 avisos legados, aposentar footer) — APROVADO

### Plan

Áreas tocadas desta task: `src/App.tsx`, `src/ui/PipelineState.ts`, `src/ui/store/avisosSlice.ts`,
`src/ui/components/CentralDeAvisos.tsx` (+ testes correspondentes). Camada de teste declarada:
unit+integration.

Ponto crítico identificado na leitura fria do código (item 1 do facade, "REWIRE"): em
`PipelineState.ts`, `produzirLancamentos` ainda chamava `detectarValorPendente(excluidosPendentes)`
— `excluidosPendentes` está sempre vazio desde T6 (o parser deixou de excluir essas linhas, elas
entram em `lancamentos`). Isso já estava documentado como dívida esperada em
`Docs/debt/tecnica/regressao-integracao-parser-t6-valor-pendente-pagamento-recebido.md`
("T7 deve reescrever `detectarValorPendente`... T10 confirma"), mas a reescrita das funções de
detecção (T7) não implicava, por si só, religar o call-site em `PipelineState.ts` — essa religação
é exatamente o escopo desta task (T9), não de T7 nem de T10.

Confirmado rodando a suíte ANTES de qualquer mudança: exatamente os 3 testes previstos na dívida
estavam vermelhos (`pipeline.avisos.integracao.test.ts` × 2, `avisos-acionaveis.e2e.test.tsx` × 1).

Não havia `node_modules` no worktree (comum aos siblings desta spec) — recriado como symlink para
`/Users/es/Documents/conta_de_gastos/node_modules`, mesmo padrão já usado por T3b/T4/T8.

### Test List

1. [unit] TL-T9-01 — `produzirLancamentos` chama `detectarValorPendente` com `lancamentosComFlags`
   (não mais `excluidosPendentes`).
2. [unit] TL-T9-02 — `produzirLancamentos` chama `detectarPagamentoRecebido` (nova, T7) com
   `lancamentosComFlags`.
3. [unit] TL-T9-03 — `adicionarAvisos` recebe o array combinado das 3 detecções (valor-pendente +
   pagamento-recebido + conciliação), na ordem.
4. [unit] TL-T9-04 — quando há `linhasIgnoradas > 0`, o despacho inclui também um `Aviso`
   `tipo:'informativo'`, `origem:'linhas-ignoradas'`, `estado:'pendente'`, id único por chamada.
5. [integration] TL-T9-05 (reconciliação) — `pipeline.avisos.integracao.test.ts`: fixture real
   (fatura sintética com valor-pendente + pagamento-recebido) produz as duas propostas via
   `adicionarAvisos`, com `alvo` apontando o índice real (não mais `[]`); conciliação continua
   funcionando quando extrato é fornecido (comportamento de `detectarConciliacao` inalterado, fora
   do escopo de T9).
6. [integration] TL-T9-06 — `CentralDeAvisos` (sheet) renderizado também na tela de importação
   (Etapa 1), lado a lado com o corpo do formulário — mesmo padrão em row do Etapa 2.
7. [unit] TL-T9-07 — `CentralDeAvisos`: avisos `tipo:'informativo'` `estado:'pendente'` exibem botão
   "Dispensar" (sem "Aprovar"/"Desfazer" — esses continuam exclusivos de `tipo:'proposta'`).
8. [unit] TL-T9-08 — clicar "Dispensar" num informativo chama `dispensar(id)`.
9. [unit] TL-T9-09 — informativo com `estado:'dispensado'` sai da lista renderizada (sem
   "Desfazer" para este tipo — decisão local, ver abaixo).
10. [integration] TL-T9-10 — footer `AvisoList` ausente do DOM nas duas telas (`getByRole('alert')`
    nulo mesmo com o canal legado `avisos: string[]` populado).
11. [integration] TL-T9-11 — aviso "reconhecido-como-fatura" (useEffect de `App.tsx`) aparece no
    slice como informativo `pendente`, não duplica em re-renders subsequentes do mesmo efeito, e
    não reaparece depois de dispensado pelo usuário (persistência de sessão via checagem de id
    existente antes de despachar).
12. [integration] TL-T9-12 — aviso "dicionário substituído — último vence" aparece no slice como
    informativo dispensável.
13. [integration] TL-T9-13 — aviso "xlsx não reconhecido" aparece no slice como informativo
    dispensável.
14. [integration] TL-T9-14 — aviso "erro ao carregar Modelo.xlsx" aparece no slice como informativo
    dispensável.

Camada: unit+integration, conforme a Decomposição (T9). O 5º aviso legado ("linhas ignoradas no
CSV") já é provado no nível unit/integration de `PipelineState.ts` (itens 4 e 5 acima) — não
duplicado em `App.tsx`, já que o despacho acontece inteiramente dentro de `produzirLancamentos`.

### Red→Green

Confirmado red antes de cada implementação (rodados isoladamente por arquivo, nunca red↔green
misturados no mesmo commit lógico):

- `pipeline.test.ts` (mock de `dominio/deteccoes` sem `detectarPagamentoRecebido`) e
  `pipeline.avisos.integracao.test.ts` (assinatura antiga com `excluidosPendentes`) atualizados
  primeiro, confirmados red pela razão certa (assertion mismatch, não erro de import/sintaxe);
  green após o rewire em `PipelineState.ts` (troca do argumento + import de
  `detectarPagamentoRecebido` + acumulação do `Aviso` informativo de linhas ignoradas com
  `crypto.randomUUID()`).
- `CentralDeAvisos.test.tsx`: teste pré-existente "aviso informativo nunca exibe botões de ação"
  reescrito para o novo contrato (só "Aprovar"/"Desfazer" continuam vetados; "Dispensar" passa a
  ser exibido) — não é enfraquecimento de asserção, é a prova do comportamento revisto pedido pela
  DoD desta task (mesma lógica já usada por T8 ao revisar D11 para valor-pendente). 2 testes novos
  (dispensar chama `dispensar(id)`; dispensado some da lista) confirmados red antes da implementação
  em `CentralDeAvisos.tsx` (botão "Dispensar" nos itens de `informativos`, filtro
  `estado !== 'dispensado'`).
- `App.avisosAcionaveis.test.tsx`: describe antigo "coexistência CentralDeAvisos + AvisoList
  legado (T6)" removido — a premissa (2 canais coexistindo) é exatamente o que D18 revoga; o
  describe novo "canal único... (T9, D18)" cobre sheet-nas-2-telas e footer-ausente. 6 novos testes
  (fatura-aviso dedup/persistência, dic-último-vence, xlsx-não-reconhecido, erro-modelo-xlsx)
  confirmados red antes de tocar `App.tsx` (helper `criarAvisoInformativo` + 4 call-sites +
  restruturação do corpo da Etapa 1 para acomodar `<CentralDeAvisos />` em layout `row`, mesmo
  padrão já usado na Etapa 2).

Suíte completa após o Green: 619/619 verdes (era 612/612 antes desta task — 7 testes novos, mais os
3 já vermelhos herdados de T6/T7 resolvidos pelo rewire). `tsc -b`: limpo.

### Refactor

Reindentação cosmética do bloco JSX da Etapa 1 (corpo movido para dentro do novo wrapper `row`) —
sem mudança de comportamento, suíte re-executada e permanece 619/619 verde após a reindentação.
Nenhuma dívida de redesign identificada além da já registrada abaixo (decisão sobre `AvisoList.tsx`
órfão).

### Verify mecânico

- Suíte completa (`npm test` via `npx vitest run`): 619/619 verdes.
- `tsc -b`: limpo, zero erros.
- Lint: `N/A (declarado)` — `npm run lint` é no-op ("sem linter configurado").
- Cobertura: `N/A (declarado)` — nenhum comando/threshold declarado no `CLAUDE.md`.
- Arquivos tocados ⊆ Áreas tocadas: confirmado via `git status --short` — `src/App.tsx`,
  `src/ui/PipelineState.ts`, `src/ui/components/CentralDeAvisos.tsx` + testes correspondentes
  (`src/__tests__/App.avisosAcionaveis.test.tsx`, `src/ui/__tests__/pipeline.test.ts`,
  `src/ui/__tests__/pipeline.avisos.integracao.test.ts`,
  `src/ui/components/__tests__/CentralDeAvisos.test.tsx`). `src/ui/store/avisosSlice.ts` estava
  autorizado mas não precisou de mudança (as ações `dispensar`/`aplicar`/`desfazer` já eram
  genéricas por `tipo`). `node_modules` (symlink local) não rastreado pelo git.
- Critérios `[unit]` do spec: nenhum dos itens listados na seção "Critérios de verificação" do
  spec pertence diretamente ao escopo de T9 (são sobre `permanece`/`resumo`/inspeção, cobertos por
  T0-T8). Itens `[integration]`/`[e2e]` de escopo de spec inteira permanecem end-of-spec (ADR 0018,
  Decisão 5 — só na última task, T10).
- Test List: todos os 14 itens provados na camada declarada (unit para lógica pura/componente
  isolado, integration para App.tsx com store real e pipeline com parser real).
- Observabilidade: `N/A` — spec/`CLAUDE.md` não declaram stack de observabilidade para este projeto
  100% client-side.
- Nenhuma instrumentação de debug deixada no diff — o Debugging gate não chegou a armar nesta
  iteração (a causa-raiz do rewire já estava documentada com precisão em
  `Docs/debt/tecnica/regressao-integracao-parser-t6-valor-pendente-pagamento-recebido.md`, sem
  necessidade de investigação adicional).

### code-reviewer (Playbook 5)

3 sinais Beck avaliados via sub-agente real, todos `pass`, confiança alta. `loops_without_progress`:
nenhuma entrada prévia de Task T9 no log principal (primeira tentativa); rewire em
`PipelineState.ts:172-181` é mudança comportamental real, documentada como débito explicitamente
atribuído a T9. `unrequested_functionality`: `criarAvisoInformativo` e as 4 chamadas de
`adicionarAvisosAcionaveis` implementam exatamente os 4 avisos legados exigidos pela DoD (itens
12-14 do Test List); `avisosSlice.ts` confirmado ausente do diff, consistente com a alegação de que
as ações genéricas já cobriam `'informativo'`. `test_manipulation`: a asserção alterada em
`pipeline.test.ts` reflete a mudança de assinatura pedida pelo item 1 do Test List (não
enfraquecimento); `pipeline.avisos.integracao.test.ts` e `CentralDeAvisos.test.tsx` foram
fortalecidos (mais asserções), nenhuma assertion removida ou trocada por checagem genérica mais
fraca. Nota do revisor: a raiz de "3 testes ficaram verdes sem edição" é o rewire — item central da
DoD desta task, não manipulação. Nenhum flag; iteração seguiu para `harness-judge`.

### harness-judge (Playbook 6)

3 critérios avaliados via sub-agente real, todos `pass`, confiança alta. `consistencia-arquitetural`:
D18 do ADR (`inspecao-proposta-conciliacao.adr.md:366-386`) respeitada integralmente — sheet nas 2
telas, 5 avisos migrados como informativos dispensáveis, `AvisoList` removido de ambas as telas;
rewire crítico em `PipelineState.ts` correto (`lancamentosComFlags` em vez de `excluidosPendentes`);
zero-retenção global mantida. `escopo-respeitado`: arquivos tocados congruentes com `Áreas tocadas`
declaradas; DoD da spec (linha 278) integralmente satisfeita; todos os 14 itens do Test List
autorizados; nenhuma dependência nova além de `crypto.randomUUID` (nativo). `padrao-de-codigo`: 5/5
sub-camadas `pass` — princípios de design (helper elimina 4 repetições, Rule of Three excedida),
disciplina de teste (Canon TDD, red→green documentado, triangulation, assertions sobre
comportamento observável), tipagem semântica (`Aviso` sempre com os 6 campos, nenhum `any`),
estrutura legível (nomes explícitos, comentários que explicam o "porquê"), ausência de
anti-padrões nominais (sem vibe coding, sem cargo cult, sem teste-contra-implementação). Veredito:
**aprovado**.

### Decisões arquiteturais não-óbvias

- Mecanismo de persistência de dispensa do aviso "reconhecido-como-fatura": em vez de um novo
  campo de controle (`useRef`/flag "já emitido nesta sessão"), a checagem usa o próprio slice como
  fonte de verdade — `useAppStore.getState().avisosAcionaveis.avisos.some((a) => a.id ===
  'fatura-aviso')` antes de despachar. Ref: `src/App.tsx` (useEffect de aviso de fatura, ~linha
  226-238). Motivo: o slice já é a fonte de verdade de "o que existe e em que estado" — reintroduzir
  esse controle em um `useRef` local duplicaria informação e poderia dessincronizar (ex.: se o
  usuário desfizesse a dispensa por algum caminho futuro, o `useRef` não saberia). Efeito colateral
  aceito: a mensagem fica "congelada" na primeira computação (não atualiza mais se `fontesFatura`
  mudar depois que o aviso já existe) — trade-off explícito em troca de nunca duplicar/reaparecer
  após dispensa, que é o requisito explícito da DoD.
- Informativos dispensados somem da lista renderizada em `CentralDeAvisos` (sem "Desfazer" para
  esse tipo). Ref: `src/ui/components/CentralDeAvisos.tsx` (filtro
  `a.tipo === 'informativo' && a.estado !== 'dispensado'`). Motivo: D14 do ADR (desfazer após
  dispensa) é escopo explícito de **propostas** no Contexto da spec; nada no D18 pede undo para
  informativos. Manter os 5 legados sempre visíveis mesmo dispensados adicionaria ruído permanente
  ao sheet sem nenhum caminho de ação — dispensar um informativo é, por natureza, definitivo na
  sessão (ele é só leitura, nunca teve efeito reversível sobre `lancamentos`).
- Canal legado `avisos: string[]` (estado + `addAviso`/`clearAvisos`) mantido intacto em paralelo
  às novas emissões via `adicionarAvisosAcionaveis` — nenhum call-site teve seu `addAviso` removido.
  Ref: `src/App.tsx` (4 call-sites migrados: useEffect de fatura, 2 ramos de `processarArquivos`,
  catch de `handleProduzir`). Motivo: `Docs/debt/tecnica/*` e testes fora de `Áreas tocadas` de T9
  (`App.mesReferencia.test.tsx`, `App.dicionarioUnificado.test.tsx`) fazem asserção direta sobre
  `useAppStore.getState().avisos` (canal legado) para essas mesmas mensagens; removê-lo quebraria
  esses testes, forçando uma expansão de escopo não autorizada por esta task. O Follow-up de D18
  ("avaliar no Encerramento se `avisos: string[]` pode ser removido de vez") já antecipa essa
  duplicação temporária como aceitável até uma decisão humana explícita.

### Pressupostos assumidos

- `crypto.randomUUID()` (Web Crypto API, disponível tanto no Node ≥19 usado pelo Vitest quanto em
  todo navegador moderno) foi assumido disponível no ambiente de execução sem necessidade de
  polyfill — já é usado implicitamente por outras partes do toolchain (Vite/Vitest), mas este é o
  primeiro uso explícito no código de produção do projeto. Risco se errado: navegadores muito
  antigos (não suportados pelo projeto, que já assume ES2020+ via Vite) quebrariam nos 4 call-sites
  que geram ids de aviso informativo com essa função.
- Symlink `node_modules -> /Users/es/Documents/conta_de_gastos/node_modules` recriado neste
  worktree sibling (ausente inicialmente), seguindo o mesmo padrão já documentado nos siblings
  anteriores desta spec (T3b, T4, T8).
- `Docs/debt/tecnica/regressao-integracao-parser-t6-valor-pendente-pagamento-recebido.md` (dívida
  herdada de T6/T7) foi resolvida como efeito colateral do rewire desta task — os 3 testes lá
  listados (2 em `pipeline.avisos.integracao.test.ts`, 1 em `avisos-acionaveis.e2e.test.tsx`) estão
  verdes após esta iteração. Não editei esse arquivo de dívida (fora de `Áreas tocadas` de T9 e
  vive em `Docs/debt/`, fora do git no worktree) — registro aqui para o orquestrador/consolidação
  marcar como resolvido, mesmo padrão já usado por T5 ao resolver a dívida análoga de T2
  (`regressao-e2e-pipeline-valor-pendente-proposta.md`, prefixo "**RESOLVIDO**").

### Escolhas locais

- Helper `criarAvisoInformativo(id, origem, mensagem)` em `src/App.tsx` (não exportado, escopo de
  módulo) em vez de espalhar o literal `Aviso` de 6 campos em cada um dos 4 call-sites. Ref:
  `src/App.tsx` (topo do arquivo, logo após os imports). Valor/alternativa: Rule of Three
  ultrapassada (4 usos) — DRY sem cerimônia, mesma disciplina já usada no projeto (ex.:
  `formatarResumoConciliacao` em `deteccoes.ts`).
- Ids únicos para os avisos "dic-último-vence"/"xlsx-não-reconhecido"/"erro-processar-xlsx"/
  "erro-modelo-xlsx" via `crypto.randomUUID()` (não determinísticos), diferente do id fixo
  `'fatura-aviso'`. Ref: `src/App.tsx` (4 call-sites em `processarArquivos`/`handleProduzir`).
  Valor/alternativa: esses 4 avisos nascem de eventos discretos (clique/upload), nunca de um
  `useEffect` que reroda a cada render — não há risco de duplicação por re-render, então não
  precisam do mecanismo de dedupe por id fixo que o aviso de fatura precisa.
