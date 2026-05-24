"""Backend SQLite para dicionário, lançamentos e minutas."""

import sqlite3
from datetime import datetime
from pathlib import Path

from gastos.config import RAIZ

DB_PATH = RAIZ / "gastos.db"
_OLD_DB_PATH = RAIZ / "dicionario.db"

_CREATE_TABLES = """
CREATE TABLE IF NOT EXISTS dicionario (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    chave      TEXT    NOT NULL,
    fonte      TEXT    NOT NULL,
    natureza   TEXT    NOT NULL,
    descricao  TEXT    NOT NULL,
    ambiguo    INTEGER NOT NULL DEFAULT 0,
    contagem   INTEGER NOT NULL DEFAULT 1,
    UNIQUE(chave, fonte)
);

CREATE TABLE IF NOT EXISTS minutas (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    mes_referencia  TEXT    NOT NULL,
    spreadsheet_id  TEXT    NOT NULL UNIQUE,
    url             TEXT    NOT NULL,
    criada_em       TEXT    NOT NULL,
    aprendida_em    TEXT
);

CREATE TABLE IF NOT EXISTS lancamentos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    minuta_id       INTEGER,
    mes_referencia  TEXT    NOT NULL,
    fonte           TEXT    NOT NULL,
    natureza        TEXT    NOT NULL DEFAULT '',
    descricao       TEXT    NOT NULL DEFAULT '',
    valor           REAL    NOT NULL,
    registro        TEXT    NOT NULL,
    data            TEXT    NOT NULL,
    classificado    INTEGER NOT NULL DEFAULT 0,
    criado_em       TEXT    NOT NULL,
    FOREIGN KEY (minuta_id) REFERENCES minutas(id)
);
"""


def _migrar_db() -> None:
    """Renomeia dicionario.db → gastos.db se necessário."""
    if _OLD_DB_PATH.exists() and not DB_PATH.exists():
        _OLD_DB_PATH.rename(DB_PATH)


def _conn() -> sqlite3.Connection:
    _migrar_db()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(_CREATE_TABLES)
    return conn


# ---------------------------------------------------------------------------
# Dicionário
# ---------------------------------------------------------------------------

def salvar_dicionario(registros: list[dict]) -> tuple[int, int, int]:
    """Salva mapeamentos no SQLite. Retorna (salvos, atualizados, ambíguos)."""
    conn = _conn()
    salvos = atualizados = ambiguos = 0

    for r in registros:
        row = conn.execute(
            "SELECT id, natureza, descricao, contagem FROM dicionario WHERE chave = ? AND fonte = ?",
            (r["chave"], r["fonte"]),
        ).fetchone()

        if row:
            mesmo = row["natureza"] == r["natureza"] and row["descricao"] == r["descricao"]
            if mesmo:
                conn.execute(
                    "UPDATE dicionario SET contagem = ? WHERE id = ?",
                    (row["contagem"] + 1, row["id"]),
                )
                atualizados += 1
            else:
                conn.execute(
                    "UPDATE dicionario SET ambiguo = 1 WHERE id = ?",
                    (row["id"],),
                )
                ambiguos += 1
        else:
            conn.execute(
                "INSERT INTO dicionario (chave, fonte, natureza, descricao, ambiguo, contagem) VALUES (?, ?, ?, ?, 0, 1)",
                (r["chave"], r["fonte"], r["natureza"], r["descricao"]),
            )
            salvos += 1

    conn.commit()
    conn.close()
    return salvos, atualizados, ambiguos


def carregar_dicionario() -> dict[tuple[str, str], dict]:
    """Carrega todo o dicionário SQLite como índice {(chave, fonte): dados}."""
    conn = _conn()
    rows = conn.execute("SELECT chave, fonte, natureza, descricao, ambiguo FROM dicionario").fetchall()
    conn.close()

    return {
        (row["chave"], row["fonte"]): {
            "chave": row["chave"],
            "fonte": row["fonte"],
            "natureza": row["natureza"],
            "descricao": row["descricao"],
            "ambiguo": bool(row["ambiguo"]),
        }
        for row in rows
    }


# ---------------------------------------------------------------------------
# Lançamentos
# ---------------------------------------------------------------------------

def limpar_lancamentos_nao_classificados(mes_referencia: str) -> int:
    """Remove lançamentos não verificados de um mês (para re-run seguro)."""
    conn = _conn()
    cursor = conn.execute(
        "DELETE FROM lancamentos WHERE mes_referencia = ? AND classificado = 0",
        (mes_referencia,),
    )
    conn.commit()
    removidos = cursor.rowcount
    conn.close()
    return removidos


def salvar_lancamentos(
    registros: list[dict],
    mes_referencia: str,
    minuta_id: int | None = None,
    classificado: bool = False,
) -> int:
    """Insere lançamentos para um mês. Retorna quantidade inserida."""
    conn = _conn()
    agora = datetime.now().isoformat()
    inseridos = 0

    for r in registros:
        conn.execute(
            """INSERT INTO lancamentos
               (minuta_id, mes_referencia, fonte, natureza, descricao, valor, registro, data, classificado, criado_em)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                minuta_id,
                mes_referencia,
                r["fonte"],
                r.get("natureza", ""),
                r.get("descricao", ""),
                r["valor"],
                r["registro"],
                r["data"],
                int(classificado),
                agora,
            ),
        )
        inseridos += 1

    conn.commit()
    conn.close()
    return inseridos


def atualizar_lancamentos_aprendidos(
    registros: list[dict],
    mes_referencia: str,
) -> int:
    """Atualiza lançamentos com classificação verificada por humano."""
    conn = _conn()
    atualizados = 0

    for r in registros:
        if not r.get("natureza") and not r.get("descricao"):
            continue
        cursor = conn.execute(
            """UPDATE lancamentos
               SET natureza = ?, descricao = ?, classificado = 1
               WHERE mes_referencia = ?
                 AND fonte = ?
                 AND registro = ?
                 AND data = ?
                 AND valor = ?
                 AND classificado = 0
               LIMIT 1""",
            (
                r["natureza"],
                r["descricao"],
                mes_referencia,
                r["fonte"],
                r["registro"],
                r["data"],
                r["valor"],
            ),
        )
        atualizados += cursor.rowcount

    conn.commit()
    conn.close()
    return atualizados


# ---------------------------------------------------------------------------
# Minutas
# ---------------------------------------------------------------------------

def salvar_minuta(mes_referencia: str, spreadsheet_id: str, url: str) -> int:
    """Registra uma minuta. Retorna o ID."""
    conn = _conn()
    cursor = conn.execute(
        "INSERT INTO minutas (mes_referencia, spreadsheet_id, url, criada_em) VALUES (?, ?, ?, ?)",
        (mes_referencia, spreadsheet_id, url, datetime.now().isoformat()),
    )
    conn.commit()
    minuta_id = cursor.lastrowid
    conn.close()
    return minuta_id


def vincular_lancamentos_minuta(mes_referencia: str, minuta_id: int) -> int:
    """Vincula lançamentos de um mês a uma minuta."""
    conn = _conn()
    cursor = conn.execute(
        "UPDATE lancamentos SET minuta_id = ? WHERE mes_referencia = ? AND minuta_id IS NULL",
        (minuta_id, mes_referencia),
    )
    conn.commit()
    vinculados = cursor.rowcount
    conn.close()
    return vinculados


def marcar_minuta_aprendida(spreadsheet_id: str) -> None:
    """Marca uma minuta como aprendida."""
    conn = _conn()
    conn.execute(
        "UPDATE minutas SET aprendida_em = ? WHERE spreadsheet_id = ?",
        (datetime.now().isoformat(), spreadsheet_id),
    )
    conn.commit()
    conn.close()


def listar_minutas(limite: int = 20) -> list[dict]:
    """Retorna as minutas mais recentes (para o menu 'aprender existente')."""
    conn = _conn()
    rows = conn.execute(
        "SELECT id, mes_referencia, spreadsheet_id, url, criada_em, aprendida_em "
        "FROM minutas ORDER BY datetime(criada_em) DESC LIMIT ?",
        (limite,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# Prefixos builtin garantem que, mesmo com banco vazio, fontes válidas sejam
# reconhecidas na primeira leitura de uma planilha.
_PREFIXOS_BUILTIN = ("extrato_itau", "extrato_nubank", "fatura_itau_cc", "fatura_nubank_cc")


def fontes_conhecidas() -> set[str]:
    """Conjunto de fontes vistas no banco (lançamentos + dicionário) + prefixos builtin.

    Inclui também os prefixos builtin literais para que faturas/extratos novos
    (ainda não importados) sejam aceitos numa primeira leitura.
    """
    conn = _conn()
    rows = conn.execute(
        "SELECT DISTINCT fonte FROM lancamentos "
        "UNION SELECT DISTINCT fonte FROM dicionario"
    ).fetchall()
    conn.close()
    fontes = {r["fonte"] for r in rows}
    fontes.update(_PREFIXOS_BUILTIN)
    return fontes
