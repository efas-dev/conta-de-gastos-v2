# Conta de Gastos

Sistema de linha de comando para organização de finanças pessoais. Ingere extratos bancários e faturas de cartão (PDF/CSV/TXT), classifica lançamentos automaticamente e gera minutas no Google Sheets para revisão.

## Instalação

```bash
curl -sSf https://raw.githubusercontent.com/efas-dev/conta_de_gastos/main/install.sh | bash
```

O script detecta seu ambiente (Linux, macOS ou WSL), verifica os pré-requisitos, instala o [uv](https://docs.astral.sh/uv/) (se necessário) e disponibiliza o comando `cg` no terminal. Você **não precisa** ter Python instalado — o uv baixa e gerencia a versão correta sozinho.

Funciona em **Linux**, **macOS** e **Windows via WSL**.

### Instalando no WSL (Windows)

Se você ainda não tem o WSL, abra o **PowerShell como administrador** e rode:

```powershell
wsl --install
```

Depois reinicie e abra o **Ubuntu** (ou a distro escolhida). Em instalações novas de WSL, geralmente faltam pacotes básicos como `curl`. O instalador detecta isso e mostra exatamente o que rodar. Se preferir já preparar antes:

```bash
sudo apt-get update && sudo apt-get install -y curl ca-certificates
curl -sSf https://raw.githubusercontent.com/efas-dev/conta_de_gastos/main/install.sh | bash
```

Nenhum Python é necessário previamente — o uv cuida disso.

## Primeiros passos

Após instalar, execute `cg` e selecione **Configurar**. O wizard guia você por:

1. **Autenticação Google** — passo a passo para criar credenciais OAuth no Google Cloud Console
2. **Iniciais** — usadas no nome de cada minuta (ex: "2026-04 - AB")
3. **Pasta do Google Drive** — onde as minutas serão salvas
4. **Nome para Pix** — identifica transferências entre suas próprias contas

## Como funciona

```
Extratos/Faturas (PDF, CSV, TXT)
    ↓
cg → Parseia → Classifica → Gera minuta no Google Sheets
                                  ↓
                    Você preenche Natureza e Descrição
                                  ↓
                    cg → Aprende → Dicionário SQLite
                                  ↓
                    Próxima vez classifica automaticamente
```

1. **Arraste** seus arquivos de extrato/fatura para o terminal
2. O sistema **detecta** o tipo automaticamente (Nubank CSV, Itaú PDF, etc.)
3. Uma **minuta** é criada no Google Sheets com todos os lançamentos
4. Você preenche **Natureza** e **Descrição** na planilha
5. O sistema **aprende** e classifica automaticamente nas próximas vezes

## Bancos suportados

| Fonte | Formato |
|-------|---------|
| Extrato Nubank | CSV |
| Fatura Nubank (CC) | CSV |
| Extrato Itaú | PDF, TXT |
| Fatura Itaú (CC) | PDF |

Novos bancos podem ser adicionados implementando um parser.

## Comandos

```bash
cg                 # Abre a interface interativa
cg --uninstall     # Desinstala
```

## Atualização

O sistema verifica automaticamente (1x por dia) se há nova versão disponível. Também é possível verificar manualmente pelo menu **Verificar atualização**.

## Requisitos

- Linux, macOS ou WSL
- `curl` (em WSL/Linux mínimo, o instalador avisa se faltar e mostra como instalar)
- O instalador cuida do resto (uv, Python 3.12+, dependências)
