/**
 * Parser de uma linha CSV com suporte a campos entre aspas (RFC 4180 simples).
 *
 * Necessário para formatos cujos campos contêm o próprio separador — por exemplo
 * valores pt-BR com vírgula decimal entre aspas (`"1.000,00"`). Não trata aspas
 * escapadas (`""`), que os extratos suportados não usam.
 *
 * Compartilhado pelos parsers que usam CSV separado por vírgula (Nubank, BB).
 */
export function parsearLinhaCsv(linha: string): string[] {
  const campos: string[] = []
  let campo = ''
  let dentroAspas = false

  for (let i = 0; i < linha.length; i++) {
    const char = linha[i]
    if (char === '"') {
      dentroAspas = !dentroAspas
    } else if (char === ',' && !dentroAspas) {
      campos.push(campo)
      campo = ''
    } else {
      campo += char
    }
  }
  campos.push(campo)
  return campos
}
