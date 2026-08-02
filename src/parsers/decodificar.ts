/**
 * Decodifica os bytes de um arquivo de texto (CSV/TXT) para string.
 *
 * A maioria dos bancos exporta em UTF-8, mas alguns (ex.: Banco do Brasil)
 * usam ISO-8859-1 / Windows-1252. Como `File.text()` sempre assume UTF-8,
 * arquivos latin-1 chegariam com acentos corrompidos.
 *
 * Estratégia: tentar UTF-8 estrito (`fatal`) — que é auto-sincronizante e falha
 * em bytes altos inválidos — e, se lançar, cair para Windows-1252. Arquivos
 * ASCII/UTF-8 válidos decodificam pelo primeiro caminho; latin-1 com acentos
 * cai no segundo. Não há adivinhação heurística: só o fallback determinístico.
 */
export function decodificarCsv(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}
