'use client';

import { useEffect, useState } from 'react';
import type { MockAttempt, MockResultSink } from '../store';

/** The best saved attempt at a test, loaded from the sink after mount; `loaded` is false until then. */
export function useBestResult(sink: MockResultSink, configId: string, refreshKey: unknown = 0) {
  const [state, setState] = useState<{ best: MockAttempt | null; loaded: boolean }>({ best: null, loaded: false });
  useEffect(() => {
    let cancelled = false;
    sink
      .best(configId)
      .catch(() => null)
      .then((best) => {
        if (!cancelled) setState({ best, loaded: true });
      });
    return () => {
      cancelled = true;
    };
  }, [sink, configId, refreshKey]);
  return state;
}
