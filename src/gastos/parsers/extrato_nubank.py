import csv
from datetime import datetime
from pathlib import Path

from gastos.modelos import Lancamento


class ExtratoNubank:
    def aceita(self, caminho: Path) -> bool:
        if caminho.suffix.lower() != ".csv":
            return False
        with open(caminho, encoding="utf-8") as f:
            header = f.readline().strip()
        return "Identificador" in header and "Descrição" in header

    def parsear(self, caminho: Path) -> list[Lancamento]:
        lancamentos = []
        with open(caminho, encoding="utf-8") as f:
            leitor = csv.DictReader(f)
            for linha in leitor:
                dt = datetime.strptime(linha["Data"], "%d/%m/%Y").date()
                lancamentos.append(
                    Lancamento(
                        fonte="extrato_nubank",
                        natureza="",
                        descricao="",
                        valor=float(linha["Valor"]),
                        registro=linha["Descrição"],
                        data=dt,
                    )
                )
        return lancamentos
