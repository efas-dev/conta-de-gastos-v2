import csv
from datetime import datetime
from pathlib import Path

from gastos.formatacao import parse_valor
from gastos.modelos import Lancamento


class FaturaNubank:
    def aceita(self, caminho: Path) -> bool:
        if caminho.suffix.lower() != ".csv":
            return False
        with open(caminho, encoding="utf-8") as f:
            header = f.readline().strip()
        return "date" in header and "title" in header and "amount" in header

    def parsear(self, caminho: Path) -> list[Lancamento]:
        lancamentos = []
        with open(caminho, encoding="utf-8") as f:
            leitor = csv.DictReader(f)
            for linha in leitor:
                titulo = linha["title"].strip()
                if titulo.lower() == "pagamento recebido":
                    continue
                dt = datetime.strptime(linha["date"], "%Y-%m-%d").date()
                valor = -parse_valor(linha["amount"])
                lancamentos.append(
                    Lancamento(
                        fonte="fatura_nubank_cc",
                        natureza="",
                        descricao="",
                        valor=valor,
                        registro=titulo,
                        data=dt,
                    )
                )
        return lancamentos
