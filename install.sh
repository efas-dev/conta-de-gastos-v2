#!/usr/bin/env bash
# Instalador do Conta de Gastos (cg)
# Uso: curl -sSf https://raw.githubusercontent.com/efas-dev/conta_de_gastos/main/install.sh | bash
set -euo pipefail

REPO="https://github.com/efas-dev/conta_de_gastos.git"
NOME="gastos"
COMANDO="cg"

# ---------------------------------------------------------------------------
# Cores
# ---------------------------------------------------------------------------
verde="\033[32m"
amarelo="\033[33m"
vermelho="\033[31m"
dim="\033[2m"
reset="\033[0m"

info()  { printf "${verde}✓${reset} %s\n" "$1"; }
aviso() { printf "${amarelo}!${reset} %s\n" "$1"; }
erro()  { printf "${vermelho}✗${reset} %s\n" "$1"; }

# ---------------------------------------------------------------------------
# Detectar sistema
# ---------------------------------------------------------------------------
detectar_os() {
    case "$(uname -s)" in
        Linux*)  echo "linux" ;;
        Darwin*) echo "mac" ;;
        *)       echo "desconhecido" ;;
    esac
}

OS=$(detectar_os)

if [ "$OS" = "desconhecido" ]; then
    erro "Sistema operacional não suportado. Use Linux, macOS ou WSL."
    exit 1
fi

info "Sistema detectado: $OS"

# ---------------------------------------------------------------------------
# Verificar/instalar uv
# ---------------------------------------------------------------------------
if command -v uv &>/dev/null; then
    info "uv encontrado: $(uv --version)"
else
    aviso "uv não encontrado. Instalando..."
    curl -LsSf https://astral.sh/uv/install.sh | sh

    # Adicionar ao PATH da sessão atual
    export PATH="$HOME/.local/bin:$PATH"

    if command -v uv &>/dev/null; then
        info "uv instalado: $(uv --version)"
    else
        erro "Falha ao instalar uv. Instale manualmente: https://docs.astral.sh/uv/getting-started/installation/"
        exit 1
    fi
fi

# ---------------------------------------------------------------------------
# Instalar conta-de-gastos
# ---------------------------------------------------------------------------
echo ""
aviso "Instalando $NOME..."
uv tool install "git+${REPO}"

# ---------------------------------------------------------------------------
# Verificar instalação
# ---------------------------------------------------------------------------
echo ""
if command -v "$COMANDO" &>/dev/null; then
    info "Instalação concluída!"
    echo ""
    printf "  Comandos disponíveis:\n"
    printf "  ${dim}%-30s${reset} %s\n" "$COMANDO" "Abrir a interface"
    printf "  ${dim}%-30s${reset} %s\n" "$COMANDO --uninstall" "Desinstalar"
    echo ""
else
    aviso "$COMANDO instalado, mas não foi encontrado no PATH."
    echo ""
    echo "  Adicione ao seu shell (~/.bashrc, ~/.zshrc, etc.):"
    echo ""
    echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
    echo "  Depois reinicie o terminal ou execute:"
    echo ""
    echo "    source ~/.bashrc"
    echo ""
fi
