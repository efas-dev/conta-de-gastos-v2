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


def _converter_caminho_wsl(raw: str) -> str:
    """Converte caminho Windows (C:\\...) para WSL (/mnt/c/...) se necessário."""
    import re
    m = re.match(r"^([A-Za-z]):[\\\/]", raw)
    if m:
        drive = m.group(1).lower()
        resto = raw[3:].replace("\\", "/")
        return f"/mnt/{drive}/{resto}"
    return raw


def _validar_arquivos(caminhos_raw: list[str]) -> list[Path]:
    """Valida e filtra caminhos de arquivos, retornando os válidos."""
    validos: list[Path] = []
    for raw in caminhos_raw:
        raw = raw.strip().strip("'\"")
        if not raw:
            continue
        raw = _converter_caminho_wsl(raw)
        caminho = Path(raw)
        if not caminho.exists():
            console.print(f"  [red]✗[/] Arquivo não encontrado: {caminho}")
            continue
        if caminho.suffix.lower() not in (".csv", ".pdf", ".txt"):
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
        "Aprender de minuta existente",
        "Configurar",
        "Verificar atualização",
        "Sair",
    ])
    if escolha == 0:
        return "iniciar"
    if escolha == 1:
        return "aprender_existente"
    if escolha == 2:
        return "configurar"
    if escolha == 3:
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
            partes = shlex.split(linha, posix=False)
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
    """Lê planilha preenchida e atualiza dicionário.

    Captura erros de leitura para que a TUI não morra: mostra mensagem
    acionável e volta ao menu principal.
    """
    from gastos.classificador import preparar_aprendizado
    from gastos.db import (
        DB_PATH,
        atualizar_lancamentos_aprendidos,
        fontes_conhecidas,
        marcar_minuta_aprendida,
        salvar_dicionario,
    )
    from gastos.main import _detectar_mes
    from gastos.sheets import ErroLeituraPlanilha, backup_sqlite_para_drive, ler_planilha

    spreadsheet_id = url.split("/d/")[1].split("/")[0] if "/d/" in url else url
    _tela("Lendo planilha preenchida...")

    try:
        leitura = ler_planilha(spreadsheet_id, credenciais, fontes_conhecidas())
    except ErroLeituraPlanilha as e:
        _tela_erro_leitura(url, e.invalidas)
        return
    except Exception as e:
        _tela_erro_generico(url, e)
        return

    lancamentos_planilha = leitura.lancamentos

    if leitura.puladas:
        console.print()
        console.print(f"  [yellow]Aviso:[/] {len(leitura.puladas)} linha(s) ignorada(s):")
        for p in leitura.puladas:
            console.print(f"    Linha {p.linha}: {p.motivo}")
            console.print(f"      [dim]{p.conteudo}[/]")
        console.print()

    registros = preparar_aprendizado(lancamentos_planilha)
    salvos, atualizados, ambiguos = salvar_dicionario(registros)
    console.print(f"  Dicionário: {salvos} novos, {atualizados} reforçados, {ambiguos} ambíguos")

    # Atualiza lançamentos persistidos com a classificação verificada e marca a minuta.
    if lancamentos_planilha:
        mes = _detectar_mes(lancamentos_planilha)
        atualizados_lc = atualizar_lancamentos_aprendidos(
            [lc.to_dict() for lc in lancamentos_planilha], mes,
        )
        if atualizados_lc:
            console.print(f"  Lançamentos: {atualizados_lc} marcados como verificados")
    marcar_minuta_aprendida(spreadsheet_id)

    backup_sqlite_para_drive(DB_PATH, credenciais)
    _tela_aprender_resultado(len(lancamentos_planilha))


def _tela_erro_leitura(url: str, invalidas: list) -> None:
    """Tela de erro: linhas inválidas impedem a leitura."""
    _tela()
    linhas_txt = "\n".join(
        f"  Linha {inv.linha}: {inv.motivo}\n    [dim]{inv.conteudo}[/]"
        for inv in invalidas
    )
    console.print(Padding(
        Panel(
            f"[bold red]Não consegui ler a planilha.[/]\n\n"
            f"Corrija as linhas abaixo e tente aprender de novo:\n\n"
            f"{linhas_txt}\n\n"
            f"[link={url}]{url}[/link]",
            border_style="red",
            title="Erro de leitura",
        ),
        (0, 0, 0, len(_MARGEM)),
    ))
    console.print()
    _menu("", ["Ok"])


def _tela_erro_generico(url: str, erro: Exception) -> None:
    """Tela de erro: falha inesperada."""
    _tela()
    console.print(Padding(
        Panel(
            f"[bold red]Erro ao processar a planilha:[/]\n\n"
            f"{type(erro).__name__}: {erro}\n\n"
            f"[link={url}]{url}[/link]",
            border_style="red",
            title="Erro",
        ),
        (0, 0, 0, len(_MARGEM)),
    ))
    console.print()
    _menu("", ["Ok"])


def _criar_e_persistir_minuta(todos_lancamentos: list, credenciais) -> str:
    """Persiste lançamentos, cria a minuta no Sheets, persiste e vincula a minuta.

    Retorna a URL da minuta criada. Centraliza o que o CLI antigo (main.py)
    já fazia para que a TUI tenha o mesmo comportamento de persistência.
    """
    from gastos.configuracao import obter_iniciais
    from gastos.db import (
        DB_PATH,
        limpar_lancamentos_nao_classificados,
        salvar_lancamentos,
        salvar_minuta,
        vincular_lancamentos_minuta,
    )
    from gastos.main import _detectar_mes
    from gastos.sheets import backup_sqlite_para_drive, criar_minuta

    mes = _detectar_mes(todos_lancamentos)
    limpar_lancamentos_nao_classificados(mes)
    salvar_lancamentos([lc.to_dict() for lc in todos_lancamentos], mes)

    nome = f"{mes} - {obter_iniciais()}"
    url = criar_minuta(todos_lancamentos, nome, credenciais)
    spreadsheet_id = url.split("/d/")[1].split("/")[0]
    minuta_id = salvar_minuta(mes, spreadsheet_id, url)
    vincular_lancamentos_minuta(mes, minuta_id)

    backup_sqlite_para_drive(DB_PATH, credenciais)
    return url


def _fluxo_iniciar() -> None:
    """Orquestra as telas do fluxo de ingestão com navegação voltar/avançar."""
    from gastos.main import _credenciais_google

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
    url = _criar_e_persistir_minuta(todos_lancamentos, credenciais)

    escolha = _tela_pos_processamento(url)
    if escolha == "aprender":
        _aprender_planilha(url, credenciais)


def _fluxo_aprender_existente() -> None:
    """Menu para escolher uma minuta já criada (do banco) ou colar URL avulsa."""
    from gastos.db import listar_minutas
    from gastos.main import _credenciais_google

    minutas = listar_minutas()

    opcoes: list[str] = []
    for m in minutas:
        status = "[aprendida]" if m["aprendida_em"] else "[pendente]"
        criada = m["criada_em"][:10]
        opcoes.append(f"{m['mes_referencia']} {status}  criada em {criada}")
    opcoes.append("Colar URL manualmente")
    opcoes.append("← Voltar")

    _tela("Selecione a minuta a aprender")
    console.print()
    escolha = _menu("", opcoes)

    if escolha is None or escolha == len(opcoes) - 1:
        return  # voltar

    if escolha == len(opcoes) - 2:
        # colar URL manual
        _tela("Cole a URL da planilha (ou só o spreadsheet_id) e pressione Enter")
        console.print()
        url = input(f"{_MARGEM}> ").strip()
        if not url:
            return
    else:
        url = minutas[escolha]["url"]

    credenciais = _credenciais_google()
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


def _executar_atualizacao(local: str, remota: str) -> bool:
    """Roda `uv tool install --upgrade`. Retorna True se sucesso."""
    from gastos.atualizacao import atualizar

    console.print()
    console.print(f"  Atualizando {local} → [bold green]{remota}[/]...")
    ok, msg = atualizar()
    if ok:
        console.print("  [bold green]Atualizado![/] Reinicie o [bold]cg[/] para usar a nova versão.")
        console.print()
        _menu("", ["Ok"])
        return True
    console.print(f"  [red]Falha na atualização:[/]")
    for linha in msg.splitlines()[-5:]:
        console.print(f"  [dim]{linha}[/]")
    console.print()
    _menu("", ["Ok"])
    return False


def _verificar_atualizacao_no_startup() -> None:
    """Check silencioso ao abrir a TUI. 1x por dia. Erros são ignorados."""
    try:
        from gastos.atualizacao import verificar_atualizacao
        resultado = verificar_atualizacao()
    except Exception:
        return

    if not resultado:
        return

    local, remota = resultado
    _tela()
    console.print(
        f"  [bold yellow]Nova versão disponível:[/] "
        f"{local} → [bold green]{remota}[/]"
    )
    console.print()
    escolha = _menu("", ["Atualizar agora", "Pular"])
    if escolha == 0:
        _executar_atualizacao(local, remota)


def _verificar_atualizacao_menu() -> bool:
    """Check manual a partir do menu. Retorna True se atualizou (deve sair)."""
    from gastos.atualizacao import _versao_instalada, verificar_atualizacao

    _tela("Verificando atualização...")
    local = _versao_instalada()
    try:
        resultado = verificar_atualizacao(forcar=True)
    except Exception as e:
        console.print(f"  [red]Erro ao verificar:[/] {type(e).__name__}: {e}")
        console.print()
        _menu("", ["Ok"])
        return False

    if resultado is None:
        # Pode ser "já está atualizado" OU falha de rede. Diferencia.
        from gastos.atualizacao import _versao_remota
        if _versao_remota() is None:
            console.print("  [yellow]Não foi possível consultar o GitHub.[/] Verifique sua conexão.")
        else:
            console.print(f"  [green]Você está na versão mais recente ({local}).[/]")
        console.print()
        _menu("", ["Ok"])
        return False

    local, remota = resultado
    console.print(
        f"  [bold yellow]Nova versão:[/] {local} → [bold green]{remota}[/]"
    )
    console.print()
    escolha = _menu("", ["Atualizar agora", "← Voltar"])
    if escolha == 0:
        return _executar_atualizacao(local, remota)
    return False


def executar() -> None:
    """Ponto de entrada da TUI."""
    if "--uninstall" in sys.argv:
        _desinstalar()
        return

    args = sys.argv[1:]

    if args:
        from gastos.main import _credenciais_google

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
        url = _criar_e_persistir_minuta(todos_lancamentos, credenciais)

        escolha = _tela_pos_processamento(url)
        if escolha == "aprender":
            _aprender_planilha(url, credenciais)
        return

    _verificar_atualizacao_no_startup()

    try:
        while True:
            acao = _tela_principal()

            if acao == "iniciar":
                _fluxo_iniciar()
            elif acao == "aprender_existente":
                _fluxo_aprender_existente()
            elif acao == "configurar":
                from gastos.wizard import executar_wizard
                executar_wizard()
            elif acao == "atualizar":
                if _verificar_atualizacao_menu():
                    return
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
