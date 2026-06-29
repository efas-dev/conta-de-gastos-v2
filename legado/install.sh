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
azul="\033[34m"
negrito="\033[1m"
dim="\033[2m"
reset="\033[0m"

info()  { printf "${verde}✓${reset} %s\n" "$1"; }
aviso() { printf "${amarelo}!${reset} %s\n" "$1"; }
erro()  { printf "${vermelho}✗${reset} %s\n" "$1"; }
passo() { printf "\n${azul}▸${reset} ${negrito}%s${reset}\n" "$1"; }

# ---------------------------------------------------------------------------
# Detectar sistema (Linux nativo, macOS, WSL)
# ---------------------------------------------------------------------------
detectar_os() {
    case "$(uname -s)" in
        Darwin*) echo "mac"; return ;;
        Linux*)
            # WSL expõe "microsoft" em /proc/version
            if grep -qiE "(microsoft|wsl)" /proc/version 2>/dev/null; then
                echo "wsl"
            else
                echo "linux"
            fi
            ;;
        *) echo "desconhecido" ;;
    esac
}

OS=$(detectar_os)

case "$OS" in
    mac)   info "Sistema detectado: macOS" ;;
    linux) info "Sistema detectado: Linux" ;;
    wsl)   info "Sistema detectado: WSL (Windows Subsystem for Linux)" ;;
    *)
        erro "Sistema operacional não suportado. Use Linux, macOS ou WSL."
        exit 1
        ;;
esac

# ---------------------------------------------------------------------------
# Detectar gerenciador de pacotes (para mensagens contextuais)
# ---------------------------------------------------------------------------
detectar_pkg_manager() {
    if command -v apt-get &>/dev/null; then echo "apt"
    elif command -v dnf &>/dev/null; then echo "dnf"
    elif command -v pacman &>/dev/null; then echo "pacman"
    elif command -v zypper &>/dev/null; then echo "zypper"
    elif command -v brew &>/dev/null; then echo "brew"
    else echo "desconhecido"
    fi
}

PKG=$(detectar_pkg_manager)

# Sugere o comando de instalação correto para um pacote do sistema.
sugerir_instalacao() {
    local pacote="$1"
    case "$PKG" in
        apt)     echo "sudo apt-get update && sudo apt-get install -y $pacote" ;;
        dnf)     echo "sudo dnf install -y $pacote" ;;
        pacman)  echo "sudo pacman -S --noconfirm $pacote" ;;
        zypper)  echo "sudo zypper install -y $pacote" ;;
        brew)    echo "brew install $pacote" ;;
        *)       echo "(instale '$pacote' usando o gerenciador de pacotes do seu sistema)" ;;
    esac
}

# ---------------------------------------------------------------------------
# Verificar pré-requisitos básicos (curl é obrigatório p/ baixar uv)
# ---------------------------------------------------------------------------
passo "Verificando pré-requisitos do ambiente"

faltando=()

if ! command -v curl &>/dev/null; then
    faltando+=("curl")
fi

# `ca-certificates` é frequentemente necessário em instalações mínimas de WSL
# para que o curl confie nos certificados HTTPS da astral.sh/github.com.
if [ "$OS" = "wsl" ] || [ "$OS" = "linux" ]; then
    if [ ! -d /etc/ssl/certs ] && [ ! -f /etc/ssl/cert.pem ]; then
        faltando+=("ca-certificates")
    fi
fi

if [ ${#faltando[@]} -gt 0 ]; then
    erro "Pacotes do sistema ausentes: ${faltando[*]}"
    echo ""
    if [ "$OS" = "wsl" ]; then
        echo "  ${negrito}Você está no WSL.${reset} Instalações novas costumam vir mínimas."
        echo "  Rode o comando abaixo dentro do WSL e tente o instalador de novo:"
    else
        echo "  Instale os pacotes ausentes e rode o instalador novamente:"
    fi
    echo ""
    for p in "${faltando[@]}"; do
        echo "    ${dim}\$${reset} $(sugerir_instalacao "$p")"
    done
    echo ""
    exit 1
fi

info "curl encontrado"

# ---------------------------------------------------------------------------
# Python: uv instala e gerencia Python automaticamente, mas avisamos se
# o sistema NÃO tiver nenhum interpretador — assim o usuário entende que
# o download inicial do Python (~30 MB) faz parte do processo.
# ---------------------------------------------------------------------------
if command -v python3 &>/dev/null; then
    versao_python=$(python3 --version 2>&1 | awk '{print $2}')
    info "Python do sistema: $versao_python (uv usará a versão dele se compatível)"
else
    aviso "Nenhum Python instalado no sistema."
    echo "  ${dim}Sem problema — o uv vai baixar e gerenciar o Python 3.12 sozinho.${reset}"
fi

# ---------------------------------------------------------------------------
# Verificar/instalar uv
# ---------------------------------------------------------------------------
passo "Verificando uv"

if command -v uv &>/dev/null; then
    info "uv encontrado: $(uv --version)"
else
    aviso "uv não encontrado. Instalando..."
    if ! curl -LsSf https://astral.sh/uv/install.sh | sh; then
        erro "Falha ao baixar/instalar o uv."
        echo ""
        echo "  Verifique sua conexão e tente novamente, ou instale manualmente:"
        echo "    ${dim}https://docs.astral.sh/uv/getting-started/installation/${reset}"
        exit 1
    fi

    # Adicionar ao PATH da sessão atual
    export PATH="$HOME/.local/bin:$PATH"

    if command -v uv &>/dev/null; then
        info "uv instalado: $(uv --version)"
    else
        erro "uv foi instalado mas não está no PATH desta sessão."
        echo ""
        echo "  Reabra o terminal e rode o instalador novamente, ou execute:"
        echo "    ${dim}\$${reset} export PATH=\"\$HOME/.local/bin:\$PATH\""
        exit 1
    fi
fi

# ---------------------------------------------------------------------------
# Instalar conta-de-gastos
# ---------------------------------------------------------------------------
passo "Instalando $NOME"
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
