'use client';

import { useMemo, useState } from 'react';
import { Stave } from '@/components/stave';
import type { StaveGapRef } from '@/components/stave';
import { Button } from '@/components/ui';
import type { Passage } from '@/engine/types';
import type { QuestionProps } from '@/lesson/contracts';
import { useAnswerReporting } from '@/lesson/questions/use-answer-reporting';
import { beamGaps, groupsOf, joinsOf } from './beams';
import type { FixBeamingAnswer, FixBeamingPayload } from './types';

/** Joins from a restored answer, when every group fits the bar; otherwise null. */
function restoreJoins(payload: FixBeamingPayload, answer: FixBeamingAnswer | undefined): boolean[] | null {
  const bar = payload.passage.bars[payload.barIndex];
  const beams = answer?.beams;
  if (!bar || !Array.isArray(beams)) return null;
  const gaps = new Set(beamGaps(bar));
  const fits = beams.every(
    (g) => Array.isArray(g) && g.length >= 2 && g.every((i, k) => Number.isInteger(i) && (k === 0 || i === g[k - 1]! + 1) && (k === g.length - 1 ? true : gaps.has(i))),
  );
  return fits ? joinsOf(bar, beams) : null;
}

/**
 * One bar is beamed wrongly. A gap is offered between each pair of neighbouring beamable notes of that bar;
 * tapping one joins or splits the beam there and the bar is drawn again with the beams as written.
 */
export function FixBeaming({
  payload,
  terminology,
  locked,
  result,
  onAnswer,
  initialAnswer,
  onAnswerChange,
  hideCheck = false,
}: QuestionProps<FixBeamingPayload, FixBeamingAnswer>) {
  const { passage, barIndex } = payload;
  const bar = passage.bars[barIndex]!;
  const start = useMemo(() => joinsOf(bar, bar.beams ?? []), [bar]);
  const [joins, setJoins] = useState<boolean[]>(() => restoreJoins(payload, initialAnswer) ?? start);
  const readOnly = locked || result !== null;

  const beams = useMemo(() => groupsOf(joins), [joins]);
  useAnswerReporting<FixBeamingAnswer>({ beams }, onAnswerChange);

  const gaps = useMemo(() => beamGaps(bar), [bar]);
  const drawn = useMemo<Passage>(
    () => ({ ...passage, bars: passage.bars.map((b, i) => (i === barIndex ? { ...b, beams } : b)) }),
    [passage, barIndex, beams],
  );
  const offered = useMemo<StaveGapRef[]>(() => gaps.map((event) => ({ bar: barIndex, event })), [gaps, barIndex]);
  const on = useMemo<StaveGapRef[]>(() => offered.filter((g) => joins[g.event]), [offered, joins]);
  const marks = result === null ? undefined : ({ [String(barIndex)]: result.correct ? 'correct' : 'wrong' } as const);
  const changed = joins.some((j, i) => j !== start[i]);

  function toggle(at: StaveGapRef) {
    if (readOnly) return;
    setJoins((cur) => cur.map((j, i) => (i === at.event ? !j : j)));
  }

  return (
    <div className="flex flex-col gap-4">
      <Stave
        mode="read"
        passage={drawn}
        marks={marks}
        terminology={terminology}
        ariaLabel={readOnly ? 'The bar with your beams' : 'A bar with its beams. Join or split the beams between notes.'}
        gaps={{
          offered,
          on,
          onToggle: toggle,
          label: (at) => `Join note ${at.event + 1} and note ${at.event + 2}`,
        }}
      />
      <div className="flex flex-wrap gap-3">
        {hideCheck ? null : (
          <Button size="lg" disabled={readOnly} onClick={() => onAnswer({ beams })}>
            Check
          </Button>
        )}
        <Button size="lg" variant="secondary" disabled={readOnly || !changed} onClick={() => setJoins(start)}>
          Reset
        </Button>
      </div>
    </div>
  );
}
