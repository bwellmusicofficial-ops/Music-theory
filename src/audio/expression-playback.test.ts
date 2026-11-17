/**
 * What playPassage schedules for passages WITH expression (docs/expression.md
 * section 3). Every expected number below was worked out by hand from the
 * specification, not taken from the code under test; the working is in the
 * comments. At 120 beats a minute a crotchet is 0.5 s, a bar of 4/4 is 2 s.
 * Times are seconds after the first scheduled sound; durations are the
 * sounding length handed to the voice. Plain full-length notes get today's
 * small release gap: min(0.03, 10% of the note), so a crotchet sounds 0.47 s.
 */
import { describe, expect, it, vi } from 'vitest';
import { ToneAudioEngine } from './engine';
import { START, record } from './test-schedule';
import { callsOf, mock, resetMock } from './test-tone-mock';
import {
  A4,
  B4,
  C4,
  C5,
  D4,
  E4,
  F4,
  G4,
  HZ,
  at,
  bar,
  crotchet,
  dur,
  fourCrotchets,
  note,
  passageOf,
  rest,
} from './test-build';

vi.mock('tone', async () => (await import('./test-tone-mock')).toneMockFactory());

type Row = { t: number; d: number; v?: number; hz?: number };
function expectNotes(actual: { time: number; duration: number; velocity: number; hz: number }[], expected: Row[]) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((e, i) => {
    const a = actual[i]!;
    expect(a.time, `note ${i} time`).toBeCloseTo(e.t, 5);
    expect(a.duration, `note ${i} duration`).toBeCloseTo(e.d, 5);
    if (e.v !== undefined) expect(a.velocity, `note ${i} velocity`).toBeCloseTo(e.v, 5);
    if (e.hz !== undefined) expect(a.hz, `note ${i} pitch`).toBeCloseTo(e.hz, 2);
  });
}

describe('dynamics', () => {
  it('pp to ff: the steps are 15, 10, 5, 0, 4, 7 dB relative to mf, and ff fits exactly under 1', async () => {
    // ff is +7 dB, so mf is lowered for this passage to 10^(-7/20) = 0.446684 and ff = 1.
    // velocity = 10^((dB - 7) / 20): pp 10^(-22/20), p 10^(-17/20), mp 10^(-12/20), mf 10^(-7/20), f 10^(-3/20), ff 1.
    const passage = passageOf(
      [fourCrotchets(), fourCrotchets({}, [G4, A4, B4, C5])],
      {
        dynamics: [
          { at: at(0, 0), level: 'pp' },
          { at: at(0, 1), level: 'p' },
          { at: at(0, 2), level: 'mp' },
          { at: at(0, 3), level: 'mf' },
          { at: at(1, 0), level: 'f' },
          { at: at(1, 1), level: 'ff' },
        ],
      },
    );
    const r = await record(passage, { bpm: 120 });
    const v = [0.079433, 0.141254, 0.251189, 0.446684, 0.707946, 1, 1, 1];
    expectNotes(
      r.notes,
      v.map((velocity, i) => ({ t: i * 0.5, d: 0.47, v: velocity })),
    );
  });

  it('a passage whose loudest level is mf keeps today\'s mf velocity of 0.8', async () => {
    // velocity = 0.8 * 10^(dB/20): pp 0.142262, p 0.252982, mp 0.449873, mf 0.8.
    const passage = passageOf([fourCrotchets()], {
      dynamics: [
        { at: at(0, 0), level: 'pp' },
        { at: at(0, 1), level: 'p' },
        { at: at(0, 2), level: 'mp' },
        { at: at(0, 3), level: 'mf' },
      ],
    });
    const r = await record(passage, { bpm: 120 });
    expectNotes(
      r.notes,
      [0.142262, 0.252982, 0.449873, 0.8].map((v, i) => ({ t: i * 0.5, d: 0.47, v })),
    );
  });

  it('plays at mf (0.8) until the first dynamic when nothing is louder than mf', async () => {
    const passage = passageOf([fourCrotchets()], { dynamics: [{ at: at(0, 2), level: 'p' }] });
    const r = await record(passage, { bpm: 120 });
    // p is -10 dB: 0.8 * 10^(-10/20) = 0.252982
    expectNotes(
      r.notes,
      [0.8, 0.8, 0.252982, 0.252982].map((v, i) => ({ t: i * 0.5, d: 0.47, v })),
    );
  });

  it('pp and ff differ by 22 dB in the peak level scheduled, on the synth and on the sampled piano', async () => {
    const passage = passageOf([fourCrotchets()], {
      dynamics: [
        { at: at(0, 0), level: 'pp' },
        { at: at(0, 2), level: 'ff' },
      ],
    });
    for (const voice of ['synth', 'sampled'] as const) {
      const r = await record(passage, { bpm: 120 }, voice);
      expect(r.notes).toHaveLength(4);
      const pp = r.notes[0]!.velocity;
      const ff = r.notes[2]!.velocity;
      // Both Tone voices take velocity as a linear amplitude (checked against real Tone in the browser smoke test).
      expect(20 * Math.log10(ff / pp), voice).toBeCloseTo(22, 3);
      expect(ff).toBe(1);
    }
  });

  it('a passage with no expression is at today\'s velocity, 0.8', async () => {
    const r = await record(passageOf([fourCrotchets()]), { bpm: 120 });
    expect(r.notes.every((n) => n.velocity === 0.8)).toBe(true);
  });
});

describe('hairpins', () => {
  it('p to f: p -10 dB, then +3.5 dB a note, reaching f on the next bar (-10, -6.5, -3, +0.5, +4)', async () => {
    // Peak is f = +4 dB, so mf = 10^(-4/20) = 0.630957 and velocity = 10^((dB - 4) / 20).
    const passage = passageOf([fourCrotchets(), fourCrotchets({}, [G4, A4, B4, C5])], {
      dynamics: [
        { at: at(0, 0), level: 'p' },
        { at: at(1, 0), level: 'f' },
      ],
      hairpins: [{ kind: 'cresc', from: at(0, 0), to: at(0, 3) }],
    });
    const r = await record(passage, { bpm: 120 });
    expectNotes(
      r.notes,
      [0.199526, 0.298538, 0.446684, 0.668344, 1, 1, 1, 1].map((v, i) => ({ t: i * 0.5, d: 0.47, v })),
    );
  });

  it('a diminuendo with no later dynamic goes two steps down: f to mp (+4, +1.75, -0.5, -2.75 dB)', async () => {
    const passage = passageOf([fourCrotchets()], {
      dynamics: [{ at: at(0, 0), level: 'f' }],
      hairpins: [{ kind: 'dim', from: at(0, 0), to: at(0, 3) }],
    });
    const r = await record(passage, { bpm: 120 });
    expectNotes(
      r.notes,
      [1, 0.771792, 0.595662, 0.459727].map((v, i) => ({ t: i * 0.5, d: 0.47, v })),
    );
  });
});

describe('accent', () => {
  it('adds 5 dB to that note only, and does not change its length', async () => {
    // Loudest is the accent, +5 dB: mf = 10^(-5/20) = 0.562341, the accent is 1.
    // An articulation is present, so the plain notes sound 85% = 0.425 s, the accent included.
    const passage = passageOf([bar([note(C4), note(D4, crotchet, { art: ['accent'] }), note(E4), note(F4)])]);
    const r = await record(passage, { bpm: 120 });
    expectNotes(r.notes, [
      { t: 0, d: 0.425, v: 0.562341 },
      { t: 0.5, d: 0.425, v: 1 },
      { t: 1, d: 0.425, v: 0.562341 },
      { t: 1.5, d: 0.425, v: 0.562341 },
    ]);
  });
});

describe('articulation and slurs: onsets never move, only the sounding length', () => {
  it('staccato 40% (0.2 s), tenuto full (0.47 s), plain 85% (0.425 s)', async () => {
    const passage = passageOf([
      bar([
        note(C4, crotchet, { art: ['staccato'] }),
        note(D4, crotchet, { art: ['tenuto'] }),
        note(E4),
        note(F4, crotchet, { art: ['staccato'] }),
      ]),
    ]);
    const r = await record(passage, { bpm: 120 });
    expectNotes(r.notes, [
      { t: 0, d: 0.2 },
      { t: 0.5, d: 0.47 },
      { t: 1, d: 0.425 },
      { t: 1.5, d: 0.2 },
    ]);
  });

  it('a slur sounds each note fully plus a 20 ms overlap, except the last, which is plain; it can cross a bar line', async () => {
    // Slur from bar 1 note 3 across the bar line to bar 2 note 2: three notes slurred.
    // Slurred and not last: 0.5 + 0.02 = 0.52. Last of the slur: plain, 0.425. Notes outside: plain, 0.425.
    const passage = passageOf([fourCrotchets(), fourCrotchets({}, [G4, A4, B4, C5])], {
      slurs: [{ from: at(0, 2), to: at(1, 1) }],
    });
    const r = await record(passage, { bpm: 120 });
    expectNotes(r.notes, [
      { t: 0, d: 0.425 },
      { t: 0.5, d: 0.425 },
      { t: 1, d: 0.52 },
      { t: 1.5, d: 0.52 },
      { t: 2, d: 0.52 },
      { t: 2.5, d: 0.425 },
      { t: 3, d: 0.425 },
      { t: 3.5, d: 0.425 },
    ]);
  });

  it('a slur beats the note\'s own staccato', async () => {
    const passage = passageOf([bar([note(C4, crotchet, { art: ['staccato'] }), note(D4), rest(), rest()])], {
      slurs: [{ from: at(0, 0), to: at(0, 1) }],
    });
    const r = await record(passage, { bpm: 120 });
    expectNotes(r.notes, [
      { t: 0, d: 0.52 },
      { t: 0.5, d: 0.425 },
    ]);
  });

  it('the staccato floor is 60 ms, but never longer than the written length', async () => {
    // Quavers at 240: 0.125 s written, 40% = 0.05 s, floor 0.06 s.
    const q = dur('quaver');
    const quavers = passageOf([bar(Array.from({ length: 8 }, (_, i) => note(i % 2 ? D4 : C4, q, { art: ['staccato'] })))]);
    const a = await record(quavers, { bpm: 240 });
    expect(a.notes).toHaveLength(8);
    a.notes.forEach((n, i) => {
      expect(n.time).toBeCloseTo(i * 0.125, 6);
      expect(n.duration).toBeCloseTo(0.06, 6);
    });
    // Semiquavers at 480: 0.03125 s written; the floor would be longer, so the written length wins.
    const s = dur('semiquaver');
    const semis = passageOf([bar(Array.from({ length: 16 }, () => note(C4, s, { art: ['staccato'] })))]);
    const b = await record(semis, { bpm: 480 });
    b.notes.forEach((n) => expect(n.duration).toBeCloseTo(0.03125, 6));
  });

  it('ties sound as one note and the first note\'s articulation applies to the whole chain', async () => {
    // Minim tied to crotchet = 1.5 s. Staccato: 40% = 0.6 s. Then a plain crotchet: 0.425 s (articulation present).
    const passage = passageOf([
      bar([
        note(C4, dur('minim'), { tie: true, art: ['staccato'] }),
        note(C4, crotchet),
        note(D4),
      ]),
    ]);
    const r = await record(passage, { bpm: 120 });
    expectNotes(r.notes, [
      { t: 0, d: 0.6, hz: HZ.C4 },
      { t: 1.5, d: 0.425, hz: HZ.D4 },
    ]);
    expect(r.cursor.map((c) => c.event)).toEqual([0, 1, 2]);
  });

  it('a tied slurred note holds the whole chain plus the overlap', async () => {
    // C minim tied to C crotchet (1.5 s) slurred to D: 1.5 + 0.02 = 1.52; D is the last of the slur: 0.425.
    const passage = passageOf([bar([note(C4, dur('minim'), { tie: true }), note(C4), note(D4), rest()])], {
      slurs: [{ from: at(0, 0), to: at(0, 2) }],
    });
    const r = await record(passage, { bpm: 120 });
    expectNotes(r.notes, [
      { t: 0, d: 1.52 },
      { t: 1.5, d: 0.425 },
    ]);
  });
});

describe('pause (fermata)', () => {
  it('on the last note: it is held twice as long, and done waits for it', async () => {
    // Last crotchet starts at 1.5 s and lasts 1.0 s: sounds 1.0 - 0.03 = 0.97 s. Everything ends at 2.5 s.
    const passage = passageOf([bar([note(C4), note(D4), note(E4), note(F4, crotchet, { fermata: true })])]);
    const r = await record(passage, { bpm: 120 });
    expectNotes(r.notes, [
      { t: 0, d: 0.47 },
      { t: 0.5, d: 0.47 },
      { t: 1, d: 0.47 },
      { t: 1.5, d: 0.97 },
    ]);
    expect(r.doneResolved).toBe(true);
  });

  it('in the middle: everything after moves later by the extra half-second pair', async () => {
    // D is held for 1.0 s, so E starts at 1.5 s and F at 2.0 s.
    const passage = passageOf([bar([note(C4), note(D4, crotchet, { fermata: true }), note(E4), note(F4)])]);
    const r = await record(passage, { bpm: 120 });
    expectNotes(r.notes, [
      { t: 0, d: 0.47 },
      { t: 0.5, d: 0.97 },
      { t: 1.5, d: 0.47 },
      { t: 2, d: 0.47 },
    ]);
    expect(r.cursor.map((c) => c.time)).toEqual([0, 0.5, 1.5, 2]);
  });

  it('on a rest: the silence is held twice as long', async () => {
    const passage = passageOf([bar([note(C4), rest(crotchet, true), note(D4), note(E4)])]);
    const r = await record(passage, { bpm: 120 });
    expectNotes(r.notes, [
      { t: 0, d: 0.47 },
      { t: 1.5, d: 0.47 },
      { t: 2, d: 0.47 },
    ]);
  });

  it('on the first note of a tie: the chain is its real seconds, the pause included', async () => {
    // Minim with a pause lasts 2.0 s, tied to a crotchet 0.5 s: 2.5 s, less the gap 0.03 = 2.47. Next note at 2.5 s.
    const passage = passageOf([
      bar([note(C4, dur('minim'), { tie: true, fermata: true }), note(C4), note(D4)]),
    ]);
    const r = await record(passage, { bpm: 120 });
    expectNotes(r.notes, [
      { t: 0, d: 2.47 },
      { t: 2.5, d: 0.47 },
    ]);
  });
});

describe('tempo changes', () => {
  it('rit. to 60 over bar 1, then a tempo; the count-in stays at the starting tempo', async () => {
    // Count-in of 2 beats at 120: clicks at 0 and 0.5 s, first note at 1.0 s.
    // The tempo falls linearly in beats from 120 to 60 over 4 beats: v(b) = 120 - 15b.
    // Time to beat b = 60 * 4 / (60 - 120) * ln(v(b) / 120) = -4 ln(v(b) / 120):
    //   b=1: -4 ln(105/120) = 0.534126   b=2: -4 ln(0.75) = 1.150728
    //   b=3: -4 ln(75/120) = 1.880015    b=4: -4 ln(0.5) = 2.772589
    // Bar 2 is a tempo (120): crotchets of 0.5 s from 1.0 + 2.772589.
    // Each sounds its length less the gap min(0.03, 10%).
    const passage = passageOf([fourCrotchets(), fourCrotchets({}, [G4, A4, B4, C5])], {
      tempoChanges: [
        { kind: 'rit', from: at(0, 0), to: at(0, 3), toBpm: 60 },
        { kind: 'a-tempo', at: at(1, 0) },
      ],
    });
    const r = await record(passage, { bpm: 120, countInBeats: 2 });
    expect(r.clicks.map((c) => c.time)).toEqual([0, 0.5]);
    const t = [0, 0.534126, 1.150728, 1.880015, 2.772589];
    const rows: Row[] = [];
    for (let i = 0; i < 4; i++) rows.push({ t: 1 + t[i]!, d: t[i + 1]! - t[i]! - 0.03 });
    for (let i = 0; i < 4; i++) rows.push({ t: 1 + 2.772589 + i * 0.5, d: 0.47 });
    expectNotes(r.notes, rows);
    expect(r.cursor.map((c) => c.time)).toEqual(r.notes.map((n) => n.time));
  });

  it('accel. with no target goes to 1.35 times the tempo (120 to 162) and holds', async () => {
    // Over 4 beats from 120 to 162: v(b) = 120 + 10.5b; time to beat b = 60 * 4 / 42 * ln(v(b) / 120):
    //   b=1: 0.479323   b=2: 0.921532   b=3: 1.331965   b=4: 1.714883.
    // Then it holds at 162: a crotchet is 60 / 162 = 0.370370 s.
    const passage = passageOf([fourCrotchets(), fourCrotchets({}, [G4, A4, B4, C5])], {
      tempoChanges: [{ kind: 'accel', from: at(0, 0), to: at(0, 3) }],
    });
    const r = await record(passage, { bpm: 120 });
    const t = [0, 0.479323, 0.921532, 1.331965, 1.714883];
    const rows: Row[] = [];
    for (let i = 0; i < 4; i++) rows.push({ t: t[i]!, d: t[i + 1]! - t[i]! - 0.03 });
    for (let i = 0; i < 4; i++) rows.push({ t: 1.714883 + i * (60 / 162), d: 60 / 162 - 0.03 });
    expectNotes(r.notes, rows);
  });
});

describe('repeats and navigation: sound in performance order, the cursor reports the written place', () => {
  const positions = (r: { cursor: { time: number; bar: number; event: number }[] }) =>
    r.cursor.map((c) => `${c.bar}.${c.event}@${c.time}`);

  it('a repeat plays the repeated bars twice', async () => {
    // Bar 1 starts the repeat, bar 2 ends it, bar 3 is a semibreve. Order of bars: 1 2 1 2 3 (written 0 1 0 1 2).
    const passage = passageOf([
      fourCrotchets({ repeatStart: true }),
      fourCrotchets({ end: 'repeat-end' }, [G4, A4, B4, C5]),
      bar([note(C4, dur('semibreve'))]),
    ]);
    const r = await record(passage, { bpm: 120 });
    const hz = [HZ.C4, HZ.D4, HZ.E4, HZ.F4, HZ.G4, HZ.A4, HZ.B4, HZ.C5];
    const rows: Row[] = [];
    for (let rep = 0; rep < 2; rep++) {
      for (let k = 0; k < 8; k++) rows.push({ t: rep * 4 + k * 0.5, d: 0.47, hz: hz[k] });
    }
    // Bars 0 and 1 are 2 s each, so the second pass starts at 4 s and the semibreve (2 s, sounding 1.97 s) at 8 s.
    rows.push({ t: 8, d: 1.97, hz: HZ.C4 });
    expectNotes(r.notes, rows);
    expect(positions(r).slice(0, 4)).toEqual(['0.0@0', '0.1@0.5', '0.2@1', '0.3@1.5']);
    // the cursor jumps back at 4 s
    expect(r.cursor.filter((c) => c.time >= 3.5 && c.time <= 4.6).map((c) => `${c.bar}.${c.event}`)).toEqual([
      '1.3',
      '0.0',
      '0.1',
    ]);
    expect(r.cursor.at(-1)).toMatchObject({ bar: 2, event: 0, time: 8 });
    expect(r.cursor).toHaveLength(17);
    expect(r.doneResolved).toBe(true);
  });

  it('a tie is carried only into the bar written next, not across a jump back', async () => {
    // Bar 0 (repeat start): C minim, D minim. Bar 1 (repeat end): E minim, D minim tied to bar 2's D semibreve.
    // Order 0 1 0 1 2, each bar 2 s. The first time bar 1 ends, playing goes back to bar 0, so that D is
    // not joined to anything: it sounds 1 - 0.03 = 0.97 s. The second time it runs on into bar 2:
    // 1 s + 2 s = 3 s, less 0.03 = 2.97 s. The D semibreve of bar 2 starts no sound of its own.
    const passage = passageOf([
      bar([note(C4, dur('minim')), note(D4, dur('minim'))], { repeatStart: true }),
      bar([note(E4, dur('minim')), note(D4, dur('minim'), { tie: true })], { end: 'repeat-end' }),
      bar([note(D4, dur('semibreve'))]),
    ]);
    const r = await record(passage, { bpm: 120 });
    expectNotes(r.notes, [
      { t: 0, d: 0.97, hz: HZ.C4 },
      { t: 1, d: 0.97, hz: HZ.D4 },
      { t: 2, d: 0.97, hz: HZ.E4 },
      { t: 3, d: 0.97, hz: HZ.D4 },
      { t: 4, d: 0.97, hz: HZ.C4 },
      { t: 5, d: 0.97, hz: HZ.D4 },
      { t: 6, d: 0.97, hz: HZ.E4 },
      { t: 7, d: 2.97, hz: HZ.D4 },
    ]);
    expect(r.cursor).toHaveLength(9);
  });

  it('D.C. al Fine: back to the beginning, no repeat the second time, stop at the Fine bar', async () => {
    // Written bars: 0 (repeat-end), 1 (Fine), 2 (D.C. al Fine).
    // Order: 0 0 1 2, then back: 0 1 and stop = bars 0 0 1 2 0 1, starting at 0 2 4 6 8 10 s.
    const passage = passageOf([
      fourCrotchets({ end: 'repeat-end' }),
      fourCrotchets({ marker: 'fine' }, [G4, A4, B4, C5]),
      fourCrotchets({ marker: 'dc-al-fine' }, [E4, F4, G4, A4]),
    ]);
    const r = await record(passage, { bpm: 120 });
    const barStarts = r.cursor.filter((c) => c.event === 0).map((c) => [c.bar, c.time]);
    expect(barStarts).toEqual([
      [0, 0],
      [0, 2],
      [1, 4],
      [2, 6],
      [0, 8],
      [1, 10],
    ]);
    expect(r.cursor).toHaveLength(24);
    expect(r.notes).toHaveLength(24);
    const last = r.notes.at(-1)!;
    expect(last.time).toBeCloseTo(11.5, 6);
    expect(last.hz).toBeCloseTo(HZ.C5, 2);
    expect(r.doneResolved).toBe(true);
  });

  it('D.S. al Fine: back to the segno', async () => {
    // Bars: 0, 1 (segno), 2 (Fine), 3 (D.S. al Fine). Order 0 1 2 3 1 2 and stop: starts 0 2 4 6 8 10.
    const passage = passageOf([
      fourCrotchets(),
      fourCrotchets({ marker: 'segno' }, [G4, A4, B4, C5]),
      fourCrotchets({ marker: 'fine' }, [E4, F4, G4, A4]),
      fourCrotchets({ marker: 'ds-al-fine' }, [C4, E4, G4, C5]),
    ]);
    const r = await record(passage, { bpm: 120 });
    expect(r.cursor.filter((c) => c.event === 0).map((c) => [c.bar, c.time])).toEqual([
      [0, 0],
      [1, 2],
      [2, 4],
      [3, 6],
      [1, 8],
      [2, 10],
    ]);
  });

  it('a plain D.C. plays the whole passage again', async () => {
    const passage = passageOf([fourCrotchets(), fourCrotchets({ marker: 'dc' }, [G4, A4, B4, C5])]);
    const r = await record(passage, { bpm: 120 });
    expect(r.cursor.filter((c) => c.event === 0).map((c) => [c.bar, c.time])).toEqual([
      [0, 0],
      [1, 2],
      [0, 4],
      [1, 6],
    ]);
  });
});

describe('the rest of playPassage is as before', () => {
  it('count-in clicks come first at the starting tempo, with the accent on the downbeat', async () => {
    const passage = passageOf([fourCrotchets()], { dynamics: [{ at: at(0, 0), level: 'ff' }] });
    const r = await record(passage, { bpm: 120, countInBeats: 4 });
    expect(r.clicks.map((c) => c.time)).toEqual([0, 0.5, 1, 1.5]);
    expect(r.clicks[0]!.hz).toBeGreaterThan(r.clicks[1]!.hz);
    expect(r.notes[0]!.time).toBeCloseTo(2, 9);
  });
});

describe('done and stop with expression', () => {
  async function started(passage: ReturnType<typeof passageOf>, bpm = 120) {
    vi.useFakeTimers();
    resetMock();
    const engine = new ToneAudioEngine();
    await engine.unlock();
    const onEvent = vi.fn();
    const handle = engine.playPassage(passage, { bpm, onEvent });
    let done = false;
    void handle.done.then(() => (done = true));
    const advanceTo = async (seconds: number) => {
      mock.currentTime = START + seconds;
      await vi.advanceTimersByTimeAsync(30);
    };
    return { handle, advanceTo, isDone: () => done, onEvent };
  }

  it('done resolves only after a held last note has ended (2.5 s here), not before', async () => {
    const passage = passageOf([bar([note(C4), note(D4), note(E4), note(F4, crotchet, { fermata: true })])]);
    try {
      const run = await started(passage);
      await run.advanceTo(2.4);
      expect(run.isDone()).toBe(false);
      await run.advanceTo(2.51);
      expect(run.isDone()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('done waits for the whole performance, repeats included', async () => {
    const passage = passageOf([fourCrotchets({ end: 'repeat-end' })]);
    try {
      const run = await started(passage);
      await run.advanceTo(2.5); // written length is 2 s; performed length is 4 s
      expect(run.isDone()).toBe(false);
      await run.advanceTo(4.01);
      expect(run.isDone()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stop silences everything, cancels cursor callbacks and schedules nothing more', async () => {
    const passage = passageOf([fourCrotchets({ end: 'repeat-end' })], {
      dynamics: [{ at: at(0, 0), level: 'ff' }],
    });
    try {
      const run = await started(passage);
      await run.advanceTo(0.6);
      const before = callsOf('poly', 'triggerAttackRelease').length;
      run.handle.stop();
      expect(callsOf('poly', 'releaseAll').length).toBeGreaterThanOrEqual(2);
      mock.draws.forEach((d) => d.cb());
      expect(run.onEvent).not.toHaveBeenCalled();
      await run.advanceTo(5);
      expect(callsOf('poly', 'triggerAttackRelease')).toHaveLength(before);
      expect(run.isDone()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
