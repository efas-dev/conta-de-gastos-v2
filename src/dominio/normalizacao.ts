// ADR: see Docs/specs/mvp-vertical-nubank.adr.md
// ADR: see Docs/specs/dicionario-chave-canonica.adr.md

/**
 * Sufixo de data no final da transcrição, em paridade com o regex do sistema
 * legado (`legado/src/gastos/classificador.py`).
 *
 * Os dois detalhes que parecem ruído são justamente o que faz a regra funcionar
 * (ADR `dicionario-chave-canonica`, Decisão 6):
 * - `\s*` em vez de `\s+`, porque o extrato Itaú trunca o nome em largura fixa
 *   e cola a data sem espaço algum (`PIX TRANSF HENRIQU04/05`);
 * - `D?`, porque nesse truncamento a inicial do sobrenome costuma sobrar
 *   grudada na data (`PIX TRANSF CESAR D13/06`).
 *
 * A porta original para TypeScript perdeu os dois, e com isso 51% das linhas do
 * extrato real deixavam de casar com o dicionário: cada dia do mês produzia uma
 * chave nova.
 */
const SUFIXO_DATA = /\s*D?\d{2}\/\d{2}(\/\d{2,4})?\s*$/

/**
 * Número da parcela no final da transcrição, sempre ancorado na palavra
 * "Parcela" — `Parcela 2/4` e `Parcela 1 de 6` casam, `Loja 2/4` não.
 *
 * A exigência da palavra é deliberada e conservadora: `N/M` solto é
 * indistinguível de uma data, e o sistema legado nunca tratou esse caso.
 */
const SUFIXO_PARCELA = /(parcela\s*)\d{1,2}\s*(?:\/|de)\s*(\d{1,2})\s*$/i

/**
 * Remove sufixo de data do final de uma transcrição, produzindo a chave de
 * lookup no dicionário.
 *
 * Regra: apenas sufixos no final da string são removidos; datas no meio da
 * transcrição são preservadas. O `.trim()` final espelha o `.strip()` do
 * legado.
 *
 * Esta função NÃO mascara parcela — quem faz isso é `canonizarChave`. A
 * separação é a Decisão 15 do ADR e existe porque `normalizarParaBusca`
 * (abaixo) é aplicada a descrições digitadas pelo usuário, não a transcrições.
 */
export function normalizarChave(transcricao: string): string {
  return transcricao.replace(SUFIXO_DATA, '').trim()
}

/**
 * Resultado de `canonizarChave`: a chave de lookup e o sinal de que ela perdeu
 * poder discriminante por causa do mascaramento de parcela.
 *
 * `afrouxadaPorParcela` é o que autoriza a trava de valor no casamento — o
 * valor só participa onde a canonização apagou informação (ADR, Decisão 2).
 */
export interface ChaveCanonica {
  chave: string
  afrouxadaPorParcela: boolean
}

/**
 * Produz a chave canônica de uma transcrição, removendo os tokens que variam a
 * cada mês: o número da parcela e o sufixo de data.
 *
 * **A ordem importa e não é permutável.** O mascaramento de parcela roda ANTES
 * da remoção de data porque `Parcela 02/04` casa com o padrão de data
 * (`\d{2}/\d{2}$`): invertida a ordem, a chave viraria `Loja X - Parcela` e
 * colapsaria planos de parcelamento diferentes do mesmo lojista.
 *
 * O total de parcelas é preservado (`Parcela #/4`) para distinguir uma compra
 * em 4x de outra em 6x no mesmo estabelecimento, e normalizado via `Number`
 * para que `02/04` e `2/4` não gerem duas chaves.
 *
 * Fail-safe da Decisão 13: se a canonização consumir a transcrição inteira —
 * uma transcrição que seja só uma data produz string vazia —, a canonização é
 * descartada e vale a transcrição original. Chave vazia casaria com qualquer
 * outra chave vazia da mesma fonte, que é o pior modo de falha possível aqui.
 */
export function canonizarChave(transcricao: string): ChaveCanonica {
  const semParcela = transcricao.replace(
    SUFIXO_PARCELA,
    (_casamento, prefixo: string, total: string) => `${prefixo}#/${Number(total)}`,
  )
  const afrouxadaPorParcela = semParcela !== transcricao
  const chave = normalizarChave(semParcela)

  if (chave === '') {
    return { chave: transcricao, afrouxadaPorParcela: false }
  }

  return { chave, afrouxadaPorParcela }
}

/**
 * Normaliza um texto para busca por prefixo: remove sufixo de data via
 * `normalizarChave`, converte para minúsculas e remove diacríticos (acentos).
 *
 * Thin wrapper sobre `normalizarChave` — não altera seu contrato.
 * Reutilizado por `calcularSugestoes` para casamento case/accent-insensitive.
 * (Decisão 3 do ADR adr-20260704-grid-autocomplete-aviso-saida)
 */
export function normalizarParaBusca(texto: string): string {
  return normalizarChave(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/**
 * Interpreta um valor monetário digitado ou colado na grid, devolvendo `null` quando o texto não
 * contém número algum.
 *
 * Existe por causa do item 40 do TODO: o clipboard nunca traz o número cru. Copiar da própria
 * grid entrega o texto contábil desenhado (`-R$ 1.083,06`); copiar do Excel/Sheets entrega a
 * moeda formatada, às vezes com o negativo entre parênteses. `Number()` devolvia `NaN` para todos
 * esses casos e a guarda de finitude do `editarCelula` descartava a edição em silêncio.
 *
 * Regra de separadores: havendo vírgula, ela é o decimal e os pontos são milhar (pt-BR). Sem
 * vírgula, o ponto é tratado como decimal — preserva o `'-300.5'` que já funcionava e é o único
 * palpite possível, já que `'1.234'` é ambíguo entre as duas convenções. Na prática não morde: a
 * grid e as planilhas sempre emitem os centavos com vírgula.
 */
export function interpretarValorMonetario(texto: string): number | null {
  const limpo = texto.trim()
  if (!/\d/.test(limpo)) return null

  // Parênteses são a notação contábil de negativo do Excel: (1.234,50) = −1234,50.
  const negativo = limpo.startsWith('-') || /^\(.*\)$/.test(limpo)
  const digitos = limpo.replace(/[^\d.,]/g, '')
  const semMilhar = digitos.includes(',')
    ? digitos.replace(/\./g, '').replace(',', '.')
    : digitos
  const num = Number(semMilhar)
  if (!Number.isFinite(num)) return null
  return negativo ? -Math.abs(num) : num
}
