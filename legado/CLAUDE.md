# CLAUDE.md

## Regras Globais

- **Sempre use `uv`** para gerenciamento de pacotes, execução de scripts Python e qualquer operação relacionada a dependências. Nunca use `pip`, `pip install`, `python -m pip` ou similares diretamente.
- **Nunca execute comandos destrutivos** que possam afetar outros serviços, processos ou dados neste computador. Isso inclui: matar processos de outros serviços, apagar arquivos fora do escopo do projeto, modificar configurações do sistema, parar/reiniciar serviços do sistema (systemctl, docker containers de outros projetos, etc.).

## Arquitetura

O projeto usa arquitetura hexagonal simplificada. A única abstração formal é o **Protocol `Parser`** — todo o resto (SQLite, Sheets, CSV) é concreto.

### Estrutura de módulos

```
src/gastos/
├── modelos.py          # Lancamento (dataclass) — modelo central
├── classificador.py    # Lógica pura: normalizar_chave, classificar, preparar_aprendizado
├── db.py               # SQLite concreto (dicionário, lançamentos, minutas)
├── formatacao.py       # Utilitários puros de formatação BR
├── sheets.py           # Google Sheets/Drive (concreto)
├── config.py           # Carrega .env, constantes
├── configuracao.py     # Configuração do usuário (~/.config/contas-gastos/)
├── wizard.py           # Wizard interativo de configuração
├── atualizacao.py      # Verificação de atualização via GitHub API
├── exportar.py         # Export CSV
├── main.py             # CLI + orquestração
├── tui.py              # Interface terminal interativa (entry point: cg)
└── parsers/
    ├── __init__.py     # Protocol Parser + registro + detectar()
    ├── extrato_nubank.py
    ├── fatura_nubank.py
    ├── extrato_itau.py
    ├── fatura_itau.py
    └── (novos parsers aqui)
```

### Regras de arquitetura

1. **Parsers são o único ponto de extensão.** Para adicionar um novo banco/formato:
   - Crie uma classe em `gastos/parsers/` implementando `aceita(Path) -> bool` e `parsear(Path) -> list[Lancamento]`
   - Registre em `parsers/__init__.py` dentro de `_registrar_builtin()`
   - Zero mudança nos demais módulos

2. **Não abstraia o que é fixo.** SQLite e Sheets são concretos — sem interfaces/ports para eles. Só crie abstrações para pontos que realmente variam.

3. **`classificador.py` é puro.** Funções recebem dados como parâmetro (não acessam banco). O caller (main/tui) busca o dicionário no `db.py` e passa para `classificar()`.

4. **`db.py` é CRUD.** Só persistência, sem lógica de negócio. Normalização e detecção de ambiguidade ficam no `classificador.py`.

## Versionamento

- A versão do projeto fica em `pyproject.toml` no campo `version`.
- **Sempre que uma funcionalidade nova for implementada ou um bug relevante for corrigido**, incremente a versão seguindo SemVer:
  - **patch** (0.1.0 → 0.1.1): correções de bug
  - **minor** (0.1.1 → 0.2.0): funcionalidade nova
  - **major** (0.2.0 → 1.0.0): mudança incompatível
- Ao criar um commit que altera a versão, **crie também uma tag git**: `git tag v0.2.0`
- O sistema de atualização automática (`atualizacao.py`) compara a versão instalada com a última tag do GitHub. Sem tag, o usuário não recebe a atualização.

## Testes

- Rodar testes: `uv run pytest`
- Rodar com verbose: `uv run pytest -v`

### Pirâmide

| Camada | Diretório | O que testa |
|--------|-----------|-------------|
| Unitário | `tests/unit/` | Funções puras, parsers com fixtures CSV |
| Integração | `tests/integration/` | Fluxos com SQLite `:memory:` |

### Regras para testes

- Fixtures de parsers ficam em `tests/fixtures/` (CSVs sintéticos pequenos, PDFs mínimos)
- Testes unitários não acessam banco nem rede
- Novos parsers **devem** ter testes de `aceita()` e `parsear()` com fixture correspondente
- Use `setup_method` para instanciar parsers nos testes
