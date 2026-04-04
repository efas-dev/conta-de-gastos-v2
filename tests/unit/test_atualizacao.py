from datetime import date
from unittest.mock import patch

import pytest

from gastos import atualizacao, configuracao


@pytest.fixture(autouse=True)
def config_dir_isolado(tmp_path, monkeypatch):
    monkeypatch.setattr(configuracao, "_CONFIG_DIR", tmp_path)
    return tmp_path


class TestCompararVersoes:
    def test_remota_maior(self):
        assert atualizacao._comparar_versoes("0.1.0", "0.2.0")

    def test_remota_igual(self):
        assert not atualizacao._comparar_versoes("0.1.0", "0.1.0")

    def test_remota_menor(self):
        assert not atualizacao._comparar_versoes("0.2.0", "0.1.0")

    def test_major_maior(self):
        assert atualizacao._comparar_versoes("0.9.9", "1.0.0")

    def test_patch_maior(self):
        assert atualizacao._comparar_versoes("0.1.0", "0.1.1")


class TestVerificarAtualizacao:
    @patch.object(atualizacao, "_versao_remota", return_value="0.2.0")
    @patch.object(atualizacao, "_versao_instalada", return_value="0.1.0")
    def test_atualizacao_disponivel(self, _inst, _rem):
        resultado = atualizacao.verificar_atualizacao()
        assert resultado == ("0.1.0", "0.2.0")

    @patch.object(atualizacao, "_versao_remota", return_value="0.1.0")
    @patch.object(atualizacao, "_versao_instalada", return_value="0.1.0")
    def test_sem_atualizacao(self, _inst, _rem):
        assert atualizacao.verificar_atualizacao() is None

    @patch.object(atualizacao, "_versao_remota", return_value=None)
    @patch.object(atualizacao, "_versao_instalada", return_value="0.1.0")
    def test_sem_internet(self, _inst, _rem):
        assert atualizacao.verificar_atualizacao() is None

    @patch.object(atualizacao, "_versao_remota", return_value="0.2.0")
    @patch.object(atualizacao, "_versao_instalada", return_value="0.1.0")
    def test_cache_diario(self, _inst, _rem):
        # Primeira chamada retorna atualização
        assert atualizacao.verificar_atualizacao() is not None
        # Segunda chamada no mesmo dia retorna None (cache)
        assert atualizacao.verificar_atualizacao() is None


class TestUltimaChecagem:
    def test_sem_checagem(self):
        assert atualizacao._ultima_checagem() is None

    def test_registrar_e_ler(self):
        atualizacao._registrar_checagem()
        assert atualizacao._ultima_checagem() == date.today()
