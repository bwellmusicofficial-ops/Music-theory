import type { Page } from '@playwright/test';
import { allLessons, EXEMPLAR, type QuestionJson } from './content';
import { QUESTION_TYPES } from './questions';
import { seedSettings, seedStorage } from './app';

export const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

/** Routes that every accessibility check visits (the static routes plus a lesson and a mock paper). */
export const LESSON_STEPS = ['hook', 'explore', 'name', 'practice', 'challenge', 'recap'] as const;
export type LessonStep = (typeof LESSON_STEPS)[number];

/** Opens the exemplar lesson at a step by seeding saved progress (the hook is the default start). */
export async function openLessonAt(page: Page, step: LessonStep, theme: Theme, id = EXEMPLAR): Promise<void> {
  await seedSettings(page, { theme });
  if (step !== 'hook') {
    await seedStorage(page, {
      'mtn:v1:progress': { [id]: { lessonId: id, state: 'in-progress', step, questionIndex: 0, bestScore: null, updatedAt: new Date().toISOString() } },
    });
  }
  await page.goto(`/lessons/${id}`);
  await page.getByTestId('eyebrow').waitFor();
}

/** The first question of each of the nine types, authored first (generated ones need a seed). */
export function oneQuestionPerType(): { lesson: string; question: QuestionJson; type: string }[] {
  const out: { lesson: string; question: QuestionJson; type: string }[] = [];
  for (const type of QUESTION_TYPES) {
    let found: { lesson: string; question: QuestionJson } | null = null;
    for (const l of allLessons()) {
      for (const q of [...l.steps.practice.questions, ...l.steps.challenge.questions]) {
        if (q.type !== type) continue;
        if (!found || (found.question.source === 'generated' && q.source === 'authored')) found = { lesson: l.id, question: q };
        if (found.question.source === 'authored') break;
      }
      if (found?.question.source === 'authored') break;
    }
    if (found) out.push({ ...found, type });
  }
  return out;
}
