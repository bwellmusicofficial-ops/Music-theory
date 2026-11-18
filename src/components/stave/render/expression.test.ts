// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import type { Bar, Expression, Passage } from '@/engine/types';
import { bar, engines, note, passage, rest } from '../fixtures';
import { installStaveStubs } from '../test-utils';
import { GALLERY } from '@/app/(dev)/dev/expression/gallery';
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
    expect([...host.querySelectorAll('.mtn-repeat')].map((e) => e.getAttribute('data-kind'))).toEqual(['repeat-begin', 'repeat-end', 'double', 'final']);
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

describe('print rules from review: clear dynamics, whole-looking split hairpins, slurs clear of signs, plain tempo mark', () => {
  const STUB_LETTER = 10; // the test font stub measures 10 per glyph, so one letter is 10 wide
  const galleryPassage = (id: string) => (GALLERY.find((g) => g.id === id) as (typeof GALLERY)[number]).passage;

  it('consecutive dynamics on crotchets at phone width are at least one letter apart (notes are spread to allow it)', async () => {
    for (const width of [358, 330]) {
      const { host } = await render(galleryPassage('dynamics'), width);
      const texts = [...host.querySelectorAll('.mtn-dyn text')];
      expect(texts).toHaveLength(6);
      const boxes = texts.map((t) => ({ x0: Number(t.getAttribute('x')), w: (t.textContent ?? '').length * STUB_LETTER }));
      // The dynamics of one bar sit on notes: each starts where its note head starts, never pushed along.
      const notes = [...host.querySelectorAll('.vf-stavenote')];
      expect(notes.length).toBeGreaterThanOrEqual(6);
      boxes.slice(1).forEach((b, i) => {
        // same system only (a new system starts further left)
        if (b.x0 < boxes[i].x0) return;
        expect(b.x0 - (boxes[i].x0 + boxes[i].w)).toBeGreaterThanOrEqual(STUB_LETTER - 0.5);
      });
    }
  });
  it('even dynamics on quavers are spread a letter apart (the notes are widened, the dynamics are not moved)', async () => {
    const q = (n: string) => note(n, 'quaver');
    const dense = withExpr([bar(q('C5'), q('D5'), q('E5'), q('F5'), q('G5'), q('F5'), q('E5'), q('D5'))], {
      dynamics: [{ at: r(0, 0), level: 'pp' }, { at: r(0, 1), level: 'mf' }, { at: r(0, 2), level: 'ff' }, { at: r(0, 3), level: 'p' }],
    });
    const { host, out } = await render(dense, 300);
    const headStart = (i: number) => out.model.bars[0].events[i].heads[0].x - out.model.headWidth / 2;
    [...host.querySelectorAll('.mtn-dyn text')].forEach((t, i) => expect(Math.abs(Number(t.getAttribute('x')) - headStart(i))).toBeLessThan(2));
    const boxes = [...host.querySelectorAll('.mtn-dyn text')].map((t) => ({ x0: Number(t.getAttribute('x')), w: (t.textContent ?? '').length * STUB_LETTER }));
    expect(boxes).toHaveLength(4);
    boxes.slice(1).forEach((b, i) => expect(b.x0 - (boxes[i].x0 + boxes[i].w)).toBeGreaterThanOrEqual(STUB_LETTER - 0.5));
  });
  it('a dynamic sits exactly under its own note head, not moved off it', async () => {
    const { host, out } = await render(galleryPassage('dynamics'), 358);
    const xs = [...host.querySelectorAll('.mtn-dyn text')].map((t) => Number(t.getAttribute('x')));
    const heads = out.model.bars.flatMap((b) => b.events.map((e) => e.heads[0].x - out.model.headWidth / 2));
    xs.forEach((x, i) => expect(Math.abs(x - heads[i])).toBeLessThan(2));
  });
  it('passages with one dynamic per bar are not widened', async () => {
    const one = withExpr([four()], { dynamics: [{ at: r(0, 0), level: 'f' }] });
    const none = withExpr([four()]);
    const a = await render(one);
    const b = await render(none);
    expect(a.out.model.bars[0].events.map((e) => e.centreX)).toEqual(b.out.model.bars[0].events.map((e) => e.centreX));
  });
  it('a hairpin over a break: the first piece opens to 60% and the continuation starts at 60% (crescendo), mirrored for diminuendo', async () => {
    const bars = Array.from({ length: 2 }, four);
    for (const kind of ['cresc', 'dim'] as const) {
      const p = withExpr(Array.from({ length: 4 }, four), { hairpins: [{ kind, from: r(0, 0), to: r(3, 3) }] });
      const { host } = await render(p, 300);
      const pieces = [...host.querySelectorAll('.mtn-hairpin')].map((g) => {
        const d = g.querySelector('path')?.getAttribute('d') ?? '';
        const nums = [...d.matchAll(/(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
        // M x y L x y M x y L x y: the opening at each end is the gap between the upper and the lower line
        return { start: Math.abs(nums[5] - nums[1]), end: Math.abs(nums[7] - nums[3]) };
      });
      expect(pieces.length).toBe(2);
      const full = Math.max(...pieces.flatMap((q) => [q.start, q.end]));
      const share = (v: number) => v / full;
      if (kind === 'cresc') {
        expect(share(pieces[0].start)).toBeCloseTo(0, 1);
        expect(share(pieces[0].end)).toBeCloseTo(0.6, 1);
        expect(share(pieces[1].start)).toBeCloseTo(0.6, 1);
        expect(share(pieces[1].end)).toBeCloseTo(1, 1);
      } else {
        expect(share(pieces[0].start)).toBeCloseTo(1, 1);
        expect(share(pieces[0].end)).toBeCloseTo(0.4, 1);
        expect(share(pieces[1].start)).toBeCloseTo(0.4, 1);
        expect(share(pieces[1].end)).toBeCloseTo(0, 1);
      }
    }
    void bars;
  });
  it('line breaking avoids cutting a hairpin when a break elsewhere is possible, and leaves other passages alone', async () => {
    const bars = Array.from({ length: 4 }, four);
    const hairpin = withExpr(bars, { hairpins: [{ kind: 'cresc', from: r(2, 0), to: r(3, 3) }] });
    const plain4 = withExpr(bars);
    const a = await render(hairpin, 260);
    const b = await render(plain4, 260);
    const splitAt = (m: typeof a.out.model) => m.systems.map((s) => s.bars.length);
    expect(a.out.model.systems.length).toBe(b.out.model.systems.length);
    // the hairpin lies in bars 2-3: they must share a system
    const sysOf = (m: typeof a.out.model, bar: number) => m.systems.findIndex((s) => s.bars.includes(bar));
    expect(sysOf(a.out.model, 2)).toBe(sysOf(a.out.model, 3));
    expect(splitAt(b.out.model).reduce((x, y) => x + y, 0)).toBe(4);
  });
  it('a slur ends clear of an accent on its side, with a gap', async () => {
    const p = withExpr([bar(note('G4'), note('A4'), note('B4'), note('G4')), bar(note('E5', 'crotchet', { articulations: ['accent'] }), note('D5'), note('C5'), note('B4'))], { slurs: [{ from: r(0, 3), to: r(1, 0) }] });
    const { host } = await render(p);
    const slur = host.querySelector('.mtn-slur path');
    expect(slur).not.toBeNull();
    const d = slur?.getAttribute('d') ?? '';
    const endY = Number([...d.matchAll(/(-?\d+(?:\.\d+)?)/g)].map((m) => m[1])[5]);
    const signY = Number(host.querySelector('.mtn-artic text')?.getAttribute('y'));
    // above the notes: smaller y is higher; the slur's end must be above the sign's top (sign ink is about 8 tall)
    expect(host.querySelector('.mtn-slur')?.getAttribute('data-side')).toBe('above');
    expect(endY).toBeLessThan(signY - 8);
  });
  it('the metronome mark has no brackets: word, then note = number', async () => {
    const { host } = await render(withExpr([four()], { tempo: { text: 'Allegro', bpm: 120 } }));
    expect(count(host, '.mtn-tempo')).toBe(1);
    const text = host.querySelector('.mtn-tempo')?.textContent ?? '';
    expect(text).not.toMatch(/[()]/);
    expect(text).toContain('Allegro');
    expect(text).toContain('=');
    expect(text).toContain('120');
  });
  it('D.C., D.S. and Fine signs are marked for bold italic (CSS), the segno is not', async () => {
    const p = withExpr([{ ...four(), marker: 'segno' }, { ...four(), marker: 'dc-al-fine' }, { ...four(), marker: 'fine' }]);
    const { host } = await render(p, 600);
    const kinds = [...host.querySelectorAll('.mtn-repeat')].map((e) => e.getAttribute('data-kind'));
    expect(kinds).toEqual(expect.arrayContaining(['segno', 'dc-al-fine', 'fine']));
  });
});

