import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import {
  answer,
  buildResult,
  cardTimeMs,
  continueRound,
  createGame,
  multiplierForStreak,
  REVEAL_MS,
  tick,
  type GameEvent,
  type GameState,
} from './engine';
import { realBank, TINY_IDS, tinyBank } from './test-data';

const bank = tinyBank();
const newGame = (config: Parameters<typeof createGame>[0] = {}, seed = 1) =>
  createGame({ poolIds: TINY_IDS, ...config }, bank, createRng(seed));

const right = (s: GameState) => answer(s, s.card!.correctIndex);
const wrong = (s: GameState) => answer(s, (s.card!.correctIndex + 1) % 4);
const types = (events: GameEvent[]) => events.map((e) => e.type);

describe('rules as numbers', () => {
  it('has a card clock of 6 s that shortens by 0.3 s per streak step to 3 s from streak 10', () => {
    expect([0, 1, 2, 5, 9, 10, 11, 40].map(cardTimeMs)).toEqual([6000, 5700, 5400, 4500, 3300, 3000, 3000, 3000]);
    expect(cardTimeMs(-3)).toBe(6000);
  });
  it('has multipliers x1 for streak 0-4, x2 for 5-9, x3 for 10-14, x4 from 15 (streak before the answer)', () => {
    expect([0, 4, 5, 9, 10, 14, 15, 99].map(multiplierForStreak)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

describe('a new game', () => {
  it('starts with a card, a full round clock, a full card clock and nothing scored', () => {
    const s = newGame();
    expect(s.phase).toBe('playing');
    expect(s.roundLeftMs).toBe(60_000);
    expect(s.cardLeftMs).toBe(6000);
    expect(s.cardLimitMs).toBe(6000);
    expect(s.card).toMatchObject({ seq: 1 });
    expect(s.card!.options).toHaveLength(4);
    expect([s.score, s.streak, s.answered]).toEqual([0, 0, 0]);
  });
  it('has no clocks in untimed mode', () => {
    const s = newGame({ untimed: true });
    expect([s.roundLeftMs, s.cardLeftMs, s.cardLimitMs]).toEqual([null, null, null]);
  });
  it('needs four playable entries and drops the ones that cannot be asked', () => {
    expect(() => createGame({ poolIds: TINY_IDS.slice(0, 3) }, bank, createRng(1))).toThrow(/at least 4/);
    expect(() => createGame({ poolIds: ['nope', 'alpha', 'bravo', 'charlie', 'delta'] }, bank, createRng(1))).not.toThrow();
    expect(() => createGame({ poolIds: ['nope', 'alpha', 'bravo', 'charlie'] }, bank, createRng(1))).toThrow();
  });
  it('can be repeated from a seed', () => {
    expect(newGame({}, 5).card).toEqual(newGame({}, 5).card);
  });
});

describe('scoring, by hand', () => {
  it('scores 10 plus a speed bonus of floor(10 * left / limit), times the multiplier', () => {
    let s = newGame();
    // Instantly: left = limit, bonus 10, x1 -> 20.
    let step = right(s);
    expect(step.events[0]).toMatchObject({ type: 'correct', points: 20, speedBonus: 10, multiplier: 1, streak: 1 });
    s = step.state;
    expect(s.score).toBe(20);
    expect(s.cardLimitMs).toBe(5700); // streak 1

    // Half the clock gone: 2850 of 5700 left -> bonus floor(5) = 5 -> 15.
    s = tick(s, 2850).state;
    step = right(s);
    expect(step.events[0]).toMatchObject({ points: 15, speedBonus: 5 });
    s = step.state;
    expect(s.score).toBe(35);
    expect(s.cardLimitMs).toBe(5400); // streak 2

    // 1 ms left of 5400: bonus floor(0.0018) = 0 -> 10.
    s = tick(s, 5399).state;
    step = right(s);
    expect(step.events[0]).toMatchObject({ points: 10, speedBonus: 0 });
    expect(step.state.score).toBe(45);

    // A quarter gone of 5100 (streak 3): left 3825 -> floor(7.5) = 7 -> 17.
    s = tick(step.state, 1275).state;
    expect(s.cardLimitMs).toBe(5100);
    step = right(s);
    expect(step.events[0]).toMatchObject({ points: 17, speedBonus: 7 });
    expect(step.state.score).toBe(62);
  });

  it('applies x2, x3 and x4 on answers 6, 11 and 16, scoring instantly each time', () => {
    let s = newGame();
    const points: number[] = [];
    for (let i = 0; i < 17; i++) {
      const step = right(s);
      points.push((step.events[0] as Extract<GameEvent, { type: 'correct' }>).points);
      s = step.state;
    }
    // Answers 1-5: (10+10)*1; 6-10: *2; 11-15: *3; 16-17: *4.
    expect(points).toEqual([...Array(5).fill(20), ...Array(5).fill(40), ...Array(5).fill(60), 80, 80]);
    expect(s.score).toBe(5 * 20 + 5 * 40 + 5 * 60 + 2 * 80); // 760
    expect(s.streak).toBe(17);
    expect(s.bestStreak).toBe(17);
    expect(s.cardLimitMs).toBe(3000);
  });

  it('gives no speed bonus in untimed mode: 10 times the multiplier', () => {
    let s = newGame({ untimed: true, untimedCards: 40 });
    const points: number[] = [];
    for (let i = 0; i < 7; i++) {
      s = tick(s, 500).state;
      const step = right(s);
      points.push((step.events[0] as Extract<GameEvent, { type: 'correct' }>).points);
      s = step.state;
    }
    expect(points).toEqual([10, 10, 10, 10, 10, 20, 20]);
    expect(s.score).toBe(90);
  });
});

describe('a wrong answer', () => {
  it('scores nothing, resets the streak, shows the correct card and keeps the round going', () => {
    let s = newGame();
    s = right(right(s).state).state; // streak 2, score 20 + 20
    expect([s.score, s.streak]).toEqual([40, 2]);
    const card = s.card!;
    const step = wrong(s);
    expect(types(step.events)).toEqual(['wrong']);
    s = step.state;
    expect(s.phase).toBe('reveal');
    expect(s.score).toBe(40);
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(2);
    expect(s.wrong).toBe(1);
    expect(s.answered).toBe(3);
    expect(s.reveal).toMatchObject({ reason: 'wrong', guessIndex: (card.correctIndex + 1) % 4, leftMs: REVEAL_MS });
    expect(s.reveal!.card).toBe(card);
    expect(s.missed).toEqual({ [card.entryId]: 1 });
  });
  it('ignores answers while the reveal is showing', () => {
    const s = wrong(newGame()).state;
    expect(answer(s, s.reveal!.card.correctIndex).state).toBe(s);
  });
  it('moves on by itself after the reveal time, with the card clock reset to 6 s', () => {
    let s = wrong(newGame()).state;
    s = tick(s, REVEAL_MS - 1).state;
    expect(s.phase).toBe('reveal');
    const step = tick(s, 1);
    expect(step.state.phase).toBe('playing');
    expect(types(step.events)).toEqual(['card']);
    expect(step.state.cardLeftMs).toBe(6000);
    expect(step.state.card!.seq).toBe(2);
  });
  it('lets the player continue early, and ignores continue otherwise', () => {
    const playing = newGame();
    expect(continueRound(playing).state).toBe(playing);
    const step = continueRound(wrong(playing).state);
    expect(step.state.phase).toBe('playing');
    expect(step.state.card!.seq).toBe(2);
  });
  it('keeps the round clock running during the reveal', () => {
    let s = tick(newGame(), 1000).state;
    s = wrong(s).state;
    expect(s.roundLeftMs).toBe(59_000);
    s = tick(s, 1500).state;
    expect(s.roundLeftMs).toBe(57_500);
    expect(s.reveal!.leftMs).toBe(REVEAL_MS - 1500);
  });
});

describe('a timeout', () => {
  it('is a wrong answer with no guess when the card clock runs out', () => {
    let s = newGame();
    const card = s.card!;
    const step = tick(s, 6000);
    expect(types(step.events)).toEqual(['timeout']);
    s = step.state;
    expect(s.phase).toBe('reveal');
    expect(s.reveal).toMatchObject({ reason: 'timeout', guessIndex: null });
    expect(s).toMatchObject({ streak: 0, score: 0, timedOut: 1, wrong: 0, answered: 1 });
    expect(s.missed).toEqual({ [card.entryId]: 1 });
    expect(s.roundLeftMs).toBe(54_000);
  });
  it('uses the shortened clock after a streak', () => {
    let s = newGame();
    for (let i = 0; i < 10; i++) s = right(s).state;
    expect(s.cardLeftMs).toBe(3000);
    s = tick(s, 2999).state;
    expect(s.phase).toBe('playing');
    s = tick(s, 1).state;
    expect(s.phase).toBe('reveal');
  });
  it('carries leftover time through a timeout and the reveal in one big tick', () => {
    // 6000 (card) + 2200 (reveal) + 1000 into the next card.
    const step = tick(newGame(), 9200);
    expect(step.state.phase).toBe('playing');
    expect(step.state.card!.seq).toBe(2);
    expect(step.state.cardLeftMs).toBe(5000);
    expect(types(step.events)).toEqual(['timeout', 'card']);
    expect(step.state.roundLeftMs).toBe(50_800);
  });
});

describe('the end of a round', () => {
  it('ends the timed round at 60 s with the card on screen not counted', () => {
    let s = newGame();
    s = right(s).state;
    const step = tick(s, 60_000);
    expect(step.events.at(-1)?.type).toBe('finished');
    s = step.state;
    expect(s.phase).toBe('finished');
    expect(s.roundLeftMs).toBe(0);
    // Hand timeline after the right answer at t=0 (card 2 has 5700 ms, later cards 6000 ms, each reveal 2200 ms):
    // card 2 times out at 5700, card 3 at 13900, then 22100, 30300, 38500, 46700, 54900 (cards 2 to 8: seven
    // timeouts); card 9 starts at 57100 and is on screen when 60000 arrives, so it is not counted.
    expect(s.result).toMatchObject({ correct: 1, answered: 8, score: 20, wrong: 0, timedOut: 7 });
    expect(s.card!.seq).toBe(9);
    // Nothing moves after the end.
    expect(tick(s, 1000).state).toBe(s);
    expect(answer(s, 0).state).toBe(s);
    expect(continueRound(s).state).toBe(s);
  });
  it('can end during a reveal', () => {
    const s = wrong(tick(newGame(), 58_000).state).state;
    expect(s.roundLeftMs).toBe(2000);
    const step = tick(s, 2000);
    expect(step.state.phase).toBe('finished');
    // Seven timeouts (at 6000, 14200, ... 55200), card 8 shown from 57400, wrong at 58000 and still revealing at 60000.
    expect(step.state.result).toMatchObject({ wrong: 1, timedOut: 7, answered: 8, correct: 0 });
  });
  it('ends an untimed round after the set number of cards, including a wrong last one after it is shown', () => {
    let s = newGame({ untimed: true, untimedCards: 3 });
    s = right(s).state;
    s = right(s).state;
    const step = wrong(s);
    expect(step.state.phase).toBe('reveal');
    const done = continueRound(step.state);
    expect(done.state.phase).toBe('finished');
    expect(done.state.result).toMatchObject({ answered: 3, correct: 2, wrong: 1 });
    const viaCorrect = right(right(right(newGame({ untimed: true, untimedCards: 3 })).state).state);
    expect(viaCorrect.state.phase).toBe('finished');
    expect(types(viaCorrect.events)).toEqual(['correct', 'finished']);
  });
});

describe('untimed mode', () => {
  it('never times out and waits in the reveal until the player continues', () => {
    let s = newGame({ untimed: true });
    s = tick(s, 3_600_000).state;
    expect(s.phase).toBe('playing');
    expect(s.cardLeftMs).toBeNull();
    s = wrong(s).state;
    expect(s.reveal!.leftMs).toBeNull();
    s = tick(s, 3_600_000).state;
    expect(s.phase).toBe('reveal');
    expect(continueRound(s).state.phase).toBe('playing');
  });
  it('plays a hand-counted round: right, right, wrong, then four rights', () => {
    let s = newGame({ untimed: true, untimedCards: 7 });
    s = right(right(s).state).state;
    s = continueRound(wrong(s).state).state;
    for (let i = 0; i < 4; i++) s = right(s).state;
    expect(s.phase).toBe('finished');
    // Streaks 1, 2, reset, 1, 2, 3, 4: all x1, 10 each, six rights.
    expect(s.result).toMatchObject({ score: 60, correct: 6, wrong: 1, timedOut: 0, answered: 7, bestStreak: 4 });
    expect(s.result!.accuracy).toBeCloseTo(6 / 7, 10);
    expect(s.result!.untimed).toBe(true);
  });
});

describe('what counts as quick', () => {
  const lastFast = (s: GameState, id: string) => s.sched.entries[id].lastFast;
  it('is half the card clock or more left (timed)', () => {
    let s = newGame();
    let id = s.card!.entryId;
    s = right(tick(s, 3000).state).state; // exactly half left
    expect(lastFast(s, id)).toBe(true);
    s = newGame();
    id = s.card!.entryId;
    s = right(tick(s, 3001).state).state;
    expect(lastFast(s, id)).toBe(false);
  });
  it('is within 3 s of the card appearing (untimed)', () => {
    let s = newGame({ untimed: true });
    let id = s.card!.entryId;
    expect(lastFast(right(tick(s, 3000).state).state, id)).toBe(true);
    s = newGame({ untimed: true });
    id = s.card!.entryId;
    expect(lastFast(right(tick(s, 3001).state).state, id)).toBe(false);
  });
});

describe('spaced repetition inside a round', () => {
  it('brings a wrong card back after 3 to 5 other cards, then once more, then not as a due card', () => {
    for (let seed = 1; seed <= 60; seed++) {
      let s = newGame({ untimed: true, untimedCards: 60 }, seed);
      const target = s.card!.entryId;
      const seen: string[] = [];
      s = continueRound(wrong(s).state).state;
      for (let i = 0; i < 40; i++) {
        seen.push(s.card!.entryId);
        const isTarget = s.card!.entryId === target;
        // Right on the first return, wrong never again.
        s = right(s).state;
        if (isTarget && seen.filter((x) => x === target).length >= 2) break;
      }
      const returns = seen.map((id, i) => (id === target ? i : -1)).filter((i) => i >= 0);
      expect(returns.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      expect(returns[0]).toBeGreaterThanOrEqual(3); // 3 to 5 others in between
      expect(returns[0]).toBeLessThanOrEqual(5);
      expect(returns[1] - returns[0] - 1).toBeGreaterThanOrEqual(6); // then 6 to 9 others
      expect(returns[1] - returns[0] - 1).toBeLessThanOrEqual(9);
    }
  });
});

describe('the result', () => {
  it('lists the missed entries, most missed first, ties in the order first missed', () => {
    let s = newGame({ untimed: true, untimedCards: 60 }, 3);
    const order: string[] = [];
    // Miss the first three distinct cards once each, then miss the first one again when it returns.
    const miss = (st: GameState) => {
      order.push(st.card!.entryId);
      return continueRound(wrong(st).state).state;
    };
    s = miss(s);
    s = miss(s);
    s = miss(s);
    let guard = 0;
    while (s.card!.entryId !== order[0] && guard++ < 20) s = right(s).state;
    s = miss(s);
    const result = buildResult(s);
    expect(result.missed[0]).toEqual({ entryId: order[0], count: 2 });
    expect(result.missed.slice(1).map((m) => m.entryId)).toEqual([order[1], order[2]]);
    expect(result.missed.slice(1).every((m) => m.count === 1)).toBe(true);
    expect(result.wrong).toBe(4);
  });
  it('has accuracy 0 when nothing was answered', () => {
    expect(buildResult(newGame()).accuracy).toBe(0);
  });
});

describe('purity and replay', () => {
  it('never changes the state it is given', () => {
    const s = newGame();
    const before = { score: s.score, phase: s.phase, left: s.cardLeftMs, card: s.card, streak: s.streak };
    tick(s, 3000);
    right(s);
    wrong(s);
    continueRound(s);
    expect({ score: s.score, phase: s.phase, left: s.cardLeftMs, card: s.card, streak: s.streak }).toEqual(before);
  });
  it('plays the same game from the same seed and the same moves', () => {
    const run = () => {
      let s = newGame({}, 11);
      const log: unknown[] = [];
      for (let i = 0; i < 30; i++) {
        s = tick(s, 700).state;
        const step = i % 4 === 3 ? wrong(s) : right(s);
        log.push(step.events);
        s = step.state;
        if (s.phase === 'reveal') s = continueRound(s).state;
      }
      return log;
    };
    expect(run()).toEqual(run());
  });
  it('ignores bad answer indexes', () => {
    const s = newGame();
    for (const i of [-1, 4, 1.5, NaN]) expect(answer(s, i).state).toBe(s);
  });
  it('ignores zero and negative time', () => {
    const s = newGame();
    expect(tick(s, 0).state).toBe(s);
    expect(tick(s, -5).state).toBe(s);
  });
});

describe('with the real glossary', () => {
  const real = realBank();
  it('mixes card types in a round and never repeats the same card back to back', () => {
    const deck = real.decks.find((d) => d.id === 'italian')!;
    let s = createGame({ poolIds: deck.entryIds, untimed: true, untimedCards: 40 }, real.bank, createRng(4));
    const seen = new Set<string>();
    let last = '';
    for (let i = 0; i < 40; i++) {
      seen.add(s.card!.type);
      expect(s.card!.entryId).not.toBe(last);
      last = s.card!.entryId;
      s = right(s).state;
    }
    expect(seen.size).toBe(3);
  });
  it('plays a whole timed round of every deck without ever failing to deal a card', () => {
    for (const deck of real.decks) {
      let s = createGame({ poolIds: deck.entryIds }, real.bank, createRng(9));
      for (let i = 0; i < 400 && s.phase !== 'finished'; i++) {
        s = i % 3 === 2 ? wrong(s).state : right(s).state;
        s = tick(s, 400).state;
        expect(s.phase === 'finished' || s.card !== null).toBe(true);
      }
      expect(s.phase, deck.name).toBe('finished');
    }
  });
});
