"""Wizard interativo de configuração inicial."""

import re
import shlex
from pathlib import Path

from rich.console import Console
from rich.padding import Padding
from rich.panel import Panel
from simple_term_menu import TerminalMenu

from gastos.configuracao import (
    itens_configurados,
    obter_credenciais_path,
    obter_token_path,
    salvar_credenciais_de_arquivo,
    salvar_credenciais_de_input,
    salvar_iniciais,
    salvar_nome_usuario,
    salvar_pasta_destino,
)

_MARGEM = "  "

console = Console()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _limpar_e_titulo(titulo: str | None = None) -> None:
    print("\033[H\033[2J", end="", flush=True)
    console.print()
    console.print(f"{_MARGEM}[bold]Conta de gastos[/] — Configuração")
    console.print(f"{_MARGEM}[blue]─[/]" * 35)
    if titulo:
        console.print()
        console.print(f"{_MARGEM}[bold cyan]{titulo}[/]")


def _menu(titulo: str, opcoes: list[str]) -> int | None:
    menu = TerminalMenu(
        [f"{_MARGEM}{op}" for op in opcoes],
        title=f"{_MARGEM}{titulo.strip()}" if titulo.strip() else "",
        menu_cursor_style=("fg_cyan", "bold"),
        menu_highlight_style=("fg_cyan", "bold"),
    )
    return menu.show()


def _aguardar_enter(msg: str = "Pressione Enter para continuar...") -> None:
    console.print()
    console.print(f"{_MARGEM}[dim]{msg}[/]")
    input(f"{_MARGEM}")


def _passo(numero: int, total: int, titulo: str, corpo: str, url: str | None = None) -> bool:
    """Exibe um passo do wizard. Retorna True para avançar, False para voltar."""
    _limpar_e_titulo(f"Passo {numero}/{total}: {titulo}")
    console.print()

    if url:
        console.print(f"  [bold]URL:[/] [link={url}]{url}[/link]")
        console.print()

    console.print(Padding(Panel(corpo, border_style="blue", padding=(1, 2)), (0, 0, 0, len(_MARGEM))))
    console.print()

    escolha = _menu("", ["Avançar →", "← Voltar"])
    return escolha == 0


# ---------------------------------------------------------------------------
# Sub-wizard: OAuth
# ---------------------------------------------------------------------------

_PASSOS_OAUTH = [
    {
        "titulo": "Criar projeto no Google Cloud",
        "url": "https://console.cloud.google.com/projectcreate",
        "corpo": (
            "1. Acesse a URL acima (faça login se necessário)\n"
            "2. Em [bold]Nome do projeto[/], digite qualquer nome\n"
            "   (ex: \"Contas Gastos\")\n"
            "3. O campo [bold]Organização[/] pode ficar como\n"
            "   \"Nenhuma organização\"\n"
            "4. Clique em [bold]Criar[/]\n\n"
            "[dim]Quando o projeto estiver criado, avance.[/]"
        ),
    },
    {
        "titulo": "Ativar API do Google Drive",
        "url": "https://console.cloud.google.com/apis/library/drive.googleapis.com",
        "corpo": (
            "1. Acesse a URL acima\n"
            "2. Verifique se o projeto correto está selecionado no topo da página\n"
            "3. Clique em [bold]Ativar[/]"
        ),
    },
    {
        "titulo": "Ativar API do Google Sheets",
        "url": "https://console.cloud.google.com/apis/library/sheets.googleapis.com",
        "corpo": (
            "1. Acesse a URL acima\n"
            "2. Clique em [bold]Ativar[/]"
        ),
    },
    {
        "titulo": "Configurar tela de consentimento OAuth",
        "url": "https://console.cloud.google.com/apis/credentials/consent",
        "corpo": (
            "1. Acesse a URL acima\n"
            "2. Clique em [bold]Vamos começar[/]\n"
            "3. Na seção [bold]Informações do app[/], preencha:\n"
            "   • Nome do app: qualquer (ex: \"Contas Gastos\")\n"
            "   • E-mail de suporte do usuário: seu e-mail\n"
            "4. As seções [bold]Público[/] e [bold]Dados de contato[/]\n"
            "   podem ficar com os valores padrão\n"
            "5. Clique em [bold]Criar[/]"
        ),
    },
    {
        "titulo": "Adicionar você como usuário de teste",
        "url": "https://console.cloud.google.com/apis/credentials/consent",
        "corpo": (
            "1. Na mesma página, clique na aba\n"
            "   [bold]Público-alvo[/] (ou \"Audience\")\n"
            "2. Em \"Usuários de teste\", clique em\n"
            "   [bold]Add Users[/]\n"
            "3. Digite [bold]seu próprio e-mail Google[/]\n"
            "4. Clique em [bold]Salvar[/]\n\n"
            "[dim]Sem isso, o OAuth não vai funcionar![/]"
        ),
    },
    {
        "titulo": "Criar credenciais OAuth",
        "url": "https://console.cloud.google.com/apis/credentials",
        "corpo": (
            "1. Acesse a URL acima\n"
            "2. Clique em [bold]+ Criar credenciais[/]\n"
            "3. Selecione [bold]ID do cliente OAuth[/]\n"
            "4. Tipo de aplicativo:\n"
            "   [bold]App para computador[/]\n"
            "   (ou \"Desktop app\")\n"
            "5. Nome: qualquer\n"
            "6. Clique em [bold]Criar[/]\n\n"
            "Na próxima tela você verá o\n"
            "[bold]Client ID[/] e [bold]Client Secret[/].\n"
            "Copie-os ou baixe o JSON."
        ),
    },
]


def _wizard_oauth() -> None:
    """Guia passo-a-passo para configurar OAuth."""
    total = len(_PASSOS_OAUTH) + 1  # +1 para o passo de input

    # Passos informativos
    i = 0
    while i < len(_PASSOS_OAUTH):
        passo = _PASSOS_OAUTH[i]
        avancar = _passo(i + 1, total, passo["titulo"], passo["corpo"], passo.get("url"))
        if avancar:
            i += 1
        elif i > 0:
            i -= 1
        else:
            return  # voltar do primeiro passo = cancelar

    # Passo final: receber credenciais
    while True:
        _limpar_e_titulo(f"Passo {total}/{total}: Informar credenciais")
        console.print()
        console.print(Padding(
            Panel(
                "Como deseja informar suas credenciais?",
                border_style="blue",
                padding=(1, 2),
            ),
            (0, 0, 0, len(_MARGEM)),
        ))
        console.print()

        escolha = _menu("", [
            "Colar Client ID e Client Secret",
            "Arrastar/colar caminho do JSON baixado",
            "← Voltar",
        ])

        if escolha == 2 or escolha is None:
            i = len(_PASSOS_OAUTH) - 1
            # Volta ao último passo informativo
            while i >= 0:
                passo = _PASSOS_OAUTH[i]
                avancar = _passo(i + 1, total, passo["titulo"], passo["corpo"], passo.get("url"))
                if avancar:
                    break
                elif i > 0:
                    i -= 1
                else:
                    return
            continue

        if escolha == 0:
            sucesso = _input_manual()
        else:
            sucesso = _input_arquivo()

        if sucesso:
            # Tentar autenticar imediatamente
            if _testar_autenticacao():
                console.print()
                console.print(f"{_MARGEM}[bold green]Autenticação concluída com sucesso![/]")
                _aguardar_enter()
            return


def _input_manual() -> bool:
    """Coleta Client ID e Client Secret via input."""
    _limpar_e_titulo("Informar credenciais manualmente")
    console.print()

    console.print("  Cole o [bold]Client ID[/]:")
    client_id = input("  > ").strip()
    if not client_id:
        console.print("  [red]Client ID vazio.[/]")
        _aguardar_enter()
        return False

    console.print()
    console.print("  Cole o [bold]Client Secret[/]:")
    client_secret = input("  > ").strip()
    if not client_secret:
        console.print("  [red]Client Secret vazio.[/]")
        _aguardar_enter()
        return False

    try:
        salvar_credenciais_de_input(client_id, client_secret)
        console.print()
        console.print("  [green]Credenciais salvas![/]")
        return True
    except ValueError as e:
        console.print(f"  [red]{e}[/]")
        _aguardar_enter()
        return False


def _input_arquivo() -> bool:
    """Coleta caminho do JSON de credenciais."""
    _limpar_e_titulo("Informar credenciais via arquivo JSON")
    console.print()

    console.print("  Arraste o arquivo JSON ou cole o caminho:")
    raw = input("  > ").strip()
    if not raw:
        return False

    try:
        partes = shlex.split(raw)
    except ValueError:
        partes = [raw]
    caminho = Path(partes[0].strip("'\""))

    try:
        salvar_credenciais_de_arquivo(caminho)
        console.print()
        console.print("  [green]Credenciais salvas![/]")
        return True
    except (FileNotFoundError, ValueError) as e:
        console.print(f"  [red]{e}[/]")
        _aguardar_enter()
        return False


def _testar_autenticacao() -> bool:
    """Dispara fluxo OAuth para validar credenciais. Retorna True se sucesso."""
    console.print()
    console.print("  Abrindo navegador para autenticação...")
    console.print("  [dim]Autorize o acesso na janela do navegador.[/]")

    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow

        SCOPES = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive",
        ]

        cred_path = obter_credenciais_path()
        token_path = obter_token_path()

        creds = None
        if token_path.exists():
            creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)

        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                flow = InstalledAppFlow.from_client_secrets_file(str(cred_path), SCOPES)
                creds = flow.run_local_server(port=0)
            token_path.write_text(creds.to_json())

        return True
    except Exception as e:
        console.print(f"\n  [red]Erro na autenticação: {e}[/]")
        _aguardar_enter()
        return False


# ---------------------------------------------------------------------------
# Sub-wizards simples
# ---------------------------------------------------------------------------

def _wizard_iniciais() -> None:
    """Coleta iniciais do usuário."""
    _limpar_e_titulo("Suas iniciais")
    console.print()
    console.print(Padding(
        Panel(
            "As iniciais são usadas no nome de cada minuta.\n"
            "Ex: se suas iniciais são [bold]AB[/], a minuta se chamará\n"
            "\"2026-04 - AB\".",
            border_style="blue",
            padding=(1, 2),
        ),
        (0, 0, 0, len(_MARGEM)),
    ))
    console.print()
    console.print("  Digite suas iniciais (2 ou 3 letras):")
    valor = input("  > ").strip()
    if not valor:
        return

    try:
        salvar_iniciais(valor)
        console.print(f"  [green]Iniciais salvas: {valor.upper()}[/]")
    except ValueError as e:
        console.print(f"  [red]{e}[/]")
    _aguardar_enter()


def _wizard_pasta_drive() -> None:
    """Coleta ID da pasta do Google Drive."""
    _limpar_e_titulo("Pasta do Google Drive")
    console.print()
    console.print(Padding(
        Panel(
            "Informe a pasta do Google Drive onde as minutas\n"
            "serão salvas.\n\n"
            "Você pode colar:\n"
            "• A [bold]URL completa[/] da pasta\n"
            "  (ex: https://drive.google.com/drive/folders/ABC123)\n"
            "• Ou apenas o [bold]ID[/] da pasta\n"
            "  (ex: ABC123)",
            border_style="blue",
            padding=(1, 2),
        ),
        (0, 0, 0, len(_MARGEM)),
    ))
    console.print()
    console.print("  URL ou ID da pasta:")
    valor = input("  > ").strip()
    if not valor:
        return

    try:
        salvar_pasta_destino(valor)
        console.print("  [green]Pasta salva![/]")
    except ValueError as e:
        console.print(f"  [red]{e}[/]")
    _aguardar_enter()


def _wizard_nome_pix() -> None:
    """Coleta nome do usuário para detecção de Pix interno."""
    _limpar_e_titulo("Nome para detecção de Pix")
    console.print()
    console.print(Padding(
        Panel(
            "Informe seu nome [bold]como aparece nos extratos[/]\n"
            "bancários nas transferências Pix.\n\n"
            "Isso é usado para identificar transferências entre\n"
            "suas próprias contas (movimentações internas).\n\n"
            "Ex: se no extrato aparece\n"
            "\"Transferência enviada pelo Pix - [bold]Maria[/]\",\n"
            "digite [bold]Maria[/].",
            border_style="blue",
            padding=(1, 2),
        ),
        (0, 0, 0, len(_MARGEM)),
    ))
    console.print()
    console.print("  Seu nome como aparece no extrato:")
    valor = input("  > ").strip()
    if not valor:
        return

    try:
        salvar_nome_usuario(valor)
        console.print(f"  [green]Nome salvo: {valor}[/]")
    except ValueError as e:
        console.print(f"  [red]{e}[/]")
    _aguardar_enter()


# ---------------------------------------------------------------------------
# Fluxos compostos
# ---------------------------------------------------------------------------

def _wizard_completa() -> None:
    """Configuração guiada completa do zero."""
    _wizard_oauth()
    _wizard_iniciais()
    _wizard_pasta_drive()
    _wizard_nome_pix()

    _limpar_e_titulo("Configuração completa")
    console.print()
    status = itens_configurados()
    pendentes = [k for k, v in status.items() if not v]
    if pendentes:
        console.print("  [yellow]Alguns itens ficaram pendentes.[/]")
    else:
        console.print("  [bold green]Tudo configurado![/]")
    _aguardar_enter()


def _wizard_backup() -> None:
    """Restauração a partir de backup no Google Drive."""
    # 1. Credenciais
    _limpar_e_titulo("Restaurar a partir de backup")
    console.print()
    console.print(Padding(
        Panel(
            "Você precisará das credenciais OAuth do Google\n"
            "que já foram criadas anteriormente.\n\n"
            "Se você baixou o JSON na época, pode usá-lo.\n"
            "Caso contrário, acesse o Google Cloud Console\n"
            "e copie o Client ID e Client Secret do projeto.",
            border_style="blue",
            padding=(1, 2),
        ),
        (0, 0, 0, len(_MARGEM)),
    ))
    console.print()

    escolha = _menu("", [
        "Colar Client ID e Client Secret",
        "Arrastar/colar caminho do JSON baixado",
        "← Voltar",
    ])

    if escolha == 2 or escolha is None:
        return

    sucesso = _input_manual() if escolha == 0 else _input_arquivo()
    if not sucesso:
        return

    # 2. Testar autenticação
    if not _testar_autenticacao():
        return

    console.print()
    console.print(f"{_MARGEM}[bold green]Autenticação concluída com sucesso![/]")
    _aguardar_enter()

    # 3. Pasta do Drive (necessária para localizar o backup)
    _wizard_pasta_drive()

    from gastos.configuracao import obter_pasta_destino_id
    try:
        pasta_id = obter_pasta_destino_id()
    except (KeyError, FileNotFoundError):
        console.print("  [red]Pasta do Drive não configurada. Não é possível restaurar.[/]")
        _aguardar_enter()
        return

    # 4. Download do backup
    from gastos.db import DB_PATH
    from gastos.sheets import restaurar_sqlite_do_drive

    if DB_PATH.exists():
        _limpar_e_titulo("Restaurar a partir de backup")
        console.print()
        console.print("  [yellow]Já existe um banco de dados local.[/]")
        console.print("  [yellow]A restauração vai sobrescrevê-lo.[/]")
        console.print()
        confirma = _menu("", ["Continuar e sobrescrever", "← Cancelar"])
        if confirma != 0:
            return

    _limpar_e_titulo("Restaurar a partir de backup")
    console.print()
    console.print("  Baixando backup do Google Drive...")

    try:
        restaurar_sqlite_do_drive(DB_PATH, obter_credenciais_path(), pasta_id)
        console.print("  [bold green]Backup restaurado com sucesso![/]")
    except FileNotFoundError:
        console.print("  [red]Backup não encontrado na pasta informada.[/]")
        _aguardar_enter()
        return
    except Exception as e:
        console.print(f"  [red]Erro ao restaurar: {e}[/]")
        _aguardar_enter()
        return

    _aguardar_enter()

    # 5. Configurações restantes (não estão no SQLite)
    _wizard_iniciais()
    _wizard_nome_pix()

    _limpar_e_titulo("Restauração completa")
    console.print()
    status = itens_configurados()
    pendentes = [k for k, v in status.items() if not v]
    if pendentes:
        console.print("  [yellow]Alguns itens ficaram pendentes.[/]")
    else:
        console.print("  [bold green]Tudo configurado![/]")
    _aguardar_enter()


def _wizard_especificas() -> None:
    """Menu com itens individuais de configuração."""
    while True:
        _limpar_e_titulo(None)
        console.print()

        status = itens_configurados()
        opcoes = [
            f"{'✓' if status['oauth'] else '✗'} Autenticação Google",
            f"{'✓' if status['iniciais'] else '✗'} Iniciais",
            f"{'✓' if status['pasta_drive'] else '✗'} Pasta do Google Drive",
            f"{'✓' if status['nome_pix'] else '✗'} Nome para detecção Pix",
            "← Voltar",
        ]

        escolha = _menu("\nO que deseja configurar?\n", opcoes)

        if escolha == 0:
            _wizard_oauth()
        elif escolha == 1:
            _wizard_iniciais()
        elif escolha == 2:
            _wizard_pasta_drive()
        elif escolha == 3:
            _wizard_nome_pix()
        else:
            return


# ---------------------------------------------------------------------------
# Menu principal do wizard
# ---------------------------------------------------------------------------

def executar_wizard() -> None:
    """Ponto de entrada do wizard de configuração."""
    while True:
        _limpar_e_titulo(None)
        console.print()

        opcoes = [
            "Completa            configuração guiada do zero",
            "A partir de backup  restaurar de outra instalação",
            "Específicas         configurar itens individuais",
            "← Voltar",
        ]

        escolha = _menu("\nComo deseja configurar?\n", opcoes)

        if escolha == 0:
            _wizard_completa()
            return
        elif escolha == 1:
            _wizard_backup()
            return
        elif escolha == 2:
            _wizard_especificas()
        else:
            return
