import re
from datetime import datetime
from pathlib import Path

from gastos.formatacao import parse_brasileiro
from gastos.modelos import Lancamento

_LINHA = re.compile(r"^(\d{2}/\d{2}/\d{4});(.+);(-?[\d.]+,\d{2})\s*$")

_FILTRAR = {
    "SALDO TOTAL DISPON",
    "SALDO ANTERIOR",
    "SALDO DO DIA",
    "S A L D O",
}


def _deve_filtrar(descricao: str) -> bool:
    texto = descricao.strip().upper()
    return any(filtro in texto for filtro in _FILTRAR)


def _ler_linhas(caminho: Path) -> list[str]:
    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            return caminho.read_text(encoding=encoding).splitlines()
        except UnicodeDecodeError:
            continue
    return caminho.read_text(encoding="utf-8", errors="replace").splitlines()


class ExtratoItauTxt:
    def aceita(self, caminho: Path) -> bool:
        if caminho.suffix.lower() != ".txt":
            return False
        try:
            linhas = _ler_linhas(caminho)
        except OSError:
            return False

        validas = 0
        examinadas = 0
        for linha in linhas:
            linha = linha.strip()
            if not linha:
                continue
            examinadas += 1
            if _LINHA.match(linha):
                validas += 1
            if examinadas >= 5:
                break
        return examinadas > 0 and validas >= max(1, examinadas - 1)

    def parsear(self, caminho: Path) -> list[Lancamento]:
        lancamentos: list[Lancamento] = []
        for linha in _ler_linhas(caminho):
            linha = linha.strip()
            if not linha:
                continue

            match = _LINHA.match(linha)
            if not match:
                continue

            descricao = match.group(2).strip()
            if _deve_filtrar(descricao):
                continue

            try:
                valor = parse_brasileiro(match.group(3))
            except ValueError:
                continue

            dt = datetime.strptime(match.group(1), "%d/%m/%Y").date()
            lancamentos.append(
                Lancamento(
                    fonte="extrato_itau",
                    natureza="",
                    descricao="",
                    valor=valor,
                    registro=descricao,
                    data=dt,
                )
            )

        return lancamentos
