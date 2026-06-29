import json
from pathlib import Path
from unittest.mock import patch

import pytest

from gastos import configuracao


@pytest.fixture(autouse=True)
def config_dir_isolado(tmp_path, monkeypatch):
    """Redireciona _CONFIG_DIR para diretório temporário em cada teste."""
    monkeypatch.setattr(configuracao, "_CONFIG_DIR", tmp_path)
    return tmp_path


class TestCarregarSalvarConfig:
    def test_carregar_vazio(self):
        assert configuracao._carregar_config() == {}

    def test_salvar_e_carregar(self):
        configuracao._salvar_config({"iniciais": "AB"})
        assert configuracao._carregar_config()["iniciais"] == "AB"

    def test_merge_preserva_existente(self):
        configuracao._salvar_config({"iniciais": "AB"})
        configuracao._salvar_config({"nome_usuario": "Ana"})
        config = configuracao._carregar_config()
        assert config["iniciais"] == "AB"
        assert config["nome_usuario"] == "Ana"


class TestObterIniciais:
    def test_sem_config_retorna_xx(self):
        assert configuracao.obter_iniciais() == "XX"

    def test_com_config(self):
        configuracao.salvar_iniciais("AB")
        assert configuracao.obter_iniciais() == "AB"


class TestObterNomeUsuario:
    def test_sem_config_retorna_none(self):
        assert configuracao.obter_nome_usuario() is None

    def test_com_config(self):
        configuracao.salvar_nome_usuario("Maria")
        assert configuracao.obter_nome_usuario() == "Maria"


class TestObterPastaDestinoId:
    def test_com_config(self):
        configuracao.salvar_pasta_destino("abc123")
        assert configuracao.obter_pasta_destino_id() == "abc123"

    def test_fallback_env(self, monkeypatch):
        monkeypatch.setenv("GOOGLE_PASTA_DESTINO_ID", "env_folder")
        assert configuracao.obter_pasta_destino_id() == "env_folder"

    def test_sem_nada_levanta_erro(self, monkeypatch):
        monkeypatch.delenv("GOOGLE_PASTA_DESTINO_ID", raising=False)
        # Impede carregar_env de ler o .env do projeto
        monkeypatch.setattr("gastos.config.carregar_env", lambda: None)
        with pytest.raises(KeyError):
            configuracao.obter_pasta_destino_id()


class TestObterCredenciaisPath:
    def test_com_credentials_no_config_dir(self, config_dir_isolado):
        cred = config_dir_isolado / "credentials.json"
        cred.write_text('{"installed": {}}')
        assert configuracao.obter_credenciais_path() == cred

    def test_fallback_root(self, config_dir_isolado, tmp_path, monkeypatch):
        # Sem credentials no config dir, usa glob no RAIZ
        raiz = tmp_path / "projeto"
        raiz.mkdir()
        fake_cred = raiz / "client_secret_123.json"
        fake_cred.write_text("{}")
        monkeypatch.setattr("gastos.config.RAIZ", raiz)
        assert configuracao.obter_credenciais_path() == fake_cred

    def test_sem_nada_levanta_erro(self, tmp_path, monkeypatch):
        raiz = tmp_path / "projeto_vazio"
        raiz.mkdir()
        monkeypatch.setattr("gastos.config.RAIZ", raiz)
        with pytest.raises(FileNotFoundError):
            configuracao.obter_credenciais_path()


class TestSalvarIniciais:
    def test_valido(self):
        configuracao.salvar_iniciais("es")
        assert configuracao.obter_iniciais() == "ES"

    def test_tres_letras(self):
        configuracao.salvar_iniciais("abc")
        assert configuracao.obter_iniciais() == "ABC"

    def test_uma_letra_invalido(self):
        with pytest.raises(ValueError):
            configuracao.salvar_iniciais("A")

    def test_quatro_letras_invalido(self):
        with pytest.raises(ValueError):
            configuracao.salvar_iniciais("ABCD")

    def test_numeros_invalido(self):
        with pytest.raises(ValueError):
            configuracao.salvar_iniciais("A1")


class TestSalvarNomeUsuario:
    def test_valido(self):
        configuracao.salvar_nome_usuario("Ana")
        assert configuracao.obter_nome_usuario() == "Ana"

    def test_vazio_invalido(self):
        with pytest.raises(ValueError):
            configuracao.salvar_nome_usuario("  ")


class TestSalvarPastaDestino:
    def test_id_direto(self):
        configuracao.salvar_pasta_destino("abc123def")
        assert configuracao.obter_pasta_destino_id() == "abc123def"

    def test_url_completa(self):
        url = "https://drive.google.com/drive/folders/1LeUv4C6OpNJiIOHNwLWjuUV2Uhud3Vho"
        configuracao.salvar_pasta_destino(url)
        assert configuracao.obter_pasta_destino_id() == "1LeUv4C6OpNJiIOHNwLWjuUV2Uhud3Vho"

    def test_vazio_invalido(self):
        with pytest.raises(ValueError):
            configuracao.salvar_pasta_destino("")


class TestSalvarCredenciaisDeInput:
    def test_gera_json_correto(self, config_dir_isolado):
        path = configuracao.salvar_credenciais_de_input("my-id", "my-secret")
        dados = json.loads(path.read_text())
        assert dados["installed"]["client_id"] == "my-id"
        assert dados["installed"]["client_secret"] == "my-secret"
        assert dados["installed"]["auth_uri"] == "https://accounts.google.com/o/oauth2/auth"
        assert dados["installed"]["token_uri"] == "https://oauth2.googleapis.com/token"
        assert "http://localhost" in dados["installed"]["redirect_uris"]

    def test_vazio_invalido(self):
        with pytest.raises(ValueError):
            configuracao.salvar_credenciais_de_input("", "secret")


class TestSalvarCredenciaisDeArquivo:
    def test_copia_json_valido(self, config_dir_isolado, tmp_path):
        src = tmp_path / "creds.json"
        src.write_text(json.dumps({
            "installed": {"client_id": "id", "client_secret": "sec"}
        }))
        dest = configuracao.salvar_credenciais_de_arquivo(src)
        assert dest.exists()
        assert json.loads(dest.read_text())["installed"]["client_id"] == "id"

    def test_arquivo_inexistente(self):
        with pytest.raises(FileNotFoundError):
            configuracao.salvar_credenciais_de_arquivo(Path("/nao/existe.json"))

    def test_json_invalido(self, tmp_path):
        src = tmp_path / "bad.json"
        src.write_text(json.dumps({"foo": "bar"}))
        with pytest.raises(ValueError):
            configuracao.salvar_credenciais_de_arquivo(src)


class TestItensConfigurados:
    def test_nenhum(self):
        status = configuracao.itens_configurados()
        assert not any(status.values())

    def test_todos(self, config_dir_isolado):
        configuracao.salvar_iniciais("ES")
        configuracao.salvar_nome_usuario("Eduardo")
        configuracao.salvar_pasta_destino("folder123")
        configuracao.salvar_credenciais_de_input("id", "sec")
        status = configuracao.itens_configurados()
        assert all(status.values())
