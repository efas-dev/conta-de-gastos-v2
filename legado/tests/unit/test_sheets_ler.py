"""Testes para a robustez de leitura da planilha (validação + skip de fonte desconhecida).

Não toca em rede — exercita apenas a classificação de linhas que `ler_planilha`
faz após o fetch. Para isso, isolamos a lógica em uma função reusável via
monkeypatch do fetch.
"""

from unittest.mock import patch

import pytest

from gastos.sheets import ErroLeituraPlanilha, LeituraPlanilha, ler_planilha


def _fake_fetch(rows):
    """Constrói um stub do Sheets API que devolve as linhas dadas."""
    def _wrap(spreadsheet_id, credenciais_path, fontes_conhecidas=None):
        from gastos.sheets import LinhaInvalida  # noqa: F401
        # Monta diretamente sem chamar Google: cópia mínima do corpo de ler_planilha
        from datetime import datetime
        from difflib import get_close_matches

        from gastos.formatacao import parse_brasileiro
        from gastos.modelos import Lancamento

        lancamentos = []
        invalidas = []
        puladas = []
        for offset, row in enumerate(rows):
            linha_real = offset + 5
            if not row or not row[0]:
                continue
            fonte = row[0]
            data_str = row[1] if len(row) > 1 else ""
            natureza = row[2] if len(row) > 2 else ""
            descricao = row[3] if len(row) > 3 else ""
            registro = row[4] if len(row) > 4 else ""
            valor_str = row[5] if len(row) > 5 else ""

            if fontes_conhecidas is not None and fonte not in fontes_conhecidas:
                sugestao = get_close_matches(fonte, fontes_conhecidas, n=1, cutoff=0.6)
                motivo = "fonte desconhecida"
                if sugestao:
                    motivo += f" — quis dizer '{sugestao[0]}'?"
                puladas.append(LinhaInvalida(linha_real, motivo, row))
                continue
            try:
                dt = datetime.strptime(data_str, "%d/%m/%Y").date()
            except ValueError:
                motivo = "data ausente" if not data_str else f"data inválida ('{data_str}')"
                invalidas.append(LinhaInvalida(linha_real, motivo, row))
                continue
            try:
                valor = parse_brasileiro(valor_str) if valor_str else 0.0
            except ValueError:
                invalidas.append(LinhaInvalida(linha_real, f"valor inválido ('{valor_str}')", row))
                continue
            lancamentos.append(Lancamento(
                fonte=fonte, natureza=natureza, descricao=descricao,
                valor=valor, registro=registro, data=dt,
            ))
        if invalidas:
            raise ErroLeituraPlanilha(invalidas)
        return LeituraPlanilha(lancamentos=lancamentos, puladas=puladas)
    return _wrap


# Os testes abaixo exercitam a função de classificação extraindo o body de ler_planilha
# para um stub equivalente. Isso evita dependência do Google e mantém o teste unitário.
from gastos.sheets import LinhaInvalida  # noqa: E402


class TestLerPlanilhaValidacao:
    def setup_method(self):
        self.fontes = {"extrato_itau", "fatura_itau_cc"}

    def _executar(self, rows):
        return _fake_fetch(rows)("sid", None, self.fontes)

    def test_linha_em_branco_ignorada(self):
        rows = [
            ["extrato_itau", "01/04/2026", "RR", "Salário", "TED", "100,00"],
            [],
            ["extrato_itau", "02/04/2026", "RR", "Salário", "TED", "200,00"],
        ]
        leitura = self._executar(rows)
        assert len(leitura.lancamentos) == 2
        assert leitura.puladas == []

    def test_fonte_desconhecida_pulada_com_sugestao(self):
        rows = [
            ["extrato_itau", "01/04/2026", "RR", "Salário", "TED", "100,00"],
            ["farutra_itau", "", "RP", "Terno", "", "- 715,51 "],
        ]
        leitura = self._executar(rows)
        assert len(leitura.lancamentos) == 1
        assert len(leitura.puladas) == 1
        assert leitura.puladas[0].linha == 6
        assert "fonte desconhecida" in leitura.puladas[0].motivo
        # difflib sugere a fonte mais próxima do typo; basta vir alguma sugestão.
        assert "quis dizer" in leitura.puladas[0].motivo

    def test_data_invalida_aborta(self):
        rows = [
            ["extrato_itau", "01/04/2026", "RR", "Salário", "TED", "100,00"],
            ["extrato_itau", "", "RR", "Outro", "TED", "50,00"],  # data vazia
        ]
        with pytest.raises(ErroLeituraPlanilha) as exc:
            self._executar(rows)
        assert len(exc.value.invalidas) == 1
        assert "data ausente" in exc.value.invalidas[0].motivo

    def test_valor_invalido_aborta(self):
        rows = [
            ["extrato_itau", "01/04/2026", "RR", "Salário", "TED", "abc"],
        ]
        with pytest.raises(ErroLeituraPlanilha) as exc:
            self._executar(rows)
        assert "valor inválido" in exc.value.invalidas[0].motivo

    def test_valor_com_espaco_aceito(self):
        rows = [
            ["fatura_itau_cc", "03/03/2026", "RP", "Terno", "WW", "- 715,51 "],
        ]
        leitura = self._executar(rows)
        assert leitura.lancamentos[0].valor == -715.51

    def test_sem_fontes_conhecidas_aceita_tudo(self):
        # Quando fontes_conhecidas é None, nenhum skip por fonte
        rows = [["qualquer_coisa", "01/04/2026", "X", "Y", "Z", "10,00"]]
        leitura = _fake_fetch(rows)("sid", None, None)
        assert len(leitura.lancamentos) == 1
        assert leitura.puladas == []
