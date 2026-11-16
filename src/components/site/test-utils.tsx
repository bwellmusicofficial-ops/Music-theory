import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { listLessons } from '@/content/load';
import type { AttemptEvent, LessonProgress } from '@/lesson/contracts';
import { ATTEMPTS_KEY, PROGRESS_KEY } from '@/lesson/progress';
import { SettingsProvider } from '@/settings';
import { resetSettingsStoreForTests } from '@/settings/store';
import { SETTINGS_KEY } from '@/settings/storage';

export function renderPage(ui: ReactElement) {
  return render(<SettingsProvider>{ui}</SettingsProvider>);
}

export function resetBrowserState(terminology: 'uk' | 'us' = 'uk') {
  localStorage.clear();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ terminology }));
  resetSettingsStoreForTests();
}

export function seed(progress: LessonProgress[], attempts: AttemptEvent[] = []) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(Object.fromEntries(progress.map((p) => [p.lessonId, p]))));
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
}

export function row(lessonId: string, state: LessonProgress['state'], over: Partial<LessonProgress> = {}): LessonProgress {
  return { lessonId, state, step: 'practice', questionIndex: 0, bestScore: null, updatedAt: new Date().toISOString(), ...over };
}

export const allLessons = () => listLessons();

export function attemptNow(lessonId: string, skill: string, correct: boolean, minutesAgo = 0): AttemptEvent {
  return {
    lessonId, step: 'practice', questionId: 'q', skill, type: 'multiple-choice', correct, score: correct ? 1 : 0,
    msTaken: 5000, at: new Date(Date.now() - minutesAgo * 60000).toISOString(),
  };
}
