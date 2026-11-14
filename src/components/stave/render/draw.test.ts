// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { bar, engines, note, passage, rest } from '../fixtures';
import { installStaveStubs } from '../test-utils';
import { loadVexFlow } from '../vexflow-loader';
import { draw, type DrawInput } from './draw';

beforeAll(() => installStaveStubs());

async function run(p = passage([bar(note('F#4', 'crotchet', { tieToNext: true }), note('F#4'), note('A4', 'quaver'), note('B4', 'quaver'), rest())], { key: 'D' }), over: Partial<DrawInput> = {}) {
  const vf = await loadVexFlow();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const out = draw({
    vf, host, engines, passage: p, uid: 'u1', scale: 1.5, availablePx: 400, edit: false,
    editableBars: p.bars.map(() => false), range: { min: -6, max: 14 },
    show: { clef: true, keySignature: true, timeSignature: true, finalBarline: true }, ...over,
  });
  return { host, out, p };
}

describe('draw', () => {
  it('draws one vf-stavenote per event and returns a layout model', async () => {
    const { host, out, p } = await run();
    expect(host.querySelectorAll('.vf-stavenote')).toHaveLength(p.bars[0].events.length);
    expect(out.model.bars).toHaveLength(1);
    expect(out.model.bars[0].events).toHaveLength(5);
    expect(out.model.bars[0].slotX).toHaveLength(6);
    expect(out.model.scale).toBe(1.5);
    expect(out.model.systems[0].height).toBeGreaterThan(80);
    const svg = host.querySelector('svg')!;
    expect(svg.getAttribute('id')).toBe('u1-notation-svg');
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${out.model.width} ${out.model.height}`);
  });
  it('event layouts are ordered left to right with head positions from the engine', async () => {
    const { out } = await run();
    const xs = out.model.bars[0].events.map((e) => e.centreX);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(out.model.bars[0].events[0].heads[0].position).toBe(1);
    expect(out.model.bars[0].events[4].isRest).toBe(true);
    expect(out.model.bars[0].events[4].heads).toEqual([]);
  });
  it('registers element groups by bar:event', async () => {
    const { out } = await run();
    expect(out.elements.get('0:0')?.group?.classList.contains('vf-stavenote')).toBe(true);
    expect(out.elements.size).toBe(5);
  });
  it('an empty bar draws a stave only; an empty passage a single system', async () => {
    const empty = await run(passage([bar()]));
    expect(empty.host.querySelectorAll('.vf-stavenote')).toHaveLength(0);
    expect(empty.out.model.bars[0].slotX).toHaveLength(1);
    const none = await run(passage([]));
    expect(none.out.model.systems).toHaveLength(1);
    expect(none.out.model.bars).toHaveLength(0);
  });
  it('breaks into systems at narrow widths and draws ties across them', async () => {
    const bars = Array.from({ length: 4 }, () => bar(note('C5', 'crotchet', { tieToNext: true }), note('C5', 'minim')));
    const { out, host } = await run(passage(bars), { availablePx: 300, edit: true, editableBars: [true, true, true, true] });
    expect(out.model.systems.length).toBeGreaterThan(1);
    expect(host.querySelectorAll('.vf-stavetie').length).toBeGreaterThan(0);
  });
  it('handles chords, accidentals, dots, tuplets, short and overfull bars', async () => {
    const tup = { kind: 'note' as const, pitches: [engines.pitch.parsePitch('C5')], duration: { value: 'quaver' as const, dots: 0 as const, tuplet: { actual: 3, normal: 2 } } };
    const p = passage([
      bar(note(['D4', 'F#4', 'A4'], 'minim'), { ...note('G4'), duration: { value: 'crotchet', dots: 1 } }),
      bar(tup, tup, tup, note('D5', 'crotchet'), note('E5', 'minim')),
      bar(...Array.from({ length: 7 }, () => note('C5'))),
    ]);
    const { out, host } = await run(p);
    expect(host.querySelectorAll('.vf-stavenote')).toHaveLength(2 + 5 + 7);
    expect(out.model.bars).toHaveLength(3);
    expect(host.querySelectorAll('.vf-tuplet').length).toBeGreaterThan(0);
  });
  it('a note far above the stave grows the system box in read mode', async () => {
    const low = await run(passage([bar(note('C5'))]));
    const high = await run(passage([bar(note('C7'))]));
    expect(high.out.model.systems[0].height).toBeGreaterThan(low.out.model.systems[0].height);
  });
  it('redrawing replaces the old svg', async () => {
    const { host, p } = await run();
    expect(host.querySelectorAll('svg')).toHaveLength(1);
    const vf = await loadVexFlow();
    draw({ vf, host, engines, passage: p, uid: 'u1', scale: 1.5, availablePx: 400, edit: false, editableBars: [false], range: { min: -6, max: 14 }, show: { clef: true, keySignature: true, timeSignature: true, finalBarline: true } });
    expect(host.querySelectorAll('svg')).toHaveLength(1);
  });
  it('all four clefs draw', async () => {
    for (const clef of ['treble', 'bass', 'alto', 'tenor'] as const) {
      const { host } = await run(passage([bar(note('C4'), rest('semibreve'))], { clef }));
      expect(host.querySelectorAll('.vf-stavenote')).toHaveLength(2);
    }
  });
});
