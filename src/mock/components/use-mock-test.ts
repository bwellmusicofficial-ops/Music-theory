'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type { MockTest, TestState } from '../engine';

/** Interval, in milliseconds, at which the clock is re-read. */
export const TICK_MS = 250;

/** Subscribes a component to a running test and drives its clock while the test is timed and running. */
export function useMockTest(test: MockTest): TestState {
  const state = useSyncExternalStore(test.subscribe, test.getState, test.getState);
  const ticking = state.phase === 'running' && state.secondsLeft !== null;
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => test.tick(), TICK_MS);
    return () => clearInterval(id);
  }, [ticking, test]);
  return state;
}
