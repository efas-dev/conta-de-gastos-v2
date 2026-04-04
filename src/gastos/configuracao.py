"""Serviço de configuração do usuário.

Persiste dados em ~/.config/contas-gastos/:
- config.json   — iniciais, nome_usuario, pasta_destino_id
- credentials.json — credenciais OAuth (gerado ou copiado)
- token.json    — token OAuth salvo após autenticação
"""

import json
import re
import shutil
from pathlib import Path

from gastos.config import get_env

_CONFIG_DIR = Path.home() / ".config" / "contas-gastos"


def _config_dir() -> Path:
    """Retorna (e cria se necessário) o diretório de configuração."""
    _CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    return _CONFIG_DIR


def _config_path() -> Path:
    return _config_dir() / "config.json"


def _carregar_config() -> dict:
    """Carrega config.json. Retorna {} se não existir."""
    path = _config_path()
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _salvar_config(dados: dict) -> None:
    """Salva config.json (merge com dados existentes)."""
    config = _carregar_config()
    config.update(dados)
    _config_path().write_text(
        json.dumps(config, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# Acessores
# ---------------------------------------------------------------------------

def obter_iniciais() -> str:
    """Retorna iniciais do usuário (ex: 'ES'). Fallback: 'XX'."""
    config = _carregar_config()
    return config.get("iniciais", "XX")


def obter_nome_usuario() -> str | None:
    """Retorna nome do usuário para detecção de Pix. None se não configurado."""
    config = _carregar_config()
    return config.get("nome_usuario")


def obter_pasta_destino_id() -> str:
    """Retorna ID da pasta do Drive. Tenta config, depois .env."""
    config = _carregar_config()
    pasta = config.get("pasta_destino_id")
    if pasta:
        return pasta
    return get_env("GOOGLE_PASTA_DESTINO_ID")


def obter_credenciais_path() -> Path:
    """Retorna caminho do credentials.json. Tenta config dir, depois root do projeto."""
    path = _config_dir() / "credentials.json"
    if path.exists():
        return path
    # Fallback: glob no root do projeto
    from gastos.config import RAIZ
    candidatos = list(RAIZ.glob("client_secret_*.json"))
    if candidatos:
        return candidatos[0]
    raise FileNotFoundError(
        "Credenciais Google não encontradas. Use 'Configurar' no menu para configurar."
    )


def obter_token_path() -> Path:
    """Retorna caminho do token.json no diretório de config."""
    return _config_dir() / "token.json"


def itens_configurados() -> dict[str, bool]:
    """Retorna status de cada item de configuração."""
    config = _carregar_config()
    cred_path = _config_dir() / "credentials.json"
    return {
        "oauth": cred_path.exists(),
        "iniciais": bool(config.get("iniciais")),
        "pasta_drive": bool(config.get("pasta_destino_id")),
        "nome_pix": bool(config.get("nome_usuario")),
    }


# ---------------------------------------------------------------------------
# Escrita
# ---------------------------------------------------------------------------

def salvar_iniciais(iniciais: str) -> None:
    """Salva iniciais do usuário (uppercase, 2-3 letras)."""
    iniciais = iniciais.strip().upper()
    if not 2 <= len(iniciais) <= 3 or not iniciais.isalpha():
        raise ValueError("Iniciais devem ter 2 ou 3 letras.")
    _salvar_config({"iniciais": iniciais})


def salvar_nome_usuario(nome: str) -> None:
    """Salva nome do usuário para detecção de Pix."""
    nome = nome.strip()
    if not nome:
        raise ValueError("Nome não pode ser vazio.")
    _salvar_config({"nome_usuario": nome})


def salvar_pasta_destino(valor: str) -> None:
    """Salva ID da pasta do Drive. Aceita URL completa ou ID direto."""
    valor = valor.strip()
    match = re.search(r"/folders/([a-zA-Z0-9_-]+)", valor)
    if match:
        valor = match.group(1)
    if not valor:
        raise ValueError("ID da pasta não pode ser vazio.")
    _salvar_config({"pasta_destino_id": valor})


def salvar_credenciais_de_input(client_id: str, client_secret: str) -> Path:
    """Gera credentials.json a partir de Client ID e Client Secret."""
    client_id = client_id.strip()
    client_secret = client_secret.strip()
    if not client_id or not client_secret:
        raise ValueError("Client ID e Client Secret não podem ser vazios.")

    dados = {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://localhost"],
        }
    }
    path = _config_dir() / "credentials.json"
    path.write_text(json.dumps(dados, indent=2) + "\n", encoding="utf-8")
    return path


def salvar_credenciais_de_arquivo(caminho: Path) -> Path:
    """Copia JSON de credenciais do usuário para o diretório de config."""
    if not caminho.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {caminho}")

    conteudo = json.loads(caminho.read_text(encoding="utf-8"))
    # Aceita formato "installed" ou "web"
    dados = conteudo.get("installed") or conteudo.get("web")
    if not dados or "client_id" not in dados:
        raise ValueError("Arquivo JSON não contém credenciais OAuth válidas.")

    dest = _config_dir() / "credentials.json"
    shutil.copy2(caminho, dest)
    return dest
