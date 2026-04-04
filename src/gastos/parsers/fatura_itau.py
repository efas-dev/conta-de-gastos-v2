import re
from datetime import date, datetime
from pathlib import Path

import pdfplumber

from gastos.formatacao import parse_brasileiro
from gastos.modelos import Lancamento


def _extrair_ano_referencia(texto: str) -> int:
    """Extrai o ano da fatura a partir da data de emissão ou vencimento."""
    match = re.search(r"(?:Emissão|Vencimento)[:\s]+(\d{2}/\d{2}/\d{4})", texto)
    if match:
        return datetime.strptime(match.group(1), "%d/%m/%Y").year
    return date.today().year


class FaturaItau:
    def aceita(self, caminho: Path) -> bool:
        if caminho.suffix.lower() != ".pdf":
            return False
        with pdfplumber.open(caminho) as pdf:
            if not pdf.pages:
                return False
            texto = ""
            for p in pdf.pages[:2]:
                texto += (p.extract_text() or "") + "\n"
            texto_lower = texto.lower()
        if "lançamentos" in texto_lower and ("compras" in texto_lower or "saques" in texto_lower):
            return True
        if "resumo da fatura" in texto_lower and "itaú" in texto_lower.replace("itau", "itaú"):
            return True
        return False

    def parsear(self, caminho: Path) -> list[Lancamento]:
        texto_completo = ""
        with pdfplumber.open(caminho) as pdf:
            for pagina in pdf.pages:
                texto_completo += (pagina.extract_text() or "") + "\n"

        ano = _extrair_ano_referencia(texto_completo)
        lancamentos = []
        cartao_atual = None
        em_compras_parceladas = False

        for linha in texto_completo.split("\n"):
            linha = linha.strip()
            if not linha:
                continue

            if "compras parceladas" in linha.lower() and (
                "próximas" in linha.lower() or "proximas" in linha.lower()
            ):
                em_compras_parceladas = True
                continue

            match_cartao = re.search(r"\(final\s+(\d{4})\)", linha, re.IGNORECASE)
            if match_cartao:
                from gastos.configuracao import obter_nome_usuario
                nome = obter_nome_usuario()
                if nome is None or nome.upper() in linha.upper():
                    cartao_atual = match_cartao.group(1)
                em_compras_parceladas = False
                continue

            if em_compras_parceladas:
                continue

            if "lançamentos no cartão" in linha.lower():
                continue
            if "total dos lançamentos" in linha.lower():
                continue
            if linha.upper().startswith("DATA") and "ESTABELECIMENTO" in linha.upper():
                continue

            if not cartao_atual:
                continue

            match = re.match(
                r"[@\uf0d2]?(\d{2}/\d{2})\s+(.+?)\s+(\d{2}/\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})",
                linha,
            )
            if match:
                dia_mes = match.group(1)
                estabelecimento = match.group(2).strip()
                try:
                    valor = -parse_brasileiro(match.group(4))
                    dt = datetime.strptime(f"{dia_mes}/{ano}", "%d/%m/%Y").date()
                except ValueError:
                    continue
                lancamentos.append(
                    Lancamento(
                        fonte=f"fatura_itau_cc_{cartao_atual}",
                        natureza="",
                        descricao="",
                        valor=valor,
                        registro=estabelecimento,
                        data=dt,
                    )
                )

        return lancamentos
