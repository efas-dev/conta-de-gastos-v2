"""Operações com Google Sheets e Drive para criação de minutas."""

from dataclasses import dataclass
from datetime import datetime
from difflib import get_close_matches
from itertools import groupby
from pathlib import Path

from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload

from gastos.formatacao import parse_brasileiro
from gastos.modelos import Lancamento

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

TEMPLATE_GID = 672560374
TEMPLATE_ID = "1dMHpWV1ugw6V2tEO4oGNyF_-nttg6T7uv2ZJ5tFnMSE"


def _is_wsl() -> bool:
    try:
        with open("/proc/version") as f:
            return "microsoft" in f.read().lower()
    except OSError:
        return False


def _abrir_no_windows(url: str) -> bool:
    """Tenta abrir uma URL no navegador padrão do Windows a partir do WSL.

    Evita `cmd.exe /c start`, que trunca a URL no primeiro `&` mesmo com aspas
    (interpretado como separador de comando antes do quoting), o que quebra
    URLs de OAuth (que sempre têm vários `&`).
    """
    import shutil
    import subprocess

    tentativas: list[list[str]] = []
    if shutil.which("wslview"):
        tentativas.append(["wslview", url])
    if shutil.which("powershell.exe"):
        # Start-Process com a URL como argumento único — sem parsing de cmd.exe
        escaped = url.replace("'", "''")
        tentativas.append([
            "powershell.exe", "-NoProfile", "-NonInteractive",
            "-Command", f"Start-Process '{escaped}'",
        ])
    if shutil.which("rundll32.exe"):
        tentativas.append(["rundll32.exe", "url.dll,FileProtocolHandler", url])

    for cmd in tentativas:
        try:
            subprocess.run(
                cmd, check=True, timeout=8,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            return True
        except (subprocess.SubprocessError, OSError):
            continue
    return False


def executar_flow_oauth(flow: InstalledAppFlow) -> Credentials:
    """Executa o fluxo OAuth. No WSL, usa fluxo manual de colar-URL para
    contornar o servidor de loopback (que não é acessível pelo navegador do Windows)."""
    if not _is_wsl():
        return flow.run_local_server(port=0)

    import os
    from rich.console import Console
    console = Console()

    # O redirect_uri é http://localhost (loopback local — não trafega na rede).
    # Sem essa variável, oauthlib rejeita a troca do code com
    # "(insecure_transport) OAuth 2 MUST utilize https".
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

    flow.redirect_uri = "http://localhost:8080/"
    auth_url, _ = flow.authorization_url(access_type="offline", prompt="consent")

    console.print()
    console.print("  [yellow]WSL detectado — usando fluxo manual de autenticação.[/]")
    console.print()
    abriu = _abrir_no_windows(auth_url)
    if abriu:
        console.print("  Tentei abrir o navegador do Windows com a página de autorização.")
        console.print("  [dim]Se a página exibir \"Acesso bloqueado / Missing required parameter\",[/]")
        console.print("  [dim]use a URL abaixo manualmente:[/]")
    else:
        console.print("  Não consegui abrir o navegador automaticamente.")
        console.print("  Cole a URL abaixo no seu navegador do Windows:")
    console.print()
    console.print(f"  [cyan]{auth_url}[/cyan]")
    console.print()
    console.print("  Depois de autorizar, o navegador vai redirecionar para uma página")
    console.print("  com [dim]\"Não é possível acessar esse site\"[/] — isso é [bold]esperado[/].")
    console.print()
    console.print("  [bold]Copie a URL completa da barra de endereços[/] e cole aqui:")

    import re
    # Remove sequências de escape ANSI (setas/edição) que terminais às vezes
    # injetam na entrada quando o usuário navega numa linha colada longa.
    _ansi = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")

    def _limpar(s: str) -> str:
        s = _ansi.sub("", s).strip()
        # Se a colagem concatenou duas URLs (acontece ao colar duas vezes sem
        # apagar a anterior), fica só com a última ocorrência.
        marcadores = ["http://localhost", "https://localhost", "localhost"]
        for m in marcadores:
            idx = s.rfind(m)
            if idx > 0:
                s = s[idx:]
                break
        if s.startswith("localhost"):
            s = "http://" + s
        # Normaliza https→http no redirect (alguns navegadores forçam HSTS no
        # localhost). O code só vale uma vez; o esquema do redirect é só
        # informativo para o fetch_token.
        if s.startswith("https://localhost"):
            s = "http://" + s[len("https://"):]
        return s

    while True:
        try:
            bruto = input("  > ")
        except EOFError:
            raise RuntimeError("Autenticação cancelada (entrada encerrada).")
        resp = _limpar(bruto)
        if not resp:
            raise RuntimeError("Autenticação cancelada (nenhuma URL informada).")
        try:
            flow.fetch_token(authorization_response=resp)
            return flow.credentials
        except Exception as e:
            msg = str(e)
            if "insecure_transport" in msg.lower():
                # Última rede de segurança: força o env var e tenta de novo
                # no mesmo input antes de pedir outro.
                os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"
                try:
                    flow.fetch_token(authorization_response=resp)
                    return flow.credentials
                except Exception as e2:
                    e = e2
                    msg = str(e2)
            if "invalid_grant" in msg.lower() or "bad request" in msg.lower():
                console.print(f"  [red]O código dessa URL já expirou ou foi usado.[/]")
                console.print("  [yellow]Abra novamente a URL de autorização acima e gere uma URL nova.[/]")
            elif "missing" in msg.lower() and "code" in msg.lower():
                console.print(f"  [red]A URL colada não contém o parâmetro 'code'.[/]")
                console.print("  [dim]Confira se você copiou a URL DEPOIS de autorizar (deve conter '?state=...&code=...').[/]")
            else:
                console.print(f"  [red]URL inválida: {e}[/]")
            console.print("  Cole a URL completa que apareceu na barra de endereços (começa com http://localhost):")


def _template_id() -> str:
    return TEMPLATE_ID


def _pasta_destino_id() -> str:
    from gastos.configuracao import obter_pasta_destino_id
    return obter_pasta_destino_id()


def _autenticar(credenciais_path: Path) -> Credentials:
    """Autentica via OAuth2 (abre navegador na primeira vez, depois usa token salvo)."""
    from gastos.configuracao import obter_token_path
    token_path = obter_token_path()
    creds = None

    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)

    if not creds or not creds.valid:
        refreshed = False
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                refreshed = True
            except RefreshError:
                creds = None
        if not refreshed:
            flow = InstalledAppFlow.from_client_secrets_file(str(credenciais_path), SCOPES)
            creds = executar_flow_oauth(flow)
        token_path.write_text(creds.to_json())

    return creds


def _obter_nome_aba(sheets_service, spreadsheet_id: str) -> str:
    """Obtém o nome da aba correspondente ao GID do template."""
    template_gid = TEMPLATE_GID
    meta = sheets_service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    for sheet in meta["sheets"]:
        if sheet["properties"]["sheetId"] == template_gid:
            return sheet["properties"]["title"]
    return meta["sheets"][0]["properties"]["title"]


def copiar_modelo(creds: Credentials, nome: str) -> str:
    """Copia o modelo no Drive com o nome dado. Retorna o ID da nova planilha."""
    drive = build("drive", "v3", credentials=creds)

    copia = drive.files().copy(
        fileId=_template_id(),
        body={"name": nome, "parents": [_pasta_destino_id()]},
        supportsAllDrives=True,
    ).execute()

    return copia["id"]


def _obter_sheet_id(sheets_service, spreadsheet_id: str) -> int:
    """Obtém o sheetId numérico da aba do template."""
    template_gid = TEMPLATE_GID
    meta = sheets_service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    for sheet in meta["sheets"]:
        if sheet["properties"]["sheetId"] == template_gid:
            return template_gid
    return meta["sheets"][0]["properties"]["sheetId"]


def preencher_minuta(
    creds: Credentials,
    spreadsheet_id: str,
    lancamentos: list[Lancamento],
) -> None:
    """Preenche a minuta a partir de A5, com linha em branco entre blocos."""
    sheets = build("sheets", "v4", credentials=creds)
    aba = _obter_nome_aba(sheets, spreadsheet_id)
    sheet_id = _obter_sheet_id(sheets, spreadsheet_id)

    linhas: list[list] = []
    linhas_vermelhas: list[int] = []  # índices (0-based) das linhas internas
    primeiro_bloco = True

    for _, grupo in groupby(lancamentos, key=lambda lc: lc.fonte):
        if not primeiro_bloco:
            linhas.append([])  # linha em branco entre blocos
        primeiro_bloco = False

        for lc in grupo:
            if lc.interno:
                linhas_vermelhas.append(len(linhas))
            linhas.append([
                lc.fonte,
                lc.data.strftime("%d/%m/%Y"),
                lc.natureza,
                lc.descricao,
                lc.registro,
                lc.valor,
            ])

    # Escrever dados
    sheets.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=f"'{aba}'!A5",
        valueInputOption="USER_ENTERED",
        body={"values": linhas},
    ).execute()

    # Formatar linhas internas em vermelho
    if linhas_vermelhas:
        requests = []
        for idx in linhas_vermelhas:
            row = idx + 4  # A5 = row index 4 (0-based)
            requests.append({
                "repeatCell": {
                    "range": {
                        "sheetId": sheet_id,
                        "startRowIndex": row,
                        "endRowIndex": row + 1,
                        "startColumnIndex": 0,
                        "endColumnIndex": 6,
                    },
                    "cell": {
                        "userEnteredFormat": {
                            "textFormat": {
                                "foregroundColor": {"red": 0.8, "green": 0.0, "blue": 0.0},
                            },
                        },
                    },
                    "fields": "userEnteredFormat.textFormat.foregroundColor",
                },
            })

        sheets.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={"requests": requests},
        ).execute()


@dataclass
class LinhaInvalida:
    linha: int           # número real na planilha (A5 = 5)
    motivo: str
    conteudo: list


class ErroLeituraPlanilha(Exception):
    """Linhas com fonte conhecida mas dados inválidos (data/valor) impedem a leitura."""

    def __init__(self, invalidas: list[LinhaInvalida]):
        self.invalidas = invalidas
        super().__init__(f"{len(invalidas)} linha(s) inválida(s) na planilha")


@dataclass
class LeituraPlanilha:
    lancamentos: list[Lancamento]
    puladas: list[LinhaInvalida]  # fonte desconhecida — silenciosamente puladas com aviso


def ler_planilha(
    spreadsheet_id: str,
    credenciais_path: Path,
    fontes_conhecidas: set[str] | None = None,
) -> LeituraPlanilha:
    """Lê lançamentos preenchidos de volta do Google Sheets.

    Se `fontes_conhecidas` for fornecido, linhas cuja fonte não esteja no conjunto
    são puladas e retornadas em `puladas` (não impedem a leitura). Linhas com fonte
    conhecida mas data/valor inválidos levantam `ErroLeituraPlanilha`.
    """
    creds = _autenticar(credenciais_path)
    sheets = build("sheets", "v4", credentials=creds)
    aba = _obter_nome_aba(sheets, spreadsheet_id)

    result = sheets.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range=f"'{aba}'!A5:F500",
    ).execute()

    lancamentos: list[Lancamento] = []
    invalidas: list[LinhaInvalida] = []
    puladas: list[LinhaInvalida] = []

    rows = result.get("values", [])
    for offset, row in enumerate(rows):
        linha_real = offset + 5  # A5 é a primeira linha de dados

        if not row or not row[0]:
            continue  # linha em branco entre blocos

        fonte = row[0]
        data_str = row[1] if len(row) > 1 else ""
        natureza = row[2] if len(row) > 2 else ""
        descricao = row[3] if len(row) > 3 else ""
        registro = row[4] if len(row) > 4 else ""
        valor_str = row[5] if len(row) > 5 else ""

        if fontes_conhecidas is not None and fonte not in fontes_conhecidas:
            sugestao = get_close_matches(fonte, fontes_conhecidas, n=1, cutoff=0.6)
            motivo = "fonte desconhecida"
            if sugestao:
                motivo += f" — quis dizer '{sugestao[0]}'?"
            puladas.append(LinhaInvalida(linha_real, motivo, row))
            continue

        try:
            dt = datetime.strptime(data_str, "%d/%m/%Y").date()
        except ValueError:
            motivo = "data ausente" if not data_str else f"data inválida ('{data_str}')"
            invalidas.append(LinhaInvalida(linha_real, motivo, row))
            continue

        try:
            valor = parse_brasileiro(valor_str) if valor_str else 0.0
        except ValueError:
            invalidas.append(LinhaInvalida(linha_real, f"valor inválido ('{valor_str}')", row))
            continue

        lancamentos.append(
            Lancamento(
                fonte=fonte,
                natureza=natureza,
                descricao=descricao,
                valor=valor,
                registro=registro,
                data=dt,
            )
        )

    if invalidas:
        raise ErroLeituraPlanilha(invalidas)

    return LeituraPlanilha(lancamentos=lancamentos, puladas=puladas)


def criar_minuta(
    lancamentos: list[Lancamento],
    nome: str,
    credenciais_path: Path,
) -> str:
    """Fluxo completo: copia modelo, preenche dados, retorna URL da planilha."""
    creds = _autenticar(credenciais_path)
    print(f"  Copiando modelo como '{nome}'...")
    spreadsheet_id = copiar_modelo(creds, nome)
    print(f"  Preenchendo {len(lancamentos)} lançamentos...")
    preencher_minuta(creds, spreadsheet_id, lancamentos)
    url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}"
    print(f"  Minuta criada: {url}")
    return url


BACKUP_FILENAME = "gastos.db"


def backup_sqlite_para_drive(db_path: Path, credenciais_path: Path) -> None:
    """Envia o SQLite para a mesma pasta das minutas no Google Drive, sobrescrevendo."""
    import shutil
    import tempfile

    if not db_path.exists():
        print("  [backup] gastos.db não encontrado, pulando backup.")
        return

    creds = _autenticar(credenciais_path)
    drive = build("drive", "v3", credentials=creds)
    pasta_id = _pasta_destino_id()

    # Cópia segura para não travar o banco durante upload
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    shutil.copy2(db_path, tmp_path)

    try:
        media = MediaFileUpload(str(tmp_path), mimetype="application/x-sqlite3")

        # Procura backup existente na pasta
        query = (
            f"name = '{BACKUP_FILENAME}' and '{pasta_id}' in parents and trashed = false"
        )
        resultado = drive.files().list(
            q=query, fields="files(id)", supportsAllDrives=True, includeItemsFromAllDrives=True,
        ).execute()
        existentes = resultado.get("files", [])

        if existentes:
            drive.files().update(
                fileId=existentes[0]["id"],
                media_body=media,
                supportsAllDrives=True,
            ).execute()
            print("  [backup] gastos.db atualizado no Google Drive.")
        else:
            drive.files().create(
                body={"name": BACKUP_FILENAME, "parents": [pasta_id]},
                media_body=media,
                supportsAllDrives=True,
            ).execute()
            print("  [backup] gastos.db enviado ao Google Drive.")
    finally:
        tmp_path.unlink(missing_ok=True)


def restaurar_sqlite_do_drive(db_path: Path, credenciais_path: Path, pasta_id: str) -> None:
    """Baixa o backup do SQLite do Google Drive para o caminho local."""
    import shutil
    import tempfile

    creds = _autenticar(credenciais_path)
    drive = build("drive", "v3", credentials=creds)

    query = (
        f"name = '{BACKUP_FILENAME}' and '{pasta_id}' in parents and trashed = false"
    )
    resultado = drive.files().list(
        q=query, fields="files(id)", supportsAllDrives=True, includeItemsFromAllDrives=True,
    ).execute()
    existentes = resultado.get("files", [])

    if not existentes:
        raise FileNotFoundError("Backup 'gastos.db' não encontrado na pasta do Drive.")

    file_id = existentes[0]["id"]

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        tmp_path = Path(tmp.name)

    try:
        request = drive.files().get_media(fileId=file_id)
        with open(tmp_path, "wb") as f:
            downloader = MediaIoBaseDownload(f, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()

        db_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(tmp_path), str(db_path))
    finally:
        tmp_path.unlink(missing_ok=True)
