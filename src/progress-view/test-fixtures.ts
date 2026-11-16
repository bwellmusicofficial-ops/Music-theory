import type { AttemptEvent, LessonProgress, LessonState } from '@/lesson/contracts';
import type { StepId, Strand } from '@/lesson/schema';
import type { LessonMeta } from './course';

export function meta(id: string, over: Partial<LessonMeta> = {}): LessonMeta {
  return {
    id,
    title: `Title ${id}`,
    summary: `Summary ${id}`,
    grade: '1',
    unit: 'rhythm-1',
    order: 1,
    strand: 'rhythm',
    skills: [`rhythm.${id}.a`],
    status: 'draft',
    estimatedMinutes: 6,
    ...over,
  };
}

/** Six lessons in teaching order: two in Start here, four in Grade 1 over two units. */
export function sampleLessons(): LessonMeta[] {
  return [
    meta('s1', { grade: 'start', unit: 'pulse-1', order: 1, strand: 'rhythm', status: 'reviewed' }),
    meta('s2', { grade: 'start', unit: 'pulse-1', order: 2, strand: 'rhythm' }),
    meta('g1', { grade: '1', unit: 'rhythm-1', order: 1, strand: 'rhythm', skills: ['rhythm.note-values.quaver'] }),
    meta('g2', { grade: '1', unit: 'rhythm-1', order: 2, strand: 'rhythm', skills: ['rhythm.note-values.quaver', 'rhythm.time.identify'] }),
    meta('g3', { grade: '1', unit: 'pitch-1', order: 1, strand: 'pitch', skills: ['pitch.treble.lines'] }),
    meta('g4', { grade: '1', unit: 'pitch-1', order: 2, strand: 'pitch', skills: ['pitch.treble.spaces'] }),
  ];
}

export function prog(lessonId: string, state: LessonState, over: Partial<LessonProgress> = {}): LessonProgress {
  return { lessonId, state, step: 'hook', questionIndex: 0, bestScore: null, updatedAt: '2026-11-10T10:00:00.000Z', ...over };
}

export function step(s: StepId): Pick<LessonProgress, 'step'> {
  return { step: s };
}

/** An attempt at a local time (year, 0-based month, day, hour, minute, second). */
export function attempt(
  at: Date,
  over: Partial<AttemptEvent> = {},
): AttemptEvent {
  return {
    lessonId: 'g1',
    step: 'practice',
    questionId: 'q1',
    skill: 'rhythm.note-values.quaver',
    type: 'multiple-choice',
    correct: true,
    score: 1,
    msTaken: 0,
    at: at.toISOString(),
    ...over,
  };
}

export function strandOf(lessons: LessonMeta[], strand: Strand): LessonMeta[] {
  return lessons.filter((l) => l.strand === strand);
}
