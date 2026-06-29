# Migração para Google Apps Script — Especificação

Spec do ambiente Google Sheets que substituirá o CLI Python atual, e o plano de migração.

---

## 1. Visão geral

Toda a funcionalidade vai morar em uma **planilha gestora** com Apps Script bound. O usuário interage exclusivamente por essa planilha (desktop ou mobile). Não há instalação local, não há add-on, não há CLI.

### Princípios

- **Atômico**: tudo no script da planilha gestora. Sem add-on instalável.
- **Sem PDF**: apenas `.csv` e `.txt`. Fatura Itaú em PDF não é suportada nesta versão.
- **Sem histórico de lançamentos**: o estado persistente é só o dicionário e a lista de minutas. Lançamentos são efêmeros (existem na planilha-minuta enquanto está em rascunho).
- **Upload via modal**: usuário envia arquivos diretamente pelo modal, não via pasta inbox.
- **Botões desenhados**: ações partem de imagens/desenhos inseridos na planilha com script atribuído, não de menu `onOpen`.

---

## 2. Planilha gestora — estrutura

### Abas

| Aba | Visibilidade | Colunas |
|---|---|---|
| `Minutas` | visível | `mes_ref` \| `url` \| `criada_em` \| `aprendida_em` \| `status` |
| `_config` | visível | `chave` \| `valor` |
| `_ambiguos` | visível | `chave` \| `fonte` \| `classificacoes_conflitantes` |
| `_dicionario` | oculta | `chave` \| `fonte` \| `natureza` \| `descricao` \| `ambiguo` \| `contagem` |

### Chaves de `_config`

| chave | exemplo | uso |
|---|---|---|
| `nome_usuario` | `Eduardo` | substituição em padrões de transcrição interna |
| `pasta_drive_id` | `1abc...` | pasta raiz onde minutas são salvas |
| `template_id` | `1dMHpWV1ugw6V2tEO4oGNyF_-nttg6T7uv2ZJ5tFnMSE` | ID do template de minuta |

### Botões desenhados

Dois desenhos inseridos na aba `Minutas` (Inserir → Desenho), cada um com função atribuída:

- **Gerar nova minuta** → `abrirModalGerar()`
- **Aprender minuta** → `abrirModalAprender()`

Posicionar acima da tabela de minutas. Sem menu `onOpen` para essas ações.

---

## 3. Pasta no Drive

Configurada via `pasta_drive_id` em `_config`:

```
pasta_raiz/
└── minutas/
    └── AAAA-MM/   ← planilhas geradas, organizadas por mês de referência
```

A planilha gestora pode ficar fora dessa pasta (mas geralmente é conveniente ficar na raiz dela). Sem backup JSON do dicionário — o próprio histórico de revisões do Google Sheets já protege a aba `_dicionario`.

---

## 4. Fluxos

### 4.1 Gerar nova minuta

Disparado por clique no botão "Gerar nova minuta".

1. Modal HTML abre com:
   - Campo "mês de referência" (default: mês anterior, formato `AAAA-MM`)
   - Input `<input type="file" accept=".csv,.txt" multiple>`
   - Botão **Processar**
2. Validação no cliente: rejeita arquivos com extensão ≠ `.csv`/`.txt`.
3. Cliente lê cada arquivo com `FileReader.readAsText(file, 'utf-8')` e envia `{nome, conteudo}[]` ao backend via `google.script.run`.
4. Backend:
   - Para cada arquivo, percorre o registro de parsers, encontra o primeiro cujo `aceita(nome, conteudo)` retorna `true`. Erro se nenhum aceitar.
   - Concatena lançamentos.
   - Carrega `_dicionario` como `Map<"chave|fonte", entry>`.
   - Aplica `classificar()` — preenche `natureza`/`descricao` quando chave não é ambígua.
   - `DriveApp.getFileById(template_id).makeCopy(nome, pasta_minutas_do_mes)`. Cria a subpasta `AAAA-MM` se não existir.
   - Abre a cópia com `SpreadsheetApp.openById()` e preenche a partir de A5:
     - Agrupa por `fonte`, linha em branco entre blocos.
     - Linhas com `interno=true` recebem `setFontColor('#cc0000')`.
   - Insere linha em `Minutas`: `mes_ref | url | now | "" | "rascunho"`.
   - Retorna URL ao cliente.
5. Modal mostra link clicável e fecha.

### 4.2 Aprender minuta

Disparado por clique no botão "Aprender minuta".

1. Modal HTML abre com:
   - Dropdown listando linhas de `Minutas` onde `status = "rascunho"` (mais recente primeiro)
   - Checkbox obrigatório: **"Confirmo que a revisão da planilha está concluída e salva"**
   - Botão **Aprender**
2. Backend:
   - `SpreadsheetApp.flush()`.
   - Abre a planilha-minuta selecionada, lê `A5:F500`.
   - Valida cada linha:
     - Linha vazia → separador entre blocos, ignora.
     - Fonte desconhecida → adiciona à lista de "puladas" (avisa no final, não bloqueia).
     - Data ou valor inválido → lista de "inválidas" (bloqueia; mostra todas e aborta).
   - Para cada lançamento válido com `natureza` ou `descricao` preenchidos:
     - Calcula `chave = normalizar_chave(registro)`.
     - Procura em `_dicionario` por `(chave, fonte)`.
     - Se não existe: insere.
     - Se existe com mesma classificação: incrementa `contagem`.
     - Se existe com classificação diferente: marca `ambiguo = 1` e registra em `_ambiguos`.
   - Atualiza linha em `Minutas`: `aprendida_em = now`, `status = "aprendida"`.
   - Retorna resumo `{salvos, atualizados, ambiguos, puladas, invalidas}`.
3. Modal exibe o resumo.

### 4.3 Resolver ambiguidade (V2, opcional)

Por ora, o usuário resolve manualmente: vai na aba `_ambiguos`, decide qual classificação é a correta, edita a linha em `_dicionario` (mostrar a aba temporariamente) e remove a entrada de `_ambiguos`. Suficiente para a V1.

---

## 5. Parsers

Mantida a mesma arquitetura: contrato simples e registro lista. Em JS:

```js
// Cada parser:
{
  aceita(nome, conteudo) { return boolean },
  parsear(nome, conteudo) { return Lancamento[] }
}
```

`detectar(nome, conteudo)` percorre o registro e retorna o primeiro que aceita.

### Parsers a portar (V1)

| Parser | Fonte | Detecção |
|---|---|---|
| `ExtratoNubank` | `extrato_nubank` | `.csv` com header contendo `Identificador` e `Descrição` |
| `FaturaNubank` | `fatura_nubank_cc` | `.csv` com header `date,title,amount` |
| `ExtratoItau` | `extrato_itau` | `.csv` Itaú — confirmar header/encoding na implementação |
| `ExtratoItauTxt` | `extrato_itau` | `.txt` com formato fixo Itaú |

### Não portados (V1)

- `FaturaItau` (PDF) — descartado. Usuário precisa exportar fatura como CSV/OFX (verificar se Itaú oferece) ou aceitar não rastrear faturas Itaú no novo sistema.

---

## 6. Módulos do código GAS

Sugestão de organização em arquivos `.gs`:

| Arquivo | Equivalente Python | Conteúdo |
|---|---|---|
| `Modelos.gs` | `modelos.py` | factory de `Lancamento`, regex de transcrição interna |
| `Classificador.gs` | `classificador.py` | `normalizarChave`, `classificar`, `prepararAprendizado` |
| `Formatacao.gs` | `formatacao.py` | `parseBrasileiro` |
| `Dicionario.gs` | parte do `db.py` | CRUD da aba `_dicionario`, marcação de ambíguos |
| `Minutas.gs` | parte do `db.py` + `sheets.py` | criar/listar/atualizar entradas em `Minutas`; copiar template, preencher, ler |
| `Config.gs` | `config.py` + `configuracao.py` | leitura de `_config` como Map |
| `Parsers.gs` | `parsers/__init__.py` | registro + `detectar` |
| `ParserNubank.gs` | `parsers/extrato_nubank.py` + `fatura_nubank.py` | |
| `ParserItau.gs` | `parsers/extrato_itau.py` + `extrato_itau_txt.py` | |
| `Acoes.gs` | `main.py` | `abrirModalGerar`, `abrirModalAprender`, `processarUpload`, `aprenderMinuta` |
| `modalGerar.html` | — | HTML do modal de upload |
| `modalAprender.html` | — | HTML do modal de aprendizado |

Estimativa total: **~400-500 linhas JS** + 2 arquivos HTML curtos. Hoje são 2892 linhas Python.

---

## 7. Pontos de atenção

### 7.1 Encoding de CSV
Itaú às vezes exporta CSV em `latin-1`/`windows-1252`. O cliente lê como UTF-8 por padrão. Se aparecer caractere corrompido, tentar fallback: ler como `ArrayBuffer`, detectar BOM, decodificar com `TextDecoder('windows-1252')` se UTF-8 falhar. Implementar quando for problema real.

### 7.2 Múltiplos cartões na fatura
O parser PDF atual diferenciava `fatura_itau_cc_1234` por cartão. Sem PDF, isso desaparece. Se o CSV do Nubank tiver múltiplos cartões na mesma fatura, decidir se separar por cartão ou agrupar tudo em `fatura_nubank_cc`. Hoje agrupa — manter.

### 7.3 Flush antes de ler
Em "Aprender minuta", chamar `SpreadsheetApp.flush()` antes de ler a planilha-minuta para garantir que edições recentes do usuário foram persistidas.

### 7.4 Limite de 6 minutos
Folgado para um mês típico (centenas de lançamentos). Não otimizar prematuramente.

### 7.5 Permissões
Primeira execução pede autorização a:
- `SpreadsheetApp` (planilha gestora + minutas)
- `DriveApp` (copiar template, criar pastas)
- `Ui.showModalDialog` (modais HTML)

Tudo solicitado de uma vez no primeiro clique de botão.

---

## 8. Plano de migração

### Fase 0 — preparação
- Criar planilha gestora vazia no Drive do usuário.
- Criar projeto Apps Script bound (Extensões → Apps Script).
- Configurar `clasp` localmente em `./gas/` para versionar os `.gs` no próprio repo (opcional mas recomendado).
- Migrar conteúdo do `_dicionario` atual: exportar SQLite local para CSV (`sqlite3 gastos.db -csv "SELECT chave,fonte,natureza,descricao,ambiguo,contagem FROM dicionario"`) e colar na aba `_dicionario`.

### Fase 1 — MVP Nubank
Escopo: extrato Nubank + fatura Nubank, fluxo gerar + aprender.

1. `Config.gs`, `Modelos.gs`, `Formatacao.gs`, `Classificador.gs` (portes diretos).
2. `Parsers.gs` + `ParserNubank.gs`.
3. `Dicionario.gs` + `Minutas.gs` mínimos.
4. `Acoes.gs` com `abrirModalGerar`/`abrirModalAprender` + 2 HTMLs.
5. Inserir dois desenhos na aba `Minutas` e atribuir scripts.
6. Teste end-to-end com um mês real.

### Fase 2 — Itaú
1. `ParserItau.gs` (CSV e TXT).
2. Validar encoding com extratos reais.
3. Decidir destino de faturas Itaú PDF (exportar como OFX/CSV se disponível, ou aceitar perda).

### Fase 3 — polimento
- Aba `_ambiguos` com formatação condicional (destacar conflitos).
- Resumo amigável nos modais (lista de "puladas" com sugestão de fonte parecida — `get_close_matches` em JS é trivial via Levenshtein).
- Documentação curta no README da planilha gestora.

### Fase 4 — descomissionamento do CLI Python
Quando o GAS estiver em uso há ~2 meses sem regressão:
- Marcar repo Python como "legado" no README.
- Manter código para referência (alguém pode reaproveitar parsers).
- Não remover, não publicar nova versão.

---

## 9. O que fica de fora

Funcionalidades do sistema atual que **não** serão portadas:

- `atualizacao.py` (verificação de update via GitHub) — irrelevante no GAS.
- `wizard.py` (configuração inicial) — substituído pela aba `_config`.
- `tui.py` (Textual) — substituído pelos modais.
- `backup_sqlite_para_drive` — histórico do Sheets já protege.
- `restaurar_sqlite_do_drive` — idem.
- `exportar.py` (CSV) — usar Arquivo → Download → CSV nativo do Sheets.
- `FaturaItau` (PDF) — descartado.

---

## 10. Decisões em aberto

1. **Faturas Itaú**: o Itaú oferece OFX/CSV da fatura no app? Se sim, escrever parser. Se não, aceitar que faturas Itaú não entram no sistema novo.
2. **`clasp` versus copy-paste**: versionar o `.gs` no repo via `clasp` exige um pouco de setup mas dá review, diff e rollback. Recomendado.
3. **Convivência**: o sistema atual continua funcionando durante a migração. Decidir quando "virar a chave" (ex.: a partir do mês X só usar o novo).
