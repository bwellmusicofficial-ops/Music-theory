/**
 * The test battery every generator runs (docs/generators-grade-1.md section 4).
 * Not a test file itself: each generator's `generate.test.ts` calls `runBattery`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pitch } from '@/engine/pitch';
import { rhythm } from '@/engine/rhythm';
import { createRng } from '@/engine/rng';
import type { Pitch, Terminology } from '@/engine/types';
import type { GeneratedQuestion, QuestionGenerator } from '@/lesson/contracts';
import { questionTypes } from '@/lesson/questions';
import { stripRichText } from '@/lesson/player/rich-text';
import { MAX_WORDS_PER_BLOCK, questionTypeSchema } from '@/lesson/schema';
import { APPENDIX_GLOSSARY_IDS } from './glossary-ids';

export interface ParamSet {
  name: string;
  /** Authored-shape params, parsed by the generator's `paramsSchema`. */
  params: unknown;
}

export interface BatteryOptions {
  generator: QuestionGenerator<never>;
  sets: ParamSet[];
  seeds?: number;
  /** The least number of different questions across the seeds, per param set. Default 2. */
  minDistinct?: number;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const GLOSSARY_IDS = new Set<string>([
  ...(JSON.parse(readFileSync(join(process.cwd(), 'content', 'glossary', '1.json'), 'utf8')) as { id: string }[]).map(
    (e) => e.id,
  ),
  ...APPENDIX_GLOSSARY_IDS,
]);

const words = (s: string): number => stripRichText(s).trim().split(/\s+/).filter(Boolean).length;

const UK_TERMS = /\b(crotchets?|minims?|semibreves?|quavers?|semiquavers?|bars?|staves|stave|tones?|semitones?)\b/i;
const US_TERMS = /\b(quarter (note|rest)s?|half (note|rest|step)s?|whole (note|rest|step)s?|eighth (note|rest)s?|sixteenth (note|rest)s?|measures?|staff)\b/i;

/** Every string a learner could read in a generated question (not the marking reasons). */
export function collectTexts(out: GeneratedQuestion): string[] {
  const texts: string[] = [];
  if (out.prompt !== undefined) texts.push(out.prompt);
  const walk = (v: unknown, key: string): void => {
    if (typeof v === 'string') {
      if (['text', 'reason', 'explanation', 'first', 'last'].includes(key)) texts.push(v);
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (isObj(v)) for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(out.payload, '');
  return texts;
}

export function linkIds(text: string): string[] {
  return [...text.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map((m) => m[1]!.trim());
}

/** Every passage inside a payload. */
export function passagesIn(v: unknown): { clef: string; time: { beats: number; beatUnit: number }; bars: { events: unknown[] }[] }[] {
  const found: ReturnType<typeof passagesIn> = [];
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (isObj(x)) {
      if (Array.isArray(x.bars) && typeof x.clef === 'string' && isObj(x.time)) found.push(x as never);
      Object.values(x).forEach(walk);
    }
  };
  walk(v);
  return found;
}

// --- answers ----------------------------------------------------------------------------

interface Case {
  label: string;
  answer: unknown;
}

const mod = (type: string) => questionTypes[type as keyof typeof questionTypes]!;

function findFill(
  palette: { kind: 'note' | 'rest'; duration: { value: never; dots: 0 | 1 | 2 } }[],
  gap: { n: number; d: number },
  count: number | undefined,
  used = 0,
): unknown[] | null {
  if (gap.n === 0) return count === undefined || used === count ? [] : null;
  if (used >= (count ?? 12)) return null;
  for (const g of palette) {
    const len = rhythm.durationLength(g.duration);
    const rest = rhythm.addFractions(gap, { n: -len.n, d: len.d });
    if (rest.n < 0) continue;
    const tail = findFill(palette, rest, count, used + 1);
    if (tail) return [g, ...tail];
  }
  return null;
}

const semitoneUp = (p: Pitch): Pitch => pitch.transpose(p, { quality: 'minor', number: 2 }, 'up');

/** The one correct answer, built from the payload alone. */
export function correctAnswer(type: string, payload: Obj): unknown {
  switch (type) {
    case 'multiple-choice':
    case 'by-ear':
      return { optionId: payload.correct };
    case 'match-up': {
      const left = payload.left as { id: string; match: string }[];
      return { pairs: Object.fromEntries(left.map((l) => [l.id, l.match])) };
    }
    case 'ordering':
      return { order: payload.correctOrder };
    case 'note-on-stave': {
      if (payload.mode === 'identify') {
        const p = payload.pitch as Pitch;
        return { mode: 'identify', name: { letter: p.letter, accidental: p.accidental } };
      }
      const t = payload.target as { letter: Pitch['letter']; accidental: Pitch['accidental'] };
      return { mode: 'place', pitch: { ...t, octave: (payload.octave as number | undefined) ?? 4 } };
    }
    case 'play-keyboard': {
      const targets = payload.targets as Pitch[];
      return { played: payload.mode === 'together' ? [...targets].sort((a, b) => pitch.toMidi(a) - pitch.toMidi(b)) : targets };
    }
    case 'tap-rhythm': {
      const n = rhythm.onsetTimes(payload.bars as never, payload.time as never, payload.bpm as number).length;
      return { errorsMs: Array.from({ length: n }, () => 0), extraTaps: 0, accuracy: 1 };
    }
    case 'complete-bar': {
      const passage = payload.passage as { bars: { events: never[] }[]; time: never };
      const bar = passage.bars[payload.barIndex as number]!;
      const gap = rhythm.checkBarLength(bar, passage.time).difference;
      const fill = findFill(payload.palette as never, gap, payload.count as number | undefined);
      if (!fill) throw new Error('no fill found for the complete-bar payload');
      return { added: fill };
    }
    case 'spot-mistake': {
      const m = payload.mistake as { bar: number; event?: number };
      return payload.select === 'bar' ? { bar: m.bar } : { bar: m.bar, event: m.event };
    }
  }
  throw new Error(`no solver for ${type}`);
}

/** Answers that must be marked wrong. */
export function wrongAnswers(type: string, payload: Obj): Case[] {
  switch (type) {
    case 'multiple-choice':
    case 'by-ear':
      return (payload.options as { id: string }[])
        .filter((o) => o.id !== payload.correct)
        .map((o) => ({ label: `option ${o.id}`, answer: { optionId: o.id } }));
    case 'match-up': {
      const left = payload.left as { id: string; match: string }[];
      const pairs = Object.fromEntries(left.map((l) => [l.id, l.match]));
      const [a, b] = [left[0]!, left[1]!];
      return [{ label: 'swapped pair', answer: { pairs: { ...pairs, [a.id]: b.match, [b.id]: a.match } } }];
    }
    case 'ordering': {
      const order = [...(payload.correctOrder as string[])];
      [order[0], order[1]] = [order[1]!, order[0]!];
      return [{ label: 'swapped first two', answer: { order } }];
    }
    case 'note-on-stave': {
      const other = (l: Pitch['letter']): Pitch['letter'] => (l === 'C' ? 'D' : 'C');
      if (payload.mode === 'identify') {
        const p = payload.pitch as Pitch;
        return [{ label: 'wrong letter', answer: { mode: 'identify', name: { letter: other(p.letter), accidental: 0 } } }];
      }
      const t = payload.target as { letter: Pitch['letter'] };
      return [{ label: 'wrong letter', answer: { mode: 'place', pitch: { letter: other(t.letter), accidental: 0, octave: 4 } } }];
    }
    case 'play-keyboard': {
      const targets = [...(payload.targets as Pitch[])];
      const wrong = semitoneUp(targets[0]!);
      const played = payload.mode === 'together' ? [wrong, ...targets.slice(1)] : [wrong, ...targets.slice(1)];
      played.sort((a, b) => (payload.mode === 'together' ? pitch.toMidi(a) - pitch.toMidi(b) : 0));
      return [{ label: 'first note a semitone out', answer: { played } }];
    }
    case 'tap-rhythm': {
      const n = rhythm.onsetTimes(payload.bars as never, payload.time as never, payload.bpm as number).length;
      return [{ label: 'no taps', answer: { errorsMs: Array.from({ length: n }, () => null), extraTaps: 0, accuracy: 0 } }];
    }
    case 'complete-bar': {
      const palette = payload.palette as { kind: string; duration: unknown }[];
      const cases: Case[] = [{ label: 'nothing added', answer: { added: [] } }];
      const right = JSON.stringify(correctAnswer(type, payload));
      for (const g of palette) {
        const single = { added: [g] };
        if (JSON.stringify(single) !== right) cases.push({ label: 'one other symbol', answer: single });
      }
      return cases;
    }
    case 'spot-mistake': {
      const passage = payload.passage as { bars: { events: unknown[] }[] };
      const m = payload.mistake as { bar: number; event?: number };
      const cases: Case[] = [];
      passage.bars.forEach((bar, b) => {
        if (payload.select === 'bar') {
          if (b !== m.bar) cases.push({ label: `bar ${b}`, answer: { bar: b } });
        } else {
          bar.events.forEach((_, e) => {
            if (b !== m.bar || e !== m.event) cases.push({ label: `bar ${b} event ${e}`, answer: { bar: b, event: e } });
          });
        }
      });
      return cases;
    }
  }
  throw new Error(`no wrong answers for ${type}`);
}

// --- checks -----------------------------------------------------------------------------

const BANNED_START = /^(incorrect|wrong|not quite|try again)\b/i;
const BLAME = /you forgot|you should|careless/i;

export function checkReason(reason: string | undefined, where: string): void {
  expect(reason, `${where}: reason`).toBeTruthy();
  const text = reason as string;
  expect(words(text), `${where}: ${text}`).toBeLessThanOrEqual(40);
  expect(text, where).not.toMatch(/!/);
  expect(text.trim(), where).not.toMatch(BANNED_START);
  expect(text, where).not.toMatch(BLAME);
  expect(text.trim(), where).toMatch(/[.?]$/);
}

export function checkQuestion(out: GeneratedQuestion, terminology: Terminology, tag: string): void {
  expect(questionTypeSchema.safeParse(out.type).success, `${tag}: type`).toBe(true);
  const typeModule = mod(out.type);
  const parsed = typeModule.payloadSchema.safeParse(out.payload);
  if (!parsed.success) throw new Error(`${tag}: payload invalid: ${parsed.error.message}\n${JSON.stringify(out.payload)}`);
  const payload = out.payload as Obj;

  // prompt
  expect(out.prompt, `${tag}: prompt`).toBeTruthy();
  expect(words(out.prompt as string), `${tag}: prompt words`).toBeLessThanOrEqual(20);
  expect(words(out.prompt as string)).toBeLessThanOrEqual(MAX_WORDS_PER_BLOCK);

  // texts: links, terminology, word limits
  for (const text of collectTexts(out)) {
    expect(words(text), `${tag}: "${text}"`).toBeLessThanOrEqual(MAX_WORDS_PER_BLOCK);
    for (const id of linkIds(text)) expect(GLOSSARY_IDS.has(id), `${tag}: unknown glossary id ${id} in "${text}"`).toBe(true);
    // "bar line" is the same in both terminologies.
    const shown = stripRichText(text).replace(/bar lines?/gi, '');
    if (terminology === 'us') expect(shown, `${tag}: UK term in US text`).not.toMatch(UK_TERMS);
    else expect(shown, `${tag}: US term in UK text`).not.toMatch(US_TERMS);
    // "a" straight before a linked quaver would read "a eighth note"
    expect(text, `${tag}: "a quaver"`).not.toMatch(/\ba \[\[quaver\|/i);
  }
  const payloadReasonOwners = ['multiple-choice', 'by-ear'];
  if (payloadReasonOwners.includes(out.type)) {
    for (const o of payload.options as { id: string; reason?: string }[]) {
      if (o.id !== payload.correct) checkReason(o.reason, `${tag} option ${o.id}`);
    }
    const faces = (payload.options as { face: unknown }[]).map((o) => JSON.stringify(o.face));
    expect(new Set(faces).size, `${tag}: duplicate options`).toBe(faces.length);
  }
  if (out.type === 'match-up') {
    for (const l of payload.left as { reason: string }[]) checkReason(l.reason, `${tag} match reason`);
  }
  if (out.type === 'ordering') {
    expect(words(payload.reason as string)).toBeLessThanOrEqual(30);
  }
  if (out.type === 'spot-mistake') {
    expect(words(payload.explanation as string)).toBeLessThanOrEqual(40);
  }

  // marking
  const right = typeModule.mark(payload, correctAnswer(out.type, payload));
  expect(right.correct, `${tag}: correct answer marked ${JSON.stringify(right)}`).toBe(true);
  expect(right.score).toBe(1);
  const wrongs = wrongAnswers(out.type, payload);
  expect(wrongs.length, `${tag}: no wrong answers to test`).toBeGreaterThan(0);
  for (const w of wrongs) {
    const result = typeModule.mark(payload, w.answer);
    expect(result.correct, `${tag}: ${w.label} marked correct`).toBe(false);
    checkReason(result.reason, `${tag}: ${w.label}`);
    for (const id of linkIds(result.reason ?? '')) expect(GLOSSARY_IDS.has(id), `${tag}: unknown id ${id}`).toBe(true);
  }

  // passages
  const exempt = out.type === 'complete-bar' ? [(payload.barIndex as number)] : out.type === 'spot-mistake' && payload.select === 'bar' ? [(payload.mistake as { bar: number }).bar] : [];
  for (const passage of passagesIn(payload)) {
    passage.bars.forEach((bar, i) => {
      const status = rhythm.checkBarLength(bar as never, passage.time as never).status;
      if (exempt.includes(i) && passagesIn(payload)[0] === passage) return;
      expect(status, `${tag}: bar ${i + 1} is ${status}`).toBe('complete');
      expect(rhythm.groupingProblems(bar as never, passage.time as never), `${tag}: bar ${i + 1} grouping`).toEqual([]);
    });
  }
}

/** Defines the battery as a vitest `describe`. */
export function runBattery({ generator, sets, seeds = 500, minDistinct = 2 }: BatteryOptions): void {
  const gen = generator as unknown as QuestionGenerator<unknown>;
  describe(`${gen.id}: battery`, () => {
    it('has a kebab-case id and a params schema', () => {
      expect(gen.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    });

    it.each(sets.map((s) => [s.name, s] as const))('%s: deterministic', (_n, set) => {
      const params = gen.paramsSchema.parse(set.params);
      for (const seed of [0, 1, 7, 42, 999]) {
        for (const t of ['uk', 'us'] as const) {
          expect(gen.generate(params, createRng(seed), t)).toEqual(gen.generate(params, createRng(seed), t));
        }
      }
    });

    it.each(sets.map((s) => [s.name, s] as const))(`%s: ${seeds} seeds, both terminologies`, (_n, set) => {
      const params = gen.paramsSchema.parse(set.params);
      const seen = new Set<string>();
      for (let seed = 0; seed < seeds; seed += 1) {
        for (const t of ['uk', 'us'] as const) {
          const out = gen.generate(params, createRng(seed), t);
          checkQuestion(out, t, `seed ${seed} ${t}`);
          if (t === 'uk') seen.add(JSON.stringify([out.payload, out.prompt]));
        }
      }
      expect(seen.size, 'different questions across seeds').toBeGreaterThanOrEqual(minDistinct);
    });

    it('rejects unknown params keys', () => {
      const first = sets[0]!.params;
      expect(gen.paramsSchema.safeParse({ ...(isObj(first) ? first : {}), notAParam: 1 }).success).toBe(false);
    });
  });
}

/** An rng that records every call and picks by index, for call-order tests. */
export function recordingRng(indexes: number[] = []): {
  rng: import('@/engine/types').Rng;
  calls: string[];
  lists: unknown[][];
} {
  const calls: string[] = [];
  const lists: unknown[][] = [];
  let at = 0;
  const rng: import('@/engine/types').Rng = {
    next: () => {
      calls.push('next');
      return 0;
    },
    int: (min) => {
      calls.push('int');
      return min + (indexes[at++] ?? 0);
    },
    pick: <T,>(items: readonly T[]): T => {
      calls.push('pick');
      lists.push([...items]);
      return items[indexes[at++] ?? 0] as T;
    },
    shuffle: <T,>(items: readonly T[]): T[] => {
      calls.push('shuffle');
      lists.push([...items]);
      return [...items];
    },
  };
  return { rng, calls, lists };
}
