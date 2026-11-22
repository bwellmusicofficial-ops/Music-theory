'use client';

import { useEffect, useState } from 'react';
import type { GameInfo } from '@/components/site/games';
import type { AttemptEvent } from '@/lesson/contracts';
import { createLocalProgressSink, type LocalProgressSink } from '@/lesson/progress';
import { bestOf, createLocalMockResultSink, type MockAttempt, type MockResultSink } from '@/mock/store';
import { toProgressMap, type ProgressMap } from './progress';

export interface StoredProgress {
  /** 'loading' on the server and during hydration: render a skeleton, never zeros dressed up as data. */
  status: 'loading' | 'ready';
  progress: ProgressMap;
  attempts: AttemptEvent[];
  /** The time the data was read; fixed per read so renders are stable. */
  now: Date;
}

const EPOCH = new Date(0);
const EMPTY: StoredProgress = { status: 'loading', progress: new Map(), attempts: [], now: EPOCH };

/** Re-read when another tab writes, or when the page comes back from the background. */
function useReloadTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    const onVisible = () => {
      if (document.visibilityState === 'visible') bump();
    };
    window.addEventListener('storage', bump);
    window.addEventListener('pageshow', bump);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('storage', bump);
      window.removeEventListener('pageshow', bump);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return tick;
}

/** Reads lesson progress and attempts from the local sink after mount. */
export function useStoredProgress(sink?: LocalProgressSink): StoredProgress {
  const [state, setState] = useState<StoredProgress>(EMPTY);
  const tick = useReloadTick();
  useEffect(() => {
    let cancelled = false;
    const used = sink ?? createLocalProgressSink();
    Promise.all([used.loadAllLessonProgress(), used.loadAttempts()])
      .catch((): [never[], never[]] => [[], []])
      .then(([list, attempts]) => {
        if (!cancelled) setState({ status: 'ready', progress: toProgressMap(list), attempts, now: new Date() });
      });
    return () => {
      cancelled = true;
    };
  }, [sink, tick]);
  return state;
}

function readNumber(key: string): number | undefined {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

function readBestOfMap(key: string): number | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined;
    const values = Object.values(data).filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
    return values.length > 0 ? Math.max(...values) : undefined;
  } catch {
    return undefined;
  }
}

export interface Bests {
  loaded: boolean;
  /** Personal best per game id, where stored. */
  games: Record<string, number | undefined>;
  /** The best mock attempt over every test, or null. */
  mock: MockAttempt | null;
}

/** Personal bests for the games and the mock tests, read after mount. */
export function useBests(games: readonly GameInfo[], mockSink?: MockResultSink): Bests {
  const [state, setState] = useState<Bests>({ loaded: false, games: {}, mock: null });
  const tick = useReloadTick();
  useEffect(() => {
    let cancelled = false;
    const found: Record<string, number | undefined> = {};
    for (const game of games) {
      if (!game.best) continue;
      found[game.id] = game.best.shape === 'single' ? readNumber(game.best.key) : readBestOfMap(game.best.key);
    }
    (mockSink ?? createLocalMockResultSink())
      .list()
      .catch((): MockAttempt[] => [])
      .then((all) => {
        if (!cancelled) setState({ loaded: true, games: found, mock: bestOf(all) });
      });
    return () => {
      cancelled = true;
    };
  }, [games, mockSink, tick]);
  return state;
}
