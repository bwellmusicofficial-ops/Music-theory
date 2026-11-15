import { describe, expect, it, vi } from 'vitest';
import type { QuestionTypeRegistry } from '@/lesson/contracts';
import { generators } from '@/lesson/generators';
import { questionTypes } from '@/lesson/questions';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BAND_LABEL,
  UNANSWERED_REASON,
  answeredCount,
  bandFor,
  buildPaper,
  createMockTest,
  formatClock,
  markPaper,
  markQuestion,
  timeWarning,
  type MockTest,
  type Paper,
} from './engine';
import { parseMockConfig } from './load';
import { mockConfigSchema } from './schema';
import { fakeClock, fixtureConfig, mcq } from './test-fixtures';

const grade1 = parseMockConfig(JSON.parse(readFileSync(join(process.cwd(), 'content/mocks/grade-1.json'), 'utf8')), 'grade-1.json');
const opts = { generators, questionTypes };

function make(
  extra: { untimed?: boolean; lessons?: { id: string; skills: string[] }[]; minutes?: number; types?: QuestionTypeRegistry } = {},
) {
  const clock = fakeClock();
  const config = fixtureConfig(extra.minutes ? { minutes: extra.minutes } : {});
  const paper = buildPaper(config, 5, opts);
  const test = createMockTest({
    config,
    paper,
    questionTypes: extra.types ?? questionTypes,
    clock,
    untimed: extra.untimed,
    lessons: extra.lessons,
  });
  return { clock, config, paper, test };
}

/** The paper index of a fixture question by its id ("first.q3"). */
const at = (paper: Paper, id: string) => paper.questions.find((q) => q.id.endsWith(`.${id}`))!.index;
const right = { optionId: 'a' };
const wrong = { optionId: 'b' };

describe('buildPaper', () => {
  it('is deterministic: the same seed gives the same paper', () => {
    const a = buildPaper(grade1, 42, opts);
    const b = buildPaper(grade1, 42, opts);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('gives different papers for different seeds', () => {
    const a = buildPaper(grade1, 1, opts);
    const b = buildPaper(grade1, 2, opts);
    expect(JSON.stringify(a.questions)).not.toBe(JSON.stringify(b.questions));
  });

  it('keeps the config order: sections in order, each question tied to its section, indices dense', () => {
    const paper = buildPaper(grade1, 3, opts);
    expect(paper.sections.map((s) => s.id)).toEqual(grade1.sections.map((s) => s.id));
    expect(paper.questions.map((q) => q.index)).toEqual(paper.questions.map((_, i) => i));
    expect(paper.sections.flatMap((s) => s.indices)).toEqual(paper.questions.map((q) => q.index));
    for (const s of paper.sections) for (const i of s.indices) expect(paper.questions[i]!.sectionId).toBe(s.id);
    expect(paper.problems).toEqual([]);
  });

  it('records the seed of generated questions and none for authored ones', () => {
    const paper = buildPaper(grade1, 3, opts);
    for (const q of paper.questions) {
      if (q.sectionId === 'terms-and-signs') expect(q.seed).toBeUndefined();
      else expect(typeof q.seed).toBe('number');
    }
  });

  it('draws `draw` questions from a bank, different ones for different seeds, never the same twice', () => {
    const picks = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const paper = buildPaper(grade1, seed, opts);
      const terms = paper.questions.filter((q) => q.sectionId === 'terms-and-signs');
      expect(terms).toHaveLength(6);
      expect(new Set(terms.map((q) => q.id)).size).toBe(6);
      for (const item of ['tempo-and-expression', 'dynamics', 'articulation-and-signs']) {
        expect(terms.filter((q) => q.itemId === item)).toHaveLength(2);
      }
      terms.forEach((q) => picks.add(q.id));
    }
    // Over 30 papers every one of the 16 authored questions turns up.
    expect(picks.size).toBe(16);
  });

  it('uses the whole bank when `draw` is not given', () => {
    const paper = buildPaper(fixtureConfig(), 1, opts);
    expect(paper.questions.map((q) => q.id).sort()).toEqual(
      ['first.q1', 'first.q2', 'first.q3', 'second.q4', 'second.q5', 'second.q6'],
    );
  });

  it('draws count questions from a generator, each with its own seed', () => {
    const paper = buildPaper(grade1, 9, opts);
    const intervals = paper.questions.filter((q) => q.itemId === 'interval-numbers');
    expect(intervals).toHaveLength(2);
    expect(intervals[0]!.seed).not.toBe(intervals[1]!.seed);
    expect(intervals.map((q) => q.id)).toEqual(['intervals.interval-numbers.1', 'intervals.interval-numbers.2']);
  });

  it('re-draws so one paper does not repeat a generated question', () => {
    const config = mockConfigSchema.parse({
      ...fixtureConfig(),
      sections: [
        {
          id: 'one',
          title: 'One',
          strand: 'rhythm',
          items: [
            {
              kind: 'generated',
              id: 'rests',
              generator: { id: 'choose-note-value', params: { values: [{ value: 'crotchet', dots: 0 }, { value: 'minim', dots: 0 }], options: 2 } },
              skill: 'rhythm.note-values.crotchet-minim',
              count: 4,
            },
          ],
        },
      ],
    });
    for (let seed = 1; seed <= 20; seed++) {
      const paper = buildPaper(config, seed, opts);
      const prints = paper.questions.map((q) => `${q.prompt}|${JSON.stringify(q.payload)}`);
      expect(paper.problems).toEqual([]);
      expect(new Set(prints).size).toBeGreaterThanOrEqual(2);
    }
  });

  it('uses the item prompt when the generator gives none, and the generator prompt otherwise', () => {
    const paper = buildPaper(grade1, 4, opts);
    expect(paper.questions.find((q) => q.itemId === 'treble-lines')!.prompt).toBe('Name the note on the treble stave.');
    expect(paper.questions.find((q) => q.itemId === 'note-values-1')!.prompt).toMatch(/^Which note lasts/);
  });

  it('passes the terminology to generators', () => {
    const uk = buildPaper(grade1, 11, { ...opts, terminology: 'uk' });
    const us = buildPaper(grade1, 11, { ...opts, terminology: 'us' });
    expect(JSON.stringify(uk.questions)).not.toBe(JSON.stringify(us.questions));
  });

  it('reports questions it cannot build instead of throwing, and leaves them out', () => {
    const config = fixtureConfig();
    const broken = mockConfigSchema.parse({
      ...config,
      sections: [
        {
          id: 'bad',
          title: 'Bad',
          strand: 'rhythm',
          items: [
            { kind: 'generated', id: 'nope', generator: { id: 'no-such-generator' }, skill: 'rhythm.a.b' },
            { kind: 'generated', id: 'params', generator: { id: 'choose-note-value', params: { kind: 'sideways' } }, skill: 'rhythm.a.b' },
            { kind: 'authored', id: 'badpayload', bank: [{ ...mcq('x', 'rhythm.a.b'), payload: { options: [] } }] },
            { kind: 'authored', id: 'badtype', bank: [{ ...mcq('y', 'rhythm.a.b'), type: 'tap-rhythm' }] },
            { kind: 'authored', id: 'fine', bank: [mcq('z', 'rhythm.a.b')] },
          ],
        },
      ],
    });
    const paper = buildPaper(broken, 1, { generators, questionTypes: { 'multiple-choice': questionTypes['multiple-choice']! } });
    expect(paper.questions.map((q) => q.id)).toEqual(['bad.z']);
    expect(paper.problems).toHaveLength(4);
    expect(paper.problems[0]).toMatch(/no-such-generator/);
    expect(paper.problems[1]).toMatch(/rejected its params/);
    expect(paper.problems[2]).toMatch(/invalid multiple-choice payload/);
    expect(paper.problems[3]).toMatch(/no question type "tap-rhythm"/);
  });

  it('reports a generator that throws, and a generated payload that fails its schema', () => {
    const config = mockConfigSchema.parse({
      ...fixtureConfig(),
      sections: [
        {
          id: 's',
          title: 'S',
          strand: 'rhythm',
          items: [
            { kind: 'generated', id: 'throws', generator: { id: 'thrower' }, skill: 'rhythm.a.b' },
            { kind: 'generated', id: 'invalid', generator: { id: 'invalid' }, skill: 'rhythm.a.b' },
          ],
        },
      ],
    });
    const fake = {
      thrower: { id: 'thrower', paramsSchema: { safeParse: (v: unknown) => ({ success: true, data: v }) }, generate: () => { throw new Error('boom'); } },
      invalid: { id: 'invalid', paramsSchema: { safeParse: (v: unknown) => ({ success: true, data: v }) }, generate: () => ({ type: 'multiple-choice', payload: { nope: 1 } }) },
    } as unknown as typeof generators;
    const paper = buildPaper(config, 1, { generators: fake, questionTypes });
    expect(paper.questions).toEqual([]);
    expect(paper.problems[0]).toMatch(/threw: boom/);
    expect(paper.problems[1]).toMatch(/invalid multiple-choice payload/);
  });
});

describe('answers, navigation and flags (no feedback while running)', () => {
  it('starts on the first question with nothing answered or flagged', () => {
    const { test, paper } = make();
    const s = test.getState();
    expect(s.phase).toBe('running');
    expect(s.current).toBe(0);
    expect(s.answers).toEqual(paper.questions.map(() => undefined));
    expect(s.flagged.every((f) => f === false)).toBe(true);
    expect(s.result).toBeNull();
    expect(answeredCount(s)).toBe(0);
  });

  it('stores answers without marking them: no result, no verdict in the state', () => {
    const { test } = make();
    test.setAnswer(0, wrong);
    const s = test.getState();
    expect(s.answers[0]).toEqual(wrong);
    expect(s.result).toBeNull();
    expect(JSON.stringify(s)).not.toMatch(/reason|correct"/);
  });

  it('lets an answer be changed any number of times, and cleared', () => {
    const { test } = make();
    test.setAnswer(2, wrong);
    test.setAnswer(2, right);
    expect(test.getState().answers[2]).toEqual(right);
    test.clearAnswer(2);
    expect(test.getState().answers[2]).toBeUndefined();
    expect(answeredCount(test.getState())).toBe(0);
    test.clearAnswer(2); // already clear: no change, no throw
  });

  it('ignores answers for questions that do not exist, and undefined answers', () => {
    const { test } = make();
    test.setAnswer(-1, right);
    test.setAnswer(99, right);
    test.setAnswer(1.5, right);
    test.setAnswer(0, undefined);
    expect(answeredCount(test.getState())).toBe(0);
  });

  it('moves freely: next, previous, jump, clamped at both ends', () => {
    const { test, paper } = make();
    const last = paper.questions.length - 1;
    test.previous();
    expect(test.getState().current).toBe(0);
    test.next();
    test.next();
    expect(test.getState().current).toBe(2);
    test.goTo(last);
    expect(test.getState().current).toBe(last);
    test.next();
    expect(test.getState().current).toBe(last);
    test.goTo(1000);
    expect(test.getState().current).toBe(last);
    test.goTo(-5);
    expect(test.getState().current).toBe(0);
    test.goTo(Number.NaN);
    expect(test.getState().current).toBe(0);
    test.goTo(3.9);
    expect(test.getState().current).toBe(3);
  });

  it('keeps answers when moving away and back', () => {
    const { test } = make();
    test.setAnswer(0, wrong);
    test.goTo(4);
    test.goTo(0);
    expect(test.getState().answers[0]).toEqual(wrong);
  });

  it('flags and unflags a question for review', () => {
    const { test } = make();
    test.toggleFlag(3);
    expect(test.getState().flagged[3]).toBe(true);
    expect(test.getState().flagged.filter(Boolean)).toHaveLength(1);
    test.toggleFlag(3);
    expect(test.getState().flagged[3]).toBe(false);
    test.toggleFlag(99);
    expect(test.getState().flagged.every((f) => !f)).toBe(true);
  });

  it('notifies subscribers on change, not when nothing changed, and stops after unsubscribe', () => {
    const { test } = make();
    const listener = vi.fn();
    const off = test.subscribe(listener);
    test.setAnswer(0, right);
    test.goTo(1);
    test.toggleFlag(1);
    expect(listener).toHaveBeenCalledTimes(3);
    test.goTo(1);
    test.clearAnswer(5);
    expect(listener).toHaveBeenCalledTimes(3);
    off();
    test.goTo(2);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('gives the same state object when nothing changed (safe for useSyncExternalStore)', () => {
    const { test } = make();
    const before = test.getState();
    test.goTo(0);
    expect(test.getState()).toBe(before);
  });
});

describe('submitting and marking', () => {
  const lessons = [
    { id: 'lesson-a', skills: ['rhythm.s1', 'pitch.s2'] },
    { id: 'lesson-b', skills: ['rhythm.s1'] },
    { id: 'lesson-c', skills: ['pitch.s4'] },
  ];

  it('marks every question with its type mark and produces the full result', () => {
    const { test, paper } = make({ lessons });
    test.setAnswer(at(paper, 'q1'), right);
    test.setAnswer(at(paper, 'q2'), wrong);
    test.setAnswer(at(paper, 'q3'), right);
    test.setAnswer(at(paper, 'q4'), { optionId: 'c' });
    test.toggleFlag(at(paper, 'q2'));
    const result = test.submit();

    expect(test.getState().phase).toBe('submitted');
    expect(test.getState().result).toBe(result);
    expect(result.score).toMatchObject({ correct: 2, total: 6, points: 2 });
    expect(result.score.fraction).toBeCloseTo(2 / 6);
    expect(result.band).toBe('not-yet');
    expect(result.passed).toBe(false);
    expect(result.answeredCount).toBe(4);
    expect(result.unansweredCount).toBe(2);
    expect(result.timedOut).toBe(false);

    expect(result.questions).toHaveLength(6);
    const q2 = result.questions[at(paper, 'q2')]!;
    expect(q2).toMatchObject({ answered: true, correct: false, score: 0, flagged: true, answer: wrong, skill: 'rhythm.s1' });
    expect(q2.reason).toBe('Option b of q2 is wrong because of reason b.');
    expect(result.questions[at(paper, 'q4')]!.reason).toBe('Option c of q4 is wrong because of reason c.');
    const q1 = result.questions[at(paper, 'q1')]!;
    expect(q1).toMatchObject({ answered: true, correct: true, score: 1, answer: right, flagged: false });
    expect(q1.reason).toBeUndefined();
  });

  it('counts unanswered questions as wrong, and says so', () => {
    const { test, paper } = make();
    const result = test.submit();
    expect(result.score.correct).toBe(0);
    expect(result.score.points).toBe(0);
    const q = result.questions[0]!;
    expect(q).toMatchObject({ answered: false, correct: false, score: 0, answer: undefined });
    expect(q.reason).toBe(UNANSWERED_REASON);
    expect(result.questions).toHaveLength(paper.questions.length);
  });

  it('breaks the result down by section and by skill', () => {
    const { test, paper } = make();
    test.setAnswer(at(paper, 'q1'), right);
    test.setAnswer(at(paper, 'q2'), right);
    test.setAnswer(at(paper, 'q3'), wrong);
    test.setAnswer(at(paper, 'q5'), right);
    const result = test.submit();
    expect(result.sections.map((s) => [s.id, s.title, s.strand, s.correct, s.total])).toEqual([
      ['first', 'First', 'rhythm', 2, 3],
      ['second', 'Second', 'pitch', 1, 3],
    ]);
    expect(result.sections[0]!.fraction).toBeCloseTo(2 / 3);
    const skill = (id: string) => result.skills.find((s) => s.skill === id)!;
    expect(skill('rhythm.s1')).toMatchObject({ correct: 2, total: 2, fraction: 1 });
    expect(skill('rhythm.s2')).toMatchObject({ correct: 0, total: 1, fraction: 0 });
    expect(skill('pitch.s2')).toMatchObject({ correct: 0, total: 1 });
    expect(skill('pitch.s3')).toMatchObject({ correct: 1, total: 1 });
    expect(result.skills).toHaveLength(5);
    // The breakdowns add up to the whole.
    expect(result.sections.reduce((n, s) => n + s.total, 0)).toBe(result.score.total);
    expect(result.skills.reduce((n, s) => n + s.correct, 0)).toBe(result.score.correct);
  });

  it('lists the three weakest skills, weakest first, with the lessons that teach each', () => {
    const { test, paper } = make({ lessons });
    // rhythm.s1: 1/2, rhythm.s2: 0/1, pitch.s2: 0/1, pitch.s3: 1/1, pitch.s4: 0/1
    test.setAnswer(at(paper, 'q1'), right);
    test.setAnswer(at(paper, 'q2'), wrong);
    test.setAnswer(at(paper, 'q5'), right);
    const { weakest } = test.submit();
    expect(weakest).toHaveLength(3);
    // The three skills on 0: rhythm.s2, pitch.s2, pitch.s4 (equal fraction and evidence: paper order). rhythm.s1 (0.5) is left out.
    expect(weakest.map((w) => w.skill).sort()).toEqual(['pitch.s2', 'pitch.s4', 'rhythm.s2']);
    const lessonsOf = Object.fromEntries(weakest.map((w) => [w.skill, w.lessonIds]));
    expect(lessonsOf).toEqual({ 'rhythm.s2': [], 'pitch.s2': ['lesson-a'], 'pitch.s4': ['lesson-c'] });
    expect(weakest.every((w) => w.fraction === 0)).toBe(true);
  });

  it('finds every lesson with the skill, in list order; none when no lesson teaches it', () => {
    const { test, paper } = make({ lessons });
    test.setAnswer(at(paper, 'q3'), right);
    test.setAnswer(at(paper, 'q4'), right);
    test.setAnswer(at(paper, 'q5'), right);
    test.setAnswer(at(paper, 'q6'), right);
    const { weakest } = test.submit();
    expect(weakest).toHaveLength(1);
    expect(weakest[0]).toMatchObject({ skill: 'rhythm.s1', correct: 0, total: 2, lessonIds: ['lesson-a', 'lesson-b'] });
  });

  it('breaks ties on skills by evidence: a skill with more questions missed ranks as weaker', () => {
    const result = markPaper({
      config: fixtureConfig(),
      paper: buildPaper(fixtureConfig(), 1, opts),
      answers: [],
      questionTypes,
    });
    // rhythm.s1 has two unanswered questions, so it comes before the single-question skills at 0.
    expect(result.weakest[0]!.skill).toBe('rhythm.s1');
  });

  it('has no weak skills after a perfect paper, and awards distinction', () => {
    const { test, paper } = make({ lessons });
    paper.questions.forEach((q) => test.setAnswer(q.index, right));
    const result = test.submit();
    expect(result.weakest).toEqual([]);
    expect(result.score).toMatchObject({ correct: 6, total: 6, fraction: 1 });
    expect(result.band).toBe('distinction');
    expect(result.passed).toBe(true);
  });

  it('is idempotent: a second submit returns the same result, and answers are frozen', () => {
    const { test, paper } = make();
    test.setAnswer(0, right);
    const first = test.submit();
    test.setAnswer(0, wrong);
    test.setAnswer(1, right);
    test.clearAnswer(0);
    test.toggleFlag(0);
    test.goTo(3);
    expect(test.submit()).toBe(first);
    expect(test.getState().answers[0]).toEqual(right);
    expect(test.getState().answers[1]).toBeUndefined();
    expect(test.getState().current).toBe(0);
    expect(test.getState().flagged[0]).toBe(false);
    expect(paper.questions.length).toBe(6);
  });

  it('marks wrong, never throws, when an answer cannot be marked', () => {
    const { test, paper } = make();
    test.setAnswer(0, { optionId: 'not-an-option' });
    test.setAnswer(1, 'nonsense');
    const result = test.submit();
    expect(result.questions[0]).toMatchObject({ correct: false, answered: true });
    expect(result.questions[0]!.reason).toBe('Your answer could not be marked.');
    expect(result.questions[1]!.correct).toBe(false);
    expect(paper.questions).toHaveLength(6);
  });

  it('gives a reason to every wrong answer, whatever the type says', () => {
    const noReason: QuestionTypeRegistry = {
      'multiple-choice': { ...questionTypes['multiple-choice']!, mark: () => ({ correct: false, score: 0 }) },
    };
    const { test } = make({ types: noReason });
    test.setAnswer(0, wrong);
    expect(test.submit().questions[0]!.reason).toBe('That is not the right answer.');
  });

  it('counts partial credit (as tap-rhythm gives) in the points, not as a correct question', () => {
    const half: QuestionTypeRegistry = {
      'multiple-choice': { ...questionTypes['multiple-choice']!, mark: () => ({ correct: false, score: 0.5, reason: 'Half right.' }) },
    };
    const { test, paper } = make({ types: half });
    paper.questions.forEach((q) => test.setAnswer(q.index, right));
    const result = test.submit();
    expect(result.score.correct).toBe(0);
    expect(result.score.points).toBe(3);
    expect(result.score.fraction).toBe(0.5);
    expect(result.band).toBe('pass');
    expect(result.sections[0]).toMatchObject({ correct: 0, points: 1.5 });
  });

  it('clamps nonsense scores from a type', () => {
    const odd: QuestionTypeRegistry = {
      'multiple-choice': { ...questionTypes['multiple-choice']!, mark: () => ({ correct: true, score: 7 }) },
    };
    const q = buildPaper(fixtureConfig(), 1, opts).questions[0]!;
    expect(markQuestion(q, right, odd).mark.score).toBe(1);
    const nan: QuestionTypeRegistry = {
      'multiple-choice': { ...questionTypes['multiple-choice']!, mark: () => ({ correct: false, score: Number.NaN, reason: 'x' }) },
    };
    expect(markQuestion(q, right, nan).mark.score).toBe(0);
  });

  it('can mark a paper on its own (pure), e.g. for replays', () => {
    const paper = buildPaper(fixtureConfig(), 1, opts);
    const answers = paper.questions.map((q) => (q.index < 3 ? right : undefined));
    const a = markPaper({ config: fixtureConfig(), paper, answers, questionTypes });
    const b = markPaper({ config: fixtureConfig(), paper, answers, questionTypes });
    expect(a).toEqual(b);
    expect(a.score.correct).toBe(3);
  });

  it('marks real Grade 1 questions: answering from the payload is right, a wrong choice carries its reason', () => {
    const paper = buildPaper(grade1, 21, opts);
    const answers = paper.questions.map((q) => {
      if (q.type !== 'multiple-choice') return undefined;
      return { optionId: (q.payload as { correct: string }).correct };
    });
    const result = markPaper({ config: grade1, paper, answers, questionTypes });
    const mcCount = paper.questions.filter((q) => q.type === 'multiple-choice').length;
    expect(result.score.correct).toBe(mcCount);
    const firstMc = paper.questions.find((q) => q.type === 'multiple-choice')!;
    const payload = firstMc.payload as { correct: string; options: { id: string; reason?: string }[] };
    const bad = payload.options.find((o) => o.id !== payload.correct)!;
    const marked = markQuestion(firstMc, { optionId: bad.id }, questionTypes);
    expect(marked.mark).toEqual({ correct: false, score: 0, reason: bad.reason });
  });
});

describe('bands', () => {
  const marks = { passMark: 0.66, meritMark: 0.8, distinctionMark: 0.9 };
  it('gives each band at and above its mark', () => {
    expect(bandFor(1, marks)).toBe('distinction');
    expect(bandFor(0.9, marks)).toBe('distinction');
    expect(bandFor(0.899, marks)).toBe('merit');
    expect(bandFor(0.8, marks)).toBe('merit');
    expect(bandFor(0.79, marks)).toBe('pass');
    expect(bandFor(0.66, marks)).toBe('pass');
    expect(bandFor(0.659, marks)).toBe('not-yet');
    expect(bandFor(0, marks)).toBe('not-yet');
  });

  it('is not fooled by floating point: 20 of 30 is exactly 0.66.. and passes a 2/3 mark; 27 of 30 is a distinction', () => {
    expect(bandFor(20 / 30, { ...marks, passMark: 2 / 3 })).toBe('pass');
    expect(bandFor(27 / 30, marks)).toBe('distinction');
    expect(bandFor(0.1 + 0.2, { passMark: 0.3, meritMark: 0.5, distinctionMark: 0.9 })).toBe('pass');
  });

  it('has a label for each band', () => {
    expect(BAND_LABEL).toEqual({ distinction: 'Distinction', merit: 'Merit', pass: 'Pass', 'not-yet': 'Not yet passed' });
  });

  it('uses the config marks in a real result', () => {
    const { test, paper } = make();
    paper.questions.slice(0, 3).forEach((q) => test.setAnswer(q.index, right)); // 3/6 = 0.5 = the fixture pass mark
    expect(test.submit().band).toBe('pass');
  });

  it('gives a merit and a distinction at the fixture marks', () => {
    const merit = make();
    merit.paper.questions.slice(0, 5).forEach((q) => merit.test.setAnswer(q.index, right)); // 5/6 = 0.83
    expect(merit.test.submit().band).toBe('merit');
  });
});

describe('time', () => {
  it('runs a clock from the start: secondsLeft and remainingMs', () => {
    const { test, clock } = make({ minutes: 10 });
    expect(test.getState().secondsLeft).toBe(600);
    expect(test.getState().secondsAllowed).toBe(600);
    expect(test.remainingMs()).toBe(600_000);
    clock.advance(90_500);
    expect(test.remainingMs()).toBe(509_500);
    // The state does not move until tick() reads the clock.
    expect(test.getState().secondsLeft).toBe(600);
    test.tick();
    expect(test.getState().secondsLeft).toBe(510);
    clock.advance(500);
    test.tick();
    expect(test.getState().secondsLeft).toBe(509);
  });

  it('only notifies when the displayed second changes', () => {
    const { test, clock } = make();
    const listener = vi.fn();
    test.subscribe(listener);
    clock.advance(1100);
    test.tick();
    expect(listener).toHaveBeenCalledTimes(1);
    clock.advance(100);
    test.tick();
    clock.advance(100);
    test.tick();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('submits itself when time runs out, with the answers held at that moment', () => {
    const { test, clock, paper } = make({ minutes: 1 });
    test.setAnswer(at(paper, 'q1'), right);
    test.setAnswer(at(paper, 'q2'), wrong);
    clock.advance(59_999);
    test.tick();
    expect(test.getState().phase).toBe('running');
    clock.advance(1);
    test.tick();
    const s = test.getState();
    expect(s.phase).toBe('submitted');
    expect(s.timedOut).toBe(true);
    expect(s.secondsLeft).toBe(0);
    expect(s.result).not.toBeNull();
    expect(s.result!.timedOut).toBe(true);
    expect(s.result!.elapsedMs).toBe(60_000);
    expect(s.result!.score.correct).toBe(1);
    expect(s.result!.answeredCount).toBe(2);
    expect(s.result!.unansweredCount).toBe(4);
    expect(test.remainingMs()).toBe(0);
  });

  it('refuses an answer that arrives after the deadline, even before tick() has noticed', () => {
    const { test, clock, paper } = make({ minutes: 1 });
    test.setAnswer(at(paper, 'q1'), right);
    clock.advance(61_000);
    test.setAnswer(at(paper, 'q2'), right);
    const s = test.getState();
    expect(s.phase).toBe('submitted');
    expect(s.timedOut).toBe(true);
    expect(s.result!.answeredCount).toBe(1);
    expect(s.answers[at(paper, 'q2')]).toBeUndefined();
  });

  it('treats navigation and flags after the deadline the same way', () => {
    for (const act of [(t: MockTest) => t.next(), (t: MockTest) => t.toggleFlag(0), (t: MockTest) => t.clearAnswer(0)]) {
      const { test, clock } = make({ minutes: 1 });
      test.setAnswer(0, right);
      clock.advance(60_001);
      act(test);
      expect(test.getState().timedOut).toBe(true);
      expect(test.getState().result!.answeredCount).toBe(1);
    }
  });

  it('counts a Finish pressed after the deadline as the timeout', () => {
    const { test, clock } = make({ minutes: 1 });
    clock.advance(120_000);
    const result = test.submit();
    expect(result.timedOut).toBe(true);
    expect(result.elapsedMs).toBe(60_000);
  });

  it('records the real elapsed time of an early finish', () => {
    const { test, clock } = make({ minutes: 10 });
    clock.advance(125_400);
    const result = test.submit();
    expect(result.timedOut).toBe(false);
    expect(result.elapsedMs).toBe(125_400);
  });

  it('stops the clock after submission', () => {
    const { test, clock } = make({ minutes: 1 });
    test.submit();
    const before = test.getState();
    clock.advance(500_000);
    test.tick();
    expect(test.getState()).toBe(before);
    expect(test.getState().timedOut).toBe(false);
    expect(test.remainingMs()).toBe(0);
  });

  it('has no clock when untimed: no seconds, no auto-submit, however long it takes', () => {
    const { test, clock, paper } = make({ untimed: true, minutes: 1 });
    const s = test.getState();
    expect(s.secondsLeft).toBeNull();
    expect(s.secondsAllowed).toBeNull();
    expect(test.remainingMs()).toBeNull();
    test.setAnswer(at(paper, 'q1'), right);
    clock.advance(10 * 3_600_000);
    test.tick();
    test.setAnswer(at(paper, 'q2'), right);
    expect(test.getState().phase).toBe('running');
    expect(test.getState().secondsLeft).toBeNull();
    const result = test.submit();
    expect(result.timedOut).toBe(false);
    expect(result.score.correct).toBe(2);
    expect(result.elapsedMs).toBe(10 * 3_600_000);
    expect(test.getState().secondsLeft).toBeNull();
  });
});

describe('screen helpers', () => {
  it('formats the clock', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(59)).toBe('0:59');
    expect(formatClock(60)).toBe('1:00');
    expect(formatClock(2400)).toBe('40:00');
    expect(formatClock(-3)).toBe('0:00');
  });

  it('warns at 5 minutes and at 1 minute only', () => {
    expect(timeWarning(null)).toBe('');
    expect(timeWarning(2400)).toBe('');
    expect(timeWarning(301)).toBe('');
    expect(timeWarning(300)).toBe('five-minutes');
    expect(timeWarning(61)).toBe('five-minutes');
    expect(timeWarning(60)).toBe('one-minute');
    expect(timeWarning(0)).toBe('one-minute');
  });
});
