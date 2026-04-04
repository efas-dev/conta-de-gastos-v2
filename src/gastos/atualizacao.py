"""Verificação de atualização via GitHub API."""

import json
import subprocess
import urllib.request
from datetime import date
from importlib.metadata import version
from pathlib import Path

from gastos.configuracao import _config_dir

REPO_OWNER = "efas-dev"
REPO_NAME = "conta_de_gastos"
REPO_URL = f"https://github.com/{REPO_OWNER}/{REPO_NAME}.git"
PACOTE = "gastos"

_TIMEOUT_SEGUNDOS = 3


def _versao_instalada() -> str:
    """Retorna a versão instalada do pacote."""
    return version(PACOTE)


def _versao_remota() -> str | None:
    """Consulta a última tag do GitHub. Retorna None se falhar."""
    url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/tags"
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github.v3+json"})
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_SEGUNDOS) as resp:
            tags = json.loads(resp.read())
    except Exception:
        return None

    if not tags:
        return None

    # Pega a primeira tag (mais recente), remove prefixo "v" se houver
    nome = tags[0]["name"]
    return nome.lstrip("v")


def _ultima_checagem() -> date | None:
    """Retorna a data da última verificação, ou None."""
    config_path = _config_dir() / "config.json"
    if not config_path.exists():
        return None
    try:
        dados = json.loads(config_path.read_text(encoding="utf-8"))
        return date.fromisoformat(dados["ultima_checagem_atualizacao"])
    except (KeyError, ValueError):
        return None


def _registrar_checagem() -> None:
    """Salva a data de hoje como última checagem."""
    from gastos.configuracao import _carregar_config, _salvar_config
    _salvar_config({"ultima_checagem_atualizacao": date.today().isoformat()})


def _comparar_versoes(local: str, remota: str) -> bool:
    """Retorna True se a versão remota for mais nova que a local."""
    def tupla(v: str) -> tuple[int, ...]:
        try:
            return tuple(int(x) for x in v.split("."))
        except ValueError:
            return (0,)
    return tupla(remota) > tupla(local)


def verificar_atualizacao() -> tuple[str, str] | None:
    """Verifica se há atualização disponível (1x por dia).

    Retorna (versao_local, versao_remota) se houver atualização,
    ou None se estiver atualizado / sem internet / já checou hoje.
    """
    ultima = _ultima_checagem()
    if ultima == date.today():
        return None

    _registrar_checagem()

    local = _versao_instalada()
    remota = _versao_remota()

    if remota is None:
        return None

    if _comparar_versoes(local, remota):
        return (local, remota)

    return None


def atualizar() -> bool:
    """Executa a atualização via uv tool. Retorna True se sucesso."""
    resultado = subprocess.run(
        ["uv", "tool", "install", "--force", "--upgrade", f"git+{REPO_URL}"],
        capture_output=True,
        text=True,
    )
    return resultado.returncode == 0
