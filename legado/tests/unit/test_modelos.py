from datetime import date
from unittest.mock import patch

import gastos.modelos as modelos_mod
from gastos.modelos import Lancamento


def _lancamento(registro: str, fonte: str = "extrato_itau") -> Lancamento:
    return Lancamento(
        fonte=fonte, natureza="", descricao="", valor=-100.0,
        registro=registro, data=date(2026, 3, 1),
    )


class TestInterno:
    def setup_method(self):
        # Limpa cache do regex entre testes
        modelos_mod._cache_re_interno = None

    @patch("gastos.configuracao.obter_nome_usuario", return_value="Eduardo")
    def test_resgate_cdb(self, _mock):
        assert _lancamento("RESGATE CDB PREFIXADO").interno

    @patch("gastos.configuracao.obter_nome_usuario", return_value="Eduardo")
    def test_aplicacao(self, _mock):
        assert _lancamento("APLICACAO COFRINHOS").interno

    @patch("gastos.configuracao.obter_nome_usuario", return_value="Eduardo")
    def test_itau_black(self, _mock):
        assert _lancamento("ITAU BLACK").interno

    @patch("gastos.configuracao.obter_nome_usuario", return_value="Eduardo")
    def test_resgate_rdb(self, _mock):
        assert _lancamento("Resgate RDB").interno

    @patch("gastos.configuracao.obter_nome_usuario", return_value="Eduardo")
    def test_pagamento_fatura(self, _mock):
        assert _lancamento("Pagamento de fatura").interno

    @patch("gastos.configuracao.obter_nome_usuario", return_value="Eduardo")
    def test_pix_open_banking(self, _mock):
        assert _lancamento("Transferência enviada pelo Pix via Open Banking").interno

    @patch("gastos.configuracao.obter_nome_usuario", return_value="Eduardo")
    def test_pix_eduardo(self, _mock):
        assert _lancamento("Transferência enviada pelo Pix - Eduardo").interno

    @patch("gastos.configuracao.obter_nome_usuario", return_value="Eduardo")
    def test_compra_normal_nao_interno(self, _mock):
        assert not _lancamento("PAG BOLETO ENERGIA").interno

    @patch("gastos.configuracao.obter_nome_usuario", return_value="Eduardo")
    def test_pix_terceiro_nao_interno(self, _mock):
        assert not _lancamento("Transferência enviada pelo Pix - João").interno

    @patch("gastos.configuracao.obter_nome_usuario", return_value="Maria")
    def test_pix_nome_configurado(self, _mock):
        assert _lancamento("Transferência enviada pelo Pix - Maria").interno

    @patch("gastos.configuracao.obter_nome_usuario", return_value="Maria")
    def test_pix_outro_nome_nao_interno(self, _mock):
        assert not _lancamento("Transferência enviada pelo Pix - João").interno

    @patch("gastos.configuracao.obter_nome_usuario", return_value=None)
    def test_sem_config_fallback_eduardo(self, _mock):
        assert _lancamento("Transferência enviada pelo Pix - Eduardo").interno


class TestToDict:
    def test_serializa(self):
        lc = Lancamento(
            fonte="extrato_itau", natureza="CM", descricao="Comida",
            valor=-50.0, registro="PAG BOLETO", data=date(2026, 3, 15),
        )

        d = lc.to_dict()

        assert d["fonte"] == "extrato_itau"
        assert d["data"] == "2026-03-15"
        assert d["valor"] == -50.0
