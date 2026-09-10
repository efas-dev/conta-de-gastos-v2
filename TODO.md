# TODO

## Pendentes

> **Faxina de 2026-08-16.** Os itens entregues foram removidos daqui e registrados em
> **Concluídos** ("Faxina do TODO"). Cada remoção foi verificada no app rodando (Playwright,
> dados reais de `data_sample/`), não só por leitura de código. O que sobrou abaixo foi
> verificado como **ausente** — não é backlog herdado por inércia.
>
> **Sanitização de 2026-09-10.** Repetida a faxina contra o estado real da `dev` após a spec
> `motor-de-pares` e as ondas 3–5 de hotfixes: saíram daqui os itens **23, 27, 38, 41, 49 e 51**
> (entregues e verificados no app), o **48** (não era item — era o 38) e o **39.1** (já fechado).
> O **47** virou diagnóstico e continua aberto como spec.

### 35. BB Rende Fácil: anular resgates que apenas cobrem débitos da conta
No extrato do Banco do Brasil (`src/parsers/extrato_bb.ts`) as linhas **"BB Rende Fácil"** são o
auto-sweep diário da aplicação automática: quando o dia fecharia negativo, o BB **resgata** da
aplicação para cobrir os débitos (entra na conta corrente); quando sobra, **aplica** o excedente
(sai da conta). Cada dia tende a fechar em zero via essa linha. Hoje o parser materializa essas
linhas como lançamentos comuns (transcrição `BB Rende Fácil - Rende Facil`, fonte `extrato_bb`),
então o resgate infla as **receitas** do mês sem ser renda de verdade.

**Feature:** detectar o par **resgate (Entrada) ↔ débito(s) de igual valor** na própria conta e
**neutralizar o resgate** — ele não é receita, é só a aplicação automática devolvendo dinheiro para
pagar um gasto já lançado. Análogo à detecção de investimento (`detectarInvestimento` em
`src/dominio/investimento.ts`) e ao par por igual valor do reembolso (item 23) e da conciliação
(itens 26/27). Deve ser **proposta acionável** via central de avisos (nunca anulação silenciosa),
no mesmo modelo dos itens 25/26/27/34 — e provavelmente absorvida pela seção de avisos junto com
transferência própria e investimento (item 34).

**Ação do aviso:** ao **clicar no aviso** e aceitar a proposta, as **entradas de resgate**
envolvidas são **apagadas da grid** (deixam de contar como receita), reusando o mesmo mecanismo de
remoção de linha da conciliação (item 26) e do modo inspeção (item 33) — com Desfazer, como os
demais avisos acionáveis.

**Exemplo (FC):** em 01/07 nos samples de `data_sample/bb/`, o crédito
`Transferência recebida - FILIPE CORREIA CARMO` (FC, +1.000) e o `Pix - Enviado` (−1.500) fariam o
dia fechar em −500; o `BB Rende Fácil` resgata exatamente esses **+500** (o que faltou após o
crédito do FC). A proposta identifica esse resgate de 500 como mera cobertura e, ao aceitar, **apaga
a linha do resgate** — mantendo o Pix (gasto real) e o crédito do FC. (Num dia sem crédito do FC,
como 02/07, o resgate bate com o **somatório dos débitos** do dia: −275,00 −16,50 −84,79 = +376,29.)

Decidir na spec: casamento por **débito único** vs **somatório do dia** (nos samples o resgate = soma
dos débitos do dia quando não há outra entrada; quando há transferência recebida, cobre só o
saldo faltante); janela temporal (mesmo dia?); tolerância de centavos; o que fazer com a perna de
**aplicação** (Saída de excedente — também é investimento a neutralizar?); precedência frente às
detecções existentes; e se a natureza do resíduo vira "investimento"/"aplicação" já classificado.

**Atualização de 2026-09-10:** o motor de pares que este item esperava **já existe** —
`encontrarPares` (`src/dominio/pares.ts`), entregue pela spec `motor-de-pares`, com precedência
explícita no registry. Mas este item **não** é caso dele como está: o motor casa 1 perna
positiva ↔ 1 negativa de valor idêntico, e aqui o resgate bate com o **somatório dos débitos do
dia**. Note também que `BB Rende Fácil` está deliberadamente na lista de exclusão do motor
(`PADROES_EXCLUSAO_REEMBOLSO`, `pares.ts:256`), justamente para ele não propor apagar despesa
real. A spec deste item precisa decidir se estende o motor para N-para-1 ou se constrói um
detector próprio por cima dele.

### 36. Transferências internas entre pessoas da mesma casa
Tratar o problema das transferências entre **pessoas da mesma casa** (ex.: casal, família no
mesmo orçamento): funcionam como tirar dinheiro de um bolso e colocar no outro — não são
receita nem despesa do orçamento doméstico e não deviam poluir o resultado do mês. É a
generalização do item 27 (contas do mesmo titular) para o **mesmo domicílio/orçamento**:
provavelmente entra no mesmo fluxo de proposta via aviso (par de mesmo valor entre fontes).
Pontos a decidir na spec: como o sistema sabe quem é "da mesma casa" (lista de nomes
informada pelo usuário? aprendizado pelo dicionário? campo nome já usado no Pix nominal de
`detectarTransferenciaInterna`?), e se a anulação é sempre em par ou aceita lançamento único
(só uma das contas carregada).

**Atualização de 2026-09-10:** com o item 27 entregue, este é o candidato mais direto a reusar o
motor: `encontrarPares` já casa o par entre fontes, e o que falta é só a **política** que decide
que aquele par é "mesma casa" — exatamente o formato das duas políticas que já existem sobre o
motor (`transferencia-interna` e `reembolso`). O trabalho real virou a origem dos nomes da casa,
não o casamento.

### 37. Botão de retorno à tela de importação + stepper persistente na top bar
Incluir um botão que permita **retornar à tela de importação** a partir da revisão. Proposta
visual (print `image.png` na raiz): usar a mesma semântica do **Stepper de 3 passos**
("1 Importar — 2 Revisar — 3 Exportar") que hoje aparece na tela de importação, deixando
esses indicadores **posicionados no mesmo lugar da top bar ao longo de todo o fluxo** — o
passo "Importar" clicável funciona como o retorno. Cuidados: preservar o estado ao voltar
(lançamentos/edições não podem se perder sem confirmação — interação com a flag `sujo` e o
prompt de saída), e alinhar com os itens 22 (upload incremental) e 32/33 (jornada e
readequação da UI — este stepper de telas e o stepper de jornada precisam conversar).

### 39. Navegar até as linhas relevantes (inspeção e incompletos) — achado da faxina 2026-08-16
Hoje o app **aponta** para linhas mas não **leva** até elas.

> **Correção da auditoria de 2026-08-31.** O sintoma 1 abaixo estava **errado**: o auto-scroll
> existe desde a spec `inspecao-proposta-conciliacao` (`ReviewGrid.tsx`, `scrollTo` no efeito de
> inspeção) e tem testes. O que havia era um **bug de âncora** — nas origens que gravam
> `Lancamento.id` no `alvo` (`transferencia-interna`, `investimento`) o id era usado como
> posição e a grid rolava para a linha errada. **Corrigido** (commit `e3dfe6c`, testes
> TL-39a-1..4, verificado no app). **O resíduo também foi fechado em 2026-08-31**: nasceu o botão
> "Ir para a linha" no card em inspeção (`focoInspecao` no slice + `focarInspecao`), porque o card
> é um toggle e re-clicá-lo saía da inspeção em vez de rolar. Testes TL-39b-1..4 e TL-39c-1..3;
> verificado no app (rolei ao topo, cliquei, a grid voltou à linha 45 sem sair da inspeção).

1. ~~**Modo inspeção sem auto-scroll.**~~ Entregue por inteiro — ver a correção acima.
2. **Incompletos sem localizador.** O item 34 alertava: "revisar o que os chips filtram para
   não perder a localização de linhas incompletas". A linha de filterchips foi aposentada
   (2026-08-02, commit `034221f`, que registra `filtroFontes`/só-incompletos ficando "sem UI")
   e o que restou é o contador "X de Y classificados" com `title="N ainda sem natureza"`. Ele
   **informa** quantas faltam; não leva a nenhuma delas. Numa grid de dezenas/centenas de
   linhas isso é caçada visual.

Decidir na spec: auto-scroll ao entrar em inspeção vs. botão "ir para"; navegação
próxima/anterior entre as linhas de um mesmo aviso; e se os incompletos voltam como filtro,
como salto (n/N com setas), ou ambos. Interage com o 32/33 (jornada) — a etapa "Classificar"
só fecha quando não há incompletos.

**Atualização de 2026-09-10:** o item 38 (seleção de linha + menu de contexto), que este item
citava como dependência, foi **entregue** na onda 5 — ver Concluídos. Nota de escopo que nasceu
lá: a linha em branco inserida manualmente, enquanto totalmente vazia, **não** conta como
incompleta (`validarLinha`, `src/dominio/validacao.ts:13`, só cobra natureza de linha com
transcrição ou valor). Ela aparece no filtro de só-incompletos, mas não no contador
"X de Y classificados" — comportamento deliberado, e a spec deste item precisa saber disso ao
definir o critério de "etapa Classificar concluída".

### 40. Bug: colar múltiplas células às vezes buga na grid — **parcialmente entregue**
Ao copiar duas células (ex.: Natureza + Descrição de uma linha) e colar em outra linha, às
vezes o paste de múltiplas células buga — não cola as duas de uma vez / cola errado.

**Entregue em 2026-08-31** (investigação + 4 correções, testes TL-40-1..12): o "às vezes" era o
formato da **seleção no momento do Ctrl+V**. (a) `montarColagem` clampava o destino ao retângulo
selecionado — colar um bloco 1×2 numa seleção de 2 linhas × 1 coluna descartava a Descrição;
agora o destino cresce até caber o bloco, como no Sheets. (b) Linha curta no clipboard (TSV
terminado em quebra, típico do Excel) gerava edição com `undefined`; agora a célula fica intacta.
(c) Colar na coluna **Valor** era descartado em silêncio — o clipboard traz `-R$ 1.083,06` e
`Number()` dava `NaN`; nasceu `interpretarValorMonetario` (pt-BR, moeda e parênteses contábeis),
ligada ao choke point `escreverCampoNoDraft`, que passou a valer também para o fill handle. (d) A
colagem virou **1 mutação única** no undo/redo (`aplicarColagem` no store) — antes um bloco 2×3
exigia 6 Ctrl+Z.

**O que falta:** os defeitos acima foram provados por teste unitário determinístico, mas a
colagem **não foi verificada no app rodando** — o Glide lê `navigator.clipboard.read()` e nem o
`ClipboardEvent` sintético nem o clipboard real do Playwright (trava pedindo permissão) chegam
lá. Falta um teste manual do usuário. Segue em aberto também o suspeito que não dá para tocar
daqui: `navigator.clipboard.read()` sem try/catch dentro do próprio Glide
(`data-editor.js:2215`) — se a leitura falhar, a colagem não acontece e nada é dito.

### 46. Jornada de usuário mais intuitiva — induzir a ordem correta das etapas
O app tem todas as peças, mas não **conduz** o usuário: ele precisa saber por conta própria o
que fazer, em que ordem. A feature é transformar a sequência abaixo — hoje implícita — em
jornada explícita e induzida pela UI (nos moldes do stepper do item 32/37, mas com o conteúdo
real de cada etapa):

1. **Importar os dois grupos de arquivos.** Na primeira tela, induzir o envio tanto do
   **`.xlsx` gerado no mês anterior** (que traz o **saldo final do mês anterior** — `B5`,
   `lerSaldoAnterior` — e o **dicionário** de lançamentos) quanto das **faturas e extratos do
   mês de referência** atual. Hoje o input aceita tudo, mas nada diz ao usuário que o Excel do
   mês passado é parte esperada do fluxo — quem não envia perde saldo inicial e classificação
   automática sem saber. Interage com o item 22 (upload incremental) e o 37 (voltar à
   importação).
2. **Limpeza primeiro.** Na tela de revisão, induzir o usuário a resolver antes de tudo as
   **propostas dos detectores** (registry em `src/dominio/registry.ts`): remover
   aplicações/resgates (`investimento`), conciliar fatura × extrato (`conciliacao`),
   transferência interna (`transferencia-interna`), **reembolso** (`reembolso`, acrescentado
   pela spec `motor-de-pares`) e os casos especiais marcados pelo parser via `origemEspecial`
   (`valor-pendente` e `pagamento-recebido`, `detectarPorOrigemEspecial` em
   `src/dominio/deteccoes.ts:105`) — inclusive o caso do **Nubank**, em que o pagamento da
   fatura vem duplicado pela própria fatura importada e precisa sair. Limpar antes evita
   classificar linhas que vão ser removidas. Note que o registry hoje aplica **precedência
   explícita** entre detectores, então a ordem de resolução já é parcialmente imposta pelo
   domínio, não só pela UI.
3. **Classificar o que sobrou.** Induzir o usuário a zerar os **incompletos** (linha sem
   natureza/descrição): a etapa só fecha quando o contador "X de Y classificados" bate. Depende
   do item 39 (levar até as linhas incompletas, não só contá-las).
4. **Lançamentos finais.** Induzir os dois lançamentos que **não vêm dos arquivos** e são
   digitados pelo usuário: **despesas pagas com VR** (`detectarVR`, `src/dominio/vr.ts`, verbo
   `adicionar` + `FormVR`) e **rendimentos** (`detectarRendimentos`,
   `src/dominio/rendimentos.ts`, form de soma inline que zera a diferença contra o saldo). Hoje
   os dois já são os **últimos avisos** da lista, por decisão de spec — a jornada deve tornar
   essa posição visível como etapa, não como "mais dois cards no fim".
5. **Exportar.** Só então induzir o **export do `.xlsx`**, idealmente com as etapas anteriores
   sinalizadas como concluídas (e um aviso claro quando alguma não estiver).

Decidir na spec: se as etapas viram degraus do stepper (retomando a pergunta das 6 etapas do
item 32) ou seções ordenadas do painel de avisos; se a UI **bloqueia** ou apenas **sinaliza**
etapa fora de ordem (a preferência do projeto tem sido nunca bloquear); qual é o critério de
"etapa concluída" para cada uma; e como a jornada se comporta ao voltar para a importação
(item 37) e ao carregar arquivos novos no meio do caminho (item 22).

---

## Reportados na versão deployada (2026-09-08)

Cinco achados do uso real da versão que estava no ar. **Três foram fechados** nas ondas 3–5 de
hotfixes: o **49** (saldo em `B4`), o **51** (foco na grid) e o **48** (que não era item próprio
— era o 38) — ver Concluídos. Os dois abaixo seguem em aberto, e ambos são spec, não hotfix.

### 47. Bug: fatura Itaú não está conciliando adequadamente — **diagnosticado, vira spec**
Na versão deployada, a conciliação da **fatura Itaú** não funciona como deveria (a do Nubank
foi a validada nas specs).

**Diagnóstico de 2026-09-08 (onda 3): a suspeita inicial estava errada — nada específico do
Itaú está quebrado.** O pipeline foi rodado contra os arquivos reais de `data_sample/`: o
parser lê os 30 lançamentos, `classificarFonte` acerta (`fatura_itau_cc`→fatura,
`extrato_itau`→extrato, `mes.ts:121`), `pagamento-recebido` tira a quitação anterior do
somatório, o upload não confunde a fatura com dicionário, e o parser está na `main`. **Com o
pagamento presente no extrato a conciliação acerta** — provado injetando a linha de −1.443,99,
que gera a proposta correta.

**A causa real é o fallback de subconjunto:** quando o pagamento **não** está no extrato
carregado, `subsetComposicaoIndices` (`deteccoes.ts:203-224`) acha um subconjunto para quase
qualquer valor — com 30 itens de centavos as somas alcançáveis ficam densas. No caso real saem
**14 candidatos espúrios** que **substituem** a mensagem honesta "não encontrei o pagamento
desta fatura" (`deteccoes.ts:368-376` vs `:400-412`). Agrava o ciclo do cartão: a fatura com
vencimento em julho traz compras de junho, mas o pagamento cai no extrato de julho.

É a **dívida do ruído do subset-sum já registrada na spec `conciliacao-robusta`**. Mudar o
critério é decisão de política (limiar, tamanho mínimo do subconjunto, precedência sobre o "sem
casamento") e regride o pagamento parcial que a spec suporta de propósito — **vira spec, não
hotfix**.

*Achado lateral, não corrigido:* `classificarFontePorPrefixo` lança para prefixo fora da
convenção e `orquestrarDeteccao` (`registry.ts:229-260`) não tem try/catch, com
`reproduzirAvisos` rodando **antes** de `setLancamentos` (`handlersPipeline.ts:178` vs `:189`)
— uma fonte fora da convenção derrubaria a importação inteira. Inalcançável hoje (os parsers
usam literais conformantes, a coluna Fonte é somente leitura e a fonte `manual` entrou na
convenção); interessa como robustez do contrato de extensão, que é decisão de produto.

### 50. Dicionário por similaridade em vez de igualdade pura
O dicionário poderia usar um **algoritmo de similaridade** em vez de casamento por semelhança
pura/exata: assim, compras parceladas ("Parcela N de N'", em que só o número muda a cada mês)
seriam reconhecidas nos meses seguintes e classificadas automaticamente. Decidir na spec: a
métrica (normalizar dígitos/parcela antes de comparar? distância de edição? prefixo comum?),
o limiar de aceitação, o que fazer com empates (campo `ambiguo` já existe no dicionário) e
como não regredir os casos que hoje casam exato.

---

## Rescaldo das entregas (não são itens de produto)

- **Migrar decisões dos agentes** para os ADRs originais (tarefa manual, sem pressa):
  11 em `Docs/specs/grid-ux-filtros.adr-agente.md`, 8 em `Docs/specs/mes-referencia-ui.adr-agente.md`,
  11 em `Docs/specs/dicionario-ponta-a-ponta.adr-agente.md`.
- ~~**CI:** depreciação do Node 20 nas actions.~~ **Feito** na onda 4 (commit `7a64bb6`):
  `checkout` e `setup-node` em **v7** (major documentada, tags conferidas na API do GitHub —
  v7.0.1 e v7.0.0), não v5/v6 que já nascem defasadas. O repo não usa `upload-artifact`; usa
  `upload-pages-artifact@v3` e `deploy-pages@v4`, ambas na major corrente.
- **Dívidas técnicas obsoletas:** dos 32 arquivos de `Docs/debt/tecnica/`, **30 estão
  resolvidos** e foram anotados como tal na onda 4 (15 são meta-registros do harness, os demais
  são defeitos já corrigidos — verificados um a um contra o código). Seguem **2 vivos**:
  `candidatos-de-aviso-nunca-renderizados.md` (`Aviso.candidatos` sem leitor na UI) e
  `security-spec-20260824-fatura-itau-xlsx.md` (array denso sem teto em
  `leitorCelulas.ts:128-140`). `Docs/` é git-ignored, então a faxina vive só em disco.
- **Achados de segurança da spec dicionário** (zip bomb no `unzipSync` + `sheetTarget` como
  chave de lookup): **DESCARTADOS como irrelevantes por decisão do usuário (2026-07-18)** —
  arquitetura 100% client-side e stateless; o impacto máximo é o usuário travar a própria aba
  com um arquivo que ele mesmo carregou. Registro em
  `Docs/debt/tecnica/security-spec-20260716-dicionario-ponta-a-ponta.md`.

---

## ✅ Concluídos

### Spec `spec-20260831-motor-de-pares` — itens 23 e 27 (arquivada, mesclada na dev)
Motor de casamento de pares que se anulam. 7 tasks + 2 fixes de fachada; arquivada em
`Docs/specs/`. Nasceu `encontrarPares` (`src/dominio/pares.ts`) como **função pura** que casa
perna positiva ↔ negativa de valor idêntico dentro de uma janela de 7 dias, com duas políticas
por cima decidindo o rótulo.

- **Item 23 — reembolso.** Origem nova `reembolso` no registry (`registry.ts:225`): par de igual
  valor sem sinal de transferência vira proposta de remover as duas linhas, com Desfazer. ✅
- **Item 27 — par da transferência própria.** `detectarTransferenciaInternaAvisos`
  (`src/dominio/transferencia.ts`) deixou de olhar lançamento isolado e passou a consultar
  `encontrarPares`; quando a contrapartida não existe, o card **declara** que não achou, em vez
  de propor no escuro. ✅
- **Infraestrutura que vale para todos:** o registry ganhou **precedência explícita** — proposta
  de remoção cujo alvo já foi reivindicado por um detector anterior é descartada. É o que impede
  o motor de tentar apagar um `Resgate RDB` que o detector de investimento já reivindicou.
- Auto-sweep e aplicação (`BB Rende Fácil`, `RDB`, `CDB`) ficam **fora** do motor por padrão de
  transcrição, com prova e2e de que despesa real nunca é apagada.

### Onda 5 de hotfixes — item 38 completo (2026-09-10, branch `hotfixes-onda-3`)
Fecha o item 38 e, com ele, o 48. Verificado no app com clique direito real, teclado real e
dados de `data_sample/pp/`. A auditoria de 2026-08-31 dizia "não é hotfix, é spec"; a revisão de
2026-09-09 mostrou que **uma das quatro justificativas era falsa** (a tradução índice-visual→real
já existia e era usada em toda edição, `ReviewGrid.tsx:1022`) e que o trabalho pesado —
`excluirLinha` com undo e `reconciliarObsoletos`, mutação que muda a contagem de linhas
(`aplicarSplit`), criação de lançamento com id serial (`atribuirIds`) — já estava pronto.

- **Fonte `manual`** (commit `1453d72`). Decisão do usuário: linha inserida manualmente recebe
  `fonte: 'manual'`. Sem isso, linha em branco faria `classificarFontePorPrefixo` lançar e o
  `catch {}` de `TelaRevisao.tsx` engoliria — matando em silêncio o cross-check de mês.
  Reconhecida por **igualdade exata** (não prefixo): não nomeia família de parsers, e assim
  `manual_*` segue falhando ruidosamente. Entrou em `FONTES_MANUAIS` (`pares.ts`), ficando fora
  do motor de pares como as linhas de formulário. ✅
- **`inserirLinha` no store** (commit `7ddfcae`). Template do `aplicarSplit`; 1 mutação única no
  undo/redo. Decisões: **acima e abaixo** (só "abaixo" impediria criar linha antes da primeira);
  `data` = **1º dia do `mesRef`** (a coluna Data é somente leitura, o valor vai direto para a
  planilha e precisa ser ISO válida; o app fecha mês concluído, então "hoje" pode cair fora). ✅
- **Menu de contexto, atalhos e fiação** (commit `21b9c94`). `onCellContextMenu` com
  `preventDefault`; menu com `role=menu`, primeiro item focado, setas/Home/End, Escape e clique
  fora. Atalhos `Ctrl+-`, `Ctrl++` e `Ctrl+=` com `preventDefault` contra o zoom e guard de
  célula em edição. `role="menu"` entrou em `SELETOR_MODAL` — sem isso a política de foco puxaria
  o foco de volta e o menu fecharia sozinho. ✅
- **Aviso de linha escondida** (commit `fa8788c`, achado da inspeção). Com filtro de natureza
  ativo a linha nasce invisível (não tem natureza), e a ação lia como um clique que não fez nada.
  Em vez de mexer no filtro, o efeito passou a ser **declarado**: aviso informativo dispensável
  nomeando as naturezas filtradas. ✅

### Onda 4 de hotfixes — `Infinity`, 404 do Modelo, flake do zip e a11y (2026-09-09)
- **`Infinity` corrompia o `.xlsx`** (commit `e74994c`). As fronteiras dos forms perguntavam
  `Number.isNaN`, que responde `false` para infinito, enquanto a grid já usava `Number.isFinite`
  (`appStore.ts:377`). `celulaNum` interpola o número cru, então saía `<v>Infinity</v>` — XML
  inválido, arquivo que o Excel recusa. Fechadas as 3 fronteiras + guarda no writer. A dívida
  registrava isto como severidade **baixa**; era corrupção de output. ✅
- **404 no `Modelo.xlsx` virava silêncio** (commit `fb00159`). `fetch` não rejeita em status HTTP
  de erro, então o HTML da página de erro passava por planilha: grid populada, naturezas vazias,
  nenhum aviso. Checagem de `resp.ok` no `try` que já existia. ✅
- **Flake da exportação, causa fechada** (commit `2310577`). Era o `mtime` do ZIP. A medição que
  faltava: duas gerações no mesmo balde de 2 s divergem **0** bytes; **cruzando a fronteira**,
  **2** bytes — o que explica a intermitência e o "pouquíssimos bytes" que fazia a hipótese
  parecer errada. `mtime` fixo resolve (cuidado: `mtime: 0` lança, a faixa DOS é 1980–2099). ✅
- **Foco inicial nos modais e a11y** (commits `9ca0a12`, `7ce2ce7`). SplitModal foca o 1º campo;
  ExportModal foca o container (não um botão — armar o Enter no "Baixar" faria pular o alerta de
  pendentes). `aria-expanded` só nos cards que expandem; `type="button"` no SplitModal. ✅

### Onda 3 de hotfixes — itens 49, 51 e 41 (2026-09-08)
- **Item 49 — saldo inicial em `B4`** (commit `ac4b3cd`). `B4` nunca fez parte do contrato de
  injeção: o saldo era lido, exibido na toolbar e morria ali; o gerado saía em branco e a fórmula
  de `B5` fechava o mês como se o usuário começasse do zero. Confirmado antes de escrever que
  `B4` é célula **livre** e que a fórmula mora em `B5` (`B4+SUM(H9:H1004)`), que segue intocada.
  Verificado no `.xlsx` real gerado pelo app. ✅
- **Item 51 — foco preso na grid** (commits `1d2bc95`, `d6649ab`, `1f9f91f`). Nasceu `focoGrid.ts`
  (política pura sobre o DOM). A **inspeção visual** achou três furos que os testes de unidade não
  pegariam: abrir o modal devolvia o foco à grid e a digitação editava a célula **atrás** dele;
  fechá-lo por clique deixava o foco no `<body>`; e fechá-lo por **Escape** também. A raiz comum
  era olhar *onde o clique caiu* em vez do estado da página depois dele. Duas descobertas que
  valem além do item: o `ExportModal` chama `stopPropagation()` e o React delega na raiz, então
  **listener global de clique aqui tem de ser em captura**; e a decisão espera **dois frames**,
  porque o React só commita o diálogo depois do primeiro. ✅
- **Item 41 — switch da colinha** (commit `4c01403`). `somarPorNatureza` ganhou `iniciaisFiltro`;
  `role="switch"` com rótulo que nomeia as iniciais em uso. Decisões: **default desligado**; o
  filtro do cartão sobre a grid **não** acompanha o recorte; iniciais comparadas de forma
  normalizada (a coluna é digitada à mão); e o switch não é renderizado quando não há iniciais na
  sessão, em vez de virar controle morto. Efeito colateral conhecido: trocar de aba reseta o
  switch. ✅
- **Item 48 — diagnóstico, sem código.** Não era caminho quebrado: `excluirLinha` nunca teve
  chamador de UI em branch nenhum (`git log -S` vazio, `origin/main` idem) e `adicionarLinha` não
  existia. Era **feature ausente, ou seja, o item 38** — entregue na onda 5. ✅

### Onda 2 de hotfixes — itens 14, 39.1 e parte do 40 (2026-08-31)
- **Item 14 — tooltip de célula truncada.** O tooltip valia só para a Transcrição e aparecia
  **sempre**, sem olhar a largura. `derivarTooltipTranscricao` virou `derivarTooltipCelula`, que
  serve qualquer coluna e só dispara quando a largura estimada do texto passa da largura real da
  célula (`bounds.width`, que o Glide já entrega). O predicado reusa a heurística da auto-largura
  de propósito: "a auto-largura coube" e "não há tooltip" viram a mesma afirmação, então o
  tooltip só aparece quando o texto estourou o teto de 320px ou o usuário encolheu a coluna.
  A coluna Valor mostra o formato **desenhado** (`-R$ 10.595,06`), não o número cru. O `drawCell`
  ganhou clipe ao retângulo da célula e um layout **compacto** para quando prefixo e número não
  cabem lado a lado — fecha a dívida `bug-visualizacao-valor-grande-coluna-valor` sem esconder
  dígitos dentro do número. Testes TL-14-1..13; verificado no app (hover na Transcrição longa
  mostra o texto inteiro; Fonte, Data, Iniciais e Valor, que cabem, não mostram nada). ✅
- **Item 39, resíduo do sintoma 1 — botão "Ir para a linha".** Ver o item 39. ✅
- **Item 40 — colagem.** Ver o item 40: quatro defeitos corrigidos, verificação no app pendente. ✅

### Onda 1 de hotfixes — itens 42, 44, 43, 45 e parte do 38/39 (2026-08-31)
Auditoria multiagente do TODO contra o código (6 verificadores + checagem adversarial), seguida
de 4 hotfixes test-first. Verificado no app rodando com `data_sample/` (fatura + extrato Nubank).

- **Item 42 — conciliação da fatura Nubank** (commit `713c44e`). Causa raiz: a fatura deixou de
  descartar `Pagamento recebido`/`Valor pendente` no parse (D16/D17 de
  `inspecao-proposta-conciliacao`), mas `detectarConciliacao` continuou somando a fatura
  inteira. O total ia a R$ 3.394,57 em vez dos R$ 7.083,06 pagos no extrato, o casamento por
  total falhava e o fallback de subset-sum devolvia 17 candidatos — a proposta de remoção virava
  informativo. Agora `entraNoSomatorioDaFatura` exclui essas linhas **por predicado**, sem
  reindexar (os índices são o espaço de `Aviso.permanece`, remapeado pelo registry — reindexar
  removeria a linha errada). Testes TL-42-1..4; no app a proposta "Pagamento desta fatura no
  extrato (R$ 7.083,06)" voltou. ✅
- **Item 44 — mês de referência** (commit `1a13a69`). Dois defeitos: (a) `detectarMesSugerido`
  olhava todos os lançamentos, mas na fatura a data é a da **compra** — decisão do usuário:
  **o extrato é a fonte de verdade**, e a fatura só conta se nenhum extrato foi carregado;
  (b) a autodetecção chamava `onMudarMes`, que marca `usuarioEditouMes=true`, então do segundo
  upload incremental em diante o mês congelava — a sugestão bloqueava a si mesma. Nasceu
  `onSugerirMes`. Testes TL-44-1..7. ✅
- **Item 39, sintoma 1 — âncora do auto-scroll** (commit `e3dfe6c`). Ver a correção registrada no
  próprio item 39: o auto-scroll existia; o bug era o id usado como índice. Testes TL-39a-1..4. ✅
- **Itens 43 e 45, e parte do 38** (commit `ea6c1e5`). `keybindings.search` liga o Ctrl+F nativo
  do Glide (3 resultados navegáveis com ↑↓ no teste real); linha/cabeçalho a 30px com fonte e
  padding recalibrados (22 linhas visíveis contra ~16); `rowMarkers="clickable-number"` faz o
  clique no número selecionar a linha inteira. Sem teste automatizado — as três dependem do
  canvas do Glide, que não roda em jsdom; verificação visual no browser. ✅

**Também corrigido no próprio TODO:** o item 14 estava listado como ausente e já tinha sido
entregue (commit `3a88f18`); o item 39 afirmava que não havia auto-scroll, e havia.

### Faxina do TODO — 10 itens entregues saíram de "Pendentes" (2026-08-16)
Auditoria cruzando cada item pendente com o código e com o **app rodando** (Playwright, dados
reais de `data_sample/pp/` e `data_sample/bb/`). Dos 16 itens listados como pendentes, 10 já
estavam entregues e 2 tinham sido entregues com escopo diferente do escrito.

| item | onde vive hoje | verificação no app |
|---|---|---|
| **20** valor pendente da fatura | detector `valor-pendente` (registry) | proposta "Valor pendente do mês anterior: R$ 3.043,64" |
| **25** avisos dispensáveis | `CentralDeAvisos`, estados `pendente`/`aplicado`/`dispensado`/`obsoleto` | cards com Aplicar/Dispensar |
| **26** conciliação fatura × extrato | `detectarConciliacao` + spec `conciliacao-robusta` (que resolveu o silêncio descrito no próprio item) | proposta "Pagamento desta fatura no extrato (R$ 4.874,05)" |
| **29** B5 → saldo inicial | `lerSaldoAnterior` (`leitor.ts:588`) | topbar "Saldo ant.: R$ 95,70" |
| **30** rendimentos | `detectarRendimentos` + `FormRendimentos` | último aviso da lista, como especificado |
| **32** stepper de jornada | `Cabecalho.tsx` | ver divergência abaixo |
| **33** inspeção da proposta | modo inspeção + realce sai/fica em `ReviewGrid` | linha realçada em `--insp-sai-bg`, card com evidência "Sai: 1 lançamento(s)" |
| **33** readequação da UI | specs `redesign-frontend`, `patches-ui-ux`, `refino-ui-revisao-v2` | topbar, toolbar e painel redesenhados |
| **34** avisos absorvem transf./investimento; matar "Precisa de atenção" | detectores `transferencia-interna` e `investimento` no registry; `Swatch` e realce por categoria removidos | transferência interna aparece como proposta; sem legenda de cores |
| **35** propor remoção de aplicação/resgate | `investimento.ts:139` (`mutacaoProposta: { verbo: 'remover' }`) | — (dataset sem investimento; confirmado no código) |
| **36** replicar classificação | `detectarReplicacao` + `PopupReplicacao` | popup "13 outras linhas iguais a «BB Rende Fácil»… Aplicar a 13" |

**Duas entregas divergem do que o item pedia** — decisões deliberadas de spec, registradas
aqui para não se perderem:

- **Item 32 — stepper com 3 passos, não 6.** O item especificava seis etapas (carregar →
  classificar → conciliar fatura → conciliar transferências → saldos/rendimentos → exportar).
  A spec `redesign-frontend` entregou `PASSOS = ['Importar', 'Revisar', 'Exportar']`. As
  etapas de conciliação viraram avisos na sidebar em vez de degraus do stepper. O item 37
  (novo) mexe justamente neste stepper — vale reabrir a pergunta das 6 etapas lá.
- **Item 25 — sheet lateral, não cartão flutuante macOS.** O item pedia notificações estilo
  macOS (cartão flutuante, canto da tela, empilhamento). A spec
  `inspecao-proposta-conciliacao` aposentou o `AvisoList` e adotou o painel lateral como canal
  único de avisos. A dispensa persiste via `estado`, que era a preocupação funcional do item.

**Numeração:** a seção tinha colisões (dois 33, dois 35, dois 36). Resolveu-se sozinha na
faxina — em cada par, um dos itens era dos entregues. Os que restaram são únicos.

### Hotfix — linha de filterchips aposentada (2026-08-02, commit `034221f`)
- Com os cartões da colinha filtrando por natureza, a linha de chips perdeu o sentido (decisão
  do usuário). `FiltroBar` e `filtroRanking` deletados (−686 linhas); a faixa mantém só a
  legenda de cores + lembrete de zero-retenção. `proximaSelecaoFiltro` migrou para
  `src/ui/selecaoFiltro.ts`. Estado de filtro no store intocado: `filtroNaturezas` alimentado
  pelos cartões; `filtroFontes`/só-incompletos ficam sem UI (default = sem filtro). ✅

### Hotfix — colinha: somatória por natureza + cartão filtra a grid (2026-08-02, commit `5fbe521`)
- Cada cartão da colinha mostra a **soma dos lançamentos** rotulados com a natureza (lida do
  store, atualiza automaticamente); sem lançamento correspondente o número é **omitido** (nunca
  R$ 0,00). Ordem: **RR sempre primeiro**, demais por |soma| decrescente. Clicar num cartão
  **filtra a grid** pela natureza com a mesma semântica dos chips (clique simples
  troca/desliga; Ctrl/Cmd+clique acumula) — lógica unificada em `proximaSelecaoFiltro`.
  Verificado no navegador; testes TLSN-1..5 e TLFN-1..5. ✅

### Hotfix — painel lateral (Avisos/Naturezas) sempre aberto na revisão (2026-08-02, commit `e95de6d`)
- O painel deixa de depender de botão: na revisão é montado incondicionalmente (`null` herdado
  da importação vira a aba padrão "avisos"), os toggles Avisos/Naturezas saíram da toolbar (as
  abas do próprio painel fazem a troca) e o "×" virou prop `fechavel`, mantida só no overlay da
  TelaImportacao. Verificado no navegador; testes ajustados ao novo contrato. ✅

### Parser de extrato do Banco do Brasil (2026-08-02, commit `d1fbfbb`)
- Novo parser `src/parsers/extrato_bb.ts`: CSV separado por vírgula, campos entre aspas, header
  `"Data","Lançamento","Detalhes","N° documento","Valor","Tipo Lançamento"`. Descarta linhas de
  saldo (Tipo vazio: "Saldo Anterior", "Saldo do dia", "S A L D O"), preserva o sinal do valor
  (Entrada + / Saída −) e monta a transcrição `Lançamento - Detalhes`, removendo o prefixo
  `DD/MM HH:MM` do Detalhes (varia por transação e já está na coluna Data — manteria a chave do
  dicionário instável).
- **Encoding:** BB exporta em ISO-8859-1; `File.text()` (UTF-8 fixo) corromperia acentos. Novo
  `src/parsers/decodificar.ts` (`decodificarCsv`: UTF-8 estrito → fallback Windows-1252) ligado no
  `App.tsx` via `lerTextoArquivo` nos 2 pontos de leitura de CSV. Demais bancos (UTF-8/ASCII) intactos.
- DRY: parser de linha CSV quoted extraído para `src/parsers/csv.ts` (compartilhado Nubank + BB).
  Testes TL-BB-01..11 + TL-DEC-01..04. 678 testes verdes; build OK; verificado contra os arquivos
  reais em `data_sample/bb/` (56 e 7 lançamentos, acentos corretos). ✅

### Hotfix — Item 22: upload incremental acumula em vez de substituir (2026-08-02, commit `11b26d2`)
- `processarArquivos` acumula cada lote na lista existente com dedup por nome (último vence);
  seleção só de `.xlsx` não mexe mais na lista de CSVs; lançamentos antecipados seguem a lista
  acumulada e o mês sugerido é recalculado sobre o conjunto inteiro. "Remover" individual
  preservado. Testes TL22-1..5 em `App.uploadIncremental.test.tsx`. ✅

### Hotfix — clique fora da célula em edição salva o texto parcial (2026-08-01, commit `17f22ae`)
- Bug reportado pelo usuário: escrever Natureza/Descrição e clicar em outro lugar da tela
  descartava o texto. Causa: o overlay do Glide commita no click-outside o `tempValue`
  alimentado pela prop `onChange` do editor customizado — que o GhostEditor nunca chamava.
  `GhostEditorCore` ganhou `onTextoAlterado` (cada tecla e sugestão aceita) ligado ao
  `onChange` do Glide no wrapper do ReviewGrid. Verificado no navegador. Testes TLCF-1/2. ✅

### Hotfix — Item 28: Natureza sempre em caixa alta (2026-08-01, commit `b655414`)
- Normalização nos 3 pontos de entrada da grid: `editarCelula` e `preencherIntervalo` no store
  (choke points que cobrem digitação, GhostEditor, colar e fill handle) e
  `enriquecerLancamento` (natureza herdada de dicionário antigo). `aprenderDicionario` compara
  natureza sem diferenciar caixa (não gera falso ambíguo contra dicionários antigos) e grava
  sempre em caixa alta. Descrição e Iniciais seguem aceitando minúsculas. Testes TL28-1..6. ✅

### Spec `spec-20260731-inspecao-proposta-conciliacao` (arquivada, mergeada na dev `914e381`, 2026-08-01)
Fecha os **itens 33, 25 e 20**, e adianta **parte do 32** (canal de propostas). 13 tasks T0–T11 +
emenda pós-inspeção (D16–D18) + hotfixes; 640 testes verdes; build de produção OK.
- **Item 33** — modo inspeção na grid: clicar no card de uma proposta destaca as linhas
  envolvidas (vermelho=sai / verde-menta=fica), auto-scroll, robusto a filtro/ordenação; sumário
  da regra no card. ✅
- **Item 25** — redesign do container de avisos: virou **sheet lateral** no padrão da Colinha
  (botão "Avisos" ao lado do "Colinha", `aside` fixo à direita, badge de pendentes, Desfazer após
  aceite **e** dispensa); footer `AvisoList` aposentado; canal único nas 2 telas (D18). ✅
- **Item 20** — valor pendente do mês anterior **e** pagamento recebido deixaram de ser excluídos
  no parser: entram na grid como lançamento + **proposta de remoção** acionável (D16/D17, reverteu
  D10/D11); nasceu `detectarPagamentoRecebido`. ✅
- **Parte do item 32** — as exclusões silenciosas viraram propostas via aviso (jornada); o stepper
  visual em si segue pendente.
- Aula Feynman em `Docs/debt/cognitiva/inspecao-proposta-conciliacao.md`; 10 decisões A1–A10 no
  adr-agente a migrar. **Deploy:** via PR dev→main (a fazer pelo usuário).

### Hotfix — Item 21: feedback visual de drag-over em toda a tela (2026-07-20, commits `f6ecfe3` + `87d862e`)
- Estado `arrastando` em `App.tsx`: liga em `dragEnter`, desliga em `dragLeave`/`drop`, com
  **contador de profundidade** para não piscar ao atravessar filhos (dragEnter/dragLeave
  disparam por elemento). Revisão do usuário na 1ª versão (realce só no dropzone): os handlers
  subiram para o container da **tela de importação inteira** — soltar funciona em qualquer
  ponto, com overlay de tela cheia (fundo esmaecido, moldura tracejada verde, ícone branco e
  "Solte os arquivos aqui"). Testes TL21-1..5 em `App.dragdrop.test.tsx`. ✅

### Hotfix — Item 24: dicionário não aprende entradas vazias (2026-07-20, commit `bff469c`)
- `aprenderDicionario` ignora lançamento com Natureza **ou** Descrição vazia (não cria entrada,
  não incrementa `vezes`, não marca ambíguo) e **filtra do retorno** entradas herdadas já
  incompletas — como o export grava o resultado do aprendizado, o round-trip deixa de re-gravar
  lixo de dicionários antigos sem mexer no writer. Regra centralizada em `classificacaoCompleta`
  (ambas preenchidas, com trim). Testes TL24-1/2/3/4. ✅

### Item 31: Enter em célula selecionada abre a edição — **já funcionava, sem código** (2026-07-20)
- Verificado no app real (dev server + Chrome DevTools): Enter em célula selecionada **já abre**
  a edição com o conteúdo existente preservado (GhostEditor nas colunas de texto e editor
  numérico na coluna Valor), e Enter dentro da edição confirma e desce — é o keybinding
  `activateCell` nativo do Glide (default `Enter`/`Espaço`, sempre ativo). O item foi escrito
  quando o bug do `editorContextRef` defasado impedia o editor de abrir por esse caminho; o fix
  de 2026-07-15 em `onGridSelectionChange` (ReviewGrid) destravou o comportamento. ✅

### Spec `spec-20260718-colinha-naturezas` (arquivada, merge `43ec717`, 2026-07-18)
- **Item 15** — colinha de naturezas: painel lateral colapsável ("Colinha" na barra de ações,
  fechado por padrão) com sigla + nome + descrição das naturezas; `lerNaturezas` evoluída para
  `NaturezaRica[]` (colunas A/B/F da aba `Naturezas`), campo `naturezasRicas` no store
  (`naturezasValidas` intocado). Regra: só naturezas com descrição na coluna F aparecem
  (hoje 15); sem nenhuma, o botão some. Descrições escritas pelo usuário direto no Modelo
  (raiz + `public/` sincronizados). Teste de integração fixa "exatamente 15" como alarme de
  drift — atualizar ao preencher mais F. 462 testes verdes. 8 decisões A1–A8 no adr-agente
  a migrar. ✅

### Item 18: fórmulas de totais na linha dos títulos da Tabela1 (2026-07-18)
- Mexida manual no Modelo feita pelo usuário (fórmulas em `J8`/`M8`, linha dos títulos;
  re-salvo com a aba Extrato ativa — cumpre também a opção 1 do item 19). Parte da app:
  contrato de injeção validado no novo Modelo (Tabela1 `A8:H504`, `B2` s=40, `B3` s=45,
  `calcPr` presente, A:H sem fórmulas no corpo) e `public/Modelo.xlsx` + fixture de testes
  sincronizados (sem drift). O re-save exigiu 2 robustecimentos no writer: B3 por regex
  (célula veio vazia em vez de shared string) e `activeTab="0"` inserido quando ausente.
  435 testes verdes. ✅

### Hotfix — Item 19: exportado abre na aba Extrato (2026-07-18)
- Opção 2 implementada: o writer força `activeTab="0"` no `workbook.xml`
  (`forcarAbaExtratoAtiva`) e move o `tabSelected="1"` de sheet2 (Dicionario, herdado do
  Modelo salvo com a aba errada ativa) para sheet1 (Extrato) via `definirTabSelected` —
  robusto contra futuros re-saves do Modelo. As 3 partes já estavam entre as 4 que a injeção
  cirúrgica modifica. Teste no `gerador.test.ts`; 435 testes verdes. Obs.: o Modelo em si
  ainda abre na Dicionario se aberto direto (opção 1 — re-salvar — segue opcional/manual). ✅

### Item 12: favicon (2026-07-18)
- `public/favicon.svg` reproduz o logo do header (quadrado verde `#5e7c63` arredondado com as
  3 linhas do `IconeMenu`), referenciado no `index.html` via
  `<link rel="icon" type="image/svg+xml">`; o Vite reescreve o href com o base do GitHub
  Pages no build. ✅

### Hotfix — Item 13: drag-and-drop na tela de importação (2026-07-18)
- Causa raiz: **não era regressão da spec dicionário** — o dropzone nunca teve handlers
  `onDragOver`/`onDrop`; o drop funcionava só pelo comportamento nativo do
  `<input type="file">` visível e se perdeu no redesign visual (`ac2000c`), que escondeu o
  input (`display: none`) sem implementar drop. Correção: `processarArquivos(File[])`
  extraída de `handleUploadChange` e compartilhada com `handleDrop`; `onDragOver` com
  `preventDefault` no label. Testes TL13-1/2/3 em `App.dragdrop.test.tsx` (csv → lista,
  xlsx → detecção de dicionário, preventDefault do dragover). 434 testes verdes. ✅

### Hotfix — Item 16: dicionário importado não populava a grid (2026-07-18)
- Causa raiz: `handleProduzir` passava `dicBytes = null` a `produzirLancamentos` (função pura,
  nunca leu o store) e ainda gravava o `[]` de volta via `setDic`, apagando o dicionário do
  upload. Correção: `produzirLancamentos` agora recebe `dicEntries: DicEntry[]` do store
  (leitura de bytes ficou no upload e na fachada `executarPipeline`); `handleProduzir` não
  sobrescreve mais o store. Teste TL16-1 cobre o call-site; contrato coberto em
  `pipeline.test.ts`. Revisão registrada na Decisão A9 de
  `Docs/specs/dicionario-ponta-a-ponta.adr-agente.md`. 431 testes verdes. ✅

### Hotfix — Item 17: dedup do parser extrato Nubank (2026-07-18)
- Dedup deixou de ser por `Identificador` sozinho e passou a ser pela **linha inteira**
  (`data|valor|id|descrição`): o "Pix no Crédito" traz 2 pernas legítimas com o mesmo id e
  ambas agora são materializadas. Teste TL-17 com a fixture pseudonimizada do beta tester;
  TL-10 reescrito para a nova semântica. Revisão registrada na decisão A7 de
  `Docs/specs/mvp-vertical-nubank.adr-agente.md`. 430 testes verdes. ✅

### Spec `spec-20260716-dicionario-ponta-a-ponta` (arquivada, deploy 2026-07-18)
- **Item 2** — dicionário pelo mesmo input box: input único `accept=".csv,.txt,.xlsx"`,
  detecção por conteúdo (`ehDicionario` verifica a aba `Dicionario`), input dedicado removido,
  `.xlsx` não reconhecido gera aviso; múltiplos dicionários → último vence + aviso. ✅
- **Item 3** — iniciais detectadas do dicionário: `lerIniciais` lê o campo estático `B2` da
  aba `Extrato` e preenche o formulário, salvo edição manual na sessão. ✅
- **Item 6** — app escreve o cabeçalho da aba Dicionario: 7 títulos amigáveis
  (`Chave, Fonte, Natureza, Descrição, Iniciais, Vezes, Ambíguo`); decisão pendente resolvida
  por "amigáveis + leitor normaliza acentos/caixa (NFD)". ✅
- **Item 11** — round-trip de `vezes`/`ambiguo`: writer grava F/G, teste E2E prova
  `vezes 3 → 4` após export→import→aprendizado. ✅
- 429 testes verdes. Aula Feynman em `Docs/debt/cognitiva/dicionario-ponta-a-ponta.md`.

### Spec `spec-20260713-mes-referencia-ui` (arquivada, merge 2026-07-16)
- **Item 7** — campo de mês de referência (dois selects, nunca vazio, default = mês anterior),
  detecção antecipada no upload (mês mais recente < corrente; manual prevalece), alerta de
  fatura não bloqueante e rótulos "fatura"/"extrato" por fonte; placeholder `'TODO-mes'`
  eliminado. ✅ (o "resíduo do item 7" do TODO antigo — alerta de fatura — entrou no escopo)
- Bônus: fix do drift `public/Modelo.xlsx` (pré-483f420) que fazia o Excel reparar o gerado. ✅
- Aula Feynman em `Docs/debt/cognitiva/mes-referencia-ui.md`.

### Spec `spec-20260713-grid-ux-filtros` (arquivada, merge `64bd2ec`, 2026-07-15)
- **Item 1** — fill handle (`onFillPattern` + `preencherIntervalo`; sob filtro, só linhas visíveis). ✅
- **Item 5** — auto-largura das colunas (debounce 300 ms, teto 320 px, medição contábil no Valor). ✅
- **Item 10** — filtros por chips + ordenação por clique no cabeçalho (asc→desc→sem, ↑/↓). ✅
- Extras: Tab em zigue-zague, GhostEditor por digitação direta, export invariante a filtro/ordenação.

### Spec `spec-20260713-injecao-xlsx-mes-referencia` (arquivada, merge `1f6e0d3`)
- **Item 4** — formatação condicional preservada (`F9:F504`, `COUNTA($A9:$E9,$G9:$H9)`). ✅
- Novo contrato de injeção: corpo `A9:H504`, `B3` = mês, coluna `Ref.` por linha, zonas intocáveis. ✅

### Itens do Modelo (manuais, sem ação da app)
- **Item 8** — campo `B3` no Modelo ✅; escrita pela app ✅; coleta na UI ✅ (mes-referencia-ui).
- **Item 9** — visualização de "caixas" (colunas `Q`/`AA`) no Modelo ✅; app não as toca. ✅
