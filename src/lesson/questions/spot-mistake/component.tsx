'use client';

import { useMemo, useState } from 'react';
import { Stave } from '@/components/stave';
import type { StaveMark } from '@/components/stave';
import { Button } from '@/components/ui';
import type { QuestionProps } from '@/lesson/contracts';
import { PlayButton } from '@/lesson/questions/notation/play-button';
import { usePassagePlayback } from '@/lesson/questions/notation/use-passage-playback';
import type { SpotMistakeAnswer, SpotMistakePayload } from './types';

const keyOf = (select: SpotMistakePayload['select'], bar: number, event?: number) =>
  select === 'bar' ? String(bar) : `${bar}:${event}`;

/**
 * The passage in read + tap mode. A tap selects (and a second tap elsewhere
 * changes the selection); Check commits. With `select: 'bar'` a tap on any
 * note or rest selects its whole bar.
 */
export function SpotMistake({
  payload,
  terminology,
  locked,
  result,
  onAnswer,
}: QuestionProps<SpotMistakePayload, SpotMistakeAnswer>) {
  const { select, passage, mistake, reference } = payload;
  const [selected, setSelected] = useState<SpotMistakeAnswer | null>(null);
  const playback = usePassagePlayback();
  const readOnly = locked || result !== null;

  const marks = useMemo(() => {
    const out: Record<string, StaveMark> = {};
    if (selected) {
      const key = keyOf(select, selected.bar, selected.event);
      out[key] = result === null ? 'highlight' : result.correct ? 'correct' : 'wrong';
    }
    if (result !== null && !result.correct) {
      // Show where the mistake really was, by outline.
      out[keyOf(select, mistake.bar, mistake.event)] = 'highlight';
    }
    return out;
  }, [selected, result, select, mistake]);

  function tap(bar: number, event: number) {
    if (readOnly) return;
    setSelected(select === 'bar' ? { bar } : { bar, event });
  }

  const label =
    select === 'bar'
      ? terminology === 'us'
        ? 'Tap the measure with the mistake'
        : 'Tap the bar with the mistake'
      : 'Tap the note or rest with the mistake';

  return (
    <div className="flex flex-col gap-4">
      <Stave
        mode="read"
        passage={passage}
        ariaLabel={label}
        marks={marks}
        terminology={terminology}
        onEventTap={readOnly ? undefined : tap}
      />
      <div className="flex flex-wrap gap-3">
        {reference ? (
          <PlayButton
            label="the correct version"
            playing={playback.playing}
            onToggle={() => (playback.playing ? playback.stop() : void playback.play(reference.passage, reference.bpm))}
          />
        ) : null}
        <Button size="lg" disabled={readOnly || selected === null} onClick={() => selected && onAnswer(selected)}>
          Check
        </Button>
      </div>
    </div>
  );
}
