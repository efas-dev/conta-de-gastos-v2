"""Parsers de extratos e faturas bancárias.

Para adicionar um novo parser:
1. Crie um módulo em gastos/parsers/ com uma classe que implemente aceita() e parsear()
2. Registre a classe em _registrar_builtin() abaixo
"""

from pathlib import Path
from typing import Protocol

from gastos.modelos import Lancamento


class Parser(Protocol):
    """Contrato para parsers de extratos e faturas."""

    def aceita(self, caminho: Path) -> bool: ...
    def parsear(self, caminho: Path) -> list[Lancamento]: ...


_parsers: list[Parser] = []


def registrar(parser: Parser) -> None:
    """Adiciona um parser ao registro."""
    _parsers.append(parser)


def detectar(caminho: Path) -> Parser | None:
    """Retorna o primeiro parser que aceita o arquivo, ou None."""
    for p in _parsers:
        if p.aceita(caminho):
            return p
    return None


def _registrar_builtin() -> None:
    from gastos.parsers.extrato_itau import ExtratoItau
    from gastos.parsers.extrato_itau_txt import ExtratoItauTxt
    from gastos.parsers.extrato_nubank import ExtratoNubank
    from gastos.parsers.fatura_itau import FaturaItau
    from gastos.parsers.fatura_nubank import FaturaNubank

    registrar(ExtratoNubank())
    registrar(FaturaNubank())
    registrar(ExtratoItau())
    registrar(ExtratoItauTxt())
    registrar(FaturaItau())


_registrar_builtin()
