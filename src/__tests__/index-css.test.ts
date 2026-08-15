// ADR: see Docs/specs/redesign-frontend-claude-design.adr.md
// ADR: see Docs/specs/patches-ui-ux.adr.md
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(__dirname, '../index.css'), 'utf-8');

/**
 * Confirma que `seletor` existe como seletor CSS de verdade em `folha` — não como substring de um
 * seletor mais longo. `.chip` NÃO deve casar dentro de `.chip-sujo`, mas DEVE casar em `.chip {`,
 * `.btn, .chip {` ou `.chip:hover`. A fronteira proibida é qualquer caractere de identificador
 * ([\w-]) logo antes ou logo depois do seletor buscado — isso barra extensões do nome (`-sujo`) sem
 * barrar continuações legítimas de seletor (`,`, `:`, `.`, espaço, chave, fim de string).
 */
function cssHasSelector(folha: string, seletor: string): boolean {
  const escapado = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(?<![\\w-])${escapado}(?![\\w-])`);
  return regex.test(folha);
}

describe('cssHasSelector — matcher de seletor real (Task D1)', () => {
  it('casa um seletor simples que aparece isolado seguido de chave', () => {
    expect(cssHasSelector('.chip {\n  color: red;\n}', '.chip')).toBe(true);
  });

  it('NÃO casa um seletor simples dentro de outro seletor que o contém como prefixo textual', () => {
    expect(cssHasSelector('.chip-sujo {\n  color: red;\n}', '.chip')).toBe(false);
  });

  it('NÃO casa `.btn` dentro de `.btn-remover`', () => {
    expect(cssHasSelector('.btn-remover {\n  color: red;\n}', '.btn')).toBe(false);
  });

  it('casa seletor composto exato', () => {
    expect(cssHasSelector('.btn.pri {\n  color: red;\n}', '.btn.pri')).toBe(true);
  });

  it('NÃO casa seletor composto quando o CSS tem um terceiro qualificador colado', () => {
    expect(cssHasSelector('.btn.pri-especial {\n  color: red;\n}', '.btn.pri')).toBe(false);
  });

  it('casa quando o seletor aparece numa lista separada por vírgula', () => {
    expect(cssHasSelector('.btn, .chip {\n  color: red;\n}', '.chip')).toBe(true);
  });

  it('casa quando o seletor é seguido de pseudo-classe', () => {
    expect(cssHasSelector('.aba:hover {\n  color: red;\n}', '.aba')).toBe(true);
  });
});

describe('src/index.css — fundação de tokens do protótipo Claude Design (Task T1)', () => {
  it('contém as variáveis novas de cor de inspeção e terracota suave', () => {
    expect(css).toContain('--insp-sai: #c94f46');
    expect(css).toContain('--insp-sai-bg: #f6ddd9');
    expect(css).toContain('--insp-fica: #3e9c78');
    expect(css).toContain('--insp-fica-bg: #daeee4');
    expect(css).toContain('--terracota-suave: #f7ece6');
  });

  it('mantém --muted já correto no :root, sem sobrescrever', () => {
    expect(css).toContain('--muted: #8a867c');
  });

  it.each([
    '.btn',
    '.btn.sec',
    '.btn.pri',
    '.btn.cta',
    '.btn.icone',
    '.btn.mini',
    '.badge',
    '.badge.peach',
    '.badge.inline',
    '.chip-sujo',
    '.ponto',
    '.painel',
    '.painel-abas',
    '.aba',
    '.aba.on',
    '.painel-corpo',
    '.painel-secao',
    '.painel-vazio',
    '.stepper',
    '.step-num',
    '.step-num.ativo',
    '.step-num.feito',
    '.step-nome',
    '.step-nome.ativo',
    '.step-linha',
    '.card-aviso',
    '.card-aviso.inspecionando',
    '.card-aviso.resolvido',
    '.icone-aviso',
    '.icone-aviso.proposta',
    '.icone-aviso.info',
    '.legenda-insp',
    '.estado-aviso',
    '.toolbar',
    '.toolbar.compacta',
    '.progresso',
    '.prog-barra',
    '.prog-fill',
    '.grupo-mes',
    '.grupo-mes-rotulo',
    '.sel-mini',
    '.logo',
    '.logo.mini',
    '.btn-texto',
    '.banner-inspecao',
    '.tag-insp',
    '.tag-insp.sai',
    '.tag-insp.fica',
    '.valor',
    '.valor.neg',
    '.valor.pos',
    '.vazio',
    '.cel-input',
    '.sugestoes',
    '.sugestao',
    '.rodape-soma',
    '.overlay',
    '.modal',
    '.modal-titulo',
    '.dropzone',
    '.icone-drop',
    '.spinner',
    '.arquivo',
    '.icone-arq',
    '.btn-remover',
    '.tag-tipo',
    '.cartao-dic',
    '.cartao-info',
    '.linha-banco',
    '.campo',
    '.rotulo',
    '.dica',
    '.opcional',
    '.pill-privado',
    '.titulo',
    '.subtitulo',
    '.input',
    '.nat-item',
    '.nat-sigla',
    '.topo',
    '.check-grande',
    '.dica-dic',
    '.alerta-export',
    '.arquivo-nome',
  ])('contém a classe %s copiada do protótipo, como seletor real (não substring)', (classe) => {
    expect(cssHasSelector(css, classe)).toBe(true);
  });

  it('contém o styling de scrollbar do protótipo', () => {
    expect(css).toContain('::-webkit-scrollbar');
  });

  it('não confunde `.chip-sujo` (real) com um resquício de `.chip` (removido em C1) — prova contra o CSS de produção', () => {
    expect(cssHasSelector(css, '.chip-sujo')).toBe(true);
    expect(cssHasSelector(css, '.chip')).toBe(false);
  });
});
