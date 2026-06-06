import argparse
import sys
from collections import Counter
from pathlib import Path

from gastos.modelos import Lancamento
from gastos.parsers import detectar

# Ordem de agrupamento das fontes na saída
ORDEM_FONTES = [
    "extrato_itau",
    "extrato_nubank",
    "fatura_itau_cc",  # prefixo — cobre fatura_itau_cc_9572, _2555, etc.
    "fatura_nubank_cc",
]


def _chave_ordenacao(lc: Lancamento) -> tuple[int, ...]:
    """Ordena por grupo de fonte (conforme ORDEM_FONTES), depois por data."""
    for i, prefixo in enumerate(ORDEM_FONTES):
        if lc.fonte.startswith(prefixo):
            return (i, lc.data.toordinal())
    return (len(ORDEM_FONTES), lc.data.toordinal())


def _ingerir(input_dir: Path) -> list[Lancamento]:
    """Lê todos os arquivos de entrada e retorna lançamentos ordenados."""
    if not input_dir.exists():
        print(f"Diretório de entrada não encontrado: {input_dir}")
        sys.exit(1)

    arquivos = sorted(
        p for p in input_dir.iterdir() if p.is_file() and p.suffix.lower() in (".csv", ".pdf", ".txt")
    )

    if not arquivos:
        print("Nenhum arquivo CSV, PDF ou TXT encontrado em", input_dir)
        sys.exit(1)

    todos_lancamentos = []
    contagem = Counter()

    for arq in arquivos:
        parser = detectar(arq)
        if parser is None:
            print(f"  [?] {arq.name} — tipo não reconhecido, pulando")
            continue

        print(f"  [+] {arq.name} -> {type(parser).__name__}")
        lancamentos = parser.parsear(arq)
        todos_lancamentos.extend(lancamentos)
        for lc in lancamentos:
            contagem[lc.fonte] += 1

    todos_lancamentos.sort(key=_chave_ordenacao)

    for fonte, qtd in sorted(contagem.items()):
        print(f"    {fonte}: {qtd}")

    return todos_lancamentos


def _detectar_mes(lancamentos: list[Lancamento]) -> str:
    """Detecta o mês de referência (AAAA-MM) a partir das datas dos extratos."""
    datas_extrato = [
        lc.data for lc in lancamentos if lc.fonte.startswith("extrato_")
    ]
    if not datas_extrato:
        print("Nenhum lançamento de extrato encontrado para detectar o mês.")
        sys.exit(1)

    meses = Counter(d.strftime("%Y-%m") for d in datas_extrato)
    mes, _ = meses.most_common(1)[0]
    return mes


def _credenciais_google() -> Path:
    """Retorna o caminho das credenciais OAuth do Google."""
    from gastos.configuracao import obter_credenciais_path
    try:
        return obter_credenciais_path()
    except FileNotFoundError as e:
        print(f"  {e}")
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingestão de extratos e faturas bancárias")
    parser.add_argument(
        "--minuta",
        action="store_true",
        help="Cria minuta no Google Sheets após a ingestão.",
    )
    parser.add_argument(
        "--aprender",
        metavar="SPREADSHEET_ID",
        help="Lê planilha preenchida e alimenta o dicionário.",
    )
    parser.add_argument("--input-dir", type=Path, default=None)
    args = parser.parse_args()

    raiz = Path(__file__).resolve().parent.parent.parent

    # Modo aprender: lê planilha e salva no dicionário
    if args.aprender:
        from gastos.classificador import preparar_aprendizado
        from gastos.db import (
            DB_PATH,
            atualizar_lancamentos_aprendidos,
            fontes_conhecidas,
            marcar_minuta_aprendida,
            salvar_dicionario,
        )
        from gastos.sheets import ErroLeituraPlanilha, backup_sqlite_para_drive, ler_planilha

        credenciais = _credenciais_google()
        print(f"  Lendo planilha {args.aprender}...")
        try:
            leitura = ler_planilha(args.aprender, credenciais, fontes_conhecidas())
        except ErroLeituraPlanilha as e:
            print("  Não consegui ler a planilha. Corrija as linhas abaixo:")
            for inv in e.invalidas:
                print(f"    Linha {inv.linha}: {inv.motivo} — {inv.conteudo}")
            sys.exit(1)
        lancamentos = leitura.lancamentos
        for p in leitura.puladas:
            print(f"  Aviso: linha {p.linha} pulada ({p.motivo}) — {p.conteudo}")
        print(f"  {len(lancamentos)} lançamentos lidos da planilha")

        registros = preparar_aprendizado(lancamentos)
        salvos, atualizados, ambiguos = salvar_dicionario(registros)
        print(f"  Dicionário: {salvos} novos, {atualizados} reforçados, {ambiguos} ambíguos")

        mes = _detectar_mes(lancamentos)
        atualizados_lc = atualizar_lancamentos_aprendidos(
            [lc.to_dict() for lc in lancamentos],
            mes,
        )
        marcar_minuta_aprendida(args.aprender)
        print(f"  {atualizados_lc} lançamentos atualizados com classificação verificada")
        backup_sqlite_para_drive(DB_PATH, credenciais)
        return

    # Modo ingestão normal
    input_dir = args.input_dir or raiz / "input"

    lancamentos = _ingerir(input_dir)

    # Auto-classificar usando dicionário
    from gastos.classificador import classificar
    from gastos.db import (
        DB_PATH,
        carregar_dicionario,
        limpar_lancamentos_nao_classificados,
        salvar_lancamentos,
        salvar_minuta,
        vincular_lancamentos_minuta,
    )

    indice = carregar_dicionario()
    lancamentos, classificados = classificar(lancamentos, indice)
    if classificados:
        print(f"  Dicionário: {classificados} lançamentos classificados automaticamente")

    mes = _detectar_mes(lancamentos)
    removidos = limpar_lancamentos_nao_classificados(mes)
    if removidos:
        print(f"  {removidos} lançamentos anteriores (não classificados) removidos")
    salvos = salvar_lancamentos([lc.to_dict() for lc in lancamentos], mes)
    print(f"  {salvos} lançamentos salvos no SQLite (mês {mes})")

    if args.minuta:
        from gastos.sheets import backup_sqlite_para_drive, criar_minuta

        credenciais = _credenciais_google()
        from gastos.configuracao import obter_iniciais
        nome = f"{mes} - {obter_iniciais()}"
        url = criar_minuta(lancamentos, nome, credenciais)
        spreadsheet_id = url.split("/d/")[1]
        minuta_id = salvar_minuta(mes, spreadsheet_id, url)
        vincular_lancamentos_minuta(mes, minuta_id)
        print(f"  Minuta registrada no SQLite (id={minuta_id})")
        backup_sqlite_para_drive(DB_PATH, credenciais)


if __name__ == "__main__":
    main()
