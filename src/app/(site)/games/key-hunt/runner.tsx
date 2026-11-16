'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { KeyHunt, type GameResult } from '@/games/key-hunt';
import { useSettings } from '@/settings';

/** One entry per variant, e.g. `{ "grade-1:sig-to-key:timed": 340 }` (see `variantOf`). */
export const BEST_SCORE_KEY = 'mtn:v1:key-hunt-best';

const listeners = new Set<() => void>();

function readRaw(): string {
  try {
    return localStorage.getItem(BEST_SCORE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function parseBests(raw: string): Record<string, number> {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(value)) if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
    return out;
  } catch {
    return {};
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

export function KeyHuntRunner() {
  const router = useRouter();
  const { settings, loaded } = useSettings();
  const raw = useSyncExternalStore(subscribe, readRaw, () => '');
  const bests = useMemo(() => parseBests(raw), [raw]);

  const onFinish = useCallback((result: GameResult, variant: string) => {
    const current = parseBests(readRaw());
    if (result.score <= (current[variant] ?? 0)) return;
    try {
      localStorage.setItem(BEST_SCORE_KEY, JSON.stringify({ ...current, [variant]: result.score }));
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
    <div className="mx-auto w-full max-w-3xl flex-1 px-3 py-3">
      <KeyHunt settings={settings} bests={bests} onFinish={onFinish} onExit={() => router.push('/')} />
    </div>
  );
}
