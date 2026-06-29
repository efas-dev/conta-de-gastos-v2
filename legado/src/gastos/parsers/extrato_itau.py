import re
from datetime import datetime
from pathlib import Path

import pdfplumber

from gastos.formatacao import parse_brasileiro
from gastos.modelos import Lancamento

_FILTRAR = {
    "SALDO TOTAL DISPON",
    "SALDO ANTERIOR",
}


def _deve_filtrar(descricao: str) -> bool:
    texto = descricao.strip().upper()
    return any(filtro in texto for filtro in _FILTRAR)


class ExtratoItau:
    def aceita(self, caminho: Path) -> bool:
        if caminho.suffix.lower() != ".pdf":
            return False
        with pdfplumber.open(caminho) as pdf:
            if not pdf.pages:
                return False
            texto = ""
            for p in pdf.pages[:2]:
                texto += (p.extract_text() or "") + "\n"
        return "extrato conta corrente" in texto.lower()

    def parsear(self, caminho: Path) -> list[Lancamento]:
        texto_completo = ""
        with pdfplumber.open(caminho) as pdf:
            for pagina in pdf.pages:
                texto_completo += (pagina.extract_text() or "") + "\n"

        lancamentos = []

        for linha in texto_completo.split("\n"):
            linha = linha.strip()
            if not linha:
                continue

            if "lançamentos futuros" in linha.lower():
                continue
            if "posição consolidada" in linha.lower():
                break

            match = re.match(
                r"(\d{2}/\d{2}/\d{4})\s+(.+?)\s+(-?[\d.]+,\d{2})\s*$",
                linha,
            )
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
