import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../../styles/tokens.css'), 'utf8');

type Tokens = Record<string, string>;

/** Parses top-level rule blocks; @media blocks are skipped (they only hold motion tokens). */
function parseBlocks(source: string): { selector: string; tokens: Tokens }[] {
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const blocks: { selector: string; tokens: Tokens }[] = [];
  for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const tokens: Tokens = {};
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[d[1]] = d[2].trim();
    blocks.push({ selector: m[1].trim(), tokens });
  }
  return blocks;
}

const blocks = parseBlocks(css);
const dark: Tokens = Object.assign({}, ...blocks.filter((b) => b.selector === ':root').map((b) => b.tokens));
const lightOverrides: Tokens = Object.assign(
  {},
  ...blocks.filter((b) => b.selector === '[data-theme="light"]').map((b) => b.tokens),
);
const themes: Record<string, Tokens> = { dark, light: { ...dark, ...lightOverrides } };

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Expected a 6-digit hex colour, got "${hex}"`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const STRANDS = [
  'rhythm',
  'pitch',
  'scales-keys',
  'intervals',
  'harmony',
  'composition',
  'terms',
  'score-reading',
];
const LAYERS = ['--bg', '--bg-raised', '--surface', '--surface-raised'];
const STATUS = ['success', 'danger', 'warning'];

/** [foreground, background, minimum ratio] */
function pairs(): [string, string, number][] {
  const out: [string, string, number][] = [];
  for (const layer of LAYERS) {
    for (const fg of ['--text', '--text-secondary', '--text-muted']) out.push([fg, layer, 4.5]);
    for (const fg of ['--accent', '--accent-hover', ...STATUS.map((s) => `--${s}`)]) out.push([fg, layer, 4.5]);
    for (const s of STRANDS) out.push([`--strand-${s}`, layer, 4.5]);
    out.push(['--border', layer, 3], ['--focus-ring', layer, 3]);
  }
  out.push(['--on-accent', '--accent', 4.5], ['--on-accent', '--accent-hover', 4.5]);
  for (const s of STATUS) out.push([`--on-${s}`, `--${s}`, 4.5]);
  return out;
}

describe('tokens.css contrast (WCAG AA)', () => {
  it('defines every token the test relies on in both themes', () => {
    for (const [name, tokens] of Object.entries(themes)) {
      for (const [fg, bg] of pairs()) {
        expect(tokens[fg], `${name} ${fg}`).toBeDefined();
        expect(tokens[bg], `${name} ${bg}`).toBeDefined();
      }
    }
    expect(Object.keys(lightOverrides).length).toBeGreaterThan(10);
  });

  for (const [name, tokens] of Object.entries(themes)) {
    describe(`${name} theme`, () => {
      for (const [fg, bg, min] of pairs()) {
        it(`${fg} on ${bg} is at least ${min}:1`, () => {
          const ratio = contrastRatio(tokens[fg], tokens[bg]);
          expect(ratio, `${tokens[fg]} on ${tokens[bg]} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(min);
        });
      }

      it('gives each strand a distinct colour', () => {
        const colours = STRANDS.map((s) => tokens[`--strand-${s}`].toLowerCase());
        expect(new Set(colours).size).toBe(STRANDS.length);
      });
    });
  }
});
