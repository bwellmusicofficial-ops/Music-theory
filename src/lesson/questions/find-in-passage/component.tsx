'use client';

import { useMemo, useState } from 'react';
import { Stave } from '@/components/stave';
import type { StaveMark } from '@/components/stave';
import { Button } from '@/components/ui';
import type { QuestionProps } from '@/lesson/contracts';
import { useAnswerReporting } from '@/lesson/questions/use-answer-reporting';
import type { FindInPassageAnswer, FindInPassagePayload } from './types';

type Place = { bar: number; event?: number };

const sortPlaces = (places: Place[]): Place[] => [...places].sort((a, b) => a.bar - b.bar || (a.event ?? 0) - (b.event ?? 0));

/**
 * The passage in read + tap mode. Each tap toggles a place in or out of the selection (an outline, and
 * `aria-pressed` on the stave's buttons); with `select: 'bar'` a tap on any note or rest toggles its bar.
 * Check is enabled when as many places are chosen as there are targets.
 */
export function FindInPassage({
  payload,
  terminology,
  locked,
  result,
  onAnswer,
  initialAnswer,
  onAnswerChange,
  hideCheck = false,
}: QuestionProps<FindInPassagePayload, FindInPassageAnswer>) {
  const { passage, select, targets } = payload;
  const keyOf = (p: Place) => (select === 'bar' ? String(p.bar) : `${p.bar}:${p.event}`);
  const [chosen, setChosen] = useState<Place[]>(() => {
    const given = initialAnswer?.chosen;
    if (!Array.isArray(given)) return [];
    const fits = given.every(
      (p) => p && passage.bars[p.bar] && (select === 'bar' ? p.event === undefined : p.event !== undefined && passage.bars[p.bar]!.events[p.event]),
    );
    const places = fits ? given.map((p) => (select === 'bar' ? { bar: p.bar } : { bar: p.bar, event: p.event })) : [];
    return sortPlaces([...new Map(places.map((p) => [select === 'bar' ? String(p.bar) : `${p.bar}:${p.event}`, p])).values()]);
  });
  const readOnly = locked || result !== null;
  const complete = chosen.length === targets.length;

  useAnswerReporting<FindInPassageAnswer>(complete ? { chosen } : null, onAnswerChange);

  const wanted = useMemo(() => new Set(targets.map(keyOf)), [targets]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosenKeys = useMemo(() => chosen.map(keyOf), [chosen]); // eslint-disable-line react-hooks/exhaustive-deps

  const marks = useMemo(() => {
    const out: Record<string, StaveMark> = {};
    for (const key of chosenKeys) out[key] = result === null ? 'highlight' : wanted.has(key) ? 'correct' : 'wrong';
    if (result !== null && !result.correct) {
      // Show what was missed, by outline.
      for (const key of wanted) if (!chosenKeys.includes(key)) out[key] = 'highlight';
    }
    return out;
  }, [chosenKeys, wanted, result]);

  function tap(bar: number, event: number) {
    if (readOnly) return;
    const place: Place = select === 'bar' ? { bar } : { bar, event };
    const key = keyOf(place);
    setChosen((cur) => (cur.some((p) => keyOf(p) === key) ? cur.filter((p) => keyOf(p) !== key) : sortPlaces([...cur, place])));
  }

  const label = select === 'bar' ? (terminology === 'us' ? 'Tap the measures that match' : 'Tap the bars that match') : 'Tap the notes and rests that match';

  return (
    <div className="flex flex-col gap-4">
      <Stave
        mode="read"
        passage={passage}
        ariaLabel={label}
        marks={marks}
        pressed={result === null ? chosenKeys : undefined}
        terminology={terminology}
        onEventTap={readOnly ? undefined : tap}
      />
      <p className="text-sm text-fg-secondary" aria-live="polite" data-testid="find-counter">
        {chosen.length} of {targets.length} chosen
      </p>
      {hideCheck ? null : (
        <div className="flex flex-wrap gap-3">
          <Button size="lg" disabled={readOnly || !complete} onClick={() => onAnswer({ chosen })}>
            Check
          </Button>
        </div>
      )}
    </div>
  );
}
