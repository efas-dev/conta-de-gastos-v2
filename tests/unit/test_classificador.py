from datetime import date

from gastos.classificador import classificar, normalizar_chave, preparar_aprendizado
from gastos.modelos import Lancamento


def _lancamento(registro: str, fonte: str = "extrato_itau", natureza: str = "", descricao: str = "") -> Lancamento:
    return Lancamento(
        fonte=fonte,
        natureza=natureza,
        descricao=descricao,
        valor=-100.0,
        registro=registro,
        data=date(2026, 3, 1),
    )


class TestNormalizarChave:
    def test_remove_data_dd_mm(self):
        assert normalizar_chave("PIX TRANSF CESAR D10/03") == "PIX TRANSF CESAR"

    def test_remove_data_dd_mm_aaaa(self):
        assert normalizar_chave("PAGAMENTO BOLETO 15/03/2026") == "PAGAMENTO BOLETO"

    def test_remove_data_dd_mm_aa(self):
        assert normalizar_chave("TED FULANO 01/03/26") == "TED FULANO"

    def test_sem_data_nao_altera(self):
        assert normalizar_chave("Uber *Trip") == "Uber *Trip"

    def test_string_vazia(self):
        assert normalizar_chave("") == ""


class TestClassificar:
    def test_classifica_com_indice(self):
        lancamentos = [_lancamento("PIX TRANSF CESAR")]
        indice = {
            ("PIX TRANSF CESAR", "extrato_itau"): {
                "natureza": "TR",
                "descricao": "Transfer César",
                "ambiguo": False,
            }
        }

        resultado, classificados = classificar(lancamentos, indice)

        assert classificados == 1
        assert resultado[0].natureza == "TR"
        assert resultado[0].descricao == "Transfer César"

    def test_ignora_ambiguo(self):
        lancamentos = [_lancamento("PIX TRANSF CESAR")]
        indice = {
            ("PIX TRANSF CESAR", "extrato_itau"): {
                "natureza": "TR",
                "descricao": "Transfer César",
                "ambiguo": True,
            }
        }

        resultado, classificados = classificar(lancamentos, indice)

        assert classificados == 0
        assert resultado[0].natureza == ""

    def test_mantem_ja_classificado(self):
        lancamentos = [_lancamento("Uber *Trip", natureza="TP", descricao="Transporte")]
        indice = {}

        resultado, classificados = classificar(lancamentos, indice)

        assert classificados == 0
        assert resultado[0].natureza == "TP"

    def test_indice_vazio(self):
        lancamentos = [_lancamento("ALGO DESCONHECIDO")]
        indice = {}

        resultado, classificados = classificar(lancamentos, indice)

        assert classificados == 0
        assert resultado[0].natureza == ""

    def test_normaliza_chave_com_data(self):
        lancamentos = [_lancamento("PIX TRANSF CESAR D10/03")]
        indice = {
            ("PIX TRANSF CESAR", "extrato_itau"): {
                "natureza": "TR",
                "descricao": "Transfer César",
                "ambiguo": False,
            }
        }

        resultado, classificados = classificar(lancamentos, indice)
        assert classificados == 1


class TestPrepararAprendizado:
    def test_gera_registros(self):
        lancamentos = [
            _lancamento("PIX FULANO D10/03", natureza="TR", descricao="Fulano"),
        ]

        registros = preparar_aprendizado(lancamentos)

        assert len(registros) == 1
        assert registros[0]["chave"] == "PIX FULANO"
        assert registros[0]["natureza"] == "TR"

    def test_ignora_sem_classificacao(self):
        lancamentos = [_lancamento("PIX FULANO")]

        registros = preparar_aprendizado(lancamentos)

        assert len(registros) == 0
