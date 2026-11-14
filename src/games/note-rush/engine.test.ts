import { describe, expect, it } from 'vitest';
import { pitch } from '@/engine/pitch';
import { createRng } from '@/engine/rng';
import type { Letter, Rng } from '@/engine/types';
import {
  answer,
  createGame,
  DEFAULT_CONFIG,
  leadingNote,
  levelParams,
  multiplierForStreak,
  poolForLevel,
  resolveConfig,
  tick,
  widestRange,
  type GameEvent,
  type GameState,
  type NoteRushConfig,
} from './engine';
import { describeStavePosition } from './position-words';

/**
 * An Rng that returns the item sitting at a scripted stave position. It throws
 * if the script asks for a position the engine did not offer, so it also
 * proves what the engine excluded. Scripts repeat.
 */
function positionRng(script: number[], positionOf: (item: number) => number = (n) => n): Rng {
  let i = 0;
  return {
    next: () => 0,
    int: (min) => min,
    pick<T>(items: readonly T[]): T {
      const want = script[i++ % script.length];
      const found = items.find((it) => positionOf(it as number) === want);
      if (found === undefined) throw new Error(`position ${want} not offered: ${JSON.stringify(items)}`);
      return found;
    },
    shuffle: <T>(items: readonly T[]) => items.slice(),
  };
}

const untimed = (over: Partial<NoteRushConfig> = {}): Partial<NoteRushConfig> => ({ untimed: true, ...over });

function correctLetter(s: GameState): Letter {
  return leadingNote(s)!.letter;
}
function wrongLetter(s: GameState): Letter {
  return correctLetter(s) === 'C' ? 'D' : 'C';
}
function run(state: GameState, outcomes: ('c' | 'w')[]) {
  const events: GameEvent[] = [];
  let s = state;
  for (const o of outcomes) {
    const r = answer(s, o === 'c' ? correctLetter(s) : wrongLetter(s));
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}
const types = (events: GameEvent[]) => events.map((e) => e.type);

describe('config', () => {
  it('has the documented defaults', () => {
    expect(resolveConfig()).toEqual({
      clef: 'treble',
      range: { low: 0, high: 8 },
      roundSeconds: 90,
      answerMode: 'letters',
      untimed: false,
      untimedNotes: 20,
      startLevel: 1,
      widenRange: true,
    });
    expect(DEFAULT_CONFIG.range).toEqual({ low: 0, high: 8 });
  });
  it('ignores undefined fields and repairs bad values', () => {
    const c = resolveConfig({ clef: undefined, range: { low: 6, high: 2 }, roundSeconds: -5, untimedNotes: 0, startLevel: 99 });
    expect(c.clef).toBe('treble');
    expect(c.range).toEqual({ low: 2, high: 6 });
    expect(c.roundSeconds).toBe(90);
    expect(c.untimedNotes).toBe(20);
    expect(c.startLevel).toBe(8);
    expect(resolveConfig({ startLevel: -3 }).startLevel).toBe(1);
  });
});

describe('level tables', () => {
  it('speeds up and spawns faster with every level', () => {
    for (let l = 1; l < 8; l++) {
      expect(levelParams(l + 1).travelMs).toBeLessThan(levelParams(l).travelMs);
      expect(levelParams(l + 1).spawnMs).toBeLessThan(levelParams(l).spawnMs);
    }
    expect(levelParams(1)).toEqual({ travelMs: 8000, spawnMs: 3000, extra: 0 });
    expect(levelParams(0)).toEqual(levelParams(1));
    expect(levelParams(12)).toEqual(levelParams(8));
  });
  it.each([
    [0, 1],
    [4, 1],
    [5, 2],
    [9, 2],
    [10, 3],
    [14, 3],
    [15, 4],
    [16, 4],
    [100, 4],
  ])('multiplier for a streak of %i is x%i', (streak, x) => {
    expect(multiplierForStreak(streak)).toBe(x);
  });
  it('widens the pool by ledger lines from level 3', () => {
    const c = resolveConfig();
    const span = (l: number) => {
      const p = poolForLevel(c, l);
      return [p[0], p[p.length - 1], p.length];
    };
    expect(span(1)).toEqual([0, 8, 9]);
    expect(span(2)).toEqual([0, 8, 9]);
    expect(span(3)).toEqual([-2, 10, 13]);
    expect(span(4)).toEqual([-2, 10, 13]);
    expect(span(5)).toEqual([-4, 12, 17]);
    expect(span(7)).toEqual([-6, 14, 21]);
    expect(span(8)).toEqual([-6, 14, 21]);
    expect(widestRange(c)).toEqual({ low: -6, high: 14 });
  });
  it('keeps the pool fixed when widening is off, and honours a custom range', () => {
    const fixed = resolveConfig({ widenRange: false });
    expect(poolForLevel(fixed, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(widestRange(fixed)).toEqual({ low: 0, high: 8 });
    const custom = resolveConfig({ range: { low: 2, high: 4 } });
    expect(poolForLevel(custom, 1)).toEqual([2, 3, 4]);
    expect(poolForLevel(custom, 3)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('spawning and movement (timed)', () => {
  it('starts empty with the full clock and spawns on the first tick', () => {
    const s0 = createGame({}, positionRng([4]));
    expect(s0.notes).toHaveLength(0);
    expect(s0.timeLeftMs).toBe(90000);
    expect(s0.phase).toBe('playing');
    const { state, events } = tick(s0, 16);
    expect(events).toEqual([]);
    expect(state.notes).toHaveLength(1);
    const n = state.notes[0];
    expect(pitch.formatPitch(n.pitch)).toBe('B4'); // treble: position 4 is the middle line
    expect(n.letter).toBe('B');
    expect(n.position).toBe(4);
    // Spawned 16 ms "ago": 1 - 16/8000.
    expect(n.x).toBeCloseTo(0.998, 9);
    expect(state.timeLeftMs).toBe(90000 - 16);
    expect(state.elapsedMs).toBe(16);
  });
  it('moves every note left by dt / travelMs and spawns on the interval', () => {
    const { state } = tick(createGame({}, positionRng([4, 5])), 3000);
    expect(state.notes).toHaveLength(2);
    expect(state.notes[0].x).toBeCloseTo(1 - 3000 / 8000, 9); // 0.625
    expect(state.notes[1].x).toBeCloseTo(1, 9);
    expect(state.notes[0].id).toBe(1);
    expect(state.notes[1].id).toBe(2);
    expect(leadingNote(state)!.id).toBe(1);
  });
  it('places a note that spawns mid-step according to the overshoot', () => {
    // 3025 ms: the second note's spawn was due at 3000, so it has already travelled 25 ms.
    const { state } = tick(createGame({}, positionRng([4, 5])), 3025);
    expect(state.notes[1].x).toBeCloseTo(1 - 25 / 8000, 9);
  });
  it('gives the same result for one big tick as for several small ones', () => {
    const a = tick(createGame({}, positionRng([4, 5, 6])), 7000).state;
    let b = createGame({}, positionRng([4, 5, 6]));
    for (const dt of [1000, 2500, 500, 3000]) b = tick(b, dt).state;
    expect(a.notes.map((n) => [n.id, n.position])).toEqual(b.notes.map((n) => [n.id, n.position]));
    a.notes.forEach((n, i) => expect(n.x).toBeCloseTo(b.notes[i].x, 9));
    expect(a.timeLeftMs).toBe(b.timeLeftMs);
  });
  it('ignores zero and negative time', () => {
    const s0 = createGame({}, positionRng([4]));
    expect(tick(s0, 0).state).toBe(s0);
    expect(tick(s0, -10).state).toBe(s0);
  });
  it('never spawns the same pitch twice in a row', () => {
    // Record what the engine offers to pick from.
    const offered: number[][] = [];
    const rng: Rng = {
      next: () => 0,
      int: (min) => min,
      pick: <T>(items: readonly T[]) => {
        offered.push(items.slice() as number[]);
        return items[0];
      },
      shuffle: <T>(items: readonly T[]) => items.slice(),
    };
    let s = createGame({}, rng);
    s = tick(s, 3000).state; // first spawn: pool 0..8, picks position 0
    s = tick(s, 3000).state; // second spawn: 0 must be excluded
    expect(offered[0]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(offered[1]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(s.notes.map((n) => n.position)).toEqual([0, 1, 0].slice(0, s.notes.length));
  });
  it('never repeats a pitch over a long seeded run, in either clef', () => {
    for (const clef of ['treble', 'bass'] as const) {
      let s = createGame(untimed({ clef, untimedNotes: 400 }), createRng(7));
      let last = pitch.formatPitch(leadingNote(s)!.pitch);
      for (let i = 0; i < 399; i++) {
        s = answer(s, correctLetter(s)).state;
        const now = pitch.formatPitch(leadingNote(s)!.pitch);
        expect(now).not.toBe(last);
        last = now;
      }
    }
  });
  it('allows repeats only when the pool has a single position', () => {
    let s = createGame(untimed({ range: { low: 4, high: 4 }, widenRange: false }), createRng(1));
    const first = leadingNote(s)!.position;
    s = answer(s, correctLetter(s)).state;
    expect(first).toBe(4);
    expect(leadingNote(s)!.position).toBe(4);
  });
  it('uses bass clef pitches', () => {
    const s = createGame(untimed({ clef: 'bass' }), positionRng([0]));
    expect(pitch.formatPitch(leadingNote(s)!.pitch)).toBe('G2');
    const t = createGame(untimed({ clef: 'bass' }), positionRng([8]));
    expect(pitch.formatPitch(leadingNote(t)!.pitch)).toBe('A3');
  });
  it('only spawns naturals', () => {
    let s = createGame(untimed({ untimedNotes: 100, startLevel: 8 }), createRng(3));
    for (let i = 0; i < 99; i++) {
      expect(leadingNote(s)!.pitch.accidental).toBe(0);
      s = answer(s, correctLetter(s)).state;
    }
  });
  it('draws from the widened pool at higher levels and stays inside it', () => {
    let s = createGame(untimed({ untimedNotes: 300, startLevel: 3 }), createRng(11));
    const seen = new Set<number>();
    for (let i = 0; i < 299; i++) {
      // Stay on level 3 or 4 by judging after each: all answers correct, so the level will rise;
      // check against the level in force when each note was spawned.
      seen.add(leadingNote(s)!.position);
      s = answer(s, correctLetter(s)).state;
    }
    expect(Math.min(...seen)).toBeLessThan(0);
    expect(Math.max(...seen)).toBeGreaterThan(8);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(-6);
    expect(Math.max(...seen)).toBeLessThanOrEqual(14);
  });
  it('keeps level 1 inside the five lines and four spaces', () => {
    let s = createGame(untimed({ untimedNotes: 7 }), createRng(5));
    for (let i = 0; i < 6; i++) {
      expect(leadingNote(s)!.position).toBeGreaterThanOrEqual(0);
      expect(leadingNote(s)!.position).toBeLessThanOrEqual(8);
      s = answer(s, correctLetter(s)).state; // 6 correct: still level 1
    }
    expect(s.level).toBe(1);
  });
});

describe('misses', () => {
  it('counts a note reaching the line as a miss and reveals its name', () => {
    const s0 = createGame({}, positionRng([4, 5, 6, 7]));
    const { state, events } = tick(s0, 8000);
    const miss = events.filter((e) => e.type === 'miss');
    expect(miss).toHaveLength(1);
    expect(miss[0]).toMatchObject({ type: 'miss', noteId: 1, letter: 'B' });
    expect((miss[0] as Extract<GameEvent, { type: 'miss' }>).pitch).toEqual(pitch.parsePitch('B4'));
    expect(state.missed).toBe(1);
    expect(state.streak).toBe(0);
    expect(state.phase).toBe('playing');
    // Notes 2 and 3 spawned at 3000 and 6000.
    expect(state.notes.map((n) => n.id)).toEqual([2, 3]);
    expect(state.notes[0].x).toBeCloseTo(1 - 5000 / 8000, 9);
    expect(state.notes[1].x).toBeCloseTo(1 - 2000 / 8000, 9);
  });
  it('resets the streak and costs no lives: the game goes on and later answers score', () => {
    let s = createGame({}, positionRng([4, 5, 6]));
    s = tick(s, 1000).state;
    s = answer(s, correctLetter(s)).state; // streak 1
    expect(s.streak).toBe(1);
    const r = tick(s, 9000); // second note (spawned 3000) misses at 11000; push on
    s = tick(r.state, 2500).state;
    expect(s.missed).toBeGreaterThanOrEqual(1);
    expect(s.streak).toBe(0);
    expect(s.phase).toBe('playing');
    s = answer(s, correctLetter(s)).state;
    expect(s.correct).toBe(2);
    expect(s.score).toBeGreaterThan(10);
  });
  it('does not misfire on unanswered notes still in the lane when the clock ends', () => {
    // A round of 4 s: the first note spawns at 0 and would only be missed at 8 s.
    const { state, events } = tick(createGame({ roundSeconds: 4 }, positionRng([4, 5])), 10000);
    expect(state.missed).toBe(0);
    expect(types(events)).toEqual(['finished']);
  });
  it('keeps every later miss in order and tallies them per pitch', () => {
    // 90 s round, positions alternate E4 (0) and G4 (2); a note spawns every 3 s from t=0
    // and misses 8 s later, so spawns k = 0..27 miss before the end: 28 misses, 14 each.
    const { state, events } = tick(createGame({}, positionRng([0, 2])), 90000);
    const misses = events.filter((e) => e.type === 'miss');
    expect(misses).toHaveLength(28);
    expect(misses.map((m) => (m as { noteId: number }).noteId)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
    expect(state.missed).toBe(28);
    const fin = events.find((e) => e.type === 'finished') as Extract<GameEvent, { type: 'finished' }>;
    expect(fin.result).toMatchObject({ score: 0, correct: 0, wrong: 0, missed: 28, accuracy: 0, bestStreak: 0, maxLevel: 1 });
    expect(fin.result.mistakes.map((m) => [m.key, m.missed, m.wrong, m.total])).toEqual([
      ['E4', 14, 0, 14],
      ['G4', 14, 0, 14],
    ]);
  });
});

describe('answering', () => {
  it('does nothing before the first note exists', () => {
    const s0 = createGame({}, positionRng([4]));
    const r = answer(s0, 'C');
    expect(r.state).toBe(s0);
    expect(r.events).toEqual([]);
  });

  it('scores base 10 plus a speed bonus times the multiplier', () => {
    let s = tick(createGame({}, positionRng([4, 5])), 1600).state; // note 1 at x = 0.8
    expect(s.notes[0].x).toBeCloseTo(0.8, 9);
    const r = answer(s, 'B');
    expect(r.events).toEqual([
      { type: 'correct', noteId: 1, letter: 'B', points: 18, speedBonus: 8, multiplier: 1, streak: 1 },
    ]);
    s = r.state;
    expect(s.score).toBe(18);
    expect(s.notes).toHaveLength(0);
    expect(s.correct).toBe(1);
  });
  it('gives no speed bonus to a note on the line and the full 10 to a fresh one', () => {
    // Fresh: note 2 spawns exactly at x = 1 at t = 3000.
    let s = tick(createGame({}, positionRng([4, 5])), 3000).state;
    s = answer(s, 'B').state; // note 1 at 0.625: bonus floor(6.25) = 6 -> 16
    expect(s.score).toBe(16);
    s = answer(s, 'C').state; // note 2 at x = 1: bonus 10 -> 20
    expect(s.score).toBe(36);
  });
  it('applies the streak multiplier: x1 for 1-5, x2 for 6-10, x3, then capped at x4', () => {
    const per: number[] = [];
    let s = createGame(untimed({ untimedNotes: 25 }), positionRng([4, 5]));
    for (let i = 0; i < 24; i++) {
      const before = s.score;
      s = answer(s, correctLetter(s)).state;
      per.push(s.score - before);
    }
    expect(per).toEqual([
      ...Array(5).fill(10),
      ...Array(5).fill(20),
      ...Array(5).fill(30),
      ...Array(9).fill(40),
    ]);
    expect(s.bestStreak).toBe(24);
  });
  it('reports the multiplier in the event', () => {
    let s = createGame(untimed(), positionRng([4, 5]));
    const evs: GameEvent[] = [];
    for (let i = 0; i < 6; i++) {
      const r = answer(s, correctLetter(s));
      s = r.state;
      evs.push(...r.events);
    }
    const mults = evs.filter((e) => e.type === 'correct').map((e) => (e as { multiplier: number }).multiplier);
    expect(mults).toEqual([1, 1, 1, 1, 1, 2]);
  });

  it('wrong: no points, streak reset, the note stays, and the event withholds the name', () => {
    let s = createGame(untimed(), positionRng([4, 5]));
    s = run(s, ['c', 'c']).state; // streak 2, score 20, now on C (position 5)
    expect(s.streak).toBe(2);
    const lead = leadingNote(s)!;
    const r = answer(s, 'G');
    expect(r.events).toEqual([{ type: 'wrong', noteId: lead.id, guess: 'G' }]);
    expect(JSON.stringify(r.events)).not.toContain(lead.letter === 'G' ? 'x' : `"${lead.letter}"`);
    expect(Object.keys(r.events[0]).sort()).toEqual(['guess', 'noteId', 'type']);
    expect(r.state.score).toBe(20);
    expect(r.state.streak).toBe(0);
    expect(r.state.bestStreak).toBe(2);
    expect(r.state.wrong).toBe(1);
    expect(leadingNote(r.state)!.id).toBe(lead.id);
    expect(leadingNote(r.state)!.wrongGuesses).toBe(1);
    // Can be answered again, and that scores from a streak of zero (x1).
    const again = answer(r.state, lead.letter);
    expect(again.events[0]).toMatchObject({ type: 'correct', multiplier: 1, points: 10, streak: 1 });
  });
  it('treats a non-natural press (null) as wrong', () => {
    const s = createGame(untimed(), positionRng([4]));
    const r = answer(s, null);
    expect(r.events).toEqual([{ type: 'wrong', noteId: 1, guess: null }]);
    expect(r.state.wrong).toBe(1);
  });
  it('always applies an answer to the oldest note, never a later one', () => {
    // Notes: B (position 4) first, then C (position 5). Answering "C" is wrong while B leads.
    const s = tick(createGame({}, positionRng([4, 5])), 3000).state;
    expect(s.notes.map((n) => n.letter)).toEqual(['B', 'C']);
    const r = answer(s, 'C');
    expect(r.events[0]).toMatchObject({ type: 'wrong', noteId: 1 });
    expect(r.state.notes).toHaveLength(2);
    const ok = answer(r.state, 'B');
    expect(ok.events[0]).toMatchObject({ type: 'correct', noteId: 1 });
    expect(leadingNote(ok.state)!.id).toBe(2);
  });
  it('matches only the exact letter', () => {
    const s = createGame(untimed(), positionRng([4, 5]));
    expect(answer(s, 'A').events[0].type).toBe('wrong');
    expect(answer(s, 'B').events[0].type).toBe('correct');
  });
  it('does not mutate the state it was given', () => {
    const s = tick(createGame({}, positionRng([4, 5])), 3000).state;
    const snap = JSON.stringify({ ...s, rng: undefined });
    answer(s, 'B');
    answer(s, 'G');
    tick(s, 5000);
    expect(JSON.stringify({ ...s, rng: undefined })).toBe(snap);
  });
});

describe('adaptive difficulty', () => {
  const fresh = (over: Partial<NoteRushConfig> = {}) => createGame(untimed({ untimedNotes: 200, ...over }), positionRng([4, 5]));

  it('rises after 8 correct answers at 100% accuracy', () => {
    const r7 = run(fresh(), Array(7).fill('c'));
    expect(r7.state.level).toBe(1);
    expect(types(r7.events)).not.toContain('levelUp');
    const r8 = answer(r7.state, correctLetter(r7.state));
    expect(types(r8.events)).toEqual(['correct', 'levelUp']);
    expect(r8.events[1]).toEqual({ type: 'levelUp', level: 2 });
    expect(r8.state.level).toBe(2);
    expect(r8.state.maxLevel).toBe(2);
  });
  it('rises with one wrong in the recent window: 8 of 9 is 89%', () => {
    const r = run(fresh(), ['w', ...Array(8).fill('c')]);
    expect(r.state.level).toBe(2);
    expect(types(r.events).filter((t) => t === 'levelUp')).toHaveLength(1);
  });
  it('holds back with two wrongs: 8 of 10 is 80%, then rises on the 9th correct (9 of 10)', () => {
    const r8 = run(fresh(), ['w', 'w', ...Array(8).fill('c')]);
    expect(r8.state.level).toBe(1);
    const r9 = answer(r8.state, correctLetter(r8.state));
    expect(r9.state.level).toBe(2);
    expect(r9.events.map((e) => e.type)).toEqual(['correct', 'levelUp']);
  });
  it('needs a fresh run of 8 after each rise, and clamps at level 8', () => {
    let s = fresh();
    const allEvents: GameEvent[] = [];
    for (let i = 0; i < 8 * 9; i++) {
      const r = answer(s, correctLetter(s));
      s = r.state;
      allEvents.push(...r.events);
    }
    const ups = allEvents.filter((e) => e.type === 'levelUp').map((e) => (e as { level: number }).level);
    expect(ups).toEqual([2, 3, 4, 5, 6, 7, 8]); // exactly every 8 answers, then silence
    expect(s.level).toBe(8);
    expect(s.maxLevel).toBe(8);
  });
  it('falls after 3 wrong answers in the last 6', () => {
    const base = run(fresh({ startLevel: 4 }), ['c', 'c']).state;
    const r = run(base, ['w', 'w']);
    expect(r.state.level).toBe(4);
    const third = answer(r.state, wrongLetter(r.state));
    expect(third.events.map((e) => e.type)).toEqual(['wrong', 'levelDown']);
    expect(third.events[1]).toEqual({ type: 'levelDown', level: 3 });
    expect(third.state.level).toBe(3);
    expect(third.state.maxLevel).toBe(4);
  });
  it('does not fall when failures are spread out beyond 6', () => {
    // w c c c c c w c c c c c w: never 3 failures within any 6 consecutive outcomes.
    const r = run(fresh({ startLevel: 4 }), ['w', 'c', 'c', 'c', 'c', 'c', 'w', 'c', 'c', 'c', 'c', 'c', 'w']);
    expect(types(r.events)).not.toContain('levelDown');
    expect(r.state.level).toBeGreaterThanOrEqual(4);
  });
  it('clears the window on a change, so one more failure after a fall does not cascade', () => {
    const r = run(fresh({ startLevel: 5 }), ['w', 'w', 'w']); // down to 4
    expect(r.state.level).toBe(4);
    const more = run(r.state, ['w', 'w']);
    expect(more.state.level).toBe(4);
    const last = run(more.state, ['w']);
    expect(last.state.level).toBe(3);
  });
  it('counts misses as failures', () => {
    // Level 3 start; three notes miss in a row: spawns at 0, 3000... at level 3: spawn 2400, travel 6200.
    let s = createGame({ startLevel: 3 }, positionRng([4, 5, 6, 7, 8]));
    const events: GameEvent[] = [];
    // Run until three misses are seen, in small ticks.
    for (let i = 0; i < 2000 && s.missed < 3; i++) {
      const r = tick(s, 50);
      s = r.state;
      events.push(...r.events);
    }
    expect(s.missed).toBe(3);
    expect(types(events).filter((t) => t === 'miss')).toHaveLength(3);
    expect(types(events).filter((t) => t === 'levelDown')).toHaveLength(1);
    expect(s.level).toBe(2);
  });
  it('never goes below 1 and emits nothing when already there', () => {
    const r = run(fresh(), ['w', 'w', 'w', 'w', 'w']);
    expect(r.state.level).toBe(1);
    expect(types(r.events)).not.toContain('levelDown');
  });
  it('changes speed with the level', () => {
    let s = fresh();
    s = run(s, Array(8).fill('c')).state; // level 2: travel 7000
    expect(s.level).toBe(2);
    const timed = createGame({ startLevel: 2 }, positionRng([4, 5]));
    const t = tick(timed, 3500).state; // half of 7000 ms
    expect(t.notes[0].x).toBeCloseTo(0.5, 9);
  });
  it('uses the level spawn interval', () => {
    // Level 2: 2700 ms between spawns.
    const a = tick(createGame({ startLevel: 2 }, positionRng([4, 5, 6])), 2699).state;
    expect(a.notes).toHaveLength(1);
    const b = tick(createGame({ startLevel: 2 }, positionRng([4, 5, 6])), 2700).state;
    expect(b.notes).toHaveLength(2);
  });
});

describe('untimed mode', () => {
  it('shows one note at a time and ignores the clock', () => {
    const s0 = createGame(untimed(), positionRng([4, 5]));
    expect(s0.timeLeftMs).toBeNull();
    expect(s0.notes).toHaveLength(1);
    expect(s0.notes[0].x).toBe(1);
    const r = tick(s0, 100000);
    expect(r.state).toBe(s0);
    expect(r.events).toEqual([]);
  });
  it('gives no speed bonus', () => {
    const s = createGame(untimed(), positionRng([4, 5]));
    expect(answer(s, 'B').events[0]).toMatchObject({ points: 10, speedBonus: 0 });
  });
  it('replaces a cleared note straight away and keeps a wrongly answered one', () => {
    let s = createGame(untimed(), positionRng([4, 5]));
    s = answer(s, 'G').state;
    expect(s.notes.map((n) => n.id)).toEqual([1]);
    s = answer(s, 'B').state;
    expect(s.notes.map((n) => [n.id, n.letter])).toEqual([[2, 'C']]);
  });
  it('ends after 20 notes by default and reports the result', () => {
    let s = createGame(untimed(), positionRng([4, 5]));
    const events: GameEvent[] = [];
    for (let i = 0; i < 19; i++) {
      const r = answer(s, correctLetter(s));
      s = r.state;
      events.push(...r.events);
    }
    expect(s.phase).toBe('playing');
    const last = answer(s, correctLetter(s));
    const fin = last.events.find((e) => e.type === 'finished') as Extract<GameEvent, { type: 'finished' }>;
    expect(fin).toBeDefined();
    expect(last.state.phase).toBe('finished');
    expect(last.state.notes).toHaveLength(0);
    // 5x10 + 5x20 + 5x30 + 5x40
    expect(fin.result).toMatchObject({
      score: 500,
      correct: 20,
      wrong: 0,
      missed: 0,
      accuracy: 1,
      bestStreak: 20,
      untimed: true,
    });
    expect(fin.result.maxLevel).toBe(3); // rises after the 8th and 16th correct
    expect(last.state.result).toEqual(fin.result);
  });
  it('honours a custom note count and counts only correct answers towards it', () => {
    let s = createGame(untimed({ untimedNotes: 3 }), positionRng([4, 5]));
    s = answer(s, 'A').state; // wrong, not counted
    s = answer(s, 'B').state;
    s = answer(s, 'C').state;
    expect(s.phase).toBe('playing');
    const r = answer(s, correctLetter(s));
    expect(r.state.phase).toBe('finished');
    const fin = r.events.at(-1) as Extract<GameEvent, { type: 'finished' }>;
    expect(fin.result).toMatchObject({ correct: 3, wrong: 1, accuracy: 0.75, score: 30 - 0 });
  });
  it('lists mistakes per pitch, most first, ties by lower pitch', () => {
    // Positions alternate B4 (4) and C5 (5). Wrong answers: B4 x1, C5 x2, B4 x... build explicitly.
    let s = createGame(untimed({ untimedNotes: 4 }), positionRng([4, 5]));
    s = answer(s, 'A').state; // B4 wrong (1)
    s = answer(s, 'B').state; // clear B4
    s = answer(s, 'A').state; // C5 wrong (1)
    s = answer(s, 'A').state; // C5 wrong (2)
    s = answer(s, 'C').state; // clear C5
    s = answer(s, 'B').state; // B4 again, correct
    s = answer(s, 'C').state;
    expect(s.phase).toBe('finished');
    expect(s.result!.mistakes.map((m) => [m.key, m.wrong, m.missed, m.total])).toEqual([
      ['C5', 2, 0, 2],
      ['B4', 1, 0, 1],
    ]);
    expect(s.result!.mistakes[0].pitch).toEqual(pitch.parsePitch('C5'));
    expect(s.result!.accuracy).toBeCloseTo(4 / 7, 9);
  });
});

describe('end of round', () => {
  it('finishes exactly when the time runs out, once, and then goes inert', () => {
    const s0 = createGame({ roundSeconds: 6 }, positionRng([4, 5]));
    const a = tick(s0, 5999);
    expect(types(a.events)).toEqual([]);
    expect(a.state.timeLeftMs).toBe(1);
    const b = tick(a.state, 5); // overshoots by 4 ms: only 1 ms is simulated
    expect(types(b.events)).toEqual(['finished']);
    expect(b.state.phase).toBe('finished');
    expect(b.state.timeLeftMs).toBe(0);
    expect(b.state.elapsedMs).toBe(6000);
    const c = tick(b.state, 1000);
    expect(c.state).toBe(b.state);
    expect(c.events).toEqual([]);
    expect(answer(b.state, 'A').events).toEqual([]);
  });
  it('reports score, accuracy and best streak for a mixed round', () => {
    let s = tick(createGame({ roundSeconds: 20 }, positionRng([4, 5, 6, 7])), 1600).state; // B at 0.8
    s = answer(s, 'B').state; // 18, streak 1
    s = answer(tick(s, 1400).state, 'A').state; // nothing to answer (note 2 not spawned)? tick adds none; see below
    // Note 2 spawns at 3000 ms; we are at 3000 ms now, so it just spawned at x = 1.
    expect(s.wrong).toBe(1);
    expect(s.streak).toBe(0);
    s = answer(s, 'C').state; // x = 1: (10+10) x1 = 20
    expect(s.score).toBe(38);
    const fin = tick(s, 100000);
    const ev = fin.events.find((e) => e.type === 'finished') as Extract<GameEvent, { type: 'finished' }>;
    expect(ev.result.score).toBe(38);
    expect(ev.result.correct).toBe(2);
    expect(ev.result.wrong).toBe(1);
    expect(ev.result.bestStreak).toBe(1);
    expect(ev.result.missed).toBeGreaterThan(0);
    expect(ev.result.accuracy).toBeCloseTo(2 / (3 + ev.result.missed), 9);
  });
  it('plays a whole timed round for any seed without throwing, with sane invariants', () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      let s = createGame({}, createRng(seed));
      const rngAnswers = createRng(seed + 1000);
      let finished = 0;
      for (let i = 0; i < 20000 && s.phase === 'playing'; i++) {
        const r = tick(s, 16);
        s = r.state;
        finished += r.events.filter((e) => e.type === 'finished').length;
        if (rngAnswers.next() < 0.03 && leadingNote(s)) {
          const a = answer(s, rngAnswers.next() < 0.7 ? correctLetter(s) : wrongLetter(s));
          s = a.state;
          finished += a.events.filter((e) => e.type === 'finished').length;
        }
        expect(s.level).toBeGreaterThanOrEqual(1);
        expect(s.level).toBeLessThanOrEqual(8);
        expect(s.notes.length).toBeLessThanOrEqual(5);
      }
      expect(s.phase).toBe('finished');
      expect(finished).toBe(1);
      expect(s.result!.accuracy).toBeGreaterThanOrEqual(0);
      expect(s.result!.accuracy).toBeLessThanOrEqual(1);
    }
  });
});

describe('describeStavePosition', () => {
  it.each([
    [0, 'stave', 'first line'],
    [1, 'stave', 'first space'],
    [2, 'stave', 'second line'],
    [3, 'stave', 'second space'],
    [4, 'stave', 'third line'],
    [7, 'stave', 'fourth space'],
    [8, 'stave', 'fifth line'],
    [-1, 'stave', 'space below the bottom line'],
    [-2, 'stave', 'first ledger line below the stave'],
    [-3, 'stave', 'space below the first ledger line below the stave'],
    [-4, 'staff', 'second ledger line below the staff'],
    [9, 'stave', 'space above the top line'],
    [10, 'staff', 'first ledger line above the staff'],
    [11, 'stave', 'space above the first ledger line above the stave'],
    [14, 'stave', 'third ledger line above the stave'],
  ])('position %i (%s)', (position, word, expected) => {
    expect(describeStavePosition(position, word === 'staff' ? 'us' : 'uk')).toBe(expected);
  });
  it('never names a letter', () => {
    for (let p = -6; p <= 14; p++) expect(describeStavePosition(p, 'uk')).not.toMatch(/\b[A-G]\b/);
  });
});

