// ADR: see Docs/specs/redesign-frontend-claude-design.adr.md
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(__dirname, '../index.css'), 'utf-8');

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
    '.btn.ver',
    '.badge',
    '.badge.peach',
    '.badge.inline',
    '.chip',
    '.chip.on',
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
    '.gtab',
    '.filtros',
    '.filtro-grupo',
    '.divisor',
    '.btn-limpar',
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
  ])('contém a classe %s copiada do protótipo', (classe) => {
    expect(css).toContain(classe);
  });

  it('contém o styling de scrollbar do protótipo', () => {
    expect(css).toContain('::-webkit-scrollbar');
  });

  it.each([
    '.dc-titulo',
    '.dc-subtitulo',
    '.dc-rotulo',
    '.dc-opcional',
    '.dc-card',
    '.dc-input',
    '.dc-btn',
    '.dc-btn-secundario',
    '.dc-btn-primario',
    '.dc-btn-cta',
    '.dc-pill-privado',
  ])('não remove a classe %s existente', (classe) => {
    expect(css).toContain(classe);
  });
});
