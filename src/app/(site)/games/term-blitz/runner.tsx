'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { BEST_SCORES_KEY, parseBestScores, TermBlitz, type GameResult } from '@/games/term-blitz';
import type { GlossaryEntry } from '@/lesson/schema';
import { useSettings } from '@/settings';

const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    return localStorage.getItem(BEST_SCORES_KEY);
  } catch {
    return null;
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

export function TermBlitzRunner({ entries }: { entries: GlossaryEntry[] }) {
  const router = useRouter();
  const { settings, loaded } = useSettings();
  // The raw string is the snapshot, so it stays stable between reads.
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const bests = useMemo(() => parseBestScores(raw), [raw]);

  const onFinish = useCallback((deckId: string, result: GameResult) => {
    // Untimed rounds count too: the score is what the learner earned.
    const current = parseBestScores(readRaw());
    if (result.score <= (current[deckId] ?? 0)) return;
    try {
      localStorage.setItem(BEST_SCORES_KEY, JSON.stringify({ ...current, [deckId]: result.score }));
    } catch {
      // Storage unavailable: the best score lasts for this page only.
    }
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
    <div className="mx-auto w-full max-w-xl flex-1 px-2 py-3 sm:px-4 sm:py-4">
      <TermBlitz settings={settings} entries={entries} bests={bests} onFinish={onFinish} onExit={() => router.push('/')} />
    </div>
  );
}
