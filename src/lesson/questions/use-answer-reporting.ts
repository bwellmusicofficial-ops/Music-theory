import { useEffect, useRef } from 'react';

/**
 * Reports each change of a question component's current answer through
 * `onAnswerChange` (null when incomplete). Compares by value, so re-renders
 * that rebuild an equal answer report nothing. Nothing is reported on mount:
 * whatever the component starts with, including a restored `initialAnswer`,
 * is the baseline, not a change.
 */
export function useAnswerReporting<Answer>(
  current: Answer | null,
  onAnswerChange: ((answer: Answer | null) => void) | undefined,
): void {
  const key = JSON.stringify(current);
  const last = useRef(key);
  const latest = useRef({ current, onAnswerChange });

  // Effects run in order: the latest values are stored before the change check below.
  useEffect(() => {
    latest.current = { current, onAnswerChange };
  });
  useEffect(() => {
    if (key === last.current) return;
    last.current = key;
    latest.current.onAnswerChange?.(latest.current.current);
  }, [key]);
}
