import re
from dataclasses import dataclass
from datetime import date

# Padrões de transcrição que indicam movimentação interna (não afeta saldo consolidado)
# O placeholder {nome} é substituído pelo nome configurado do usuário.
_PADROES_INTERNOS = [
    r"^RESGATE CDB",
    r"^APLICACAO",
    r"^ITAU BLACK",           # pagamento de fatura CC no extrato
    r"^Resgate RDB",
    r"^Pagamento de fatura",
    r"Transferência .+ pelo Pix .+ Open Banking",  # transferência entre contas próprias
    r"Transferência enviada pelo Pix - {nome}",     # transferência para conta própria
]

_cache_re_interno: re.Pattern | None = None


def _re_interno() -> re.Pattern:
    """Compila regex de padrões internos (lazy, com cache)."""
    global _cache_re_interno
    if _cache_re_interno is not None:
        return _cache_re_interno

    from gastos.configuracao import obter_nome_usuario
    nome = obter_nome_usuario() or "Eduardo"

    padroes = [p.format(nome=re.escape(nome)) for p in _PADROES_INTERNOS]
    _cache_re_interno = re.compile("|".join(f"({p})" for p in padroes))
    return _cache_re_interno


@dataclass
class Lancamento:
    fonte: str
    natureza: str
    descricao: str
    valor: float
    registro: str
    data: date

    def to_dict(self) -> dict:
        """Serializa para dict (usado pelo SQLite)."""
        return {
            "fonte": self.fonte,
            "natureza": self.natureza,
            "descricao": self.descricao,
            "valor": self.valor,
            "registro": self.registro,
            "data": self.data.isoformat(),
        }

    @property
    def interno(self) -> bool:
        """Movimentação interna (transferência entre contas, resgate, pagamento CC)."""
        return bool(_re_interno().search(self.registro))
