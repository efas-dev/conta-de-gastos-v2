// ADR: see Docs/specs/patches-ui-ux.adr.md
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(__dirname, '../index.css'), 'utf-8');

describe('src/index.css — Task A1: 5 regras novas do patch de UI/UX', () => {
  it('.btn ganha position:relative para ancorar badges', () => {
    const regraBtn = css.match(/\.btn\s*\{[^}]*\}/);
    expect(regraBtn).not.toBeNull();
    expect(regraBtn?.[0]).toMatch(/position:\s*relative/);
  });

  it('existe regra global de :focus-visible cobrindo os cinco seletores com outline verde', () => {
    const regraFoco = css.match(
      /\.btn:focus-visible,\s*\.aba:focus-visible,\s*\.nat-item:focus-visible,\s*\.btn-remover:focus-visible,\s*\.cartao-dic:focus-visible\s*\{([^}]*)\}/
    );
    expect(regraFoco).not.toBeNull();
    expect(regraFoco?.[1]).toMatch(/outline:\s*2px solid var\(--verde\)/);
    expect(regraFoco?.[1]).toMatch(/outline-offset:\s*2px/);
  });

  it("existe .input[data-soma-valida='true'] com borda e fundo verdes", () => {
    const regra = css.match(/\.input\[data-soma-valida=['"]true['"]\]\s*\{([^}]*)\}/);
    expect(regra).not.toBeNull();
    expect(regra?.[1]).toMatch(/border-color:\s*var\(--verde\)/);
    expect(regra?.[1]).toMatch(/background:\s*var\(--verde-suave\)/);
  });

  it('existe .card-aviso.expandido com borda verde-borda e fundo verde-suave', () => {
    const regra = css.match(/\.card-aviso\.expandido\s*\{([^}]*)\}/);
    expect(regra).not.toBeNull();
    expect(regra?.[1]).toMatch(/border-color:\s*var\(--verde-borda\)/);
    expect(regra?.[1]).toMatch(/background:\s*var\(--verde-suave\)/);
  });

  it('declara o token --verde-texto: #4e6a53', () => {
    expect(css).toMatch(/--verde-texto:\s*#4e6a53/);
  });

  it('não resta nenhum hex #4e6a53 literal fora do token — os 4 usos migraram para var(--verde-texto)', () => {
    const ocorrenciasHex = css.match(/#4e6a53/g) ?? [];
    // A única ocorrência literal permitida é a própria declaração do token.
    expect(ocorrenciasHex.length).toBe(1);
    expect(css).toMatch(/--verde-texto:\s*#4e6a53/);
  });

  it('as regras que usavam o hex repetido agora usam var(--verde-texto)', () => {
    // .dc-pill-privado usava o mesmo hex em A1, mas foi removida em C1 (CSS
    // morto, sem call-site) — as 3 regras restantes continuam migradas.
    const regraPillPrivado = css.match(/(?<!dc-)\.pill-privado\s*\{([^}]*)\}/);
    const regraTagExtrato = css.match(/\.tag-tipo\.extrato\s*\{([^}]*)\}/);
    const regraValorPos = css.match(/\.valor\.pos\s*\{([^}]*)\}/);

    for (const regra of [regraPillPrivado, regraTagExtrato, regraValorPos]) {
      expect(regra).not.toBeNull();
      expect(regra?.[1]).toMatch(/color:\s*var\(--verde-texto\)/);
    }
  });
});
