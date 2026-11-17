import { describe, expect, it } from 'vitest';
import { validateExpression } from '@/engine/expression/validate';
import type { Passage } from '@/engine/types';
import { bar, constraints, deepFreeze, engines, note, passage, rest } from '../fixtures';
import type { EditAction, EditConstraints } from './actions';
import { createReducer } from './reducer';

const reduce = createReducer(engines);
const r = (b: number, e: number) => ({ bar: b, event: e });

function apply(p: Passage, a: EditAction, c: EditConstraints = constraints()): Passage {
  const res = reduce(deepFreeze(structuredClone(p)), a, c);
  if (!res.ok) throw new Error(`rejected: ${res.reason}`);
  expect(validateExpression(res.passage), 'result must stay valid').toEqual([]);
  return res.passage;
}

/** Two bars of four crotchets with one of every kind of marking. */
function marked(): Passage {
  const p = passage([
    {
      ...bar(note('C4'), note('D4', 'crotchet', { articulations: ['staccato'] }), note('E4'), note('F4', 'crotchet', { fermata: true })),
      repeatStart: true,
    },
    { ...bar(note('G4'), note('A4'), note('B4'), note('C5')), endBarline: 'repeat-end', marker: 'dc-al-fine' },
  ]);
  p.bars[0].marker = 'segno';
  p.bars[1].marker = 'dc-al-fine';
  p.expression = {
    tempo: { text: 'Allegro', bpm: 120 },
    dynamics: [{ at: r(0, 0), level: 'p' }, { at: r(0, 2), level: 'f' }, { at: r(1, 0), level: 'mp' }],
    hairpins: [{ kind: 'cresc', from: r(0, 0), to: r(0, 1) }, { kind: 'dim', from: r(1, 0), to: r(1, 2) }],
    slurs: [{ from: r(0, 1), to: r(1, 1) }],
    words: [{ at: r(0, 2), text: 'dolce', place: 'below', lang: 'it' }],
    tempoChanges: [{ kind: 'rit', from: r(0, 2), to: r(0, 3) }, { kind: 'a-tempo', at: r(1, 0) }],
  };
  // a Fine so D.C. al Fine is valid
  p.bars[1].marker = 'fine';
  p.bars.push({ ...bar(note('C5', 'semibreve')), marker: 'dc-al-fine' });
  return p;
}
const ins = (slot: number, bar_ = 0): EditAction => ({ type: 'insert-note', bar: bar_, slot, position: 4, value: 'crotchet', dots: 0, sign: null });
const del = (event: number, bar_ = 0): EditAction => ({ type: 'delete-event', bar: bar_, event });
const x = (p: Passage) => p.expression!;

describe('the fixture itself is valid', () => {
  it('passes validateExpression', () => expect(validateExpression(marked())).toEqual([]));
});

describe('insert-note and insert-rest shift refs after the new event', () => {
  it('at the start: every ref in the bar moves one right, other bars do not move, marks travel with their notes', () => {
    const p = apply(marked(), ins(0));
    expect(x(p).dynamics).toEqual([{ at: r(0, 1), level: 'p' }, { at: r(0, 3), level: 'f' }, { at: r(1, 0), level: 'mp' }]);
    expect(x(p).hairpins![0]).toMatchObject({ from: r(0, 1), to: r(0, 2) });
    expect(x(p).slurs).toEqual([{ from: r(0, 2), to: r(1, 1) }]);
    expect(x(p).words![0].at).toEqual(r(0, 3));
    expect(x(p).tempoChanges![0]).toMatchObject({ from: r(0, 3), to: r(0, 4) });
    expect(p.bars[0].events[2]).toMatchObject({ articulations: ['staccato'] });
    expect(p.bars[0].events[4]).toMatchObject({ fermata: true });
    expect(p.bars[0].events[0].kind === 'note' && p.bars[0].events[0].articulations).toBeFalsy();
    expect(p.bars[0].repeatStart).toBe(true);
    expect(p.bars[0].marker).toBe('segno');
  });
  it('in the middle: only refs at or after the slot shift, and a span over the slot grows', () => {
    const p = apply(marked(), ins(1));
    expect(x(p).dynamics![0].at).toEqual(r(0, 0));
    expect(x(p).dynamics![1].at).toEqual(r(0, 3));
    expect(x(p).hairpins![0]).toMatchObject({ from: r(0, 0), to: r(0, 2) });
    expect(x(p).slurs).toEqual([{ from: r(0, 2), to: r(1, 1) }]);
  });
  it('at the end of the bar: nothing moves', () => {
    const p = apply(marked(), ins(4));
    expect(x(p)).toEqual(marked().expression);
  });
  it('in a later bar leaves earlier bars alone and shifts that bar', () => {
    const p = apply(marked(), ins(0, 1));
    expect(x(p).dynamics![2].at).toEqual(r(1, 1));
    expect(x(p).slurs).toEqual([{ from: r(0, 1), to: r(1, 2) }]);
    expect(x(p).hairpins![1]).toMatchObject({ from: r(1, 1), to: r(1, 3) });
    expect(p.bars[1].endBarline).toBe('repeat-end');
    expect(p.bars[1].marker).toBe('fine');
  });
  it('insert-rest does the same', () => {
    const p = apply(marked(), { type: 'insert-rest', bar: 0, slot: 0, value: 'crotchet', dots: 0 });
    expect(x(p).dynamics![0].at).toEqual(r(0, 1));
    expect(p.bars[0].events[0].kind).toBe('rest');
    expect(p.bars[0].events[4]).toMatchObject({ fermata: true });
  });
});

describe('set-single-note inserts when the bar has no note yet', () => {
  it('keeps the refs of events after the new one valid', () => {
    const base = passage([bar(), bar(note('C4'), note('D4'))]);
    base.expression = { dynamics: [{ at: r(1, 1), level: 'f' }], slurs: [{ from: r(1, 0), to: r(1, 1) }] };
    const c = constraints({ kind: 'single-note', bars: 2, allow: { ...constraints().allow, values: ['semibreve'] } });
    const res = apply(base, { type: 'set-single-note', bar: 0, position: 4, sign: null }, c);
    expect(res.bars[0].events).toHaveLength(1);
    expect(x(res).dynamics).toEqual([{ at: r(1, 1), level: 'f' }]);
  });
});

describe('delete-event: marks on the event go, spans shrink or go', () => {
  it('drops the dynamic and the words on the deleted event', () => {
    const p = apply(marked(), del(2));
    expect(x(p).dynamics!.map((d) => d.level)).toEqual(['p', 'mp']);
    expect(x(p).words).toBeUndefined();
  });
  it('shifts refs after it, and the fermata stays on its note', () => {
    const p = apply(marked(), del(0));
    expect(x(p).slurs).toEqual([{ from: r(0, 0), to: r(1, 1) }]);
    expect(p.bars[0].events[2]).toMatchObject({ fermata: true });
    expect(p.bars[0].events[0]).toMatchObject({ articulations: ['staccato'] });
    expect(x(p).tempoChanges![0]).toMatchObject({ from: r(0, 1), to: r(0, 2) });
  });
  it('a hairpin whose first event vanished starts at the next event that remains', () => {
    const p = apply(marked(), del(0));
    expect(x(p).hairpins![0]).toMatchObject({ kind: 'cresc', from: r(0, 0), to: r(0, 0) });
  });
  it('a hairpin whose last event vanished ends at the one before it', () => {
    const base = marked();
    base.expression!.hairpins = [{ kind: 'cresc', from: r(0, 0), to: r(0, 2) }];
    base.expression!.dynamics = [{ at: r(0, 0), level: 'p' }];
    base.expression!.words = [];
    const p = apply(base, del(2));
    expect(x(p).hairpins![0]).toMatchObject({ from: r(0, 0), to: r(0, 1) });
  });
  it('a hairpin with nothing left is dropped', () => {
    const base = marked();
    base.expression!.hairpins = [{ kind: 'dim', from: r(0, 1), to: r(0, 1) }];
    const p = apply(base, del(1));
    expect(x(p).hairpins).toBeUndefined();
  });
  it('a slur whose end note vanished ends at the note before it; two notes are needed', () => {
    const p = apply(marked(), del(1, 1));
    expect(x(p).slurs).toEqual([{ from: r(0, 1), to: r(1, 0) }]);
    const base = marked();
    base.expression!.slurs = [{ from: r(1, 0), to: r(1, 1) }];
    expect(x(apply(base, del(1, 1))).slurs).toBeUndefined();
    expect(x(apply(base, del(0, 1))).slurs).toBeUndefined();
  });
  it('a slur skips a rest that now sits at its end', () => {
    const base = passage([bar(note('C4'), note('D4'), rest(), note('F4'))]);
    base.expression = { slurs: [{ from: r(0, 0), to: r(0, 3) }] };
    const p = apply(base, del(3));
    expect(x(p).slurs).toEqual([{ from: r(0, 0), to: r(0, 1) }]);
  });
  it('two equal dynamics left side by side keep only the first', () => {
    const base = passage([bar(note('C4'), note('D4'), note('E4'), note('F4'))]);
    base.expression = { dynamics: [{ at: r(0, 0), level: 'p' }, { at: r(0, 1), level: 'f' }, { at: r(0, 3), level: 'p' }] };
    const p = apply(base, del(1));
    expect(x(p).dynamics).toEqual([{ at: r(0, 0), level: 'p' }, { at: r(0, 2), level: 'p' }].slice(0, 1));
  });
  it('an a tempo whose slowing down went is dropped; one whose slowing down stays is kept', () => {
    const base = marked();
    const gone = apply({ ...base, expression: { ...base.expression!, tempoChanges: [{ kind: 'rit', from: r(0, 1), to: r(0, 1) }, { kind: 'a-tempo', at: r(0, 3) }] } }, del(1));
    expect(x(gone).tempoChanges).toBeUndefined();
    const kept = apply(base, del(0));
    expect(x(kept).tempoChanges!.map((c) => c.kind)).toEqual(['rit', 'a-tempo']);
  });
  it('the tempo mark and repeat signs stay', () => {
    const p = apply(marked(), del(0));
    expect(x(p).tempo).toEqual({ text: 'Allegro', bpm: 120 });
    expect(p.bars[0].repeatStart).toBe(true);
    expect(p.bars[2].marker).toBe('dc-al-fine');
  });
  it('removing the last head of an event deletes it, with its marks; removing one head of a chord keeps them', () => {
    const p = apply(marked(), { type: 'remove-head', bar: 0, event: 2, pitchIndex: 0 });
    expect(x(p).dynamics!.map((d) => d.level)).toEqual(['p', 'mp']);
    const chordBase = passage([bar(note(['C4', 'E4'], 'crotchet', { articulations: ['accent'] }), note('D4'))]);
    chordBase.expression = { dynamics: [{ at: r(0, 0), level: 'f' }] };
    const q = apply(chordBase, { type: 'remove-head', bar: 0, event: 0, pitchIndex: 1 });
    expect(x(q).dynamics).toEqual([{ at: r(0, 0), level: 'f' }]);
    expect(q.bars[0].events[0]).toMatchObject({ articulations: ['accent'] });
  });
  it('deleting every event of a bar leaves only valid marks', () => {
    let p = marked();
    for (let i = 0; i < 4; i++) p = apply(p, del(0));
    expect(x(p).dynamics).toEqual([{ at: r(1, 0), level: 'mp' }]);
    expect(x(p).hairpins![0]).toMatchObject({ kind: 'dim' });
    // the slur keeps the two notes of bar 2 that were inside it; the a tempo has lost its ritardando
    expect(x(p).slurs).toEqual([{ from: r(1, 0), to: r(1, 1) }]);
    expect(x(p).words).toBeUndefined();
    expect(x(p).tempoChanges).toBeUndefined();
  });
});

describe('actions that keep every event keep every mark', () => {
  const same = (p: Passage) => {
    expect(x(p)).toEqual(marked().expression);
    expect(p.bars[0].events[1]).toMatchObject({ articulations: ['staccato'] });
    expect(p.bars[0].events[3]).toMatchObject({ fermata: true });
    expect(p.bars[0].repeatStart).toBe(true);
    expect(p.bars[1].endBarline).toBe('repeat-end');
  };
  it('move-head, set-sign, set-value, set-dots, add-head', () => {
    same(apply(marked(), { type: 'move-head', bar: 0, event: 1, pitchIndex: 0, position: 5 }));
    same(apply(marked(), { type: 'set-sign', bar: 0, event: 1, pitchIndex: 0, sign: 1 }));
    same(apply(marked(), { type: 'set-value', bar: 0, event: 1, value: 'quaver' }));
    same(apply(marked(), { type: 'set-dots', bar: 0, event: 3, dots: 1 }));
    same(apply(marked(), { type: 'add-head', bar: 0, event: 1, position: 7, sign: null }));
  });
});

describe('note to rest and rest to note', () => {
  it('to-rest drops the articulation (a rest cannot have one), keeps the pause, and a slur skips the rest', () => {
    const p = apply(marked(), { type: 'to-rest', bar: 0, event: 1 });
    expect(p.bars[0].events[1]).toEqual({ kind: 'rest', duration: { value: 'crotchet', dots: 0 } });
    expect(x(p).slurs).toEqual([{ from: r(0, 2), to: r(1, 1) }]);
    const q = apply(marked(), { type: 'to-rest', bar: 0, event: 3 });
    expect(q.bars[0].events[3]).toMatchObject({ kind: 'rest', fermata: true });
  });
  it('to-note keeps the pause on the event', () => {
    const base = passage([bar(note('C4'), rest('crotchet'), note('E4'), note('F4'))]);
    base.bars[0].events[1] = { ...base.bars[0].events[1], fermata: true };
    const p = apply(base, { type: 'to-note', bar: 0, event: 1, position: 3 });
    expect(p.bars[0].events[1]).toMatchObject({ kind: 'note', fermata: true });
  });
});

describe('ties: a continuation carries no articulation or pause (rule 8)', () => {
  it('tying into a note that has its own articulation removes it, in this bar and across the bar line', () => {
    const base = passage([
      bar(note('C4'), note('C4', 'crotchet', { articulations: ['accent'], fermata: true }), note('E4'), note('G4')),
      bar(note('G4', 'crotchet', { articulations: ['staccato'] }), note('A4'), note('B4'), note('C5')),
    ]);
    const p = apply(base, { type: 'toggle-tie', bar: 0, event: 0 });
    expect(p.bars[0].events[1]).not.toHaveProperty('articulations');
    expect(p.bars[0].events[1]).not.toHaveProperty('fermata');
    const q = apply(base, { type: 'toggle-tie', bar: 0, event: 3 });
    expect(q.bars[1].events[0]).not.toHaveProperty('articulations');
  });
});

describe('no expression, no change', () => {
  it('a passage without marks reduces exactly as before (no expression key appears)', () => {
    const p = apply(passage([bar(note('C4'), note('D4'))]), ins(1));
    expect(p).not.toHaveProperty('expression');
    expect(p.bars[0]).not.toHaveProperty('repeatStart');
  });
});
