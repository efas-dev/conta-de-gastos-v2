"""Interface de terminal interativa para o Gastos."""

import shlex
import sys
from pathlib import Path

from rich.console import Console
from rich.padding import Padding
from rich.panel import Panel
from rich.table import Table
from simple_term_menu import TerminalMenu


_MARGEM = "  "

console = Console()

TITULO = "[bold]Conta de gastos[/]"


def _tela(conteudo: str | None = None) -> None:
    """Limpa o terminal e exibe o cabeçalho da aplicação."""
    print("\033[H\033[2J", end="", flush=True)
    console.print()
    console.print(f"{_MARGEM}{TITULO}")
    console.print(f"{_MARGEM}[blue]─[/]" * len("Conta de gastos"))
    if conteudo:
        console.print()
        indentado = "\n".join(f"{_MARGEM}{l}" for l in conteudo.split("\n"))
        console.print(indentado)


def _menu(titulo: str, opcoes: list[str]) -> int | None:
    """Exibe menu navegável com setas. Retorna o índice ou None se cancelado."""
    menu = TerminalMenu(
        [f"{_MARGEM}{op}" for op in opcoes],
        title=f"{_MARGEM}{titulo.strip()}" if titulo.strip() else "",
        menu_cursor_style=("fg_cyan", "bold"),
        menu_highlight_style=("fg_cyan", "bold"),
    )
    return menu.show()


def _validar_arquivos(caminhos_raw: list[str]) -> list[Path]:
    """Valida e filtra caminhos de arquivos, retornando os válidos."""
    validos: list[Path] = []
    for raw in caminhos_raw:
        raw = raw.strip().strip("'\"")
        if not raw:
            continue
        caminho = Path(raw)
        if not caminho.exists():
            console.print(f"  [red]✗[/] Arquivo não encontrado: {caminho}")
            continue
        if caminho.suffix.lower() not in (".csv", ".pdf"):
            console.print(f"  [red]✗[/] Formato não suportado: {caminho.name}")
            continue
        validos.append(caminho)
        console.print(f"  [green]✓[/] {caminho.name}")
    return validos


# ---------------------------------------------------------------------------
# Telas
# ---------------------------------------------------------------------------

def _tela_principal() -> str:
    """Tela 1: menu principal. Retorna ação."""
    _tela()
    escolha = _menu("\nUse ↑↓ para navegar, Enter para selecionar\n", [
        "Iniciar processamento",
        "Configurar",
        "Verificar atualização",
        "Sair",
    ])
    if escolha == 0:
        return "iniciar"
    if escolha == 1:
        return "configurar"
    if escolha == 2:
        return "atualizar"
    return "sair"


def _tela_arquivos() -> list[Path] | None:
    """Tela 2: entrada de arquivos. Retorna lista de Paths ou None para voltar."""
    while True:
        _tela(
            "Arraste os arquivos de extrato e fatura (PDF/CSV) para o terminal\n"
            "e pressione [bold cyan]Enter[/].\n\n"
            "Para voltar, deixe vazio e pressione [bold cyan]Enter[/]."
        )
        console.print()

        linha = input(f"{_MARGEM}> ").strip()
        if not linha:
            return None

        try:
            partes = shlex.split(linha)
        except ValueError:
            partes = [linha]

        caminhos = _validar_arquivos(partes)
        if not caminhos:
            console.print()
            escolha = _menu("Nenhum arquivo válido.", ["Tentar novamente", "← Voltar"])
            if escolha == 1 or escolha is None:
                return None
            continue

        return caminhos


def _tela_confirmar(caminhos: list[Path]) -> bool | None:
    """Tela 3: confirmar arquivos. Retorna True, False (cancelar) ou None (voltar)."""
    _tela()

    tabela = Table(title="Arquivos para processamento", border_style="blue")
    tabela.add_column("#", style="dim", width=3)
    tabela.add_column("Arquivo")
    tabela.add_column("Formato", justify="center")
    for i, p in enumerate(caminhos, 1):
        tabela.add_row(str(i), p.name, p.suffix.upper())
    console.print(Padding(tabela, (0, 0, 0, len(_MARGEM))))
    console.print()

    escolha = _menu("", ["Avançar →", "← Voltar"])
    if escolha == 0:
        return True
    return None


def _tela_pos_processamento(url: str) -> str:
    """Tela 5: resultado. Retorna 'aprender' ou 'sair'."""
    _tela()
    console.print(Padding(
        Panel(
            f"[bold green]Minuta criada com sucesso![/]\n\n"
            f"[link={url}]{url}[/link]\n\n"
            "Abra o link, preencha [bold]Natureza[/] e [bold]Descrição[/],\n"
            "e depois escolha uma opção abaixo.",
            border_style="green",
            title="Minuta pronta",
        ),
        (0, 0, 0, len(_MARGEM)),
    ))
    console.print()

    escolha = _menu("", [
        "Aprender — alimenta o dicionário com seu preenchimento",
        "Sair sem aprender",
    ])
    return "aprender" if escolha == 0 else "sair"


def _tela_aprender_resultado(total: int) -> None:
    """Tela 6: resultado do aprendizado."""
    _tela()
    console.print(f"  [bold green]Dicionário atualizado![/] {total} lançamentos lidos.")
    console.print()
    _menu("", ["Ok"])


# ---------------------------------------------------------------------------
# Fluxo principal
# ---------------------------------------------------------------------------

def _processar_arquivos(caminhos: list[Path]) -> list:
    """Parseia arquivos e retorna lançamentos ordenados e classificados."""
    from gastos.classificador import classificar
    from gastos.db import carregar_dicionario
    from gastos.main import _chave_ordenacao
    from gastos.parsers import detectar

    todos_lancamentos = []
    for arq in caminhos:
        parser = detectar(arq)
        if parser is None:
            console.print(f"  [yellow]?[/] {arq.name} — tipo não reconhecido, pulando")
            continue
        console.print(f"  [green]+[/] {arq.name} → {type(parser).__name__}")
        todos_lancamentos.extend(parser.parsear(arq))

    if not todos_lancamentos:
        return []

    todos_lancamentos.sort(key=_chave_ordenacao)

    indice = carregar_dicionario()
    todos_lancamentos, classificados = classificar(todos_lancamentos, indice)
    if classificados:
        console.print(f"  Dicionário: {classificados} classificados automaticamente")

    console.print(f"  [bold]{len(todos_lancamentos)}[/] lançamentos extraídos")
    return todos_lancamentos


def _aprender_planilha(url: str, credenciais) -> None:
    """Lê planilha preenchida e atualiza dicionário."""
    from gastos.classificador import preparar_aprendizado
    from gastos.db import DB_PATH, salvar_dicionario
    from gastos.sheets import backup_sqlite_para_drive, ler_planilha

    spreadsheet_id = url.split("/d/")[1].split("/")[0] if "/d/" in url else url
    _tela("Lendo planilha preenchida...")
    lancamentos_planilha = ler_planilha(spreadsheet_id, credenciais)

    registros = preparar_aprendizado(lancamentos_planilha)
    salvos, atualizados, ambiguos = salvar_dicionario(registros)
    console.print(f"  Dicionário: {salvos} novos, {atualizados} reforçados, {ambiguos} ambíguos")

    backup_sqlite_para_drive(DB_PATH, credenciais)
    _tela_aprender_resultado(len(lancamentos_planilha))


def _fluxo_iniciar() -> None:
    """Orquestra as telas do fluxo de ingestão com navegação voltar/avançar."""
    from gastos.db import DB_PATH
    from gastos.main import _credenciais_google, _detectar_mes
    from gastos.sheets import backup_sqlite_para_drive, criar_minuta

    caminhos = _tela_arquivos()
    if caminhos is None:
        return

    while True:
        confirmado = _tela_confirmar(caminhos)
        if confirmado is None:
            caminhos = _tela_arquivos()
            if caminhos is None:
                return
            continue
        break

    _tela("Processando...")
    todos_lancamentos = _processar_arquivos(caminhos)
    if not todos_lancamentos:
        console.print()
        console.print(f"{_MARGEM}[red]Nenhum lançamento extraído dos arquivos.[/]")
        console.print()
        _menu("", ["← Voltar"])
        return

    credenciais = _credenciais_google()
    mes = _detectar_mes(todos_lancamentos)
    from gastos.configuracao import obter_iniciais
    nome = f"{mes} - {obter_iniciais()}"
    url = criar_minuta(todos_lancamentos, nome, credenciais)
    backup_sqlite_para_drive(DB_PATH, credenciais)

    escolha = _tela_pos_processamento(url)
    if escolha == "aprender":
        _aprender_planilha(url, credenciais)


def _desinstalar() -> None:
    """Remove o pacote via uv tool uninstall."""
    import subprocess

    console.print()
    console.print("  Desinstalando gastos...")
    resultado = subprocess.run(
        ["uv", "tool", "uninstall", "gastos"],
        capture_output=True,
        text=True,
    )
    if resultado.returncode == 0:
        console.print("  [green]Desinstalado com sucesso.[/]")
        console.print()
        console.print("  [dim]Para remover também o uv:[/]")
        console.print("  [dim]  rm ~/.local/bin/uv ~/.local/bin/uvx[/]")
    else:
        console.print(f"  [red]Erro: {resultado.stderr.strip()}[/]")
    console.print()


def executar() -> None:
    """Ponto de entrada da TUI."""
    if "--uninstall" in sys.argv:
        _desinstalar()
        return

    args = sys.argv[1:]

    if args:
        from gastos.db import DB_PATH
        from gastos.main import _credenciais_google, _detectar_mes
        from gastos.sheets import backup_sqlite_para_drive, criar_minuta

        console.print()
        caminhos = _validar_arquivos(args)
        if not caminhos:
            console.print(f"{_MARGEM}[red]Nenhum arquivo válido encontrado.[/]")
            sys.exit(1)

        confirmado = _tela_confirmar(caminhos)
        if not confirmado:
            return

        _tela("Processando...")
        todos_lancamentos = _processar_arquivos(caminhos)
        if not todos_lancamentos:
            console.print(f"{_MARGEM}[red]Nenhum lançamento extraído.[/]")
            return

        credenciais = _credenciais_google()
        mes = _detectar_mes(todos_lancamentos)
        from gastos.configuracao import obter_iniciais
        url = criar_minuta(todos_lancamentos, f"{mes} - {obter_iniciais()}", credenciais)
        backup_sqlite_para_drive(DB_PATH, credenciais)

        escolha = _tela_pos_processamento(url)
        if escolha == "aprender":
            _aprender_planilha(url, credenciais)
        return

    # Verificação de atualização (1x por dia, silencia erros)
    try:
        from gastos.atualizacao import atualizar, verificar_atualizacao
        resultado = verificar_atualizacao()
        if resultado:
            local, remota = resultado
            _tela()
            console.print(
                f"  [bold yellow]Nova versão disponível:[/] "
                f"{local} → [bold green]{remota}[/]"
            )
            console.print()
            escolha = _menu("", ["Atualizar agora", "Pular"])
            if escolha == 0:
                console.print()
                console.print("  Atualizando...")
                if atualizar():
                    console.print("  [bold green]Atualizado![/] Reinicie o cg.")
                    console.print()
                    return
                else:
                    console.print("  [red]Falha na atualização.[/]")
                    _menu("", ["Ok"])
    except Exception:
        pass

    try:
        while True:
            acao = _tela_principal()

            if acao == "iniciar":
                _fluxo_iniciar()
            elif acao == "configurar":
                from gastos.wizard import executar_wizard
                executar_wizard()
            elif acao == "atualizar":
                from gastos.atualizacao import atualizar, verificar_atualizacao
                _tela("Verificando atualização...")
                from gastos.atualizacao import (
                    _registrar_checagem,
                    _versao_instalada,
                    _versao_remota,
                    _comparar_versoes,
                )
                remota = _versao_remota()
                local = _versao_instalada()
                if remota and _comparar_versoes(local, remota):
                    console.print(
                        f"  [bold yellow]Nova versão:[/] {local} → "
                        f"[bold green]{remota}[/]"
                    )
                    console.print()
                    escolha = _menu("", ["Atualizar agora", "← Voltar"])
                    if escolha == 0:
                        console.print()
                        console.print("  Atualizando...")
                        if atualizar():
                            console.print("  [bold green]Atualizado![/] Reinicie o cg.")
                            console.print()
                            return
                        else:
                            console.print("  [red]Falha na atualização.[/]")
                            _menu("", ["Ok"])
                else:
                    console.print(f"  [green]Você está na versão mais recente ({local}).[/]")
                    console.print()
                    _menu("", ["Ok"])
            else:
                _tela()
                console.print("  [dim]Até logo![/]")
                console.print()
                break
    except KeyboardInterrupt:
        console.print(f"\n{_MARGEM}[dim]Interrompido.[/]")
        sys.exit(0)


if __name__ == "__main__":
    executar()
