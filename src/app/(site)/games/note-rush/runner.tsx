'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useSyncExternalStore } from 'react';
import { NoteRush, type GameResult } from '@/games/note-rush';
import { useSettings } from '@/settings';
import { syncGameBest } from '@/sync';

export const BEST_SCORE_KEY = 'mtn:v1:note-rush-best';

const listeners = new Set<() => void>();

function readBest(): number {
  try {
    const n = Number(localStorage.getItem(BEST_SCORE_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export function NoteRushRunner() {
  const router = useRouter();
  const { settings, loaded } = useSettings();
  const best = useSyncExternalStore(subscribe, readBest, () => 0);

  const onFinish = useCallback((result: GameResult) => {
    // Untimed runs still count: the score is what the learner earned.
    if (result.score <= readBest()) return;
    try {
      localStorage.setItem(BEST_SCORE_KEY, String(result.score));
    } catch {
      // Storage unavailable: the best score lasts for this page only.
    }
    syncGameBest('note-rush', null, result.score);
    for (const listener of listeners) listener();
  }, []);

  if (!loaded) {
    return (
      <div className="flex flex-1 items-center justify-center text-fg-secondary" role="status">
        Loading game
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
      <NoteRush
        settings={settings}
        bestScore={best}
        onFinish={onFinish}
        onExit={() => router.push('/')}
      />
    </div>
  );
}
