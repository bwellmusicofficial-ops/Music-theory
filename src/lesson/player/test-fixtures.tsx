/**
 * Test-only fixtures: a dev question type, generators, an in-memory sink and a
 * small lesson builder. Not exported from index.ts and not part of the registry.
 */
import { z } from 'zod';
import type {
  AttemptEvent,
  GeneratorRegistry,
  LessonProgress,
  MarkResult,
  ProgressSink,
  QuestionProps,
  QuestionTypeModule,
  QuestionTypeRegistry,
} from '../contracts';
import { QUESTION_TYPES, lessonSchema, type Lesson, type QuestionTypeId } from '../schema';

// --- fixture question type -------------------------------------------------------------

export interface FixturePayload {
  /** Anything; the exemplar's real payloads pass through untouched. */
  [key: string]: unknown;
}
export type FixtureAnswer = 'right' | 'wrong';

export function FixtureComponent({ locked, result, onAnswer }: QuestionProps<FixturePayload, FixtureAnswer>) {
  return (
    <div data-testid="fixture-question" data-locked={locked} data-result={result ? String(result.correct) : ''}>
      <button type="button" disabled={locked} onClick={() => onAnswer('right')}>
        Right answer
      </button>
      <button type="button" disabled={locked} onClick={() => onAnswer('wrong')}>
        Wrong answer
      </button>
    </div>
  );
}

export function fixtureMark(_payload: FixturePayload, answer: FixtureAnswer): MarkResult {
  return answer === 'right'
    ? { correct: true, score: 1, reason: 'Right, that is the **correct** [[crotchet|crotchet]].' }
    : { correct: false, score: 0, reason: 'That was wrong: a [[crotchet|crotchet]] lasts 1 beat.' };
}

export function fixtureModule(type: QuestionTypeId, schema: z.ZodType<FixturePayload> = z.record(z.string(), z.unknown())): QuestionTypeModule<FixturePayload, FixtureAnswer> {
  return { type, payloadSchema: schema, Component: FixtureComponent, mark: fixtureMark };
}

/** A registry that serves every type with the fixture module. */
export function fixtureRegistry(without: QuestionTypeId[] = []): QuestionTypeRegistry {
  const reg: QuestionTypeRegistry = {};
  for (const t of QUESTION_TYPES) if (!without.includes(t)) reg[t] = fixtureModule(t);
  return reg;
}

export const fixtureGenerators: GeneratorRegistry = {
  'tap-note-values': {
    id: 'tap-note-values',
    paramsSchema: z.record(z.string(), z.unknown()),
    generate: (_params, rng) => ({ type: 'tap-rhythm', payload: { roll: rng.int(0, 999_999) } }),
  },
  gen: {
    id: 'gen',
    paramsSchema: z.object({ n: z.number().default(3) }),
    generate: (params, rng) => ({
      type: 'multiple-choice',
      payload: { n: params.n, roll: rng.int(0, 999_999) },
      prompt: `Generated question ${rng.int(0, 9)}`,
    }),
  },
};

// --- in-memory sink ------------------------------------------------------------------------

export class MemorySink implements ProgressSink {
  attempts: AttemptEvent[] = [];
  saves: LessonProgress[] = [];
  stored = new Map<string, LessonProgress>();
  failWrites = false;

  async recordAttempt(event: AttemptEvent) {
    if (this.failWrites) throw new Error('disk full');
    this.attempts.push(event);
  }
  async saveLessonProgress(progress: LessonProgress) {
    if (this.failWrites) throw new Error('disk full');
    this.saves.push(progress);
    this.stored.set(progress.lessonId, progress);
  }
  async loadLessonProgress(lessonId: string) {
    return this.stored.get(lessonId) ?? null;
  }
  async loadAllLessonProgress() {
    return [...this.stored.values()];
  }
  get lastSave() {
    return this.saves[this.saves.length - 1];
  }
}

export class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

// --- lesson builder ----------------------------------------------------------------------------

const passage = {
  clef: 'treble',
  key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
  time: { beats: 4, beatUnit: 4 },
  bars: [
    {
      events: [
        { kind: 'note', pitches: [{ letter: 'C', accidental: 0, octave: 4 }], duration: { value: 'crotchet', dots: 0 } },
      ],
    },
  ],
};

export function authored(id: string, type: QuestionTypeId = 'multiple-choice', hint: string | undefined = 'Think about the beats.') {
  return { id, type, skill: 'rhythm.pulse.steady', prompt: `Prompt for ${id}`, hint, source: 'authored' as const, payload: { id } };
}
export function generated(id: string, hint: string | undefined = 'Hint for the generated one.') {
  return {
    id,
    type: 'multiple-choice' as const,
    skill: 'rhythm.pulse.steady',
    prompt: `Prompt for ${id}`,
    hint,
    source: 'generated' as const,
    generator: { id: 'gen', params: {} },
  };
}

export interface BuildOptions {
  practice?: unknown[];
  challenge?: unknown[];
  count?: number;
  passMark?: number;
  seconds?: number;
  instrument?: 'keyboard' | 'rhythm-pad' | 'stave';
  exploreExhibit?: unknown;
  cards?: number;
}

/** A small valid lesson: 4 practice questions, a 5-question pool, count 5, pass mark 0.8. */
export function buildLesson(o: BuildOptions = {}): Lesson {
  return lessonSchema.parse({
    schemaVersion: 1,
    id: 'g1-test-lesson',
    title: 'Test lesson',
    summary: 'A lesson for tests.',
    usTitle: 'Test lesson (US)',
    grade: '1',
    unit: 'rhythm-1',
    order: 1,
    strand: 'rhythm',
    skills: ['rhythm.pulse.steady'],
    estimatedMinutes: 5,
    steps: {
      hook: { text: 'Hook text about a [[crotchet|crotchet]].', exhibit: { kind: 'passage', tempo: 100, passage } },
      explore: {
        text: 'Explore text.',
        instrument: o.instrument ?? 'keyboard',
        exhibit: o.exploreExhibit ?? { kind: 'keyboard', highlight: ['C4', 'E4'], low: 'C4', high: 'C5' },
        goal: 'Play two keys.',
      },
      name: {
        cards: Array.from({ length: o.cards ?? 2 }, (_, i) => ({ text: `Card ${i + 1} about [[bar|bars]].` })),
        alternative: { text: 'The other way to see it.' },
      },
      practice: { questions: o.practice ?? [authored('p1'), authored('p2'), authored('p3'), generated('p4')] },
      challenge: {
        seconds: o.seconds ?? 60,
        questions: o.challenge ?? [authored('c1'), authored('c2'), authored('c3'), authored('c4'), generated('c5')],
        count: o.count ?? 5,
        passMark: o.passMark ?? 0.8,
      },
      recap: { points: ['Point one.', 'Point **two**.'] },
    },
  });
}
