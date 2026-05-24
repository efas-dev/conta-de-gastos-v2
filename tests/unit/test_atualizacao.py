import json
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

    def test_aceita_prefixo_v(self):
        assert atualizacao._comparar_versoes("v0.1.0", "v0.2.0")

    def test_numerica_nao_lexica(self):
        # 0.4.10 > 0.4.9 numericamente (lexicamente seria o contrário)
        assert atualizacao._comparar_versoes("0.4.9", "0.4.10")


class TestVersaoRemota:
    def test_ordena_por_semver_nao_pela_api(self, monkeypatch):
        """A API pode devolver tags em ordem qualquer; deve pegar a maior."""
        from unittest.mock import MagicMock
        import io

        tags_payload = [
            {"name": "v0.3.1"},
            {"name": "v0.4.10"},
            {"name": "v0.4.2"},
            {"name": "v0.4.9"},
            {"name": "nightly"},  # não-semver, deve ser ignorada
        ]
        resp = MagicMock()
        resp.read.return_value = json.dumps(tags_payload).encode()
        resp.__enter__ = lambda s: s
        resp.__exit__ = lambda *a: None
        monkeypatch.setattr(atualizacao.urllib.request, "urlopen", lambda *a, **k: resp)

        assert atualizacao._versao_remota() == "0.4.10"


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

    @patch.object(atualizacao, "_versao_remota", return_value=None)
    @patch.object(atualizacao, "_versao_instalada", return_value="0.1.0")
    def test_falha_rede_nao_bloqueia_proxima_tentativa(self, _inst, _rem):
        """Falha de rede não deve gravar a data de checagem."""
        atualizacao.verificar_atualizacao()
        assert atualizacao._ultima_checagem() is None

    @patch.object(atualizacao, "_versao_remota", return_value="0.2.0")
    @patch.object(atualizacao, "_versao_instalada", return_value="0.1.0")
    def test_forcar_ignora_cache(self, _inst, _rem):
        assert atualizacao.verificar_atualizacao() is not None
        # Mesmo dia, mas forçando, deve retornar de novo
        assert atualizacao.verificar_atualizacao(forcar=True) is not None

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
