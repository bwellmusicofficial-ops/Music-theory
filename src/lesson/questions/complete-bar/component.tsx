'use client';

import { useMemo, useState } from 'react';
import { Stave } from '@/components/stave';
import type { StaveProps } from '@/components/stave';
import { Button } from '@/components/ui';
import type { Passage } from '@/engine/types';
import type { QuestionProps } from '@/lesson/contracts';
import type { Glyph } from '@/lesson/questions/shared';
import { eventToGlyph, sameGlyph } from './glyphs';
import { MAX_ADDED, type CompleteBarAnswer, type CompleteBarPayload } from './types';

/** The symbols the learner has added to the bar: its events after the given ones. */
function addedGlyphs(passage: Passage, barIndex: number, givenCount: number): (Glyph | null)[] {
  return (passage.bars[barIndex]?.events ?? []).slice(givenCount).map(eventToGlyph);
}

/** The stave palette that comes closest to the payload palette. */
function stavePalette(palette: readonly Glyph[]): NonNullable<StaveProps['palette']> {
  const values = [...new Set(palette.map((g) => g.duration.value))];
  const maxDots = Math.max(...palette.map((g) => g.duration.dots)) as 0 | 1 | 2;
  return {
    durations: values.map((value) => ({ value, dots: 0 as const })),
    rests: palette.some((g) => g.kind === 'rest'),
    dots: maxDots,
  };
}

const NOT_IN_PALETTE = 'That symbol is not one of the choices for this question.';
const TOO_MANY = `You can add up to ${MAX_ADDED} symbols.`;

/**
 * "Fill the gap": the stave locks the given notes and the learner adds
 * notes or rests after them. Check commits the symbols added.
 */
export function CompleteBar({
  payload,
  terminology,
  locked,
  result,
  onAnswer,
}: QuestionProps<CompleteBarPayload, CompleteBarAnswer>) {
  const { barIndex, fillPitch } = payload;
  const givenCount = payload.passage.bars[barIndex]?.events.length ?? 0;
  const [passage, setPassage] = useState<Passage>(payload.passage);
  const [notice, setNotice] = useState('');
  // Bumped to remount the stave when a change is refused or the bar is reset, which clears its undo history.
  const [epoch, setEpoch] = useState(0);

  const palette = useMemo(() => stavePalette(payload.palette), [payload.palette]);
  const edit = useMemo(() => ({ editable: [{ bar: barIndex, lockedPrefix: givenCount }] }), [barIndex, givenCount]);
  // Pinning the range to the fill pitch makes every added note sit on it.
  const range = useMemo(() => ({ low: fillPitch, high: fillPitch }), [fillPitch]);

  const added = addedGlyphs(passage, barIndex, givenCount);
  const readOnly = locked || result !== null;
  const marks = useMemo(
    () => (result === null ? undefined : ({ [String(barIndex)]: result.correct ? 'correct' : 'wrong' } as const)),
    [result, barIndex],
  );

  function onChange(next: Passage) {
    const glyphs = addedGlyphs(next, barIndex, givenCount);
    if (glyphs.length > MAX_ADDED) {
      setNotice(TOO_MANY);
      setEpoch((e) => e + 1);
      return;
    }
    const allowed = glyphs.every((g) => g !== null && payload.palette.some((p) => sameGlyph(p, g)));
    if (!allowed) {
      setNotice(NOT_IN_PALETTE);
      setEpoch((e) => e + 1);
      return;
    }
    setNotice('');
    setPassage(next);
  }

  function reset() {
    setNotice('');
    setEpoch((e) => e + 1);
    setPassage(payload.passage);
  }

  function check() {
    const glyphs = added.filter((g): g is Glyph => g !== null);
    if (glyphs.length > 0) onAnswer({ added: glyphs });
  }

  return (
    <div className="flex flex-col gap-4">
      <Stave
        key={epoch}
        mode={readOnly ? 'read' : 'edit'}
        passage={passage}
        onChange={onChange}
        palette={palette}
        edit={edit}
        range={range}
        marks={marks}
        terminology={terminology}
        ariaLabel={readOnly ? 'The bar with your notes added' : 'Complete the bar'}
      />
      <p role="status" className="min-h-6 text-sm text-fg-secondary">
        {notice}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button size="lg" disabled={readOnly || added.length === 0} onClick={check}>
          Check
        </Button>
        <Button size="lg" variant="secondary" disabled={readOnly || added.length === 0} onClick={reset}>
          Reset
        </Button>
      </div>
    </div>
  );
}
