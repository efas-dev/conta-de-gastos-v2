"""Configuração compartilhada: carrega .env e expõe constantes."""

import os
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent.parent


def carregar_env() -> None:
    """Carrega variáveis do .env se ainda não estiverem no ambiente."""
    env_path = RAIZ / ".env"
    if not env_path.exists():
        return
    for linha in env_path.read_text().splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, valor = linha.split("=", 1)
        os.environ.setdefault(chave.strip(), valor.strip())


def get_env(chave: str, fallback: str | None = None) -> str:
    """Retorna variável de ambiente, carregando .env se necessário."""
    carregar_env()
    valor = os.environ.get(chave)
    if valor is None:
        if fallback is not None:
            return fallback
        raise KeyError(f"Variável de ambiente '{chave}' não definida")
    return valor
