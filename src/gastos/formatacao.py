def formatar_brasileiro(valor: float) -> str:
    """Converte float para formato brasileiro: 1234.56 -> '1.234,56'"""
    negativo = valor < 0
    valor = abs(valor)
    inteiro = int(valor)
    centavos = round((valor - inteiro) * 100)
    if centavos == 100:
        inteiro += 1
        centavos = 0

    parte_inteira = f"{inteiro:,}".replace(",", ".")
    resultado = f"{parte_inteira},{centavos:02d}"
    return f"-{resultado}" if negativo else resultado


def parse_brasileiro(texto: str) -> float:
    """Converte formato brasileiro para float: '1.234,56' -> 1234.56

    Tolera espaços internos ('- 715,51 ') que o Google Sheets pode introduzir
    em células formatadas como moeda.
    """
    texto = texto.replace(" ", "").replace(".", "").replace(",", ".")
    return float(texto)


def parse_valor(texto: str) -> float:
    """Converte texto numérico para float aceitando formato US ('20.97',
    '1234.56') ou BR ('20,97', '1.234,56').

    Heurística: o separador decimal é o que aparecer mais à direita; o outro,
    se presente, é tratado como separador de milhar e removido.
    """
    texto = texto.strip().replace(" ", "")
    tem_virgula = "," in texto
    tem_ponto = "." in texto
    if tem_virgula and tem_ponto:
        if texto.rfind(",") > texto.rfind("."):
            texto = texto.replace(".", "").replace(",", ".")
        else:
            texto = texto.replace(",", "")
    elif tem_virgula:
        texto = texto.replace(",", ".")
    return float(texto)
