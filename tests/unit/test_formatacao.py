from gastos.formatacao import formatar_brasileiro, parse_brasileiro, parse_valor


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


class TestParseValor:
    def test_us_decimal_ponto(self):
        assert parse_valor("20.97") == 20.97

    def test_br_decimal_virgula(self):
        assert parse_valor("20,97") == 20.97

    def test_us_milhar_e_decimal(self):
        assert parse_valor("1,234.56") == 1234.56

    def test_br_milhar_e_decimal(self):
        assert parse_valor("1.234,56") == 1234.56

    def test_inteiro(self):
        assert parse_valor("100") == 100.0

    def test_negativo_br(self):
        assert parse_valor("-99,90") == -99.90

    def test_espacos(self):
        assert parse_valor("  20,97  ") == 20.97
