"""Classificação de lançamentos: normalização de chaves e lookup no dicionário."""

import re
from dataclasses import replace

from gastos.modelos import Lancamento

Indice = dict[tuple[str, str], dict]


def normalizar_chave(transcricao: str) -> str:
    """Remove sufixos de data e normaliza a transcrição para uso como chave."""
    chave = re.sub(r"\s*D?\d{2}/\d{2}(/\d{2,4})?\s*$", "", transcricao)
    return chave.strip()


def classificar(lancamentos: list[Lancamento], indice: Indice) -> tuple[list[Lancamento], int]:
    """Preenche natureza/descrição dos lançamentos usando o dicionário.

    Retorna (lançamentos classificados, quantidade classificada).
    Função pura — não acessa banco nem imprime.
    """
    resultado = []
    classificados = 0

    for lc in lancamentos:
        if lc.natureza and lc.descricao:
            resultado.append(lc)
            continue

        chave = normalizar_chave(lc.registro)
        entrada = indice.get((chave, lc.fonte))

        if entrada and not entrada["ambiguo"]:
            resultado.append(replace(lc, natureza=entrada["natureza"], descricao=entrada["descricao"]))
            classificados += 1
        else:
            resultado.append(lc)

    return resultado, classificados


def preparar_aprendizado(lancamentos: list[Lancamento]) -> list[dict]:
    """Prepara registros para salvar no dicionário.

    Função pura — retorna os registros sem acessar banco.
    """
    registros = []
    for lc in lancamentos:
        if not lc.natureza and not lc.descricao:
            continue
        registros.append({
            "chave": normalizar_chave(lc.registro),
            "fonte": lc.fonte,
            "natureza": lc.natureza,
            "descricao": lc.descricao,
        })
    return registros
