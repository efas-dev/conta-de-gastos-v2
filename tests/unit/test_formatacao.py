from gastos.formatacao import formatar_brasileiro, parse_brasileiro


class TestFormatarBrasileiro:
    def test_positivo_simples(self):
        assert formatar_brasileiro(1234.56) == "1.234,56"

    def test_negativo(self):
        assert formatar_brasileiro(-99.90) == "-99,90"

    def test_zero(self):
        assert formatar_brasileiro(0.0) == "0,00"

    def test_centavos_arredondamento(self):
        assert formatar_brasileiro(10.999) == "11,00"

    def test_sem_centavos(self):
        assert formatar_brasileiro(500.0) == "500,00"


class TestParseBrasileiro:
    def test_simples(self):
        assert parse_brasileiro("1.234,56") == 1234.56

    def test_negativo(self):
        assert parse_brasileiro("-99,90") == -99.90

    def test_sem_milhar(self):
        assert parse_brasileiro("50,00") == 50.0

    def test_espacos(self):
        assert parse_brasileiro("  1.000,00  ") == 1000.0

    def test_espaco_interno_negativo(self):
        # Google Sheets pode formatar moeda com espaço entre o sinal e o número
        assert parse_brasileiro("- 715,51 ") == -715.51

    def test_espacos_internos_em_milhar(self):
        assert parse_brasileiro("1 234,56") == 1234.56
