import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const raiz = resolve(__dirname, '../..');

/** Arquivos de código versionados — os `.xlsx` do projeto são binários por natureza e ficam fora. */
function fontesVersionadas(): string[] {
  const saida = execFileSync('git', ['ls-files', '-z'], { cwd: raiz, encoding: 'buffer' });
  return saida
    .toString('utf-8')
    .split('\0')
    .filter((caminho) => /\.(ts|tsx|css|json|md|html|js|mjs|cjs|yml|yaml)$/.test(caminho));
}

/**
 * Alarme de drift: nenhum fonte pode carregar byte NUL literal.
 *
 * Por que isto merece um teste. O NUL é separador tentador para chave composta — nunca aparece em
 * dado real, então não colide. Mas escrito como BYTE literal dentro do arquivo, em vez da sequência
 * de escape de seis caracteres, ele faz o git classificar o fonte como binário: `git diff` passa a
 * responder "Binary files differ" e o arquivo fica invisível em qualquer revisão, própria ou de
 * terceiros. Foi o que aconteceu com `src/dominio/migracaoDicionario.ts`, que entrou na `dev` como
 * `Bin 0 -> 4672 bytes`.
 *
 * A string em runtime é idêntica nos dois casos; o que muda é a legibilidade do histórico. Por isso
 * o alarme cobre a grafia, não o comportamento — nenhum teste de comportamento pegaria isso.
 */
describe('fontes versionados não contêm byte NUL literal', () => {
  it('nenhum arquivo de código carrega o byte 0 (usar a sequência de escape)', () => {
    const comNul = fontesVersionadas().filter((caminho) => {
      try {
        return readFileSync(resolve(raiz, caminho)).includes(0);
      } catch {
        return false; // arquivo removido do disco mas ainda no índice não é problema deste alarme
      }
    });

    expect(comNul).toEqual([]);
  });
});
