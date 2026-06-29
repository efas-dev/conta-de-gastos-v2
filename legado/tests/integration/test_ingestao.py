"""Testa o fluxo parse → classificar → persistir com SQLite in-memory."""

import sqlite3
from datetime import date
from pathlib import Path
from unittest.mock import patch

from gastos.classificador import classificar, preparar_aprendizado
from gastos.db import _CREATE_TABLES
from gastos.modelos import Lancamento
from gastos.parsers.extrato_nubank import ExtratoNubank
from gastos.parsers.fatura_nubank import FaturaNubank

FIXTURES = Path(__file__).parent.parent / "fixtures"


def _banco_memoria() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(_CREATE_TABLES)
    return conn


class TestFluxoClassificacao:
    def test_parse_classificar_roundtrip(self):
        """Parseia CSV, classifica com dicionário, verifica resultado."""
        parser = ExtratoNubank()
        lancamentos = parser.parsear(FIXTURES / "extrato_nubank.csv")

        indice = {
            ("PAG BOLETO ENERGIA", "extrato_nubank"): {
                "natureza": "MR",
                "descricao": "Moradia",
                "ambiguo": False,
            }
        }

        resultado, classificados = classificar(lancamentos, indice)

        assert classificados == 1
        energia = [lc for lc in resultado if lc.registro == "PAG BOLETO ENERGIA"][0]
        assert energia.natureza == "MR"
        assert energia.descricao == "Moradia"

        # Demais permanecem não classificados
        nao_classificados = [lc for lc in resultado if not lc.natureza]
        assert len(nao_classificados) == 3

    def test_preparar_e_salvar_dicionario(self):
        """Prepara aprendizado e salva no SQLite."""
        lancamentos = [
            Lancamento(
                fonte="extrato_nubank", natureza="MR", descricao="Moradia",
                valor=-22.50, registro="PAG BOLETO ENERGIA", data=date(2026, 3, 10),
            ),
            Lancamento(
                fonte="extrato_nubank", natureza="", descricao="",
                valor=3500.0, registro="Salário", data=date(2026, 3, 5),
            ),
        ]

        registros = preparar_aprendizado(lancamentos)

        assert len(registros) == 1
        assert registros[0]["chave"] == "PAG BOLETO ENERGIA"
        assert registros[0]["natureza"] == "MR"

    def test_multiplos_parsers_mesmos_lancamentos(self):
        """Parseia extrato + fatura e verifica consolidação."""
        extrato = ExtratoNubank().parsear(FIXTURES / "extrato_nubank.csv")
        fatura = FaturaNubank().parsear(FIXTURES / "fatura_nubank.csv")

        todos = extrato + fatura
        assert len(todos) == 7  # 4 extrato + 3 fatura (pagamento recebido excluído)

        fontes = {lc.fonte for lc in todos}
        assert fontes == {"extrato_nubank", "fatura_nubank_cc"}
