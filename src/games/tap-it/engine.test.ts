import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import {
  completeRhythm,
  createGame,
  extraTap,
  isTimeUp,
  judge,
  multiplierForStreak,
  PERFECT_RHYTHM_BONUS,
  PRACTICE_BPM,
  resolveConfig,
  restartRhythm,
  tick,
  timeLeftMs,
  timingFor,
  weakestLevel,
  type GameEvent,
  type GameState,
  type TapItConfig,
  type Verdict,
} from './engine';
import { levelSpec } from './levels';
import { rhythmKey } from './rhythms';

/** A game whose current rhythm has exactly `onsets` onsets (the notation is irrelevant to scoring). */
function game(onsets: number, config: Partial<TapItConfig> = {}, seed = 1): GameState {
  const g = createGame(config, createRng(seed));
  return { ...g, current: { ...g.current, onsets } };
}
/** Judges the given verdicts on indexes 0..n-1 in order and returns the final state and every event. */
function play(state: GameState, verdicts: Verdict[], from = 0) {
  let s = state;
  const events: GameEvent[] = [];
  verdicts.forEach((v, i) => {
    const step = judge(s, from + i, v);
    s = step.state;
    events.push(...step.events);
  });
  return { state: s, events };
}
const hits = (events: GameEvent[]) => events.filter((e): e is Extract<GameEvent, { type: 'hit' }> => e.type === 'hit');

describe('multiplierForStreak', () => {
  it('grows every 8 consecutive hits up to x4', () => {
    const table: [number, number][] = [
      [0, 1], [7, 1], [8, 2], [15, 2], [16, 3], [23, 3], [24, 4], [25, 4], [100, 4], [-3, 1],
    ];
    for (const [streak, expected] of table) expect(multiplierForStreak(streak)).toBe(expected);
  });
});

describe('resolveConfig and createGame', () => {
  it('fills defaults and clamps', () => {
    expect(resolveConfig()).toEqual({ roundSeconds: 60, startLevel: 1, practice: false, practiceRhythms: 6 });
    expect(resolveConfig({ startLevel: 12, roundSeconds: -4, practiceRhythms: 0, practice: undefined })).toEqual({
      roundSeconds: 60,
      startLevel: 8,
      practice: false,
      practiceRhythms: 6,
    });
  });
  it('starts at the chosen level with the first rhythm ready and nothing scored', () => {
    const g = createGame({ startLevel: 3 }, createRng(5));
    expect(g.level).toBe(3);
    expect(g.maxLevel).toBe(3);
    expect(g.current.level).toBe(3);
    expect(g.current.bpm).toBe(75);
    expect(g.rhythmNumber).toBe(1);
    expect(g.score).toBe(0);
    expect(g.phase).toBe('playing');
    expect(timeLeftMs(g)).toBe(60000);
  });
  it('is deterministic for a seed', () => {
    const a = createGame({ startLevel: 5 }, createRng(9));
    const b = createGame({ startLevel: 5 }, createRng(9));
    expect(rhythmKey(a.current.time, a.current.bars)).toBe(rhythmKey(b.current.time, b.current.bars));
  });
  it('uses the tight thresholds in a round and the wide ones in practice', () => {
    expect(timingFor({ practice: false })).toEqual({ perfectMs: 60, toleranceMs: 150 });
    expect(timingFor({ practice: true })).toEqual({ perfectMs: 120, toleranceMs: 300 });
  });
});

describe('scoring per onset', () => {
  it('perfect is 10, close is 5, miss is 0', () => {
    const { state, events } = play(game(4), ['perfect', 'close', 'miss']);
    expect(hits(events).map((h) => h.points)).toEqual([10, 5]);
    expect(state.score).toBe(15);
    expect(state.perfects).toBe(1);
    expect(state.closes).toBe(1);
    expect(state.misses).toBe(1);
  });
  it('multiplies by the streak held before the hit: 8 hits at x1, then x2 from the 9th', () => {
    // Hand sum, 10 perfect hits: 8 * 10 + 2 * 20 = 120.
    const { state, events } = play(game(12), Array<Verdict>(10).fill('perfect'));
    expect(hits(events).map((h) => h.multiplier)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 2, 2]);
    expect(state.score).toBe(120);
    expect(state.streak).toBe(10);
  });
  it('reaches x4 from the 25th hit', () => {
    // 8*10 + 8*20 + 8*30 + 2*40 = 80 + 160 + 240 + 80 = 560.
    const { state, events } = play(game(30), Array<Verdict>(26).fill('perfect'));
    expect(hits(events)[24]!.multiplier).toBe(4);
    expect(hits(events)[23]!.multiplier).toBe(3);
    expect(state.score).toBe(560);
  });
  it('close hits keep the streak going and are worth half at the same multiplier', () => {
    // 8 perfect (80) + a close at x2 (10) = 90.
    const { state } = play(game(10), [...Array<Verdict>(8).fill('perfect'), 'close']);
    expect(state.score).toBe(90);
    expect(state.streak).toBe(9);
  });
  it('a miss resets the streak and the multiplier', () => {
    // 8 hits (80), a miss, then a hit back at x1 (10) = 90.
    const { state, events } = play(game(12), [...Array<Verdict>(8).fill('perfect'), 'miss', 'perfect']);
    expect(state.streak).toBe(1);
    expect(state.bestStreak).toBe(8);
    expect(hits(events)[8]!.multiplier).toBe(1);
    expect(state.score).toBe(90);
  });
  it('an extra tap resets the streak and costs nothing else', () => {
    const before = play(game(12), Array<Verdict>(9).fill('perfect')).state;
    const { state, events } = extraTap(before);
    expect(events).toEqual([{ type: 'extra' }]);
    expect(state.streak).toBe(0);
    expect(state.score).toBe(before.score);
    expect(state.extraTaps).toBe(1);
    expect(state.bestStreak).toBe(9);
  });
  it('ignores a repeated verdict and an unknown index', () => {
    const g = game(4);
    const once = judge(g, 1, 'perfect').state;
    expect(judge(once, 1, 'close').events).toEqual([]);
    expect(judge(once, 1, 'close').state).toBe(once);
    expect(judge(g, 4, 'perfect').events).toEqual([]);
    expect(judge(g, -1, 'perfect').events).toEqual([]);
    expect(judge(g, 0.5, 'perfect').events).toEqual([]);
  });
  it('never mutates the state it is given', () => {
    const g = game(4);
    const frozen = JSON.stringify({ ...g, rng: undefined });
    judge(g, 0, 'perfect');
    extraTap(g);
    tick(g, 500);
    completeRhythm(g);
    expect(JSON.stringify({ ...g, rng: undefined })).toBe(frozen);
  });
});

describe('completeRhythm', () => {
  it('gives the all-perfect bonus once, unmultiplied', () => {
    // Four perfects at x1: 40, plus the 25 bonus.
    const played = play(game(4), Array<Verdict>(4).fill('perfect')).state;
    const { state, events } = completeRhythm(played);
    const done = events.find((e) => e.type === 'rhythmDone');
    expect(done).toMatchObject({ record: { onsets: 4, perfect: 4, close: 0, miss: 0, accuracy: 1, bonus: PERFECT_RHYTHM_BONUS, points: 65 } });
    expect(state.score).toBe(65);
    expect(state.completed).toBe(1);
    expect(state.rhythmNumber).toBe(2);
  });
  it('gives no bonus when any onset is only close or missed', () => {
    const close = completeRhythm(play(game(4), ['perfect', 'perfect', 'perfect', 'close']).state);
    expect(close.state.score).toBe(35);
    const missed = completeRhythm(play(game(4), ['perfect', 'perfect', 'perfect', 'miss']).state);
    expect(missed.state.score).toBe(30);
  });
  it('counts onsets nobody judged as misses', () => {
    const { state, events } = completeRhythm(play(game(5), ['perfect', 'close']).state);
    expect(events.filter((e) => e.type === 'miss').map((e) => (e as { index: number }).index)).toEqual([2, 3, 4]);
    expect(state.misses).toBe(3);
    expect(state.streak).toBe(0);
    expect(state.history[0]).toMatchObject({ perfect: 1, close: 1, miss: 3, accuracy: 0.4, points: 15, bonus: 0 });
  });
  it('prepares the next rhythm and keeps the totals and streak running', () => {
    const first = completeRhythm(play(game(4), Array<Verdict>(4).fill('perfect')).state).state;
    expect(first.judged).toEqual({});
    expect(first.checkpoint.score).toBe(65);
    expect(first.streak).toBe(4);
    const next = judge({ ...first, current: { ...first.current, onsets: 4 } }, 0, 'perfect');
    expect(next.state.score).toBe(75);
    expect(next.state.streak).toBe(5);
  });
  it('does not repeat the previous rhythm', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const g = createGame({ startLevel: 1 }, createRng(seed));
      const next = completeRhythm(g).state;
      expect(rhythmKey(next.current.time, next.current.bars)).not.toBe(rhythmKey(g.current.time, g.current.bars));
    }
  });
});

describe('adaptive level', () => {
  const finishWith = (s: GameState, hitCount: number, onsets: number) => {
    const withOnsets = { ...s, current: { ...s.current, onsets } };
    const verdicts: Verdict[] = Array.from({ length: onsets }, (_, i) => (i < hitCount ? 'perfect' : 'miss'));
    return completeRhythm(play(withOnsets, verdicts).state);
  };
  it('rises after two rhythms in a row at 85% or better', () => {
    const one = finishWith(createGame({ startLevel: 1 }, createRng(1)), 4, 4);
    expect(one.state.level).toBe(1);
    const two = finishWith(one.state, 4, 4);
    expect(two.state.level).toBe(2);
    expect(two.state.maxLevel).toBe(2);
    expect(two.events).toContainEqual({ type: 'levelUp', level: 2 });
    expect(two.state.current.level).toBe(2);
    expect(two.state.recentAccuracy).toEqual([]);
  });
  it('counts exactly 85% (17 of 20) and not 80% (16 of 20)', () => {
    const base = createGame({ startLevel: 1 }, createRng(1));
    const edge = finishWith(finishWith(base, 17, 20).state, 17, 20);
    expect(edge.state.level).toBe(2);
    const short = finishWith(finishWith(base, 16, 20).state, 20, 20);
    expect(short.state.level).toBe(1);
  });
  it('needs the two to be consecutive: a weak rhythm between resets the run', () => {
    let s = finishWith(createGame({ startLevel: 1 }, createRng(1)), 4, 4).state;
    s = finishWith(s, 3, 4).state; // 75%
    s = finishWith(s, 4, 4).state;
    expect(s.level).toBe(1);
    s = finishWith(s, 4, 4).state;
    expect(s.level).toBe(2);
  });
  it('falls after two in a row below 50% and stops at level 1', () => {
    let s = finishWith(createGame({ startLevel: 3 }, createRng(1)), 1, 4).state; // 25%
    expect(s.level).toBe(3);
    const down = finishWith(s, 0, 4);
    expect(down.state.level).toBe(2);
    expect(down.events).toContainEqual({ type: 'levelDown', level: 2 });
    s = finishWith(finishWith(createGame({ startLevel: 1 }, createRng(1)), 0, 4).state, 0, 4).state;
    expect(s.level).toBe(1);
  });
  it('exactly 50% is not below 50%', () => {
    const s = finishWith(finishWith(createGame({ startLevel: 3 }, createRng(1)), 2, 4).state, 2, 4).state;
    expect(s.level).toBe(3);
  });
  it('stops at level 8', () => {
    const s = finishWith(finishWith(createGame({ startLevel: 8 }, createRng(1)), 4, 4).state, 4, 4);
    expect(s.state.level).toBe(8);
    expect(s.events.some((e) => e.type === 'levelUp')).toBe(false);
  });
  it('plays each level at its own tempo', () => {
    for (let level = 1; level <= 8; level += 1) {
      expect(createGame({ startLevel: level }, createRng(3)).current.bpm).toBe(levelSpec(level).bpm);
    }
  });
});

describe('the round clock', () => {
  it('only moves when told to', () => {
    const g = createGame({ roundSeconds: 60 }, createRng(1));
    const t = tick(g, 1500).state;
    expect(timeLeftMs(t)).toBe(58500);
    expect(tick(t, 0).state).toBe(t);
    expect(tick(t, -5).state).toBe(t);
  });
  it('lets the rhythm in progress finish, then ends the round', () => {
    let s = game(4, { roundSeconds: 10 });
    s = tick(s, 9999).state;
    expect(isTimeUp(s)).toBe(false);
    expect(completeRhythm(s).state.phase).toBe('playing');
    s = tick(s, 1).state;
    expect(isTimeUp(s)).toBe(true);
    expect(timeLeftMs(s)).toBe(0);
    expect(s.phase).toBe('playing');
    const played = play(s, ['perfect', 'perfect', 'close', 'miss']).state;
    const { state, events } = completeRhythm(played);
    expect(state.phase).toBe('finished');
    expect(events.at(-1)?.type).toBe('finished');
    expect(state.result).toMatchObject({
      score: 10 + 10 + 5,
      rhythms: 1,
      onsets: 4,
      perfects: 2,
      closes: 1,
      misses: 1,
      accuracy: 0.75,
      bestStreak: 3,
      maxLevel: 1,
      practice: false,
    });
  });
  it('ignores everything once finished', () => {
    const done = completeRhythm(tick(game(2, { roundSeconds: 1 }), 2000).state).state;
    expect(done.phase).toBe('finished');
    expect(judge(done, 0, 'perfect').events).toEqual([]);
    expect(extraTap(done).events).toEqual([]);
    expect(completeRhythm(done).events).toEqual([]);
    expect(tick(done, 100).state).toBe(done);
    expect(restartRhythm(done)).toBe(done);
  });
});

describe('restartRhythm', () => {
  it('puts the totals back to how they were when the rhythm began', () => {
    const first = completeRhythm(play(game(4), Array<Verdict>(4).fill('perfect')).state).state;
    const mid = play({ ...first, current: { ...first.current, onsets: 4 } }, ['perfect', 'miss', 'close']).state;
    expect(mid.score).toBe(65 + 10 + 5);
    const back = restartRhythm(mid);
    expect(back.score).toBe(65);
    expect(back.streak).toBe(4);
    expect(back.misses).toBe(0);
    expect(back.judged).toEqual({});
    expect(back.current).toBe(mid.current);
  });
});

describe('practice mode', () => {
  it('has no clock, no score, no streak and a fixed level at 50 bpm', () => {
    const g = createGame({ practice: true, startLevel: 3 }, createRng(2));
    expect(g.current.bpm).toBe(PRACTICE_BPM);
    expect(PRACTICE_BPM).toBe(50);
    expect(timeLeftMs(g)).toBeNull();
    expect(tick(g, 5000).state).toBe(g);
    const withOnsets = { ...g, current: { ...g.current, onsets: 4 } };
    const played = play(withOnsets, ['perfect', 'perfect', 'close', 'miss']);
    expect(hits(played.events).map((h) => h.points)).toEqual([0, 0, 0]);
    expect(played.state.score).toBe(0);
    const done = completeRhythm(played.state);
    expect(done.state.score).toBe(0);
    expect(done.state.level).toBe(3);
  });
  it('gives no bonus and never changes level', () => {
    let s = createGame({ practice: true, startLevel: 3, practiceRhythms: 10 }, createRng(2));
    for (let i = 0; i < 4; i += 1) {
      const withOnsets = { ...s, current: { ...s.current, onsets: 4 } };
      s = completeRhythm(play(withOnsets, Array<Verdict>(4).fill('perfect')).state).state;
    }
    expect(s.score).toBe(0);
    expect(s.level).toBe(3);
    expect(s.current.bpm).toBe(50);
  });
  it('ends after the set number of rhythms and reports hits and misses', () => {
    let s = createGame({ practice: true, practiceRhythms: 2 }, createRng(4));
    s = completeRhythm(play({ ...s, current: { ...s.current, onsets: 4 } }, ['perfect', 'close', 'miss', 'perfect']).state).state;
    expect(s.phase).toBe('playing');
    const end = completeRhythm(play({ ...s, current: { ...s.current, onsets: 3 } }, ['perfect', 'perfect']).state);
    expect(end.state.phase).toBe('finished');
    expect(end.state.result).toMatchObject({ practice: true, rhythms: 2, onsets: 7, perfects: 4, closes: 1, misses: 2, score: 0 });
  });
});

describe('practise line', () => {
  it('names the level with the most misses, the higher on a tie', () => {
    expect(weakestLevel({})).toBeNull();
    expect(weakestLevel({ 1: 0 })).toBeNull();
    expect(weakestLevel({ 1: 2, 3: 5, 4: 1 })).toBe(3);
    expect(weakestLevel({ 2: 3, 5: 3 })).toBe(5);
    expect(weakestLevel({ 6: 3, 2: 3 })).toBe(6);
  });
  it('is in the result with that level\'s vocabulary', () => {
    // Play a level 3 rhythm with two misses, then time out.
    const g = game(4, { startLevel: 3, roundSeconds: 5 });
    const s = tick(play(g, ['perfect', 'miss', 'perfect', 'miss']).state, 6000).state;
    const done = completeRhythm(s).state;
    expect(done.result?.weakLevel).toBe(3);
    expect(done.result?.practise).toBe('Practise paired quavers');
  });
  it('is null for a clean round', () => {
    const s = tick(play(game(4, { roundSeconds: 5 }), Array<Verdict>(4).fill('perfect')).state, 6000).state;
    const done = completeRhythm(s).state;
    expect(done.result?.practise).toBeNull();
    expect(done.result?.weakLevel).toBeNull();
    expect(done.result?.accuracy).toBe(1);
  });
  it('has a line for every level', () => {
    const texts = [1, 2, 3, 4, 5, 6, 7, 8].map((l) => levelSpec(l).focus);
    expect(texts).toEqual([
      'crotchets and minims in 4/4',
      'semibreves, and 3/4 and 2/4 time',
      'paired quavers',
      'crotchet and minim rests',
      'dotted minims and dotted crotchet-quaver patterns',
      'ties across the bar line',
      'groups of four semiquavers',
      'everything together at speed',
    ]);
  });
});
