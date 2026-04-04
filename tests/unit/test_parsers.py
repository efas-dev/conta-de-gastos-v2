from datetime import date
from pathlib import Path

from gastos.parsers.extrato_nubank import ExtratoNubank
from gastos.parsers.fatura_nubank import FaturaNubank

FIXTURES = Path(__file__).parent.parent / "fixtures"


class TestExtratoNubank:
    def setup_method(self):
        self.parser = ExtratoNubank()

    def test_aceita_csv_nubank(self):
        assert self.parser.aceita(FIXTURES / "extrato_nubank.csv")

    def test_rejeita_csv_fatura(self):
        assert not self.parser.aceita(FIXTURES / "fatura_nubank.csv")

    def test_parsear(self):
        lancamentos = self.parser.parsear(FIXTURES / "extrato_nubank.csv")

        assert len(lancamentos) == 4
        assert all(lc.fonte == "extrato_nubank" for lc in lancamentos)

        pix = lancamentos[0]
        assert pix.registro == "Transferência enviada pelo Pix - João"
        assert pix.valor == -150.0
        assert pix.data == date(2026, 3, 1)

    def test_campos_vazios(self):
        lancamentos = self.parser.parsear(FIXTURES / "extrato_nubank.csv")
        for lc in lancamentos:
            assert lc.natureza == ""
            assert lc.descricao == ""


class TestFaturaNubank:
    def setup_method(self):
        self.parser = FaturaNubank()

    def test_aceita_csv_fatura(self):
        assert self.parser.aceita(FIXTURES / "fatura_nubank.csv")

    def test_rejeita_csv_extrato(self):
        assert not self.parser.aceita(FIXTURES / "extrato_nubank.csv")

    def test_parsear_filtra_pagamento_recebido(self):
        lancamentos = self.parser.parsear(FIXTURES / "fatura_nubank.csv")

        assert len(lancamentos) == 3  # "Pagamento recebido" excluído
        titulos = [lc.registro for lc in lancamentos]
        assert "Pagamento recebido" not in titulos

    def test_valores_negativos(self):
        lancamentos = self.parser.parsear(FIXTURES / "fatura_nubank.csv")
        for lc in lancamentos:
            assert lc.valor < 0

    def test_fonte(self):
        lancamentos = self.parser.parsear(FIXTURES / "fatura_nubank.csv")
        assert all(lc.fonte == "fatura_nubank_cc" for lc in lancamentos)
