# TODO

## Pendentes

### 14. UX: legibilidade de dados colapsados pela largura das colunas → tooltip no hover
Na grid de revisão, dados colapsados/truncados pelo tamanho das colunas (caso típico: a
coluna de transcrição com texto longo) ficam ruins de ler por inteiro. **Abordagem decidida
(2026-07-18): tooltip com o conteúdo completo ao passar o mouse sobre a célula truncada**,
sem prejuízo do redimensionamento de coluna já implementado (drag to resize) — os dois
mecanismos convivem. Vale para qualquer coluna cujo conteúdo não caiba na largura atual,
não só a transcrição.

### 20. Parser fatura Nubank: deixar de fora o valor pendente do mês anterior → **vai para spec**
Na fatura Nubank, o parser (`src/parsers/fatura_nubank.ts`) pode excluir da saída a linha de
valor pendente do mês anterior (saldo/resíduo que a fatura carrega da fatura passada) — ela
não é um gasto do mês de referência e não deve virar lançamento na grid. **Decisão
2026-07-18: não vai como hotfix** — falta o título exato da linha num CSV real (não existe em
`data_sample/`; as faturas do sample foram pagas integralmente, e o legado nunca tratou o
caso). A mecânica é a mesma do filtro "Pagamento recebido" já existente
(`src/parsers/fatura_nubank.ts:92`); quando houver CSV real com a linha (do beta tester,
pseudonimizado), tratar via spec com fixture + aviso de contagem.

**Atualização 2026-07-20 (Captura da spec):** CSV real chegou (`data_sample/pp/Nubank_2026-06-06.csv`,
título literal "Valor pendente do mês anterior") — item em spec junto com o núcleo do módulo de
avisos (item 25) e a conciliação (item 26), sob o princípio "tudo é proposta". Decisão D3 da
Captura: o filtro silencioso de "Pagamento recebido" (`fatura_nubank.ts:92`) **também migra para o
modelo de proposta** — nenhuma exclusão silenciosa permanece no parser.

### 23. Detecção de reembolso: entrada e saída de igual valor em períodos próximos
Funcionalidade que detecta pares de entrada e saída de **igual valor** (sinais opostos) em
**datas próximas** e propõe ao usuário considerá-los reembolso de despesa, anulando os dois
lançamentos (entrada + saída) para simplificar a revisão e não poluir o resultado do mês.
Pontos a decidir na spec: janela de proximidade (dias), se o par pode cruzar fontes
(ex.: saída na fatura, reembolso no extrato), interação com as detecções existentes
(transferência interna e investimento têm precedência?), e a UX da proposta — sugestão
não destrutiva que o usuário confirma (nos moldes das flags/cores já usadas na grid),
nunca anulação automática silenciosa.

### 25. UX: aviso de fatura dispensável com "×", layout estilo macOS
O aviso não bloqueante "reconhecido como fatura" (e os avisos em geral da `AvisoList`) deve
poder ser dispensado com um "×". Estudar layout parecido com o das notificações do macOS:
cartão flutuante compacto, canto da tela, ícone + texto curto, botão de fechar discreto que
aparece no hover, possivelmente auto-recolhimento/empilhamento quando houver vários. Cuidado:
o aviso de fatura hoje é recalculado por `useEffect` a cada mudança de lançamentos/mês
(`src/App.tsx`, prefixo `[fatura-aviso]`) — a dispensa precisa persistir na sessão para o
efeito não recriar o aviso dispensado.

### 26. Algoritmo: conciliar pagamento de fatura no extrato com o total da fatura
Haverá lançamentos rotulados como fatura cujo **somatório** equivale a um pagamento de fatura
que aparece na fonte extrato (ex.: "Pagamento de fatura" no extrato Nubank). Quando o sistema
identificar essa equivalência — tolerando diferença de poucos centavos, **até R$ 0,05** — deve
reconhecer como a mesma saída e **remover da planilha de revisão o lançamento do extrato** que
equivale ao total dos lançamentos de fatura (evita contar a despesa duas vezes: itens da
fatura + débito do pagamento no extrato).

O procedimento gera um **aviso** ao usuário informando que foi efetuado, com opção de
**desfazer** — ou, alternativamente, o aviso propõe e o usuário confirma antes de aplicar
(decidir na spec qual dos dois modos). Depende do **módulo de avisos**, que precisa ser
implementado de forma independente (ver item 25 — dispensa com "×", estilo macOS); avaliar
junto a semântica do item 23 (reembolso), que também anula pares por equivalência de valor.

**Robustez p/ a spec (achado 2026-08-03):** a conciliação hoje só dispara quando `classificarFonte`
(`src/dominio/mes.ts`) marca a fonte como *fatura* — o que exige ao menos uma transação com mês
**anterior** ao mês de referência. Se o mês ref estiver desalinhado, a fatura vira "extrato" e a
proposta **não aparece, em silêncio**. No dev atual a detecção funciona (reproduzida com fatura de
junho + extrato de julho); o "parou de funcionar" reportado é provavelmente esse silêncio por mês
ref. A spec deve: (a) tornar a classificação fatura/extrato mais robusta (ou avisar quando a fatura
não foi reconhecida), e (b) sinalizar quando uma fatura carregada não gerou nenhuma proposta.

### 27. Aviso de transferência própria entre contas pessoais (par de mesmo valor)
Análogo ao item 26: quando há transferência própria entre contas pessoais — mesmo valor
saindo de uma conta do usuário e entrando em outra conta dele (ex.: extratos de dois bancos
carregados juntos) — o sistema deve detectar o par e exibir o **aviso** dando ao usuário a
opção de **revisar e aplicar** o tratamento (anular/neutralizar o par como transferência
própria, sem virar despesa/receita do mês). Usa o mesmo módulo de avisos independente dos
itens 25/26. Relação com o existente: `detectarTransferenciaInterna`
(`src/dominio/transferencia.ts`) hoje marca lançamentos individualmente (flag/cor na grid);
este item acrescenta o **casamento em par por valor** entre fontes distintas e o fluxo de
proposta via aviso.

### 29. Round-trip de saldo: B5 (saldo final) do dicionário vira saldo inicial do próximo mês
O dicionário carregado (xlsx do mês anterior) terá um valor de **saldo final na célula `B5`
da aba `Extrato`**. Ao produzir o mês seguinte, esse valor deve ser preenchido como **saldo
inicial do próximo mês** no arquivo gerado. Envolve: leitor passa a extrair `B5` do xlsx
importado (análogo ao `lerIniciais`/`B2`), e o writer grava o saldo inicial no campo
correspondente do Modelo — confirmar no Modelo qual célula recebe o saldo inicial e se o
contrato de injeção precisa ser estendido (hoje: `B2`, `B3`, corpo `A9:H504`, aba
`Dicionario`).

### 30. Lançamento de rendimentos na tela de revisão (fechar o saldo do mês)
Depois do item 29: opção de lançar **rendimentos** na tela de revisão. O usuário informa como
input os **saldos totais ao final do mês de referência** (o que o banco mostra); o sistema
compara com o saldo calculado do extrato respectivo (saldo inicial + movimentações do mês) e
**calcula o lançamento que faz tudo zerar** — a diferença é o rendimento (ou ajuste), inserido
como lançamento na grid para o usuário revisar antes do export. Decidir na spec: input por
fonte/conta ou global, natureza padrão do lançamento gerado, e comportamento quando a
diferença for negativa.

**Detalhamento de UX (2026-08-03):** a feature é acionada por um **aviso**, que será sempre o
**último aviso de toda a lista**. Ao clicar nesse aviso, ele abre — ali na própria sidebar de
avisos — um **input box** para preencher os valores de saldo inicial da conta bancária e das
aplicações. O sistema detecta os **bancos envolvidos** pela atividade do interessado (de
acordo com os parsers acionados na sessão) e lembra o usuário de incluir os saldos de
aplicações com o nome que cada banco usa: **Nubank → Caixinhas; Inter → Porquinhos;
Itaú → Cofrinhos**.

### 32. Componente visual de jornada do usuário (stepper de etapas)
Componente visual para acompanhamento da jornada do usuário no app — um stepper/indicador de
progresso com as etapas:
0. **Carregar** extratos e faturas em formato `.csv` ou `.txt`;
1. **Classificar** lançamentos (natureza/descrição na grid);
2. **Conciliação de fatura** (pagamento no extrato × total da fatura — item 26);
3. **Conciliação de transferências internas** — conciliar e anular operações que são meras
   transferências entre contas do mesmo titular (par saída/entrada de mesmo valor — item 27);
4. **Conciliação de saldos e rendimentos** (saldo inicial/final + lançamento de rendimentos —
   itens 29/30);
5. **Exportar** e realizar o trabalho de inteligência (análise de receitas e despesas
   pessoais na planilha, ponderando eventuais pontos de otimização, se houver).
Decidir na spec: onde o componente vive (header? barra própria?), como cada etapa é marcada
como concluída (automático pelo estado do app × manual), e o que a etapa final mostra dentro
do app (a análise em si acontece no Excel exportado).

### 33. UX: inspeção visual da proposta de conciliação na grid → **vai para spec**
Tornar a proposta de conciliação (central de avisos, spec avisos-acionaveis) mais intuitiva:
clicar na proposta entra em **modo inspeção** — a grid destaca apenas as linhas envolvidas,
diferenciando **qual linha sai** (o "Pagamento de fatura" do extrato, destaque de remoção) e
**quais ficam** (os itens da fatura, destaque de permanência), com um sumário mostrando a
regra cumprida (somatório da fatura R$ X ↔ pagamento R$ Y, diferença ≤ R$ 0,05). Clicar de
novo, aplicar ou dispensar sai da inspeção. Encaixe já mapeado (2026-07-20): tema novo na
cadeia de `getRowThemeOverride` (`ReviewGrid.tsx:196-256`, precedência acima dos demais
enquanto ativo), estado `avisoEmInspecao` no `avisosSlice`, e expor no `Aviso` o conjunto
"quem fica" (ex.: campo `contexto`/`evidencia` com os ids que permanecem — hoje só o `alvo`
que sai é exposto). Decidir na spec: cores/semiótica dos dois papéis, auto-scroll/filtro para
as linhas envolvidas, se a inspeção vale para o fallback de composição (subconjunto) e para as
demais propostas (valor pendente/pagamento recebido, que também têm "linha que sai").

### 33. Readequação da UI após as implementações do TODO (com mecanismo de jornada)
Depois que os itens recentes do TODO forem implementados (avisos estilo macOS, conciliações,
stepper de jornada — itens 25/26/27/29/30/32), readequar a UI como um todo para acomodá-los
com coerência visual. Envolverá: **otimização do header** (hoje: contador de lançamentos +
aviso de sessão + desfazer/refazer + mês de referência + exportar), da **barra de chips**
(filtros + legenda de cores na mesma barra) e dos **títulos da grid** — abrindo espaço para o
mecanismo de jornada sem poluir a tela. Item guarda-chuva de design: fazer por último, com
uma passada de design consciente (nos moldes do handoff do Claude Design usado na grid).

### 34. Avisos absorvem transferência própria e investimento; desativar "Precisa de atenção"
Duas mudanças casadas na grid de revisão:
1. **Incluir transferências próprias e investimento no campo/seção de avisos** — as detecções
   (`detectarTransferenciaInterna`, `detectarInvestimento`) passam a se manifestar como
   avisos (módulo dos itens 25/26/27), em vez de apenas cor de linha + legenda.
2. **Desativar a funcionalidade "Precisa de atenção"** — não faz mais sentido: com os filter
   chips (para localizar pendências) e a seção de avisos estabelecidos, a marcação de linha
   "Precisa de atenção" ficou redundante. Remover a cor/flag e a entrada correspondente na
   legenda (Swatch em `src/App.tsx`); revisar o que os chips filtram para não perder a
   localização de linhas incompletas.

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

### 36. Popup: replicar classificação para linhas de transcrição idêntica ainda não classificadas — ✅ IMPLEMENTADO (2026-08-04, commit `a331b5a`)
Feito como **popup no rodapé** (não na central de avisos — o `avisosSlice.aplicar` é remove-only;
esta é fill, então ficou separada). `detectarReplicacao` (`src/dominio/replicacao.ts`) casa por
transcrição normalizada, alvos = linhas com Natureza vazia (a partir de 1). Store: `sugestaoReplicacao`
setada no `editarCelula`, `aplicarReplicacao` preenche em massa numa única entrada de histórico
(um Ctrl+Z desfaz tudo), `dispensarReplicacao` limpa. `PopupReplicacao.tsx` no App. Verificado no app
real (BB Rende Fácil → "Aplicar a 13"). 9 testes (TL-REP-1..6 + TLREP-INT-1..3).

Quando o sistema detecta que **muitas linhas com a mesma transcrição** ainda estão **sem
classificação**, oferece um **popup/proposta** sugerindo replicar a classificação (Natureza **e**
Descrição) que o usuário acabou de dar para **todas as demais linhas iguais**. Acelera a revisão de
lançamentos recorrentes (ex.: vários "Pix - Enviado - RAIA DROGASIL SA") sem depender do dicionário
do mês anterior.

Encaixe: gatilho ao classificar uma linha cuja transcrição (normalizada por `normalizarChave`,
`src/dominio/normalizacao.ts`) coincide com N outras ainda sem Natureza/Descrição; aplicar via
`preencherIntervalo`/`editarCelula` do store (as demais linhas iguais recebem a mesma Natureza +
Descrição). Deve ser **proposta acionável** na central de avisos (mesmo modelo dos itens 25/26/27/34),
com **Desfazer**, nunca replicação silenciosa. Relação: é a versão intra-sessão do aprendizado de
dicionário (`aprenderDicionario`) — aqui o "padrão" é a linha que o usuário acabou de preencher.

Decidir na spec: limiar N que dispara o popup (2+? 3+?); casar por transcrição **exata** ou
**normalizada** (sufixo de data removido — recorrência real); replicar só em linhas **vazias** ou
também sobrescrever divergentes (provavelmente só vazias); se dispara a cada classificação ou é
acionável sob demanda; e a UX do card (mostrar a contagem "aplicar a N linhas iguais").

### 35. Aviso: propor remoção dos lançamentos de aplicação e resgate
Novo aviso (módulo dos itens 25/26/27): quando houver lançamentos de **aplicação** e
**resgate** de investimentos, o sistema propõe removê-los da revisão — nessa frente, o que é
relevante são apenas os **saldos inicial e final** e um **lançamento de rendimentos**
calculado por outra feature (itens 29/30). Movimentações de aplicação/resgate são
transferências para dentro/fora de investimento, não receita nem despesa do mês; mantê-las
distorce a análise. Aproveita a detecção existente (`detectarInvestimento`); a remoção é
proposta via aviso com confirmação/desfazer do usuário, nunca automática silenciosa.
Alinhar com o item 34 (investimento migrando para avisos).

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

---

## Rescaldo das entregas (não são itens de produto)

- **Migrar decisões dos agentes** para os ADRs originais (tarefa manual, sem pressa):
  11 em `Docs/specs/grid-ux-filtros.adr-agente.md`, 8 em `Docs/specs/mes-referencia-ui.adr-agente.md`,
  11 em `Docs/specs/dicionario-ponta-a-ponta.adr-agente.md`.
- **CI:** aviso de depreciação do Node 20 nas actions (`checkout@v4`, `setup-node@v4`,
  `upload-artifact@v4`) — subir para v5/v6 quando conveniente. Não bloqueia.
- **Achados de segurança da spec dicionário** (zip bomb no `unzipSync` + `sheetTarget` como
  chave de lookup): **DESCARTADOS como irrelevantes por decisão do usuário (2026-07-18)** —
  arquitetura 100% client-side e stateless; o impacto máximo é o usuário travar a própria aba
  com um arquivo que ele mesmo carregou. Registro em
  `Docs/debt/tecnica/security-spec-20260716-dicionario-ponta-a-ponta.md`.

---

## ✅ Concluídos

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
