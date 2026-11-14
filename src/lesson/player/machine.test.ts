import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import type { LessonProgress, MarkResult } from '../contracts';
import {
  createInitialState,
  deriveSeed,
  isExploreDone,
  progressFraction,
  reduce,
  toProgress,
  type Action,
  type MachineContext,
  type MachineState,
} from './machine';
import { authored, buildLesson, fixtureGenerators, generated } from './test-fixtures';

const RIGHT: MarkResult = { correct: true, score: 1 };
const WRONG: MarkResult = { correct: false, score: 0, reason: 'No.' };

function ctxOf(o: Parameters<typeof buildLesson>[0] = {}, extra: Partial<MachineContext> = {}): MachineContext {
  return { lesson: buildLesson(o), generators: fixtureGenerators, terminology: 'uk', ...extra };
}

class Run {
  state: MachineState;
  t = 1_000_000;
  constructor(public ctx: MachineContext, init: Parameters<typeof createInitialState>[1] = {}) {
    this.state = createInitialState(ctx, { now: this.t, ...init });
  }
  do(a: Action | { type: 'SHOW_ALTERNATIVE' } | { type: 'EXPLORE_INTERACTED' }) {
    this.state = reduce(this.state, a as Action, this.ctx);
    return this;
  }
  cont(dt = 0) {
    this.t += dt;
    return this.do({ type: 'CONTINUE', now: this.t });
  }
  back() {
    return this.do({ type: 'BACK', now: this.t });
  }
  answer(r: MarkResult, dt = 100) {
    this.t += dt;
    return this.do({ type: 'ANSWER', result: r, now: this.t });
  }
  skip() {
    return this.do({ type: 'SKIP', now: this.t });
  }
  tick(dt: number) {
    this.t += dt;
    return this.do({ type: 'TICK', now: this.t });
  }
  start(timed = true) {
    return this.do({ type: 'START_CHALLENGE', now: this.t, timed });
  }
  /** Hook -> explore -> name -> practice question 0. */
  toPractice() {
    this.cont().do({ type: 'EXPLORE_INTERACTED' }).cont();
    while (this.state.step === 'name') this.cont();
    return this;
  }
  /** Through practice, all right. */
  throughPractice() {
    this.toPractice();
    while (this.state.step === 'practice') this.answer(RIGHT).cont();
    return this;
  }
  get c() {
    return this.state.challenge;
  }
  get p() {
    return this.state.practice!;
  }
}

describe('deriveSeed', () => {
  it('is deterministic, an unsigned 32-bit integer, and depends on every part', () => {
    const a = deriveSeed('lesson', 'q1', 0);
    expect(deriveSeed('lesson', 'q1', 0)).toBe(a);
    expect(Number.isInteger(a) && a >= 0 && a <= 0xffffffff).toBe(true);
    expect(deriveSeed('lesson2', 'q1', 0)).not.toBe(a);
    expect(deriveSeed('lesson', 'q2', 0)).not.toBe(a);
    expect(deriveSeed('lesson', 'q1', 1)).not.toBe(a);
  });
  it('is accepted by createRng', () => {
    expect(() => createRng(deriveSeed('l', 'q', 3))).not.toThrow();
  });
});

describe('initial state', () => {
  it('starts at the hook with nothing recorded', () => {
    const s = createInitialState(ctxOf());
    expect(s.step).toBe('hook');
    expect(s.practice).toBeNull();
    expect(s.challenge.phase).toBe('intro');
    expect(s.completed).toBe(false);
    expect(s.bestScore).toBeNull();
    expect(s.events).toEqual([]);
    expect(s.nameCount).toBe(2);
  });
  it('needs interaction in explore, except a stave step with no exhibit', () => {
    expect(createInitialState(ctxOf()).exploreNeedsInteraction).toBe(true);
    expect(createInitialState(ctxOf({ instrument: 'stave', exploreExhibit: null })).exploreNeedsInteraction).toBe(true);
    const lesson = buildLesson({ instrument: 'stave' });
    const noExhibit = { ...lesson, steps: { ...lesson.steps, explore: { ...lesson.steps.explore, exhibit: undefined } } };
    const s = createInitialState({ lesson: noExhibit, generators: {}, terminology: 'uk' });
    expect(s.exploreNeedsInteraction).toBe(false);
    expect(isExploreDone(s)).toBe(true);
  });
});

describe('hook, explore and name navigation', () => {
  it('walks hook -> explore -> name -> practice, gated by interaction', () => {
    const r = new Run(ctxOf());
    r.cont();
    expect(r.state.step).toBe('explore');
    r.cont();
    expect(r.state.step).toBe('explore'); // not yet interacted
    r.do({ type: 'EXPLORE_INTERACTED' });
    expect(isExploreDone(r.state)).toBe(true);
    r.cont();
    expect(r.state.step).toBe('name');
    expect(r.state.nameIndex).toBe(0);
    r.cont();
    expect(r.state.nameIndex).toBe(1);
    r.cont();
    expect(r.state.step).toBe('practice');
    expect(r.p.index).toBe(0);
  });

  it('ignores EXPLORE_INTERACTED outside explore', () => {
    const r = new Run(ctxOf());
    const before = r.state;
    r.do({ type: 'EXPLORE_INTERACTED' });
    expect(r.state).toBe(before);
  });

  it('shows the alternative once and hides it again on the next card', () => {
    const r = new Run(ctxOf());
    r.cont().do({ type: 'EXPLORE_INTERACTED' }).cont();
    expect(r.state.alternativeShown).toBe(false);
    r.do({ type: 'SHOW_ALTERNATIVE' });
    expect(r.state.alternativeShown).toBe(true);
    const same = r.state;
    r.do({ type: 'SHOW_ALTERNATIVE' });
    expect(r.state).toBe(same);
    r.cont();
    expect(r.state.nameIndex).toBe(1);
    expect(r.state.alternativeShown).toBe(false);
  });

  it('SHOW_ALTERNATIVE does nothing outside the name step', () => {
    const r = new Run(ctxOf());
    const before = r.state;
    r.do({ type: 'SHOW_ALTERNATIVE' });
    expect(r.state).toBe(before);
  });

  it('goes back through name cards, explore and the hook', () => {
    const r = new Run(ctxOf());
    r.toPractice();
    r.back(); // practice 0 -> last name card
    expect(r.state.step).toBe('name');
    expect(r.state.nameIndex).toBe(1);
    expect(r.state.practice).toBeNull();
    r.back();
    expect(r.state.nameIndex).toBe(0);
    r.back();
    expect(r.state.step).toBe('explore');
    expect(r.state.exploreInteracted).toBe(true); // stays unlocked
    r.back();
    expect(r.state.step).toBe('hook');
    r.back();
    expect(r.state.step).toBe('hook');
  });

  it('cannot go back from practice question 2, after a wrong attempt, or in the challenge or recap', () => {
    const r = new Run(ctxOf());
    r.toPractice();
    r.answer(RIGHT).cont();
    r.back();
    expect(r.state.step).toBe('practice');
    expect(r.p.index).toBe(1);

    const r2 = new Run(ctxOf());
    r2.toPractice();
    r2.answer(WRONG).cont(); // retry
    r2.back();
    expect(r2.state.step).toBe('practice');

    const r3 = new Run(ctxOf());
    r3.throughPractice();
    expect(r3.state.step).toBe('challenge');
    r3.back();
    expect(r3.state.step).toBe('challenge');
    r3.start();
    r3.back();
    expect(r3.c.phase).toBe('running');
    while (r3.c.phase === 'running') r3.answer(RIGHT).cont();
    r3.cont();
    expect(r3.state.step).toBe('recap');
    r3.back();
    expect(r3.state.step).toBe('recap');
    r3.cont();
    expect(r3.state.step).toBe('recap');
  });
});

describe('practice: hints and second attempts', () => {
  it('a right first answer settles at once', () => {
    const r = new Run(ctxOf());
    r.toPractice();
    r.answer(RIGHT, 250);
    expect(r.p.run).toMatchObject({ phase: 'feedback', outcome: 'correct', attempt: 1 });
    expect(r.p.outcomes[0]).toBe('correct');
    expect(r.state.events).toHaveLength(1);
    expect(r.state.events[0]).toMatchObject({
      lessonId: 'g1-test-lesson',
      step: 'practice',
      questionId: 'p1',
      skill: 'rhythm.pulse.steady',
      type: 'multiple-choice',
      correct: true,
      score: 1,
      msTaken: 250,
    });
    expect(r.state.events[0].seed).toBeUndefined();
    expect(r.state.events[0].at).toBe(new Date(r.t).toISOString());
  });

  it('a first wrong answer with a hint gives a retry; the second result stands (right)', () => {
    const r = new Run(ctxOf());
    r.toPractice();
    r.answer(WRONG);
    expect(r.p.run).toMatchObject({ phase: 'feedback', outcome: 'retry', attempt: 1 });
    expect(r.p.outcomes[0]).toBeNull();
    r.cont(500);
    expect(r.p.run).toMatchObject({ phase: 'answering', attempt: 2, result: null, outcome: null });
    expect(r.p.index).toBe(0);
    r.answer(RIGHT, 300);
    expect(r.p.run).toMatchObject({ phase: 'feedback', outcome: 'correct', attempt: 2 });
    expect(r.p.outcomes[0]).toBe('correct');
    expect(r.state.events.map((e) => e.correct)).toEqual([false, true]);
    expect(r.state.events[1].msTaken).toBe(300); // measured from the retry, not the first attempt
  });

  it('a second wrong answer stands as wrong and moves on', () => {
    const r = new Run(ctxOf());
    r.toPractice();
    r.answer(WRONG).cont().answer(WRONG);
    expect(r.p.run).toMatchObject({ phase: 'feedback', outcome: 'wrong', attempt: 2 });
    expect(r.p.outcomes[0]).toBe('wrong');
    r.cont();
    expect(r.p.index).toBe(1);
    expect(r.p.run).toMatchObject({ phase: 'answering', attempt: 1 });
  });

  it('a question without a hint gets no second attempt', () => {
    const r = new Run(ctxOf({ practice: [{ ...authored('p1'), hint: undefined }, authored('p2'), authored('p3')] }));
    r.toPractice();
    r.answer(WRONG);
    expect(r.p.run.outcome).toBe('wrong');
    r.cont();
    expect(r.p.index).toBe(1);
  });

  it('ignores answers while feedback shows and CONTINUE while answering', () => {
    const r = new Run(ctxOf());
    r.toPractice();
    r.cont();
    expect(r.p.index).toBe(0);
    r.answer(RIGHT);
    const before = r.state;
    r.answer(WRONG);
    expect(r.state).toBe(before);
  });

  it('clamps score into 0..1 in the event', () => {
    const r = new Run(ctxOf());
    r.toPractice();
    r.answer({ correct: true, score: 7 });
    expect(r.state.events[0].score).toBe(1);
  });

  it('skip advances without an event and marks the question skipped', () => {
    const r = new Run(ctxOf());
    r.toPractice();
    r.skip();
    expect(r.p.index).toBe(1);
    expect(r.p.outcomes[0]).toBe('skipped');
    expect(r.state.events).toHaveLength(0);
  });

  it('skip is ignored while feedback shows', () => {
    const r = new Run(ctxOf());
    r.toPractice();
    r.answer(RIGHT);
    const before = r.state;
    r.skip();
    expect(r.state).toBe(before);
  });

  it('finishing the last question moves to the challenge intro', () => {
    const r = new Run(ctxOf());
    r.throughPractice();
    expect(r.state.step).toBe('challenge');
    expect(r.c.phase).toBe('intro');
    expect(r.state.practice).toBeNull();
    expect(r.state.events).toHaveLength(4);
  });

  it('skipping the last practice question also reaches the challenge', () => {
    const r = new Run(ctxOf());
    r.toPractice();
    for (let i = 0; i < 4; i++) r.skip();
    expect(r.state.step).toBe('challenge');
  });
});

describe('generated questions and seeds', () => {
  it('draws generated practice questions with the derived seed and stores it in the event', () => {
    const r = new Run(ctxOf(), { attemptBase: 10 });
    r.toPractice();
    const gen = r.p.items[3];
    expect(gen.seed).toBe(deriveSeed('g1-test-lesson', 'p4', 10));
    const expected = fixtureGenerators.gen.generate({ n: 3 }, createRng(gen.seed!), 'uk');
    expect(gen.payload).toEqual(expected.payload);
    expect(gen.prompt).toBe(expected.prompt);
    expect(r.p.items[0].seed).toBeUndefined();
    expect(r.state.attemptCounter).toBe(11);
    for (let i = 0; i < 3; i++) r.answer(RIGHT).cont();
    r.answer(RIGHT);
    expect(r.state.events[3].seed).toBe(gen.seed);
  });

  it('is reproducible: same lesson, base and answers give the same questions', () => {
    const a = new Run(ctxOf(), { attemptBase: 5 }).toPractice();
    const b = new Run(ctxOf(), { attemptBase: 5 }).toPractice();
    expect(a.p.items).toEqual(b.p.items);
    const c = new Run(ctxOf(), { attemptBase: 6 }).toPractice();
    expect(c.p.items[3].seed).not.toBe(a.p.items[3].seed);
  });

  it('uses the question prompt when the generator gives none, and the generated type', () => {
    const ctx = ctxOf(
      {},
      {
        generators: {
          gen: {
            id: 'gen',
            paramsSchema: fixtureGenerators.gen.paramsSchema,
            generate: () => ({ type: 'by-ear', payload: { x: 1 } }),
          },
        },
      },
    );
    const r = new Run(ctx).toPractice();
    expect(r.p.items[3].type).toBe('by-ear');
    expect(r.p.items[3].prompt).toBe('Prompt for p4');
  });

  it('turns a missing generator into an item error', () => {
    const missing = new Run(ctxOf({}, { generators: {} })).toPractice();
    expect(missing.p.items[3].error).toMatch(/No generator is registered with id "gen"/);
    expect(missing.p.items[3].seed).toBeDefined();
  });
});

describe('generator failures', () => {
  it('rejected params', async () => {
    const { z } = await import('zod');
    const ctx = ctxOf(
      {},
      {
        generators: {
          gen: { id: 'gen', paramsSchema: z.object({ must: z.string() }), generate: () => ({ type: 'by-ear', payload: {} }) },
        },
      },
    );
    const r = new Run(ctx).toPractice();
    expect(r.p.items[3].error).toMatch(/rejected its params/);
  });
  it('a throwing generator', () => {
    const ctx = ctxOf(
      {},
      {
        generators: {
          gen: {
            id: 'gen',
            paramsSchema: fixtureGenerators.gen.paramsSchema,
            generate: () => {
              throw new Error('boom');
            },
          },
        },
      },
    );
    const r = new Run(ctx).toPractice();
    expect(r.p.items[3].error).toMatch(/threw: boom/);
  });
});

describe('challenge: drawing questions', () => {
  it('draws `count` questions from the pool in order, cycling', () => {
    const r = new Run(ctxOf({ count: 7 })).throughPractice().start();
    expect(r.c.items.map((i) => i.questionId)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c1', 'c2']);
    expect(r.c.items.map((i) => i.slot)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('gives a count smaller than the pool a prefix of it', () => {
    const r = new Run(ctxOf({ count: 5, challenge: [authored('a'), authored('b'), authored('c'), authored('d'), authored('e'), authored('f')] })).throughPractice().start();
    expect(r.c.items.map((i) => i.questionId)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('draws a fresh seed for every generated slot, even for the same question', () => {
    const pool = [generated('g1'), generated('g2'), generated('g3')];
    const r = new Run(ctxOf({ count: 6, challenge: pool }), { attemptBase: 0 }).throughPractice().start();
    const seeds = r.c.items.map((i) => i.seed);
    expect(new Set(seeds).size).toBe(6);
    expect(r.c.items[0].questionId).toBe('g1');
    expect(r.c.items[3].questionId).toBe('g1');
    expect(r.c.items[0].payload).not.toEqual(r.c.items[3].payload);
  });

  it('draws new seeds on a retry', () => {
    const r = new Run(ctxOf({ challenge: [generated('g1'), generated('g2'), generated('g3')] })).throughPractice().start();
    const first = r.c.items.map((i) => i.seed);
    while (r.c.phase === 'running') r.answer(WRONG).cont();
    r.do({ type: 'RETRY_CHALLENGE', now: r.t }).start();
    expect(r.c.items.map((i) => i.seed)).not.toEqual(first);
  });

  it('START_CHALLENGE only works from the intro of the challenge step', () => {
    const r = new Run(ctxOf());
    const before = r.state;
    r.start();
    expect(r.state).toBe(before);
    r.throughPractice().start();
    const running = r.state;
    r.start();
    expect(r.state).toBe(running);
  });
});

describe('challenge: rules', () => {
  function round(r: Run, pattern: boolean[]) {
    pattern.forEach((ok) => r.answer(ok ? RIGHT : WRONG).cont());
  }

  it('gives one attempt and no hint retry', () => {
    const r = new Run(ctxOf()).throughPractice().start();
    r.answer(WRONG);
    expect(r.c.run.outcome).toBe('wrong');
    r.cont();
    expect(r.c.index).toBe(1);
    expect(r.c.run.attempt).toBe(1);
    expect(r.c.answers).toEqual([false, null, null, null, null]);
  });

  it('records events with step "challenge" and the right msTaken', () => {
    const r = new Run(ctxOf()).throughPractice().start();
    r.answer(RIGHT, 1234);
    expect(r.state.events.at(-1)).toMatchObject({ step: 'challenge', questionId: 'c1', msTaken: 1234, correct: true });
  });

  it('passes at exactly the pass mark (4 of 5 = 0.8)', () => {
    const r = new Run(ctxOf()).throughPractice().start();
    round(r, [true, true, true, true, false]);
    expect(r.c.phase).toBe('result');
    expect(r.c.result).toEqual({ correct: 4, total: 5, fraction: 0.8, passed: true, timedOut: false });
    expect(r.state.completed).toBe(true);
    expect(r.state.bestScore).toBe(0.8);
  });

  it('fails just below the pass mark (3 of 5)', () => {
    const r = new Run(ctxOf()).throughPractice().start();
    round(r, [true, false, true, false, true]);
    expect(r.c.result).toMatchObject({ correct: 3, passed: false });
    expect(r.state.completed).toBe(false);
    expect(r.state.bestScore).toBe(0.6);
  });

  it('applies a custom pass mark: 0.5 passes 3 of 6, 1 needs all', () => {
    const half = new Run(ctxOf({ count: 6, passMark: 0.5 })).throughPractice().start();
    round(half, [true, true, true, false, false, false]);
    expect(half.c.result?.passed).toBe(true);
    const all = new Run(ctxOf({ passMark: 1 })).throughPractice().start();
    round(all, [true, true, true, true, false]);
    expect(all.c.result?.passed).toBe(false);
  });

  it('handles floating point pass marks (0.7 of 10 = 7)', () => {
    const r = new Run(ctxOf({ count: 10, passMark: 0.7 })).throughPractice().start();
    round(r, [true, true, true, true, true, true, true, false, false, false]);
    expect(r.c.result?.passed).toBe(true);
  });

  it('counts MarkResult.correct, not partial scores', () => {
    const r = new Run(ctxOf()).throughPractice().start();
    for (let i = 0; i < 5; i++) r.answer({ correct: false, score: 0.9, reason: 'close' }).cont();
    expect(r.c.result?.correct).toBe(0);
  });

  it('skip in the challenge counts as wrong, with no event', () => {
    const r = new Run(ctxOf()).throughPractice().start();
    const events = r.state.events.length;
    r.skip();
    expect(r.c.answers[0]).toBe(false);
    expect(r.c.index).toBe(1);
    expect(r.state.events).toHaveLength(events);
    for (let i = 0; i < 4; i++) r.skip();
    expect(r.c.phase).toBe('result');
    expect(r.c.result?.correct).toBe(0);
  });

  it('CONTINUE on the result goes to the recap; RETRY_CHALLENGE goes to a fresh intro', () => {
    const r = new Run(ctxOf()).throughPractice().start();
    round(r, [false, false, false, false, false]);
    r.do({ type: 'RETRY_CHALLENGE', now: r.t });
    expect(r.c).toMatchObject({ phase: 'intro', items: [], result: null });
    expect(r.state.step).toBe('challenge');
    r.start();
    round(r, [true, true, true, true, true]);
    expect(r.c.result?.passed).toBe(true);
    r.cont();
    expect(r.state.step).toBe('recap');
  });

  it('RETRY_CHALLENGE is ignored unless on the result screen', () => {
    const r = new Run(ctxOf()).throughPractice();
    const before = r.state;
    r.do({ type: 'RETRY_CHALLENGE', now: r.t });
    expect(r.state).toBe(before);
  });
});

describe('challenge: the clock', () => {
  it('starts the deadline at START and counts seconds down on TICK', () => {
    const r = new Run(ctxOf({ seconds: 60 })).throughPractice();
    r.start();
    expect(r.c.deadline).toBe(r.t + 60_000);
    expect(r.c.secondsLeft).toBe(60);
    r.tick(1);
    expect(r.c.secondsLeft).toBe(60);
    r.tick(999);
    expect(r.c.secondsLeft).toBe(59);
    r.tick(29_000);
    expect(r.c.secondsLeft).toBe(30);
  });

  it('returns the same state object when the displayed second has not changed', () => {
    const r = new Run(ctxOf()).throughPractice().start();
    r.tick(100);
    const s = r.state;
    r.tick(100);
    expect(r.state).toBe(s);
  });

  it('timer expiry ends the round; unanswered questions count as wrong', () => {
    const r = new Run(ctxOf({ seconds: 60 })).throughPractice().start();
    r.answer(RIGHT).cont();
    r.answer(RIGHT).cont();
    r.tick(60_000);
    expect(r.c.phase).toBe('result');
    expect(r.c.result).toEqual({ correct: 2, total: 5, fraction: 0.4, passed: false, timedOut: true });
    expect(r.c.secondsLeft).toBe(0);
    expect(r.state.bestScore).toBe(0.4);
    expect(r.state.completed).toBe(false);
  });

  it('keeps the current question when it was already answered at expiry', () => {
    const r = new Run(ctxOf({ seconds: 60 })).throughPractice().start();
    for (let i = 0; i < 4; i++) r.answer(RIGHT).cont();
    r.answer(RIGHT); // fifth answered, feedback showing
    r.tick(60_000);
    expect(r.c.result).toMatchObject({ correct: 5, total: 5, passed: true, timedOut: true });
  });

  it('can still pass on timeout if enough were right', () => {
    const r = new Run(ctxOf({ count: 5, passMark: 0.5, seconds: 60 })).throughPractice().start();
    for (let i = 0; i < 3; i++) r.answer(RIGHT).cont();
    r.tick(60_000);
    expect(r.c.result).toMatchObject({ correct: 3, passed: true, timedOut: true });
  });

  it('rejects an answer that arrives after the deadline and ends the round', () => {
    const r = new Run(ctxOf({ seconds: 60 })).throughPractice().start();
    r.answer(RIGHT).cont();
    r.t += 61_000;
    const events = r.state.events.length;
    r.do({ type: 'ANSWER', result: RIGHT, now: r.t });
    expect(r.c.phase).toBe('result');
    expect(r.c.result?.timedOut).toBe(true);
    expect(r.c.result?.correct).toBe(1);
    expect(r.state.events).toHaveLength(events);
  });

  it('CONTINUE and SKIP after the deadline end the round', () => {
    const a = new Run(ctxOf({ seconds: 60 })).throughPractice().start();
    a.answer(RIGHT);
    a.t += 61_000;
    a.cont();
    expect(a.c.result?.timedOut).toBe(true);
    const b = new Run(ctxOf({ seconds: 60 })).throughPractice().start();
    b.t += 61_000;
    b.skip();
    expect(b.c.result?.timedOut).toBe(true);
  });

  it('untimed mode has no deadline and ignores the clock', () => {
    const r = new Run(ctxOf({ seconds: 60 })).throughPractice().start(false);
    expect(r.c.timed).toBe(false);
    expect(r.c.deadline).toBeNull();
    expect(r.c.secondsLeft).toBeNull();
    r.tick(10_000_000);
    expect(r.c.phase).toBe('running');
    r.t += 10_000_000;
    r.answer(RIGHT);
    expect(r.c.run.phase).toBe('feedback');
    r.cont();
    expect(r.c.index).toBe(1);
    for (let i = 0; i < 4; i++) r.answer(RIGHT).cont();
    expect(r.c.result).toMatchObject({ passed: true, timedOut: false });
    expect(r.c.secondsLeft).toBeNull();
  });

  it('TICK outside a running timed round changes nothing', () => {
    const r = new Run(ctxOf());
    const s = r.state;
    r.tick(5000);
    expect(r.state).toBe(s);
  });

  it('does not double-finish: TICK after the result leaves the result alone', () => {
    const r = new Run(ctxOf({ seconds: 60 })).throughPractice().start();
    r.tick(60_000);
    const s = r.state;
    r.tick(1000);
    expect(r.state).toBe(s);
  });
});

describe('replay and completion', () => {
  const done: LessonProgress = {
    lessonId: 'g1-test-lesson',
    state: 'complete',
    step: 'recap',
    questionIndex: 0,
    bestScore: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('a replay of a completed lesson starts at the hook and keeps the stored score and state', () => {
    const s = createInitialState(ctxOf(), { progress: done });
    expect(s.step).toBe('hook');
    expect(s.completed).toBe(true);
    expect(s.bestScore).toBe(1);
  });

  it('a failed replay never lowers bestScore and the lesson stays complete', () => {
    const r = new Run(ctxOf(), { progress: done }).throughPractice().start();
    for (let i = 0; i < 5; i++) r.answer(WRONG).cont();
    expect(r.c.result?.passed).toBe(false);
    expect(r.state.bestScore).toBe(1);
    expect(r.state.completed).toBe(true);
    expect(toProgress(r.state, 0)).toMatchObject({ state: 'complete', bestScore: 1 });
  });

  it('a better replay raises bestScore', () => {
    const r = new Run(ctxOf(), { progress: { ...done, bestScore: 0.8 } }).throughPractice().start();
    for (let i = 0; i < 5; i++) r.answer(RIGHT).cont();
    expect(r.state.bestScore).toBe(1);
  });

  it('a replay score between best and zero leaves best alone', () => {
    const r = new Run(ctxOf(), { progress: { ...done, bestScore: 0.9 } }).throughPractice().start();
    for (let i = 0; i < 4; i++) r.answer(RIGHT).cont();
    r.answer(WRONG).cont();
    expect(r.state.bestScore).toBe(0.9);
  });

  it('keeps mastered as mastered', () => {
    const r = new Run(ctxOf(), { progress: { ...done, state: 'mastered' } }).throughPractice().start();
    for (let i = 0; i < 5; i++) r.answer(WRONG).cont();
    expect(toProgress(r.state, 0).state).toBe('mastered');
  });

  it('a first pass completes the lesson; a first failure leaves it in progress', () => {
    const fail = new Run(ctxOf()).throughPractice().start();
    for (let i = 0; i < 5; i++) fail.answer(WRONG).cont();
    expect(toProgress(fail.state, 0)).toMatchObject({ state: 'in-progress', bestScore: 0 });
    const pass = new Run(ctxOf()).throughPractice().start();
    for (let i = 0; i < 5; i++) pass.answer(RIGHT).cont();
    expect(toProgress(pass.state, 0)).toMatchObject({ state: 'complete', bestScore: 1 });
  });

  it('a pass after earlier failures completes it and bestScore is the max', () => {
    const r = new Run(ctxOf()).throughPractice().start();
    for (let i = 0; i < 5; i++) r.answer(WRONG).cont();
    r.do({ type: 'RETRY_CHALLENGE', now: r.t }).start();
    for (let i = 0; i < 5; i++) r.answer(RIGHT).cont();
    expect(r.state.completed).toBe(true);
    expect(r.state.bestScore).toBe(1);
  });
});

describe('resume', () => {
  const base: LessonProgress = {
    lessonId: 'g1-test-lesson',
    state: 'in-progress',
    step: 'practice',
    questionIndex: 2,
    bestScore: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('resumes mid-practice at the saved question with fresh timing', () => {
    const s = createInitialState(ctxOf(), { progress: base, now: 5000 });
    expect(s.step).toBe('practice');
    expect(s.practice?.index).toBe(2);
    expect(s.practice?.items).toHaveLength(4);
    expect(s.practice?.run).toMatchObject({ phase: 'answering', attempt: 1, startedAt: 5000 });
    expect(s.exploreInteracted).toBe(true);
  });

  it('clamps a bad questionIndex', () => {
    expect(createInitialState(ctxOf(), { progress: { ...base, questionIndex: 99 } }).practice?.index).toBe(3);
    expect(createInitialState(ctxOf(), { progress: { ...base, questionIndex: -4 } }).practice?.index).toBe(0);
    expect(createInitialState(ctxOf(), { progress: { ...base, questionIndex: Number.NaN } }).practice?.index).toBe(0);
  });

  it('resumes the challenge at its intro and the recap at the recap', () => {
    const c = createInitialState(ctxOf(), { progress: { ...base, step: 'challenge', questionIndex: 0, bestScore: 0.4 } });
    expect(c.step).toBe('challenge');
    expect(c.challenge.phase).toBe('intro');
    expect(c.bestScore).toBe(0.4);
    expect(createInitialState(ctxOf(), { progress: { ...base, step: 'recap' } }).step).toBe('recap');
  });

  it('resumes explore (locked again) and name', () => {
    const e = createInitialState(ctxOf(), { progress: { ...base, step: 'explore' } });
    expect(e.step).toBe('explore');
    expect(e.exploreInteracted).toBe(false);
    expect(createInitialState(ctxOf(), { progress: { ...base, step: 'name' } }).step).toBe('name');
  });

  it('ignores progress for another lesson, an unknown step and a not-started lesson', () => {
    expect(createInitialState(ctxOf(), { progress: { ...base, lessonId: 'other' } }).step).toBe('hook');
    expect(createInitialState(ctxOf(), { progress: { ...base, step: 'nope' as never } }).step).toBe('hook');
    expect(createInitialState(ctxOf(), { progress: { ...base, state: 'not-started' } }).step).toBe('hook');
  });

  it('sanitises a bad bestScore', () => {
    expect(createInitialState(ctxOf(), { progress: { ...base, bestScore: 4 } }).bestScore).toBe(1);
    expect(createInitialState(ctxOf(), { progress: { ...base, bestScore: Number.NaN } }).bestScore).toBeNull();
  });
});

describe('toProgress and progressFraction', () => {
  it('reports the step, practice index and time', () => {
    const r = new Run(ctxOf()).toPractice();
    r.answer(RIGHT).cont();
    expect(toProgress(r.state, Date.UTC(2026, 0, 2))).toEqual({
      lessonId: 'g1-test-lesson',
      state: 'in-progress',
      step: 'practice',
      questionIndex: 1,
      bestScore: null,
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
  });

  it('gives a questionIndex of 0 outside practice', () => {
    expect(toProgress(createInitialState(ctxOf()), 0).questionIndex).toBe(0);
  });

  it('rises monotonically from 0 to 1 across a full run', () => {
    const r = new Run(ctxOf());
    const seen: number[] = [progressFraction(r.state)];
    const note = () => seen.push(progressFraction(r.state));
    expect(seen[0]).toBe(0);
    r.cont();
    note();
    r.do({ type: 'EXPLORE_INTERACTED' }).cont();
    note();
    r.cont();
    note();
    r.cont();
    note();
    while (r.state.step === 'practice') {
      r.answer(RIGHT);
      note();
      r.cont();
      note();
    }
    r.start();
    note();
    while (r.c.phase === 'running') {
      r.answer(RIGHT);
      note();
      r.cont();
      note();
    }
    r.cont();
    note();
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(seen.at(-1)).toBe(1);
    expect(seen.every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  it('does not count a retry feedback as a settled practice question', () => {
    const r = new Run(ctxOf()).toPractice();
    const start = progressFraction(r.state);
    r.answer(WRONG);
    expect(progressFraction(r.state)).toBe(start);
    r.cont().answer(RIGHT);
    expect(progressFraction(r.state)).toBeGreaterThan(start);
  });
});

describe('purity', () => {
  it('never mutates the previous state', () => {
    const r = new Run(ctxOf()).toPractice();
    const frozen = JSON.stringify(r.state);
    const before = r.state;
    r.answer(WRONG).cont().answer(RIGHT).cont();
    expect(JSON.stringify(before)).toBe(frozen);
  });

  it('ignores answers when not in a question', () => {
    const r = new Run(ctxOf());
    const s = r.state;
    r.answer(RIGHT);
    expect(r.state).toBe(s);
  });
});
