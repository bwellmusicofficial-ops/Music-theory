import { describe, expect, it } from 'vitest';
import { TheoryError } from '@/engine/api';
import { createRng } from '@/engine/rng';
import { rhythm } from '@/engine/rhythm';
import type { Bar, Duration, Rng, TimeSignature } from '@/engine/types';
import { payloadSchema } from '@/lesson/questions/tap-rhythm/schema';
import type { TapRhythmPayload } from '@/lesson/questions/tap-rhythm/types';
import { tapNoteValues, paramsSchema, type TapNoteValuesParams } from './index';

const d = (value: Duration['value'], dots: 0 | 1 | 2 = 0): Duration => ({ value, dots });
const T44: TimeSignature = { beats: 4, beatUnit: 4 };

const exemplar: TapNoteValuesParams = {
  time: T44,
  values: [d('crotchet'), d('minim')],
  require: [d('crotchet'), d('minim')],
  bars: 2,
  bpm: 80,
  showNotation: true,
  listenFirst: true,
};

const PARAM_SETS: { name: string; params: TapNoteValuesParams }[] = [
  { name: 'exemplar', params: exemplar },
  {
    name: '4/4 with quavers and a semibreve',
    params: { time: T44, values: [d('semibreve'), d('minim'), d('crotchet'), d('quaver')], require: [d('quaver')], bars: 4, bpm: 100 },
  },
  {
    name: '3/4 with dotted minims',
    params: { time: { beats: 3, beatUnit: 4 }, values: [d('minim', 1), d('minim'), d('crotchet')], require: [d('crotchet')], bars: 3, bpm: 60 },
  },
  {
    name: '2/4 with quavers',
    params: { time: { beats: 2, beatUnit: 4 }, values: [d('minim'), d('crotchet'), d('quaver')], require: [d('quaver')], bars: 2, bpm: 90, showNotation: false, listenFirst: true },
  },
  {
    name: '2/2 with crotchets',
    params: { time: { beats: 2, beatUnit: 2 }, values: [d('semibreve'), d('minim'), d('crotchet')], bars: 2, bpm: 70 },
  },
  { name: 'one value', params: { time: T44, values: [d('crotchet')], bars: 1, bpm: 120 } },
  {
    name: '4/4 with dotted crotchets and quavers',
    params: { time: T44, values: [d('crotchet', 1), d('quaver'), d('crotchet'), d('minim')], bars: 2, bpm: 80 },
  },
];

const durations = (payload: TapRhythmPayload) =>
  payload.bars.map((bar) => bar.events.map((e) => (e.kind === 'note' ? `${e.duration.value}${'.'.repeat(e.duration.dots)}` : 'rest')).join(' '));

/** An Rng that records every pick and returns the item at `choose(items)`. */
function scripted(choose: (items: readonly unknown[], call: number) => number) {
  const picks: unknown[][] = [];
  const rng: Rng = {
    next: () => {
      throw new Error('next() is not part of the spec');
    },
    int: () => {
      throw new Error('int() is not part of the spec');
    },
    shuffle: () => {
      throw new Error('shuffle() is not part of the spec');
    },
    pick: <T,>(items: readonly T[]): T => {
      picks.push([...items]);
      return items[choose(items, picks.length - 1)] as T;
    },
  };
  return { rng, picks };
}

describe('tapNoteValues: identity and params', () => {
  it('has the registered id', () => {
    expect(tapNoteValues.id).toBe('tap-note-values');
    expect(tapNoteValues.paramsSchema).toBe(paramsSchema);
  });

  it('applies the defaults', () => {
    const parsed = paramsSchema.parse({ time: T44, values: [d('crotchet')], bars: 1, bpm: 80 });
    expect(parsed).toMatchObject({ require: [], showNotation: true, listenFirst: false });
  });

  it('accepts the exemplar params', () => {
    expect(paramsSchema.safeParse(exemplar.valueOf()).success).toBe(true);
  });

  const bad = (over: Record<string, unknown>) => paramsSchema.safeParse({ time: T44, values: [d('crotchet')], bars: 1, bpm: 80, ...over });
  it.each([
    ['no values', { values: [] }],
    ['seven values', { values: [d('breve'), d('semibreve'), d('minim'), d('crotchet'), d('quaver'), d('semiquaver'), d('demisemiquaver')] }],
    ['duplicate values', { values: [d('crotchet'), d('crotchet')] }],
    ['a tuplet', { values: [{ value: 'quaver', dots: 0, tuplet: { actual: 3, normal: 2 } }] }],
    ['required value not in values', { require: [d('minim')] }],
    ['required dotted value not in values', { values: [d('minim')], require: [d('minim', 1)] }],
    ['zero bars', { bars: 0 }],
    ['five bars', { bars: 5 }],
    ['fractional bars', { bars: 1.5 }],
    ['bpm 49', { bpm: 49 }],
    ['bpm 121', { bpm: 121 }],
    ['fractional bpm', { bpm: 80.5 }],
    ['compound time', { time: { beats: 6, beatUnit: 8 } }],
    ['irregular time', { time: { beats: 5, beatUnit: 4 } }],
    ['neither notation nor listening', { showNotation: false, listenFirst: false }],
    ['unknown key', { extra: 1 }],
    ['missing time', { time: undefined }],
  ])('rejects %s', (_name, over) => {
    expect(bad(over as Record<string, unknown>).success).toBe(false);
  });

  it('accepts bpm 50 and 120, four bars and six values', () => {
    expect(bad({ bpm: 50 }).success).toBe(true);
    expect(bad({ bpm: 120, bars: 4 }).success).toBe(true);
    expect(bad({ values: [d('semibreve'), d('minim'), d('crotchet'), d('quaver'), d('semiquaver'), d('minim', 1)] }).success).toBe(true);
  });
});

describe('tapNoteValues: determinism', () => {
  it('gives the same question for the same seed and params', () => {
    for (const seed of [0, 1, 42, 12345]) {
      const a = tapNoteValues.generate(exemplar, createRng(seed), 'uk');
      const b = tapNoteValues.generate(exemplar, createRng(seed), 'uk');
      expect(a).toEqual(b);
    }
  });

  it('does not depend on the terminology', () => {
    expect(tapNoteValues.generate(exemplar, createRng(7), 'uk')).toEqual(tapNoteValues.generate(exemplar, createRng(7), 'us'));
  });

  it('gives different rhythms for different seeds', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 50; seed += 1) {
      seen.add(JSON.stringify(tapNoteValues.generate(exemplar, createRng(seed), 'uk').payload));
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  it('does not mutate its params', () => {
    const copy = structuredClone(exemplar);
    tapNoteValues.generate(exemplar, createRng(3), 'uk');
    expect(exemplar).toEqual(copy);
  });
});

describe('tapNoteValues: output', () => {
  it('returns a tap-rhythm payload with the spec fields and no prompt', () => {
    const q = tapNoteValues.generate(exemplar, createRng(9), 'uk');
    expect(q.type).toBe('tap-rhythm');
    expect(q).not.toHaveProperty('prompt');
    const payload = q.payload as TapRhythmPayload;
    expect(Object.keys(payload).sort()).toEqual(['bars', 'bpm', 'countInBars', 'listenFirst', 'showNotation', 'time']);
    expect(payload).toMatchObject({ time: T44, bpm: 80, countInBars: 1, showNotation: true, listenFirst: true });
    expect(payload.bars).toHaveLength(2);
  });

  it('passes the flags through, with the defaults true and false', () => {
    const rest: TapNoteValuesParams = { ...exemplar };
    delete rest.showNotation;
    delete rest.listenFirst;
    expect(tapNoteValues.generate(rest, createRng(1), 'uk').payload).toMatchObject({ showNotation: true, listenFirst: false });
    expect(tapNoteValues.generate({ ...rest, showNotation: false, listenFirst: true }, createRng(1), 'uk').payload).toMatchObject({
      showNotation: false,
      listenFirst: true,
    });
  });

  it('every note is B4 with no rests, ties or tuplets', () => {
    const payload = tapNoteValues.generate(PARAM_SETS[1]!.params, createRng(4), 'uk').payload as TapRhythmPayload;
    for (const event of payload.bars.flatMap((bar) => bar.events)) {
      expect(event).toEqual({
        kind: 'note',
        pitches: [{ letter: 'B', accidental: 0, octave: 4 }],
        duration: expect.objectContaining({ dots: expect.any(Number) }),
      });
      expect(event.duration).not.toHaveProperty('tuplet');
    }
  });

  it('with the exemplar params a 4/4 bar is only ever one of four patterns', () => {
    const allowed = new Set([
      'crotchet crotchet crotchet crotchet',
      'crotchet crotchet minim',
      'minim crotchet crotchet',
      'minim minim',
    ]);
    const seen = new Set<string>();
    for (let seed = 0; seed < 300; seed += 1) {
      const payload = tapNoteValues.generate(exemplar, createRng(seed), 'uk').payload as TapRhythmPayload;
      for (const line of durations(payload)) {
        expect(allowed.has(line)).toBe(true);
        seen.add(line);
      }
    }
    expect(seen.size).toBe(4);
  });

  it('with require, both crotchet and minim appear in every output', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const text = durations(tapNoteValues.generate(exemplar, createRng(seed), 'uk').payload as TapRhythmPayload).join(' ');
      expect(text).toContain('crotchet');
      expect(text).toContain('minim');
    }
  });
});

describe('tapNoteValues: placement rules and rng calls', () => {
  it('draws only with rng.pick, from the allowed values in the order given', () => {
    // Always take the first allowed value: crotchets all the way.
    const { rng, picks } = scripted(() => 0);
    const q = tapNoteValues.generate({ ...exemplar, require: [] }, rng, 'uk');
    expect(durations(q.payload as TapRhythmPayload)).toEqual(['crotchet crotchet crotchet crotchet', 'crotchet crotchet crotchet crotchet']);
    // Offsets 0, 1, 2, 3 beats in a bar. Minim is allowed at 0 and 2 only (rule 3 stops it at 1; it does not fit at 3).
    const names = (items: unknown[]) => (items as Duration[]).map((x) => x.value);
    expect(picks.slice(0, 4).map(names)).toEqual([['crotchet', 'minim'], ['crotchet'], ['crotchet', 'minim'], ['crotchet']]);
    expect(picks).toHaveLength(8);
  });

  it('keeps the values in the order given', () => {
    const { rng, picks } = scripted(() => 0);
    tapNoteValues.generate({ ...exemplar, values: [d('minim'), d('crotchet')], require: [], bars: 1 }, rng, 'uk');
    expect((picks[0] as Duration[]).map((x) => x.value)).toEqual(['minim', 'crotchet']);
  });

  it('takes the last allowed value when told to', () => {
    const { rng } = scripted((items) => items.length - 1);
    const q = tapNoteValues.generate({ ...exemplar, require: [], bars: 1 }, rng, 'uk');
    // Offset 0: minim; offset 2: minim.
    expect(durations(q.payload as TapRhythmPayload)).toEqual(['minim minim']);
  });

  it('rule 1: a note that does not fit is not offered', () => {
    const { rng, picks } = scripted(() => 0);
    tapNoteValues.generate({ time: { beats: 3, beatUnit: 4 }, values: [d('minim'), d('crotchet')], bars: 1, bpm: 80 }, rng, 'uk');
    // 3/4: at 0 both fit; the minim is taken, so at offset 2 only a crotchet fits.
    expect((picks[0] as Duration[]).map((x) => x.value)).toEqual(['minim', 'crotchet']);
    expect((picks[1] as Duration[]).map((x) => x.value)).toEqual(['crotchet']);
  });

  it('rule 2: off the beat, a note must end by the next beat', () => {
    const { rng, picks } = scripted((items) => Math.min(1, items.length - 1));
    tapNoteValues.generate({ time: { beats: 2, beatUnit: 4 }, values: [d('crotchet'), d('quaver')], bars: 1, bpm: 80 }, rng, 'uk');
    // First pick index 1 = quaver (offset 0 -> half a beat). At half a beat only a quaver fits before the beat.
    expect((picks[1] as Duration[]).map((x) => x.value)).toEqual(['quaver']);
  });

  it('rule 3 applies in 4/4 only', () => {
    const in34 = scripted(() => 0);
    tapNoteValues.generate({ time: { beats: 3, beatUnit: 4 }, values: [d('crotchet'), d('minim')], bars: 1, bpm: 80 }, in34.rng, 'uk');
    // In 3/4 after a crotchet a minim is allowed (no half-bar rule).
    expect((in34.picks[1] as Duration[]).map((x) => x.value)).toEqual(['crotchet', 'minim']);
    const in44 = scripted(() => 0);
    tapNoteValues.generate({ time: T44, values: [d('crotchet'), d('minim')], bars: 1, bpm: 80 }, in44.rng, 'uk');
    // In 4/4 after a crotchet only a crotchet is allowed.
    expect((in44.picks[1] as Duration[]).map((x) => x.value)).toEqual(['crotchet']);
  });

  it('retries up to 50 attempts and then throws TheoryError', () => {
    const { rng, picks } = scripted(() => 0);
    expect(() => tapNoteValues.generate({ ...exemplar, require: [d('minim')], bars: 1 }, rng, 'uk')).toThrow(TheoryError);
    expect(() => tapNoteValues.generate({ ...exemplar, require: [d('minim')], bars: 1 }, scripted(() => 0).rng, 'uk')).toThrow(
      'tap-note-values could not build a rhythm from these params',
    );
    // 50 attempts of 4 picks each.
    expect(picks).toHaveLength(200);
  });

  it('retries an attempt that gets stuck, and stops at the first success', () => {
    // 4/4 with only minims and dotted crotchets can never fill a bar after a dotted crotchet.
    const params: TapNoteValuesParams = { time: T44, values: [d('crotchet', 1), d('minim')], bars: 1, bpm: 80 };
    const stuck = scripted((items, call) => (call % 2 === 0 ? 0 : items.length - 1));
    expect(() => tapNoteValues.generate(params, stuck.rng, 'uk')).toThrow(TheoryError);
    // Every attempt picks a dotted crotchet first, then has nothing allowed (rule 2 and fit): one pick each at most.
    expect(stuck.picks.length).toBeGreaterThanOrEqual(50);
  });

  it('stops as soon as the require list is met (no extra picks)', () => {
    const { rng, picks } = scripted((items, call) => (call < 2 ? 0 : items.length - 1));
    // Call 0: crotchet at 0 ... the first attempt includes crotchet and minim: stop after it.
    const q = tapNoteValues.generate({ ...exemplar, bars: 1 }, rng, 'uk');
    expect(durations(q.payload as TapRhythmPayload)).toEqual(['crotchet crotchet minim']);
    expect(picks).toHaveLength(3);
  });

  it('uses rng calls in order across bars (bar by bar, then attempt by attempt)', () => {
    const { rng, picks } = scripted(() => 0);
    tapNoteValues.generate({ ...exemplar, require: [] }, rng, 'uk');
    expect(picks).toHaveLength(8);
  });
});

describe('tapNoteValues: 500 seeds', () => {
  for (const { name, params } of PARAM_SETS) {
    it(`${name}: every output validates, every bar is full and correctly grouped`, () => {
      const parsedParams = paramsSchema.parse(params);
      for (let seed = 0; seed < 500; seed += 1) {
        const question = tapNoteValues.generate(parsedParams, createRng(seed), 'uk');
        const result = payloadSchema.safeParse(question.payload);
        expect(result.success, `${name} seed ${seed}: ${result.success ? '' : result.error.message}`).toBe(true);
        const payload = question.payload as TapRhythmPayload;
        expect(payload.bars).toHaveLength(params.bars);
        payload.bars.forEach((bar: Bar, index) => {
          expect(rhythm.checkBarLength(bar, payload.time).status, `${name} seed ${seed} bar ${index}`).toBe('complete');
          expect(rhythm.groupingProblems(bar, payload.time), `${name} seed ${seed} bar ${index}`).toEqual([]);
        });
        for (const needed of params.require ?? []) {
          expect(
            payload.bars.some((bar) => bar.events.some((e) => e.duration.value === needed.value && e.duration.dots === needed.dots)),
          ).toBe(true);
        }
      }
    });
  }
});
