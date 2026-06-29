"""Verificação de atualização via GitHub API."""

import json
import re
import subprocess
import urllib.request
from datetime import date
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

from gastos.configuracao import _config_dir

REPO_OWNER = "efas-dev"
REPO_NAME = "conta_de_gastos"
REPO_URL = f"https://github.com/{REPO_OWNER}/{REPO_NAME}.git"
PACOTE = "gastos"

_TIMEOUT_SEGUNDOS = 3
_RE_SEMVER = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)$")


def _versao_instalada() -> str:
    """Retorna a versão instalada do pacote.

    Em ambientes onde a metadata não está disponível (ex: execução
    direta do checkout sem instalação), tenta ler do pyproject.toml.
    """
    try:
        return version(PACOTE)
    except PackageNotFoundError:
        try:
            pyproject = Path(__file__).resolve().parents[2] / "pyproject.toml"
            for linha in pyproject.read_text(encoding="utf-8").splitlines():
                m = re.match(r'\s*version\s*=\s*"([^"]+)"', linha)
                if m:
                    return m.group(1)
        except Exception:
            pass
        return "0.0.0"


def _tupla_semver(v: str) -> tuple[int, int, int] | None:
    """Converte 'v0.4.2' ou '0.4.2' em (0, 4, 2). Retorna None se inválido."""
    m = _RE_SEMVER.match(v.strip())
    if not m:
        return None
    return (int(m.group(1)), int(m.group(2)), int(m.group(3)))


def _versao_remota() -> str | None:
    """Consulta a maior tag semver no GitHub. Retorna None se falhar.

    A API `/tags` não garante ordem semântica de versões — ordenamos
    no cliente para evitar pegar uma tag antiga por engano.
    """
    url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/tags?per_page=100"
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github.v3+json"})
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_SEGUNDOS) as resp:
            tags = json.loads(resp.read())
    except Exception:
        return None

    if not tags:
        return None

    candidatas: list[tuple[tuple[int, int, int], str]] = []
    for t in tags:
        nome = t.get("name", "")
        tupla = _tupla_semver(nome)
        if tupla is not None:
            candidatas.append((tupla, nome.lstrip("v")))

    if not candidatas:
        return None

    candidatas.sort(reverse=True)
    return candidatas[0][1]


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
    from gastos.configuracao import _salvar_config
    _salvar_config({"ultima_checagem_atualizacao": date.today().isoformat()})


def _comparar_versoes(local: str, remota: str) -> bool:
    """Retorna True se a versão remota for mais nova que a local."""
    t_local = _tupla_semver(local) or (0, 0, 0)
    t_remota = _tupla_semver(remota) or (0, 0, 0)
    return t_remota > t_local


def verificar_atualizacao(forcar: bool = False) -> tuple[str, str] | None:
    """Verifica se há atualização disponível.

    Por padrão limita a 1x por dia (cache em config.json). Use `forcar=True`
    para ignorar o cache (ex: ação manual do usuário).

    Retorna (versao_local, versao_remota) se houver atualização,
    ou None se estiver atualizado / sem internet / já checou hoje.

    A data de checagem só é gravada após sucesso na consulta remota —
    falhas de rede não bloqueiam tentativas no mesmo dia.
    """
    if not forcar and _ultima_checagem() == date.today():
        return None

    local = _versao_instalada()
    remota = _versao_remota()

    if remota is None:
        return None

    # Só registra após sucesso para não mascarar falhas de rede.
    _registrar_checagem()

    if _comparar_versoes(local, remota):
        return (local, remota)

    return None


def atualizar() -> tuple[bool, str]:
    """Executa a atualização via uv tool. Retorna (sucesso, mensagem)."""
    resultado = subprocess.run(
        ["uv", "tool", "install", "--force", "--upgrade", f"git+{REPO_URL}"],
        capture_output=True,
        text=True,
    )
    if resultado.returncode == 0:
        return (True, resultado.stdout.strip() or "Atualização concluída.")
    return (False, (resultado.stderr or resultado.stdout).strip() or "Falha desconhecida.")
