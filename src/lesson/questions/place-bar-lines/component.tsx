'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Stave } from '@/components/stave';
import type { StaveGapRef, StaveMark } from '@/components/stave';
import { Button } from '@/components/ui';
import { rhythm } from '@/engine/rhythm';
import type { QuestionProps } from '@/lesson/contracts';
import { useAnswerReporting } from '@/lesson/questions/use-answer-reporting';
import { flatEvents, rebar, sortedAfter } from './bars';
import type { PlaceBarLinesAnswer, PlaceBarLinesPayload } from './types';

/** Keeps only gap numbers that exist in the payload (an answer that does not fit is ignored). */
function restore(answer: PlaceBarLinesAnswer | undefined, eventCount: number): number[] {
  const after = answer?.after;
  if (!Array.isArray(after)) return [];
  if (!after.every((i) => Number.isInteger(i) && i >= 0 && i <= eventCount - 2)) return [];
  return sortedAfter(after);
}

const refKey = (at: StaveGapRef) => `${at.bar}:${at.event}`;

/**
 * The passage with its inner bar lines missing. A gap is offered after every note and rest but the last; tapping
 * one toggles a bar line there. The passage is drawn again with real bar lines where the learner has put them,
 * so a gap's `{ bar, event }` (which names the passage as drawn) is mapped back to the flat event number here.
 */
export function PlaceBarLines({
  payload,
  locked,
  result,
  onAnswer,
  initialAnswer,
  onAnswerChange,
  hideCheck = false,
  terminology,
}: QuestionProps<PlaceBarLinesPayload, PlaceBarLinesAnswer>) {
  const events = useMemo(() => flatEvents(payload.passage), [payload.passage]);
  const [after, setAfter] = useState<number[]>(() => restore(initialAnswer, events.length));
  const rootRef = useRef<HTMLDivElement>(null);
  /** The gap (flat number) to put keyboard focus back on after the stave has been drawn again. */
  const refocus = useRef<number | null>(null);
  const readOnly = locked || result !== null;

  useAnswerReporting<PlaceBarLinesAnswer>(after.length > 0 ? { after } : null, onAnswerChange);

  const drawn = useMemo(() => rebar(payload.passage, after), [payload.passage, after]);
  // Flat event number -> where it is in the passage as drawn, and back.
  const { located, flatOf } = useMemo(() => {
    const located: StaveGapRef[] = [];
    const flatOf = new Map<string, number>();
    drawn.bars.forEach((bar, b) =>
      bar.events.forEach((_, e) => {
        flatOf.set(refKey({ bar: b, event: e }), located.length);
        located.push({ bar: b, event: e });
      }),
    );
    return { located, flatOf };
  }, [drawn]);

  const offered = useMemo(() => located.slice(0, -1), [located]);
  const on = useMemo(() => after.map((i) => located[i]!), [after, located]);

  const marks = useMemo(() => {
    if (result === null) return undefined;
    const out: Record<string, StaveMark> = {};
    drawn.bars.forEach((bar, b) => {
      out[String(b)] = rhythm.checkBarLength(bar, drawn.time).status === 'complete' ? 'correct' : 'wrong';
    });
    return out;
  }, [result, drawn]);

  function toggle(at: StaveGapRef) {
    const i = flatOf.get(refKey(at));
    if (readOnly || i === undefined) return;
    if (rootRef.current?.contains(document.activeElement)) refocus.current = i;
    setAfter((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : sortedAfter([...cur, i])));
  }

  // Moving a bar line renames the gaps (the passage is drawn with new bars), so the button that had focus is
  // replaced. Put focus on its successor, once the stave has drawn it.
  useEffect(() => {
    const i = refocus.current;
    if (i === null) return;
    let tries = 0;
    let frame = 0;
    const find = () => {
      const at = located[i]!;
      const button = rootRef.current?.querySelector<HTMLButtonElement>(`[data-testid="gap-${refKey(at)}"]`);
      if (button) {
        button.focus();
        refocus.current = null;
      } else if (tries++ < 60) frame = requestAnimationFrame(find);
    };
    find();
    return () => cancelAnimationFrame(frame);
  }, [after, located]);

  const label = (at: StaveGapRef) => {
    const i = flatOf.get(refKey(at)) ?? 0;
    return `Bar line after ${events[i]?.kind === 'rest' ? 'rest' : 'note'} ${i + 1}`;
  };

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      <Stave
        mode="read"
        size={events.length > 8 ? 'sm' : undefined}
        passage={drawn}
        marks={marks}
        terminology={terminology}
        ariaLabel={readOnly ? 'The passage with your bar lines' : 'Notes without bar lines. Choose the gaps where bar lines go.'}
        gaps={{ offered, on, onToggle: toggle, label }}
      />
      <p className="text-sm text-fg-secondary" aria-live="polite">
        {after.length === 0 ? 'No bar lines placed yet' : `${after.length} ${after.length === 1 ? 'bar line' : 'bar lines'} placed`}
      </p>
      {hideCheck ? null : (
        <div className="flex flex-wrap gap-3">
          <Button size="lg" disabled={readOnly || after.length === 0} onClick={() => onAnswer({ after })}>
            Check
          </Button>
        </div>
      )}
    </div>
  );
}
