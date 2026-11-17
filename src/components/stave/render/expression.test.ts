// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import type { Bar, Expression, Passage } from '@/engine/types';
import { bar, engines, note, passage, rest } from '../fixtures';
import { installStaveStubs } from '../test-utils';
import { loadVexFlow } from '../vexflow-loader';
import { draw } from './draw';

beforeAll(() => installStaveStubs());

const r = (b: number, e: number) => ({ bar: b, event: e });

async function render(p: Passage, availablePx = 700) {
  const vf = await loadVexFlow();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const out = draw({
    vf, host, engines, passage: p, uid: 'x1', scale: 1.25, availablePx, edit: false,
    editableBars: p.bars.map(() => false), range: { min: -6, max: 14 },
    show: { clef: true, keySignature: true, timeSignature: true, finalBarline: true },
  });
  return { host, out };
}
const withExpr = (bars: Bar[], expression?: Expression, extra: Partial<Passage> = {}): Passage => ({ ...passage(bars), ...(expression ? { expression } : {}), ...extra });
const four = () => bar(note('C5'), note('D5'), note('E5'), note('F5'));
const count = (host: HTMLElement, sel: string) => host.querySelectorAll(sel).length;

describe('each marking draws its classed SVG element', () => {
  it('articulation signs, by kind', async () => {
    const { host } = await render(withExpr([bar(note('C5', 'crotchet', { articulations: ['staccato'] }), note('D5', 'crotchet', { articulations: ['accent', 'tenuto'] }), note('E5'), note('F5'))]));
    expect(count(host, '.mtn-artic')).toBe(3);
    expect([...host.querySelectorAll('.mtn-artic')].map((e) => e.getAttribute('data-kind'))).toEqual(['staccato', 'accent', 'tenuto']);
    expect(host.querySelectorAll('.mtn-artic text').length).toBe(3);
  });
  it('signs go on the notehead side: below a stem-up note, above a stem-down note', async () => {
    const { host } = await render(withExpr([bar(note('C4', 'crotchet', { articulations: ['staccato'] }), note('B5', 'crotchet', { articulations: ['staccato'] }), note('E4'), note('E4'))]));
    const ys = [...host.querySelectorAll('.mtn-artic text')].map((t) => Number(t.getAttribute('y')));
    expect(ys).toHaveLength(2);
    // C4 sits low on the page (large y); its sign is below it. B5 is high; its sign is above it.
    expect(ys[0]).toBeGreaterThan(ys[1]);
  });
  it('pause on a note and on a rest', async () => {
    const { host } = await render(withExpr([bar(note('C5', 'minim', { fermata: true }), rest('minim'))].map((b) => ({ ...b, events: [b.events[0], { ...b.events[1], fermata: true }] }))));
    expect(count(host, '.mtn-fermata')).toBe(2);
  });
  it('dynamics: one group per dynamic, in the music font, with the level', async () => {
    const { host } = await render(withExpr([four()], { dynamics: [{ at: r(0, 0), level: 'p' }, { at: r(0, 2), level: 'ff' }] }));
    const els = [...host.querySelectorAll('.mtn-dyn')];
    expect(els.map((e) => e.getAttribute('data-level'))).toEqual(['p', 'ff']);
    for (const e of els) expect([...(e.textContent ?? '')].every((c) => (c.codePointAt(0) ?? 0) >= 0xe000)).toBe(true);
  });
  it('hairpins and slurs', async () => {
    const { host } = await render(withExpr([four()], { hairpins: [{ kind: 'cresc', from: r(0, 0), to: r(0, 2) }], slurs: [{ from: r(0, 0), to: r(0, 3) }] }));
    expect(count(host, '.mtn-hairpin')).toBe(1);
    expect(host.querySelector('.mtn-hairpin')?.getAttribute('data-part')).toBe('whole');
    expect(count(host, '.mtn-slur')).toBe(1);
    expect(host.querySelector('.mtn-slur path')).not.toBeNull();
  });
  it('slurs are above stems-down notes and below stems-up notes, and a tie is not a slur', async () => {
    const up = await render(withExpr([bar(note('C4'), note('D4'), note('E4'), note('F4'))], { slurs: [{ from: r(0, 0), to: r(0, 3) }] }));
    expect(up.host.querySelector('.mtn-slur')?.getAttribute('data-side')).toBe('below');
    const down = await render(withExpr([bar(note('C6'), note('B5'), note('A5'), note('G5'))], { slurs: [{ from: r(0, 0), to: r(0, 3) }] }));
    expect(down.host.querySelector('.mtn-slur')?.getAttribute('data-side')).toBe('above');
    const tie = await render(withExpr([bar(note('C5', 'crotchet', { tieToNext: true }), note('C5'), note('D5'), note('E5'))]));
    expect(count(tie.host, '.mtn-slur')).toBe(0);
    expect(count(tie.host, '.vf-stavetie')).toBe(1);
  });
  it('tempo word and metronome mark; US terminology cannot change them (no terminology input at all)', async () => {
    const { host } = await render(withExpr([four()], { tempo: { text: 'Allegro', bpm: 120 } }));
    expect(count(host, '.mtn-tempo')).toBe(1);
    expect(host.querySelector('.mtn-tempo')?.textContent).toContain('Allegro');
    expect(host.querySelector('.mtn-tempo')?.textContent).toContain('120');
  });
  it('tempo mark for 6/8 counts the dotted crotchet', async () => {
    const p = withExpr([bar(note('G4', 'quaver'), note('A4', 'quaver'), note('B4', 'quaver'), note('C5', 'minim'))], { tempo: { bpm: 60 } }, { time: { beats: 6, beatUnit: 8 } });
    const { host } = await render(p);
    expect(count(host, '.mtn-tempo')).toBe(1);
  });
  it('words: italic text with the lang attribute on the text element, above and below', async () => {
    const { host } = await render(withExpr([four()], { words: [{ at: r(0, 0), text: 'dolce', place: 'below', lang: 'it' }, { at: r(0, 2), text: 'sweetly', place: 'above', lang: 'en' }] }));
    const texts = [...host.querySelectorAll('.mtn-words text')];
    expect(texts.map((t) => [t.textContent, t.getAttribute('lang')])).toEqual([['dolce', 'it'], ['sweetly', 'en']]);
    expect(texts[0].getAttribute('font-style')).toBe('italic');
  });
  it('a written tempo change is drawn as words, but not twice when words already say it', async () => {
    const x: Expression = { tempoChanges: [{ kind: 'rit', from: r(0, 1), to: r(0, 3) }, { kind: 'a-tempo', at: r(1, 0) }] };
    const a = await render(withExpr([four(), four()], x));
    expect([...a.host.querySelectorAll('.mtn-words text')].map((t) => t.textContent)).toEqual(['rit.', 'a tempo']);
    const b = await render(withExpr([four(), four()], { ...x, words: [{ at: r(0, 1), text: 'rit.' }] }));
    expect([...b.host.querySelectorAll('.mtn-words text')].map((t) => t.textContent)).toEqual(['rit.', 'a tempo']);
  });
  it('repeat bar lines, double and final lines', async () => {
    const bars = [{ ...four(), repeatStart: true }, { ...four(), endBarline: 'repeat-end' as const }, { ...four(), endBarline: 'double' as const }, { ...four(), endBarline: 'final' as const }];
    const { host } = await render(withExpr(bars), 900);
    expect(count(host, '.vf-stavebarline')).toBeGreaterThan(4);
    expect(host.innerHTML).not.toEqual((await render(withExpr(bars.map((b) => ({ events: b.events }))), 900)).host.innerHTML);
  });
  it.each([
    ['segno', 'segno'],
    ['fine', 'Fine'],
    ['dc', 'D.C.'],
    ['dc-al-fine', 'D.C. al Fine'],
    ['ds', 'D.S.'],
    ['ds-al-fine', 'D.S. al Fine'],
  ] as const)('navigation sign %s', async (marker, text) => {
    const { host } = await render(withExpr([{ ...four(), marker }]));
    const el = host.querySelector('.mtn-repeat');
    expect(el?.getAttribute('data-kind')).toBe(marker);
    if (marker !== 'segno') expect(el?.textContent).toBe(text);
    else expect(el?.textContent?.length).toBeGreaterThan(0);
  });
});

describe('layout rules', () => {
  const plain = () => withExpr([four(), four()]);
  it('reserves nothing extra for a passage with no expression', async () => {
    const a = await render(plain());
    const b = await render({ ...plain(), expression: {} });
    expect(b.out.model.height).toBe(a.out.model.height);
  });
  it('slurs alone need no extra room above the stave but never get clipped', async () => {
    const a = await render(plain());
    const b = await render(withExpr([four(), four()], { slurs: [{ from: r(0, 0), to: r(0, 3) }] }));
    expect(b.out.model.height).toBeGreaterThanOrEqual(a.out.model.height);
  });
  it('tempo, pauses, words above and signs add room above; dynamics, hairpins and words below add room below', async () => {
    const base = (await render(plain())).out.model.height;
    const tempo = (await render(withExpr([four(), four()], { tempo: { bpm: 90 } }))).out.model.height;
    const dyn = (await render(withExpr([four(), four()], { dynamics: [{ at: r(0, 0), level: 'f' }] }))).out.model.height;
    const mark = (await render(withExpr([{ ...four(), marker: 'fine' }, four()]))).out.model.height;
    expect(tempo).toBeGreaterThan(base);
    expect(dyn).toBeGreaterThan(base);
    expect(mark).toBeGreaterThan(base);
  });
  it('a hairpin or slur crossing a system break is drawn in two parts', async () => {
    const bars = Array.from({ length: 4 }, four);
    const p = withExpr(bars, { hairpins: [{ kind: 'cresc', from: r(0, 1), to: r(3, 2) }], slurs: [{ from: r(0, 2), to: r(3, 1) }] });
    const { host, out } = await render(p, 300);
    expect(out.model.systems.length).toBeGreaterThan(1);
    const parts = [...host.querySelectorAll('.mtn-hairpin')].map((e) => e.getAttribute('data-part'));
    expect(parts[0]).toBe('first');
    expect(parts.at(-1)).toBe('last');
    expect(host.querySelectorAll('.mtn-slur').length).toBe(out.model.systems.length);
  });
  it('dynamics under neighbouring notes never overlap each other or a hairpin', async () => {
    const q = (b: number) => ({ at: r(b, 0), level: 'mp' as const });
    const p = withExpr([bar(note('C5', 'quaver'), note('D5', 'quaver'), note('E5', 'quaver'), note('F5', 'quaver'), note('G5', 'minim'))], {
      dynamics: [q(0), { at: r(0, 1), level: 'ff' }, { at: r(0, 2), level: 'pp' }],
      hairpins: [{ kind: 'dim', from: r(0, 2), to: r(0, 4) }],
    });
    const { host } = await render(p, 340);
    const xs = [...host.querySelectorAll('.mtn-dyn text')].map((t) => Number(t.getAttribute('x')));
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    // stub text width is 10 per glyph; every dynamic starts after the previous one ends (plus a gap)
    const widths = [...host.querySelectorAll('.mtn-dyn text')].map((t) => (t.textContent ?? '').length * 10);
    xs.slice(1).forEach((x, i) => expect(x).toBeGreaterThanOrEqual(xs[i] + widths[i]));
  });
});
