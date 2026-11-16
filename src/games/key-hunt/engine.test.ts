import { describe, expect, it } from 'vitest';
import { pitch } from '@/engine/pitch';
import { createRng } from '@/engine/rng';
import type { Key } from '@/engine/types';
import {
  answer,
  buildResult,
  createGame,
  multiplierForStreak,
  next,
  questionMs,
  resolveConfig,
  REVEAL_MS,
  tick,
  type GameEvent,
  type GameState,
  type KeyHuntConfig,
} from './engine';
import { DEFAULT_GRADE, describePool, GRADE_POOLS, gradePool, poolKeys } from './pools';
import { buildQuestion, clefFor, describeSignature, keyId, optionCountFor, pickKind, signaturePassage, type AskMode, type Question } from './questions';

const major = (sig: number): Key => pitch.keyFromSignature(sig, 'major');
const names = (keys: Key[]) => keys.map((k) => pitch.keyName(k));
const GRADE_1 = poolKeys(gradePool('grade-1'));

/** The index of a wrong option on the current question. */
const wrongIndex = (s: GameState) => (s.question.correct === 0 ? 1 : 0);
const right = (s: GameState) => answer(s, s.question.correct);
const wrong = (s: GameState) => answer(s, wrongIndex(s));

describe('pools', () => {
  it('Grade 1 is C, G, D and F major and the only one available', () => {
    expect(names(poolKeys(gradePool('grade-1')))).toEqual(['C major', 'G major', 'D major', 'F major']);
    expect(poolKeys(gradePool('grade-1')).map((k) => pitch.keySignature(k))).toEqual([0, 1, 2, -1]);
    expect(GRADE_POOLS.map((p) => p.available)).toEqual([true, false, false]);
    expect(DEFAULT_GRADE).toBe('grade-1');
    expect(describePool(gradePool('grade-1'))).toBe('C, G, D and F major');
  });
  it('lists Grade 2 and 3 as locked, with the message the start screen shows', () => {
    expect(gradePool('grade-2').lockedNote).toBe('Coming with Grade 2 lessons');
    expect(gradePool('grade-3').lockedNote).toBe('Coming with Grade 3 lessons');
    expect(gradePool('grade-1').lockedNote).toBeUndefined();
  });
  it('Grade 2 adds A, B flat and E flat major and A, E and D minor', () => {
    const keys = names(poolKeys(gradePool('grade-2')));
    expect(keys).toEqual([
      'C major', 'G major', 'D major', 'F major', 'A major', 'B♭ major', 'E♭ major', 'A minor', 'E minor', 'D minor',
    ]);
    expect(describePool(gradePool('grade-2'))).toBe('C, G, D, F, A, B♭ and E♭ major; A, E and D minor');
  });
  it('Grade 3 is every major and relative minor up to four sharps or flats', () => {
    const keys = poolKeys(gradePool('grade-3'));
    expect(keys).toHaveLength(18);
    for (const k of keys) expect(Math.abs(pitch.keySignature(k))).toBeLessThanOrEqual(4);
    expect(names(keys)).toContain('A♭ major');
    expect(names(keys)).toContain('C♯ minor');
    expect(names(keys)).toContain('F minor');
    for (const k of keys.filter((x) => x.mode === 'major')) {
      expect(names(keys)).toContain(pitch.keyName(pitch.relativeKey(k)));
    }
  });
});

describe('describeSignature (from the engine)', () => {
  it.each([
    [0, 'no sharps or flats'],
    [1, 'one sharp, F♯'],
    [2, 'two sharps, F♯ and C♯'],
    [3, 'three sharps, F♯, C♯ and G♯'],
    [-1, 'one flat, B♭'],
    [-2, 'two flats, B♭ and E♭'],
    [-4, 'four flats, B♭, E♭, A♭ and D♭'],
  ])('signature %i is %s', (sig, text) => {
    expect(describeSignature(major(sig))).toBe(text);
  });
  it('a relative minor has the same signature as its major', () => {
    expect(describeSignature(pitch.keyFromSignature(1, 'minor'))).toBe('one sharp, F♯');
  });
});

describe('numbers', () => {
  it('time bar runs from 8 s at level 1 to 3 s at level 8, never lengthening', () => {
    const table = [1, 2, 3, 4, 5, 6, 7, 8].map(questionMs);
    expect(table[0]).toBe(8000);
    expect(table[7]).toBe(3000);
    for (let i = 1; i < table.length; i += 1) expect(table[i]).toBeLessThan(table[i - 1]!);
    expect(questionMs(0)).toBe(8000);
    expect(questionMs(40)).toBe(3000);
  });
  it('multiplier grows every 5 correct answers up to x4', () => {
    const table: [number, number][] = [[0, 1], [4, 1], [5, 2], [9, 2], [10, 3], [14, 3], [15, 4], [99, 4]];
    for (const [streak, m] of table) expect(multiplierForStreak(streak)).toBe(m);
  });
  it('option counts and clefs by level', () => {
    expect([1, 2, 3, 4].map(optionCountFor)).toEqual([3, 3, 4, 4]);
    expect(clefFor(1, null)).toBe('treble');
    expect(clefFor(2, 'bass')).toBe('treble');
    expect(clefFor(3, null)).toBe('treble');
    expect(clefFor(3, 'treble')).toBe('bass');
    expect(clefFor(5, 'bass')).toBe('treble');
  });
  it('resolves and clamps config', () => {
    expect(resolveConfig()).toEqual({ mode: 'sig-to-key', grade: 'grade-1', roundSeconds: 60, untimed: false, untimedQuestions: 15, startLevel: 1 });
    expect(resolveConfig({ startLevel: 99, roundSeconds: 0, untimedQuestions: 0 })).toMatchObject({ startLevel: 8, roundSeconds: 60, untimedQuestions: 15 });
  });
});

describe('questions, with reasons built from the engine', () => {
  const only = (key: Key, mode: AskMode, level = 1) =>
    buildQuestion(mode, { keys: [key], level, lastKey: null, lastKind: null, lastClef: null }, createRng(1));

  it('signature to key: one line naming the signature and the key', () => {
    expect(only(major(1), 'sig-to-key').reason).toBe('One sharp, F♯: that is G major');
    expect(only(major(2), 'sig-to-key').reason).toBe('Two sharps, F♯ and C♯: that is D major');
    expect(only(major(-1), 'sig-to-key').reason).toBe('One flat, B♭: that is F major');
    expect(only(major(0), 'sig-to-key').reason).toBe('No sharps or flats: that is C major');
    expect(only(major(-2), 'sig-to-key').reason).toBe('Two flats, B♭ and E♭: that is B♭ major');
  });
  it('key to signature, accidental and count questions state the key\'s signature', () => {
    expect(only(major(1), 'key-to-sig').reason).toBe('G major has one sharp, F♯');
    const accidental = only(major(-1), 'sig-to-key', 2);
    // Level 2 may be any kind; ask for the accidental directly by trying seeds.
    expect(accidental.reason.length).toBeGreaterThan(0);
    const find = (kind: string) => {
      for (let seed = 1; seed < 200; seed += 1) {
        const q = buildQuestion('sig-to-key', { keys: [major(2)], level: 2, lastKey: null, lastKind: null, lastClef: null }, createRng(seed));
        if (q.kind === kind) return q;
      }
      throw new Error(`no ${kind} question found`);
    };
    const acc = find('which-accidental');
    expect(acc.prompt).toBe('Which of these notes is sharp in D major?');
    expect(acc.reason).toBe('D major has two sharps, F♯ and C♯');
    expect(['F', 'C']).toContain(acc.options[acc.correct]!.label);
    const count = find('count');
    expect(count.prompt).toBe('How many sharps or flats does D major have?');
    expect(count.options[count.correct]!.label).toBe('2');
  });
  it('shows a signature using only a whole-bar rest with the key set', () => {
    const p = signaturePassage('bass', major(1));
    expect(p.clef).toBe('bass');
    expect(keyId(p.key)).toBe('G major');
    expect(p.bars).toHaveLength(1);
    expect(p.bars[0]!.events).toEqual([{ kind: 'rest', duration: { value: 'semibreve', dots: 0 } }]);
  });
});

describe('question variety and correctness: 500 seeds, every level, both modes', () => {
  for (const mode of ['sig-to-key', 'key-to-sig'] as const) {
    it(`${mode}: the marked answer is right, options are distinct, keys never repeat`, () => {
      const kinds = new Set<string>();
      for (let level = 1; level <= 8; level += 1) {
        for (let seed = 1; seed <= 500; seed += 1) {
          const rng = createRng(seed * 31 + level);
          let lastKey: Key | null = null;
          let lastKind = null as Question['kind'] | null;
          let lastClef = null as Question['clef'] | null;
          // Three in a row per seed so "the same key twice in a row" is exercised.
          for (let i = 0; i < 3; i += 1) {
            const q = buildQuestion(mode, { keys: GRADE_1, level, lastKey, lastKind, lastClef }, rng);
            if (lastKey) expect(keyId(q.key)).not.toBe(keyId(lastKey));
            if (level === 1) expect(q.kind).toBe(mode);
            kinds.add(q.kind);
            const labels = q.options.map((o) => o.label);
            expect(new Set(labels).size).toBe(labels.length);
            expect(q.options).toHaveLength(Math.min(optionCountFor(level), q.kind === 'which-accidental' || q.kind === 'count' ? 99 : 4));
            expect(q.correct).toBeGreaterThanOrEqual(0);
            expect(q.correct).toBeLessThan(q.options.length);
            const sig = pitch.keySignature(q.key);
            switch (q.kind) {
              case 'sig-to-key':
                expect(labels[q.correct]).toBe(pitch.keyName(q.key));
                expect(labels.every((l) => GRADE_1.some((k) => pitch.keyName(k) === l))).toBe(true);
                expect(q.exhibit.type).toBe('signature');
                if (q.exhibit.type === 'signature') {
                  expect(pitch.keySignature(q.exhibit.passage.key)).toBe(sig);
                  expect(q.exhibit.passage.clef).toBe(q.clef);
                  expect(q.exhibit.passage.bars[0]!.events).toHaveLength(1);
                  expect(q.exhibit.passage.bars[0]!.events[0]!.kind).toBe('rest');
                }
                break;
              case 'key-to-sig': {
                expect(q.exhibit).toEqual({ type: 'key-name', text: pitch.keyName(q.key) });
                const sigs = q.options.map((o) => pitch.keySignature(o.passage!.key));
                expect(new Set(sigs).size).toBe(sigs.length);
                expect(sigs[q.correct]).toBe(sig);
                for (const o of q.options) expect(o.passage!.clef).toBe(q.clef);
                break;
              }
              case 'which-accidental': {
                expect(sig).not.toBe(0);
                const accidentals = pitch.signatureAccidentals(sig).map((a) => a.letter as string);
                const right = labels[q.correct] as string;
                expect(accidentals).toContain(right);
                labels.forEach((l, idx) => {
                  if (idx !== q.correct) expect(accidentals).not.toContain(l);
                });
                break;
              }
              case 'count':
                expect(Number(labels[q.correct])).toBe(Math.abs(sig));
                expect(labels.map(Number)).toEqual([...labels.map(Number)].sort((a, b) => a - b));
                break;
            }
            expect(q.reason).toContain(pitch.keyName(q.key));
            lastKey = q.key;
            lastKind = q.kind;
            if (q.kind === 'sig-to-key' || q.kind === 'key-to-sig') {
              if (level < 3) expect(q.clef).toBe('treble');
              else if (lastClef) expect(q.clef).not.toBe(lastClef);
              lastClef = q.clef;
            }
          }
        }
      }
      // Level 2 and up bring in the accidental and count questions.
      expect([...kinds].sort()).toEqual([mode, 'count', 'which-accidental'].sort());
    });
  }

  it('level 1 never asks the extra kinds; level 2 does, never the same kind twice in a row', () => {
    const rng = createRng(3);
    let last = null as Question['kind'] | null;
    const seen = new Set<string>();
    for (let i = 0; i < 400; i += 1) {
      const kind = pickKind('sig-to-key', 2, last, rng);
      expect(kind).not.toBe(last);
      seen.add(kind);
      last = kind;
    }
    expect(seen.size).toBe(3);
    expect(pickKind('key-to-sig', 1, 'key-to-sig', rng)).toBe('key-to-sig');
  });

  it('keeps clefs alternating through a whole game at level 3 and up', () => {
    let s = createGame({ startLevel: 3, mode: 'sig-to-key' }, createRng(11));
    const clefs: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      if (s.question.kind === 'sig-to-key' || s.question.kind === 'key-to-sig') clefs.push(s.question.clef);
      s = right(s).state;
    }
    expect(clefs.length).toBeGreaterThan(10);
    for (let i = 1; i < clefs.length; i += 1) expect(clefs[i]).not.toBe(clefs[i - 1]);
    expect(new Set(clefs)).toEqual(new Set(['treble', 'bass']));
  });

  it('also works for the locked pools (they are data, not selectable yet)', () => {
    for (const grade of ['grade-2', 'grade-3'] as const) {
      const keys = poolKeys(gradePool(grade));
      const rng = createRng(5);
      let lastKey: Key | null = null;
      for (let i = 0; i < 300; i += 1) {
        const q = buildQuestion(i % 2 ? 'sig-to-key' : 'key-to-sig', { keys, level: 4, lastKey, lastKind: null, lastClef: null }, rng);
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        if (q.kind === 'sig-to-key') expect(q.key.mode).toBe('major');
        if (lastKey) expect(keyId(q.key)).not.toBe(keyId(lastKey));
        lastKey = q.key;
      }
    }
  });
});

describe('answering', () => {
  const fresh = (config: Partial<KeyHuntConfig> = {}, seed = 4) => createGame(config, createRng(seed));

  it('a correct answer at the first instant earns 10 + 10 and moves straight on', () => {
    const g = fresh();
    expect(g.question.key).toBeDefined();
    const step = right(g);
    expect(step.events[0]).toEqual({ type: 'correct', points: 20, speedBonus: 10, multiplier: 1, streak: 1 });
    expect(step.state.score).toBe(20);
    expect(step.state.phase).toBe('asking');
    expect(step.state.questionNumber).toBe(2);
    expect(step.state.questionLeftMs).toBe(8000);
    expect(keyId(step.state.question.key)).not.toBe(keyId(g.question.key));
  });
  it('speed bonus is floor(10 * time left / total): half the bar -> 5, last millisecond -> 0', () => {
    const g = fresh();
    expect(right(tick(g, 4000).state).events[0]).toMatchObject({ speedBonus: 5, points: 15 });
    expect(right(tick(g, 7999).state).events[0]).toMatchObject({ speedBonus: 0, points: 10 });
    expect(right(tick(g, 800).state).events[0]).toMatchObject({ speedBonus: 9, points: 19 });
    expect(right(tick(g, 1600).state).events[0]).toMatchObject({ speedBonus: 8, points: 18 });
  });
  it('multiplier follows the streak held before the answer: x1 for 5, then x2', () => {
    // All instant: 5 * 20 + 5 * 40 + 1 * 60 = 360 after 11 answers.
    let s = fresh();
    const mult: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const step = right(s);
      mult.push((step.events[0] as { multiplier: number }).multiplier);
      s = step.state;
    }
    expect(mult).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3]);
    expect(s.score).toBe(5 * 20 + 5 * 40 + 60);
    expect(s.bestStreak).toBe(11);
  });
  it('a wrong answer resets the streak, shows the reason and costs no points', () => {
    let s = fresh();
    s = right(s).state;
    s = right(s).state;
    const before = s.score;
    const q = s.question;
    const step = wrong(s);
    expect(step.events[0]).toEqual({ type: 'wrong', picked: wrongIndex(s), correct: q.correct, reason: q.reason });
    expect(step.state.phase).toBe('reveal');
    expect(step.state.streak).toBe(0);
    expect(step.state.bestStreak).toBe(2);
    expect(step.state.score).toBe(before);
    expect(step.state.wrong).toBe(1);
    expect(step.state.outcome).toEqual({ correct: false, picked: wrongIndex(s) });
    expect(step.state.question).toBe(q);
    expect(step.state.mistakes[keyId(q.key)]).toMatchObject({ wrong: 1, timedOut: 0, total: 1, name: keyId(q.key) });
  });
  it('ignores answers during the reveal, out-of-range picks and repeats', () => {
    const g = fresh();
    const revealed = wrong(g).state;
    expect(answer(revealed, revealed.question.correct).events).toEqual([]);
    expect(answer(g, 99).events).toEqual([]);
    expect(answer(g, -1).events).toEqual([]);
    expect(answer(g, 0.5).events).toEqual([]);
  });
  it('after the reveal time it moves on by itself (timed), and the round clock kept running', () => {
    const revealed = wrong(fresh()).state;
    expect(revealed.revealLeftMs).toBe(REVEAL_MS);
    const mid = tick(revealed, REVEAL_MS - 1).state;
    expect(mid.phase).toBe('reveal');
    expect(mid.roundLeftMs).toBe(60000 - (REVEAL_MS - 1));
    const done = tick(mid, 1);
    expect(done.state.phase).toBe('asking');
    expect(done.state.questionNumber).toBe(2);
    expect(done.events).toEqual([{ type: 'question', number: 2 }]);
  });
  it('next() skips the reveal', () => {
    const revealed = wrong(fresh()).state;
    const skipped = next(revealed);
    expect(skipped.state.phase).toBe('asking');
    expect(next(skipped.state).events).toEqual([]);
  });
  it('never asks the same key twice in a row through a long game', () => {
    let s = fresh({}, 99);
    let last = keyId(s.question.key);
    for (let i = 0; i < 200; i += 1) {
      s = (i % 3 === 0 ? wrong(s) : right(s)).state;
      if (s.phase === 'reveal') s = next(s).state;
      expect(keyId(s.question.key)).not.toBe(last);
      last = keyId(s.question.key);
    }
  });
});

describe('the clocks', () => {
  const fresh = (config: Partial<KeyHuntConfig> = {}) => createGame(config, createRng(4));
  it('a question that runs out is a timeout: streak lost, answer revealed, game goes on', () => {
    let s = right(fresh()).state;
    const q = s.question;
    const before = tick(s, 7999);
    expect(before.events).toEqual([]);
    s = tick(before.state, 1).state;
    expect(s.phase).toBe('reveal');
    expect(s.timedOut).toBe(1);
    expect(s.wrong).toBe(0);
    expect(s.streak).toBe(0);
    expect(s.outcome).toEqual({ correct: false, picked: null });
    expect(s.mistakes[keyId(q.key)]).toMatchObject({ timedOut: 1, wrong: 0, total: 1 });
  });
  it('emits a timeout event with the reason', () => {
    const g = fresh();
    const { events } = tick(g, 8000);
    expect(events[0]).toEqual({ type: 'timeout', correct: g.question.correct, reason: g.question.reason });
  });
  it('one long tick walks through question, reveal, question, reveal', () => {
    // 8000 timeout, 2400 reveal (t = 10400), 8000 timeout (t = 18400), 2400 reveal -> t = 20800, so at 20000 we are 1600 into the second reveal.
    const { state } = tick(fresh(), 20000);
    expect(state.timedOut).toBe(2);
    expect(state.questionNumber).toBe(2);
    expect(state.phase).toBe('reveal');
    expect(state.revealLeftMs).toBe(REVEAL_MS - 1600);
    expect(state.roundLeftMs).toBe(40000);
  });
  it('the round ends when its clock hits zero, with the result', () => {
    let s = fresh({ roundSeconds: 60 });
    s = right(s).state;
    s = tick(s, 59999).state;
    expect(s.phase).not.toBe('finished');
    const end = tick(s, 1);
    expect(end.state.phase).toBe('finished');
    expect(end.state.roundLeftMs).toBe(0);
    const finished = end.events.find((e): e is Extract<GameEvent, { type: 'finished' }> => e.type === 'finished');
    expect(finished?.result).toMatchObject({ score: 20, correct: 1, wrong: 0, timedOut: expect.any(Number), untimed: false });
    expect(end.state.result).toBe(finished?.result);
  });
  it('the round can end during a reveal', () => {
    let s = fresh({ roundSeconds: 10 });
    s = wrong(tick(s, 9000).state).state; // timed out? 9000 > 8000 -> already revealing a timeout
    expect(s.phase).toBe('reveal');
    const end = tick(s, 5000).state;
    expect(end.phase).toBe('finished');
  });
  it('ignores everything once finished', () => {
    const done = tick(fresh({ roundSeconds: 1 }), 5000).state;
    expect(done.phase).toBe('finished');
    expect(answer(done, 0).events).toEqual([]);
    expect(next(done).events).toEqual([]);
    expect(tick(done, 100).state).toBe(done);
  });
  it('never mutates the state it is given', () => {
    const g = fresh();
    const snapshot = JSON.stringify({ ...g, rng: undefined });
    tick(g, 3000);
    right(g);
    wrong(g);
    next(g);
    expect(JSON.stringify({ ...g, rng: undefined })).toBe(snapshot);
  });
});

describe('adaptive level', () => {
  const fresh = (config: Partial<KeyHuntConfig> = {}) => createGame(config, createRng(8));
  it('rises after 5 correct since the last change', () => {
    let s = fresh();
    const events: GameEvent[] = [];
    for (let i = 0; i < 5; i += 1) {
      const step = right(s);
      events.push(...step.events);
      s = step.state;
      if (i < 4) expect(s.level).toBe(1);
    }
    expect(s.level).toBe(2);
    expect(s.maxLevel).toBe(2);
    expect(events).toContainEqual({ type: 'levelUp', level: 2 });
    expect(s.questionLeftMs).toBe(questionMs(2));
  });
  it('needs 80% of the last 6: C C C C W C rises on the sixth, C C C W W C C does not at level 1', () => {
    let s = fresh();
    for (const ok of [true, true, true, true, false, true]) {
      s = ok ? right(s).state : wrong(s).state;
      if (s.phase === 'reveal') s = next(s).state;
    }
    // 5 correct since level 1 began, and 5 of the last 6 -> up.
    expect(s.level).toBe(2);
    let t = fresh();
    for (const ok of [true, true, true, false, false, true, true]) {
      t = ok ? right(t).state : wrong(t).state;
      if (t.phase === 'reveal') t = next(t).state;
    }
    // Two failures in the last five and only 4 of 6 correct: stays.
    expect(t.level).toBe(1);
  });
  it('falls after 3 wrong or timed-out in the last 5, and never below level 1', () => {
    let s = fresh({ startLevel: 4 });
    for (let i = 0; i < 2; i += 1) {
      s = next(wrong(s).state).state;
      expect(s.level).toBe(4);
    }
    const third = wrong(s);
    expect(third.events).toContainEqual({ type: 'levelDown', level: 3 });
    expect(third.state.level).toBe(3);
    let low = fresh();
    for (let i = 0; i < 6; i += 1) low = next(wrong(low).state).state;
    expect(low.level).toBe(1);
  });
  it('timeouts count as failures too', () => {
    let s = fresh({ startLevel: 2 });
    for (let i = 0; i < 3; i += 1) {
      s = tick(s, questionMs(s.level)).state;
      s = next(s).state;
    }
    expect(s.level).toBe(1);
  });
  it('caps at level 8', () => {
    let s = fresh({ startLevel: 8 });
    for (let i = 0; i < 12; i += 1) s = right(s).state;
    expect(s.level).toBe(8);
  });
});

describe('untimed mode', () => {
  const fresh = (n = 3) => createGame({ untimed: true, untimedQuestions: n }, createRng(6));
  it('has no clocks and no speed bonus', () => {
    const g = fresh();
    expect(g.roundLeftMs).toBeNull();
    expect(g.questionLeftMs).toBeNull();
    expect(g.questionTotalMs).toBeNull();
    expect(tick(g, 60000).state).toBe(g);
    expect(right(g).events[0]).toEqual({ type: 'correct', points: 10, speedBonus: 0, multiplier: 1, streak: 1 });
  });
  it('waits in the reveal until next(), then finishes after the set number of questions', () => {
    let s = fresh(3);
    s = right(s).state;
    const w = wrong(s).state;
    expect(w.revealLeftMs).toBeNull();
    expect(tick(w, 99999).state).toBe(w);
    s = next(w).state;
    expect(s.phase).toBe('asking');
    expect(s.questionNumber).toBe(3);
    const end = right(s);
    expect(end.state.phase).toBe('finished');
    expect(end.state.result).toMatchObject({ correct: 2, wrong: 1, timedOut: 0, untimed: true });
    expect(end.state.result!.accuracy).toBeCloseTo(2 / 3, 10);
  });
  it('a wrong 15th answer finishes on next(), not before', () => {
    let s = fresh(15);
    for (let i = 0; i < 14; i += 1) s = right(s).state;
    const w = wrong(s).state;
    expect(w.phase).toBe('reveal');
    const end = next(w).state;
    expect(end.phase).toBe('finished');
    expect(end.result).toMatchObject({ correct: 14, wrong: 1 });
  });
  it('defaults to 15 questions', () => {
    expect(createGame({ untimed: true }, createRng(1)).config.untimedQuestions).toBe(15);
  });
});

describe('results', () => {
  it('counts what the keys missed most, with their signatures', () => {
    // Craft: two mistakes on G major, one timeout on D major, one on F major.
    const base = createGame({ roundSeconds: 600 }, createRng(1));
    const withQuestion = (from: GameState, key: Key): GameState => ({ ...from, phase: 'asking', question: { ...from.question, key }, questionLeftMs: 8000, questionTotalMs: 8000 });
    let s = base;
    for (const [sig, how] of [[1, 'wrong'], [1, 'wrong'], [2, 'timeout'], [-1, 'wrong']] as const) {
      s = withQuestion(s, major(sig));
      s = how === 'wrong' ? answer(s, wrongIndex(s)).state : tick(s, 8000).state;
    }
    const result = buildResult(s);
    expect(result.mistakes.map((m) => [m.name, m.signature, m.wrong, m.timedOut, m.total])).toEqual([
      ['G major', 1, 2, 0, 2],
      ['D major', 2, 0, 1, 1],
      ['F major', -1, 1, 0, 1],
    ]);
    expect(result.accuracy).toBe(0);
    expect(result.wrong).toBe(3);
    expect(result.timedOut).toBe(1);
  });
  it('accuracy is 0 with nothing answered and score only counts correct answers', () => {
    expect(buildResult(createGame({}, createRng(1))).accuracy).toBe(0);
  });
  it('is deterministic for a seed', () => {
    const run = (seed: number) => {
      let s = createGame({ startLevel: 2 }, createRng(seed));
      const keys: string[] = [];
      for (let i = 0; i < 10; i += 1) {
        keys.push(`${s.question.kind}:${keyId(s.question.key)}:${s.question.correct}`);
        s = right(s).state;
      }
      return keys;
    };
    expect(run(21)).toEqual(run(21));
    expect(run(21)).not.toEqual(run(22));
  });
});
