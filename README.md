# Contas & Gastos

Sistema minimalista para ingestão de extratos bancários e faturas de cartão de crédito, transformando documentos CSV e PDF em uma tabela estruturada de lançamentos.

## Motivação

Organizar finanças pessoais exige um trabalho braçal recorrente: abrir extratos, abrir faturas, copiar lançamento por lançamento e montar uma planilha consolidada. Este projeto joga essa parte para a máquina.

## Visão geral do projeto

O sistema é dividido em 4 etapas:

| Etapa | Descrição | Status |
|-------|-----------|--------|
| I — Ingestão de fontes | Importar PDF/CSV e estruturar lançamentos | Implementada |
| II — Criar Minuta | Copiar modelo do Google Sheets, salvar no Drive, preencher | Pendente |
| III — Dicionário | SQLite com mapeamento nome feio → nome bonito + natureza | Pendente |
| IV — Classificar lançamentos | Usar dicionário para preencher natureza e descrição | Pendente |

## Fontes de entrada

Arquivos colocados em `input/`:

| Fonte | Formato | Exemplo |
|-------|---------|---------|
| Extrato Nubank | CSV | `NU_XXXXXXXX_01MAR2026_31MAR2026.csv` |
| Fatura Nubank (CC) | CSV | `Nubank_2026-03-10.csv` |
| Extrato Itaú | PDF | `extrato-itau_DD_MM_AAAA_HH-MM.pdf` |
| Fatura Itaú (CC) | PDF | `<uuid>.pdf` |

O tipo de cada arquivo é detectado automaticamente pelo conteúdo (header do CSV ou texto do PDF).

## Saída

Um CSV em `output/lancamentos.csv` com 5 colunas, separador `;`, formato numérico brasileiro e encoding UTF-8 BOM:

| Coluna | Descrição |
|--------|-----------|
| `fonte` | Origem do dado (`extrato_itau`, `extrato_nubank`, `fatura_itau_cc_9572`, `fatura_nubank_cc`, etc.) |
| `natureza` | Natureza do lançamento — vazio por enquanto (Etapa IV) |
| `descricao` | Nome bonito — vazio por enquanto (Etapa IV) |
| `valor` | Positivo = entrada, negativo = saída. Formato: `1.234,56` |
| `registro` | Texto cru coletado diretamente do extrato/fatura |

### Ordenação

Os lançamentos são agrupados por fonte (extrato Itaú → extrato Nubank → fatura Itaú CC → fatura Nubank CC) e ordenados por data dentro de cada grupo, da mais antiga para a mais recente.

## Regras de negócio

- Manter a ordem original do extrato dentro de cada grupo
- Pagamento de fatura de CC no extrato bancário é mantido; os lançamentos individuais da fatura são expandidos à parte
- Lançamentos de cartão de crédito são sempre negativos (representam saída)
- Linhas de marcação de saldo no extrato Itaú (`SALDO TOTAL DISPONÍVEL DIA`, `SALDO ANTERIOR`) são ignoradas
- Linha "Pagamento recebido" da fatura Nubank é excluída (já aparece como débito no extrato)
- Cartões Itaú com finais diferentes geram fontes separadas (ex: `fatura_itau_cc_9572`, `fatura_itau_cc_2555`)
- Seção "Compras parceladas - próximas faturas" da fatura Itaú é excluída (são parcelas futuras)

## Como usar

```bash
# Colocar arquivos CSV/PDF em input/
# Executar:
uv run python -m gastos.main

# Resultado em output/lancamentos.csv
```

## Dependências

- Python >= 3.12
- [pdfplumber](https://github.com/jsvine/pdfplumber) — extração de texto de PDFs

Gerenciado exclusivamente com `uv`.
