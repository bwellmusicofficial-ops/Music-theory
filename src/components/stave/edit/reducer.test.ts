import { describe, expect, it } from 'vitest';
import type { Passage } from '@/engine/types';
import { bar, constraints, deepFreeze, engines, note, passage, pstr, rest } from '../fixtures';
import type { EditAction, EditConstraints, EditResult } from './actions';
import { createReducer } from './reducer';

const reduce = createReducer(engines);

function ok(r: EditResult) {
  if (!r.ok) throw new Error(`rejected: ${r.reason}`);
  return r;
}
function run(p: Passage, a: EditAction, c: EditConstraints = constraints()): EditResult {
  return reduce(deepFreeze(structuredClone(p)), a, c);
}
const base = () => passage([bar(note('C4'), note('E4'), note('G4')), bar(note('F4'))]);
const ins = (over: Partial<Extract<EditAction, { type: 'insert-note' }>> = {}): EditAction => ({
  type: 'insert-note', bar: 0, slot: 1, position: 4, value: 'crotchet', dots: 0, sign: null, ...over,
});

describe('insert-note', () => {
  it('inserts, shifts events right, focuses the new event, sounds it', () => {
    const r = ok(run(base(), ins()));
    expect(r.passage.bars[0].events.map(pstr)).toEqual(['C4', 'B4', 'E4', 'G4']);
    expect(r.focus).toEqual({ kind: 'event', bar: 0, event: 1, pitchIndex: 0 });
    expect(r.sound.map((p) => engines.pitch.formatPitch(p))).toEqual(['B4']);
  });
  it('reads the pitch from the key signature', () => {
    const p = passage([bar()], { key: 'D' });
    const r = ok(run(p, ins({ bar: 0, slot: 0, position: 8 })));
    expect(pstr(r.passage.bars[0].events[0])).toBe('F#5');
    expect(r.passage.bars[0].events[0]).toMatchObject({ showAccidental: false });
  });
  it('an armed sign sets pitch and flag', () => {
    const r = ok(run(base(), ins({ sign: 1, position: 1 })));
    expect(pstr(r.passage.bars[0].events[1])).toBe('F#4');
    expect(r.passage.bars[0].events[1]).toMatchObject({ showAccidental: true });
  });
  it('rejects out of range, not allowed value, dots, sign', () => {
    expect((run(base(), ins({ position: 15 })) as { reason: string }).reason).toBe('out-of-range');
    expect((run(base(), ins({ position: -7 })) as { reason: string }).reason).toBe('out-of-range');
    expect((run(base(), ins({ value: 'quaver' }), constraints({ allow: { ...constraints().allow, values: ['crotchet'] } })) as { reason: string }).reason).toBe('not-allowed');
    expect((run(base(), ins({ dots: 1 }), constraints({ allow: { ...constraints().allow, maxDots: 0 } })) as { reason: string }).reason).toBe('not-allowed');
    expect((run(base(), ins({ sign: 1 }), constraints({ allow: { ...constraints().allow, signs: [] } })) as { reason: string }).reason).toBe('not-allowed');
  });
  it('capacity: exactly twice nominal accepted, one more rejected', () => {
    const seven = Array.from({ length: 7 }, () => note('C4'));
    const p = passage([bar(...seven)]); // 7 crotchets, nominal 4
    const eight = ok(run(p, ins({ slot: 7, position: 0 })));
    expect(eight.passage.bars[0].events).toHaveLength(8);
    const full = passage([bar(...Array.from({ length: 8 }, () => note('C4')))]);
    expect((run(full, ins({ slot: 8 })) as { reason: string }).reason).toBe('bar-full');
  });
  it('capacity: 32 events', () => {
    const p = passage([bar(...Array.from({ length: 32 }, () => note('C4', 'demisemiquaver')))]);
    const c = constraints({ allow: { ...constraints().allow, values: ['demisemiquaver'] } });
    expect((run(p, ins({ slot: 0, value: 'demisemiquaver' }), c) as { reason: string }).reason).toBe('bar-full');
  });
});

describe('insert-rest', () => {
  const a: EditAction = { type: 'insert-rest', bar: 0, slot: 3, value: 'crotchet', dots: 0 };
  it('inserts a rest and sounds nothing', () => {
    const r = ok(run(base(), a));
    expect(r.passage.bars[0].events[3]).toEqual({ kind: 'rest', duration: { value: 'crotchet', dots: 0 } });
    expect(r.sound).toEqual([]);
    expect(r.focus).toEqual({ kind: 'event', bar: 0, event: 3, pitchIndex: 0 });
  });
  it('rejects when rests are off or the bar is full', () => {
    expect((run(base(), a, constraints({ allow: { ...constraints().allow, rests: false } })) as { reason: string }).reason).toBe('not-allowed');
    const full = passage([bar(...Array.from({ length: 8 }, () => note('C4')))]);
    expect((run(full, a) as { reason: string }).reason).toBe('bar-full');
  });
});

describe('set-single-note', () => {
  const c = constraints({ kind: 'single-note', bars: 1, allow: { ...constraints().allow, values: ['semibreve'] } });
  const a = (position: number, sign: 1 | null = null): EditAction => ({ type: 'set-single-note', bar: 0, position, sign });
  it('creates then moves; never two events', () => {
    const p0 = passage([bar()]);
    const r1 = ok(run(p0, a(2), c));
    expect(r1.passage.bars[0].events.map(pstr)).toEqual(['G4']);
    expect(r1.passage.bars[0].events[0].duration.value).toBe('semibreve');
    const r2 = ok(run(r1.passage, a(5), c));
    expect(r2.passage.bars[0].events.map(pstr)).toEqual(['C5']);
    const r3 = ok(run(r2.passage, a(6, 1), c));
    expect(r3.passage.bars[0].events.map(pstr)).toEqual(['D#5']);
  });
  it('respects a locked prefix', () => {
    const p = passage([bar(note('C4', 'minim'))]);
    const cc = constraints({ ...c, editable: [{ bar: 0, lockedPrefix: 1, lockedSuffix: 0 }] });
    const r = ok(run(p, a(2), cc));
    expect(r.passage.bars[0].events.map(pstr)).toEqual(['C4', 'G4']);
    const r2 = ok(run(r.passage, a(4), cc));
    expect(r2.passage.bars[0].events.map(pstr)).toEqual(['C4', 'B4']);
  });
  it('is rejected in free kind, and other actions are rejected in single-note kind', () => {
    expect((run(base(), a(2)) as { reason: string }).reason).toBe('not-allowed');
    expect((run(passage([bar()]), ins({ slot: 0 }), c) as { reason: string }).reason).toBe('not-allowed');
  });
  it('out of range', () => {
    expect((run(passage([bar()]), a(20), c) as { reason: string }).reason).toBe('out-of-range');
  });
});

describe('move-head', () => {
  const mv = (position: number, event = 1): EditAction => ({ type: 'move-head', bar: 0, event, pitchIndex: 0, position });
  it('moves and focuses', () => {
    const r = ok(run(base(), mv(5)));
    expect(r.passage.bars[0].events.map(pstr)).toEqual(['C4', 'C5', 'G4']);
    expect(r.sound).toHaveLength(1);
  });
  it('clears its sign', () => {
    const p = passage([bar(note('F#4'))]);
    const r = ok(run(p, { type: 'move-head', bar: 0, event: 0, pitchIndex: 0, position: 2 }));
    expect(r.passage.bars[0].events[0]).toMatchObject({ showAccidental: false });
    expect(pstr(r.passage.bars[0].events[0])).toBe('G4');
  });
  it('keeps chord heads sorted and rejects collapsing', () => {
    const p = passage([bar(note(['C4', 'G4']))]);
    const r = ok(run(p, { type: 'move-head', bar: 0, event: 0, pitchIndex: 0, position: 5 }));
    expect(pstr(r.passage.bars[0].events[0])).toBe('G4+C5');
    expect(r.focus).toEqual({ kind: 'event', bar: 0, event: 0, pitchIndex: 1 });
    expect((run(p, { type: 'move-head', bar: 0, event: 0, pitchIndex: 0, position: 2 }) as { reason: string }).reason).toBe('position-occupied');
  });
  it('rejects rests, range, tuplets', () => {
    const p = passage([bar(rest(), note('C4', 'quaver', {}))]);
    expect((run(p, mv(2, 0)) as { reason: string }).reason).toBe('no-target');
    expect((run(base(), mv(30)) as { reason: string }).reason).toBe('out-of-range');
    const t = passage([bar({ kind: 'note', pitches: [{ letter: 'C', accidental: 0, octave: 4 }], duration: { value: 'quaver', dots: 0, tuplet: { actual: 3, normal: 2 } } })]);
    expect((run(t, mv(2, 0)) as { reason: string }).reason).toBe('not-allowed');
  });
  it('propagates the reading rule to later notes without changing their flag', () => {
    const p = passage([bar(note('F4'), note('G4'), note('F4'))]);
    const r1 = ok(run(p, { type: 'set-sign', bar: 0, event: 0, pitchIndex: 0, sign: 1 }));
    expect(r1.passage.bars[0].events.map(pstr)).toEqual(['F#4', 'G4', 'F#4']);
    expect(r1.passage.bars[0].events[2]).toMatchObject({ showAccidental: false });
    expect(r1.passage.bars[0].events[0]).toMatchObject({ showAccidental: true });
  });
});

describe('add-head', () => {
  const add = (position: number, sign: 1 | null = null): EditAction => ({ type: 'add-head', bar: 0, event: 0, position, sign });
  it('adds a head, sorted, with sound of the whole chord', () => {
    const r = ok(run(passage([bar(note('C4'))]), add(4)));
    expect(pstr(r.passage.bars[0].events[0])).toBe('C4+B4');
    expect(r.focus).toMatchObject({ pitchIndex: 1 });
    expect(r.sound).toHaveLength(2);
  });
  it('emits per-head flags for chords', () => {
    const r = ok(run(passage([bar(note('C4'))]), add(1, 1)));
    expect(r.passage.bars[0].events[0]).toMatchObject({ showAccidental: [false, true] });
  });
  it('rejects occupied, full, rest, disabled', () => {
    expect((run(passage([bar(note('C4'))]), add(-2)) as { reason: string }).reason).toBe('position-occupied');
    expect((run(passage([bar(note(['C4', 'E4', 'G4', 'B4']))]), add(6)) as { reason: string }).reason).toBe('chord-full');
    expect((run(passage([bar(rest())]), add(6)) as { reason: string }).reason).toBe('no-target');
    expect((run(passage([bar(note('C4'))]), add(6), constraints({ maxChordSize: 1 })) as { reason: string }).reason).toBe('not-allowed');
    expect((run(passage([bar(note('C4'))]), add(40)) as { reason: string }).reason).toBe('out-of-range');
  });
});

describe('remove-head', () => {
  it('removes one head of a chord', () => {
    const r = ok(run(passage([bar(note(['C4', 'E4', 'G4']))]), { type: 'remove-head', bar: 0, event: 0, pitchIndex: 1 }));
    expect(pstr(r.passage.bars[0].events[0])).toBe('C4+G4');
  });
  it('removing the only head deletes the event', () => {
    const r = ok(run(base(), { type: 'remove-head', bar: 0, event: 1, pitchIndex: 0 }));
    expect(r.passage.bars[0].events.map(pstr)).toEqual(['C4', 'G4']);
    expect(r.focus).toEqual({ kind: 'slot', bar: 0, slot: 1 });
  });
  it('no-target for a missing head', () => {
    expect((run(base(), { type: 'remove-head', bar: 0, event: 1, pitchIndex: 3 }) as { reason: string }).reason).toBe('no-target');
  });
});

describe('set-sign', () => {
  it('sets and clears', () => {
    const r = ok(run(base(), { type: 'set-sign', bar: 0, event: 1, pitchIndex: 0, sign: -1 }));
    expect(pstr(r.passage.bars[0].events[1])).toBe('Eb4');
    const r2 = ok(run(r.passage, { type: 'set-sign', bar: 0, event: 1, pitchIndex: 0, sign: null }));
    expect(pstr(r2.passage.bars[0].events[1])).toBe('E4');
  });
  it('rejects rests and disallowed signs', () => {
    expect((run(passage([bar(rest())]), { type: 'set-sign', bar: 0, event: 0, pitchIndex: 0, sign: 1 }) as { reason: string }).reason).toBe('no-target');
    expect((run(base(), { type: 'set-sign', bar: 0, event: 0, pitchIndex: 0, sign: 2 }, constraints({ allow: { ...constraints().allow, signs: [-1, 0, 1] } })) as { reason: string }).reason).toBe('not-allowed');
  });
});

describe('set-value and set-dots', () => {
  it('changes value, keeps dots within limit', () => {
    const p = passage([bar({ ...note('C4'), duration: { value: 'crotchet', dots: 1 } })]);
    const r = ok(run(p, { type: 'set-value', bar: 0, event: 0, value: 'minim' }));
    expect(r.passage.bars[0].events[0].duration).toEqual({ value: 'minim', dots: 1 });
    const c = constraints({ allow: { ...constraints().allow, maxDots: 0 } });
    const r2 = ok(run(p, { type: 'set-value', bar: 0, event: 0, value: 'minim' }, c));
    expect(r2.passage.bars[0].events[0].duration.dots).toBe(0);
  });
  it('sets dots, rejects too many, rejects overfull', () => {
    const r = ok(run(base(), { type: 'set-dots', bar: 0, event: 0, dots: 2 }));
    expect(r.passage.bars[0].events[0].duration.dots).toBe(2);
    expect((run(base(), { type: 'set-dots', bar: 0, event: 0, dots: 2 }, constraints({ allow: { ...constraints().allow, maxDots: 1 } })) as { reason: string }).reason).toBe('not-allowed');
    const full = passage([bar(...Array.from({ length: 8 }, () => note('C4')))]);
    expect((run(full, { type: 'set-dots', bar: 0, event: 0, dots: 1 }) as { reason: string }).reason).toBe('bar-full');
    expect((run(full, { type: 'set-value', bar: 0, event: 0, value: 'semibreve' }) as { reason: string }).reason).toBe('bar-full');
  });
  it('value not in the palette is not allowed', () => {
    expect((run(base(), { type: 'set-value', bar: 0, event: 0, value: 'breve' }) as { reason: string }).reason).toBe('not-allowed');
  });
  it('shortening always passes even when overfull', () => {
    const full = passage([bar(...Array.from({ length: 9 }, () => note('C4')))]);
    ok(run(full, { type: 'set-value', bar: 0, event: 0, value: 'quaver' }));
  });
});

describe('to-rest and to-note', () => {
  it('note becomes a rest with the same duration and no tie', () => {
    const p = passage([bar(note('C4', 'minim', { tieToNext: true }), note('C4'))]);
    const r = ok(run(p, { type: 'to-rest', bar: 0, event: 0 }));
    expect(r.passage.bars[0].events[0]).toEqual({ kind: 'rest', duration: { value: 'minim', dots: 0 } });
  });
  it('rest becomes a note', () => {
    const r = ok(run(passage([bar(rest('minim'))]), { type: 'to-note', bar: 0, event: 0, position: 4 }));
    expect(pstr(r.passage.bars[0].events[0])).toBe('B4');
    expect(r.passage.bars[0].events[0].duration.value).toBe('minim');
  });
  it('rejections', () => {
    expect((run(passage([bar(rest())]), { type: 'to-rest', bar: 0, event: 0 }) as { reason: string }).reason).toBe('no-target');
    expect((run(base(), { type: 'to-rest', bar: 0, event: 0 }, constraints({ allow: { ...constraints().allow, rests: false } })) as { reason: string }).reason).toBe('not-allowed');
    expect((run(base(), { type: 'to-note', bar: 0, event: 0, position: 4 }) as { reason: string }).reason).toBe('no-target');
    expect((run(passage([bar(rest())]), { type: 'to-note', bar: 0, event: 0, position: 99 }) as { reason: string }).reason).toBe('out-of-range');
  });
});

describe('toggle-tie and pruning (4.5)', () => {
  const tie = (bar_ = 0, event = 0): EditAction => ({ type: 'toggle-tie', bar: bar_, event });
  it('ties to an identical next pitch and untoggles', () => {
    const p = passage([bar(note('C4'), note('C4'))]);
    const r = ok(run(p, tie()));
    expect(r.passage.bars[0].events[0]).toMatchObject({ tieToNext: true });
    const r2 = ok(run(r.passage, tie()));
    expect(r2.passage.bars[0].events[0].kind === 'note' && r2.passage.bars[0].events[0].tieToNext).toBeFalsy();
  });
  it('allows a tie with no next event (open tie)', () => {
    const r = ok(run(passage([bar(note('C4'))]), tie()));
    expect(r.passage.bars[0].events[0]).toMatchObject({ tieToNext: true });
  });
  it('rejects when the next event shares no pitch, or is a rest, or ties are off', () => {
    expect((run(passage([bar(note('C4'), note('D4'))]), tie()) as { reason: string }).reason).toBe('no-target');
    expect((run(passage([bar(note('C4'), rest())]), tie()) as { reason: string }).reason).toBe('no-target');
    expect((run(passage([bar(rest())]), tie()) as { reason: string }).reason).toBe('no-target');
    expect((run(passage([bar(note('C4'), note('C4'))]), tie(), constraints({ allow: { ...constraints().allow, ties: false } })) as { reason: string }).reason).toBe('not-allowed');
  });
  it('ties across the barline to the first event of the next bar', () => {
    const p = passage([bar(note('C4')), bar(note('C4'))]);
    ok(run(p, tie(0, 0)));
    const bad = passage([bar(note('C4')), bar(note('D4'))]);
    expect((run(bad, tie(0, 0)) as { reason: string }).reason).toBe('no-target');
  });
  it('moving the target prunes the tie on its source', () => {
    const p = passage([bar(note('C4', 'crotchet', { tieToNext: true }), note('C4'))]);
    const r = ok(run(p, { type: 'move-head', bar: 0, event: 1, pitchIndex: 0, position: 0 }));
    const e0 = r.passage.bars[0].events[0];
    expect(e0.kind === 'note' && e0.tieToNext).toBeFalsy();
  });
  it('moving the source head prunes its own tie', () => {
    const p = passage([bar(note('C4', 'crotchet', { tieToNext: true }), note('C4'))]);
    const r = ok(run(p, { type: 'move-head', bar: 0, event: 0, pitchIndex: 0, position: 0 }));
    const e0 = r.passage.bars[0].events[0];
    expect(e0.kind === 'note' && e0.tieToNext).toBeFalsy();
  });
  it('deleting the target keeps an open tie only when nothing follows; otherwise prunes against the new neighbour', () => {
    const p = passage([bar(note('C4', 'crotchet', { tieToNext: true }), note('C4'), note('D4'))]);
    const r = ok(run(p, { type: 'delete-event', bar: 0, event: 1 }));
    const e0 = r.passage.bars[0].events[0];
    expect(e0.kind === 'note' && e0.tieToNext).toBeFalsy();
    const p2 = passage([bar(note('C4', 'crotchet', { tieToNext: true }), note('C4'))]);
    const r2 = ok(run(p2, { type: 'delete-event', bar: 0, event: 1 }));
    expect(r2.passage.bars[0].events[0]).toMatchObject({ tieToNext: true });
  });
  it('changing duration keeps the tie', () => {
    const p = passage([bar(note('C4', 'crotchet', { tieToNext: true }), note('C4'))]);
    const r = ok(run(p, { type: 'set-value', bar: 0, event: 0, value: 'minim' }));
    expect(r.passage.bars[0].events[0]).toMatchObject({ tieToNext: true });
  });
  it('turning a tied note into a rest clears the tie; a rest target prunes it', () => {
    const p = passage([bar(note('C4', 'crotchet', { tieToNext: true }), note('C4'))]);
    const r = ok(run(p, { type: 'to-rest', bar: 0, event: 1 }));
    const e0 = r.passage.bars[0].events[0];
    expect(e0.kind === 'note' && e0.tieToNext).toBeFalsy();
  });
  it('a tied continuation takes its source accidental', () => {
    const p = passage([bar(note('F#4', 'crotchet', { tieToNext: true }), note('F#4'))]);
    const r = ok(run(p, { type: 'set-value', bar: 0, event: 1, value: 'minim' }));
    expect(r.passage.bars[0].events.map(pstr)).toEqual(['F#4', 'F#4']);
  });
});

describe('delete-event', () => {
  it('removes and closes the gap, nothing inserted', () => {
    const r = ok(run(base(), { type: 'delete-event', bar: 0, event: 0 }));
    expect(r.passage.bars[0].events.map(pstr)).toEqual(['E4', 'G4']);
    expect(r.focus).toEqual({ kind: 'slot', bar: 0, slot: 0 });
    expect(r.sound).toEqual([]);
  });
});

describe('locking', () => {
  const p = passage([bar(note('C4'), note('E4'), note('G4'), note('B4')), bar(note('F4'))]);
  const c = constraints({ editable: [{ bar: 0, lockedPrefix: 1, lockedSuffix: 1 }] });
  const actions: EditAction[] = [
    ins({ slot: 0 }),
    { type: 'insert-rest', bar: 0, slot: 4, value: 'crotchet', dots: 0 },
    { type: 'move-head', bar: 0, event: 0, pitchIndex: 0, position: 3 },
    { type: 'add-head', bar: 0, event: 3, position: 6, sign: null },
    { type: 'remove-head', bar: 0, event: 0, pitchIndex: 0 },
    { type: 'set-sign', bar: 0, event: 3, pitchIndex: 0, sign: 1 },
    { type: 'set-value', bar: 0, event: 0, value: 'minim' },
    { type: 'set-dots', bar: 0, event: 3, dots: 1 },
    { type: 'to-rest', bar: 0, event: 0 },
    { type: 'toggle-tie', bar: 0, event: 3 },
    { type: 'delete-event', bar: 0, event: 0 },
  ];
  it.each(actions.map((a) => [a.type + ' @' + JSON.stringify(a), a] as const))('%s is locked', (_n, a) => {
    expect((reduce(deepFreeze(structuredClone(p)), a, c) as { reason: string }).reason).toBe('locked');
  });
  it('a locked bar rejects everything', () => {
    expect((reduce(p, { type: 'delete-event', bar: 1, event: 0 }, c) as { reason: string }).reason).toBe('locked');
    expect((reduce(p, ins({ bar: 1, slot: 0 }), c) as { reason: string }).reason).toBe('locked');
  });
  it('the editable middle works and slots follow the prefix and suffix', () => {
    const r = ok(reduce(p, ins({ slot: 1 }), c));
    expect(r.passage.bars[0].events).toHaveLength(5);
    ok(reduce(p, ins({ slot: 3 }), c));
    expect((reduce(p, ins({ slot: 4 }), c) as { reason: string }).reason).toBe('locked');
  });
  it('a bad bar or event address is no-target', () => {
    expect((reduce(p, { type: 'delete-event', bar: 9, event: 0 }, c) as { reason: string }).reason).toBe('no-target');
    expect((reduce(p, { type: 'delete-event', bar: 0, event: 9 }, c) as { reason: string }).reason).toBe('no-target');
  });
});

describe('immutability and sharing', () => {
  it('untouched bars are reference-equal and the input is not mutated', () => {
    const p = deepFreeze(passage([bar(note('C4')), bar(note('D4')), bar(note('E4'))]));
    const r = ok(reduce(p, ins({ bar: 1, slot: 1, position: 2 }), constraints()));
    expect(r.passage.bars[0]).toBe(p.bars[0]);
    expect(r.passage.bars[2]).toBe(p.bars[2]);
    expect(r.passage.bars[1]).not.toBe(p.bars[1]);
    expect(r.passage).not.toBe(p);
  });
  it('single notes carry a boolean flag, chords an array', () => {
    const r = ok(run(passage([bar(note('C4'), note(['C4', 'E4']))]), { type: 'set-dots', bar: 0, event: 0, dots: 1 }));
    expect(r.passage.bars[0].events[0]).toMatchObject({ showAccidental: false });
    expect(r.passage.bars[0].events[1]).toMatchObject({ showAccidental: [false, false] });
  });
  it('tuplet events are not-allowed for edits', () => {
    const tup = { kind: 'note' as const, pitches: [{ letter: 'C' as const, accidental: 0 as const, octave: 4 }], duration: { value: 'quaver' as const, dots: 0 as const, tuplet: { actual: 3, normal: 2 } } };
    const p = passage([bar(tup, tup, tup)]);
    for (const a of [{ type: 'delete-event', bar: 0, event: 0 }, { type: 'set-value', bar: 0, event: 0, value: 'minim' }] as EditAction[]) {
      expect((run(p, a) as { reason: string }).reason).toBe('not-allowed');
    }
    ok(run(p, ins({ slot: 3 })));
  });
});
