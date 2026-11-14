import { describe, expect, it } from 'vitest';
import { bar, constraints, engines, note, passage, rest } from '../fixtures';
import { allStops, chordLetterPosition, firstDifferingBar, jumpBar, nearestLetterPosition, referencePosition, stepStop, stopFor, stopsForBar } from './navigation';

const p = passage([bar(note('C4'), note('E4'), rest()), bar(), bar(note('G4'), note('B4'))]);
const c = constraints({ bars: 3 });

describe('stops', () => {
  it('a bar has its events then its end slot', () => {
    expect(stopsForBar(c, p, 0)).toEqual([
      { kind: 'event', bar: 0, event: 0 },
      { kind: 'event', bar: 0, event: 1 },
      { kind: 'event', bar: 0, event: 2 },
      { kind: 'slot', bar: 0, slot: 3 },
    ]);
    expect(stopsForBar(c, p, 1)).toEqual([{ kind: 'slot', bar: 1, slot: 0 }]);
  });
  it('locked events and bars are not stops; the end slot sits before a locked suffix', () => {
    const lc = constraints({ editable: [{ bar: 0, lockedPrefix: 1, lockedSuffix: 1 }] });
    expect(stopsForBar(lc, p, 0)).toEqual([
      { kind: 'event', bar: 0, event: 1 },
      { kind: 'slot', bar: 0, slot: 2 },
    ]);
    expect(stopsForBar(lc, p, 2)).toEqual([]);
  });
  it('tuplet events are not stops', () => {
    const t = { kind: 'note' as const, pitches: [engines.pitch.parsePitch('C5')], duration: { value: 'quaver' as const, dots: 0 as const, tuplet: { actual: 3, normal: 2 } } };
    const tp = passage([bar(t, note('C4'))]);
    expect(stopsForBar(constraints({ bars: 1 }), tp, 0).map((s) => s.kind === 'event' && s.event)).toEqual([1, false]);
  });
  it('right from an end slot goes to the first stop of the next editable bar, left is the reverse', () => {
    const end0 = { kind: 'slot' as const, bar: 0, slot: 3 };
    expect(stepStop(c, p, end0, 1)).toEqual({ kind: 'slot', bar: 1, slot: 0 });
    expect(stepStop(c, p, { kind: 'slot', bar: 1, slot: 0 }, 1)).toEqual({ kind: 'event', bar: 2, event: 0 });
    expect(stepStop(c, p, { kind: 'event', bar: 2, event: 0 }, -1)).toEqual({ kind: 'slot', bar: 1, slot: 0 });
    expect(stepStop(c, p, allStops(c, p).at(-1)!, 1)).toBeNull();
    expect(stepStop(c, p, allStops(c, p)[0], -1)).toBeNull();
  });
  it('ctrl+arrow jumps bars', () => {
    expect(jumpBar(c, p, 0, 1)).toEqual({ kind: 'slot', bar: 1, slot: 0 });
    expect(jumpBar(c, p, 2, 1)).toBeNull();
    expect(jumpBar(c, p, 2, -1)).toEqual({ kind: 'slot', bar: 1, slot: 0 });
  });
  it('stopFor maps a selection to its event and a caret to the end slot', () => {
    expect(stopFor(c, p, { selection: { bar: 0, event: 1 }, caret: { bar: 0, slot: 2 } })).toEqual({ kind: 'event', bar: 0, event: 1 });
    expect(stopFor(c, p, { selection: null, caret: { bar: 0, slot: 1 } })).toEqual({ kind: 'slot', bar: 0, slot: 3 });
  });
});

describe('reference position and letters', () => {
  it('top head of the nearest note before the caret, across bars, else the middle line', () => {
    expect(referencePosition(engines, p, { bar: 0, slot: 0 })).toBe(4);
    expect(referencePosition(engines, p, { bar: 0, slot: 2 })).toBe(0);
    expect(referencePosition(engines, p, { bar: 0, slot: 3 })).toBe(0); // the rest is skipped
    expect(referencePosition(engines, p, { bar: 1, slot: 0 })).toBe(0);
    expect(referencePosition(engines, p, { bar: 2, slot: 2 })).toBe(4);
    const chord = passage([bar(note(['C4', 'G4']))]);
    expect(referencePosition(engines, chord, { bar: 0, slot: 1 })).toBe(2);
  });
  it('nearest letter, ties to the higher, clamped to the range', () => {
    const r = { min: -6, max: 14 };
    // from B4 (4): C is at 5 (up 1) and -2; nearest is 5
    expect(nearestLetterPosition(engines, 'C', 4, 'treble', r)).toBe(5);
    // from E4 (0): A is at 3 and -4 ... 3
    expect(nearestLetterPosition(engines, 'A', 0, 'treble', r)).toBe(3);
    // exact tie: positions 4 apart both ways does not occur within a 7-step cycle; test with a narrow range
    expect(nearestLetterPosition(engines, 'E', 3, 'treble', { min: 0, max: 7 })).toBe(0);
    expect(nearestLetterPosition(engines, 'F', 4, 'treble', { min: 0, max: 0 })).toBeNull();
    expect(nearestLetterPosition(engines, 'E', 4, 'treble', { min: 0, max: 7 })).toBe(7);
  });
  it('chord letter above the top head, else below the bottom, skipping occupied', () => {
    const r = { min: -6, max: 14 };
    expect(chordLetterPosition(engines, 'G', 0, 0, 'treble', r, [0])).toBe(2);
    expect(chordLetterPosition(engines, 'G', 14, 14, 'treble', r, [14])).toBe(9);
    expect(chordLetterPosition(engines, 'E', 14, 14, 'treble', { min: 0, max: 14 }, [14])).toBe(7);
  });
});

describe('firstDifferingBar', () => {
  it('finds the first changed bar by value', () => {
    const q = passage([bar(note('C4')), bar(note('D4')), bar(note('E4'))]);
    const r = structuredClone(q);
    r.bars[1] = bar(note('F4'));
    expect(firstDifferingBar(q, r)).toBe(1);
    expect(firstDifferingBar(q, structuredClone(q))).toBe(0);
  });
});
