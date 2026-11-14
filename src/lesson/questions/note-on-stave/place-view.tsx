'use client';

import { useMemo, useState } from 'react';
import { Stave } from '@/components/stave';
import { Button } from '@/components/ui';
import type { Passage, Pitch, Terminology } from '@/engine/types';
import type { MarkResult } from '@/lesson/contracts';
import { singleNotePassage } from './passage';
import type { NoteOnStaveAnswer, NoteOnStavePlace } from './types';

const DURATION = [{ value: 'semibreve', dots: 0 }] as const;
const SHOW = { timeSignature: false, finalBarline: false } as const;

export interface PlaceViewProps {
  payload: NoteOnStavePlace;
  terminology: Terminology;
  locked: boolean;
  result: MarkResult | null;
  onAnswer: (answer: NoteOnStaveAnswer) => void;
}

function placedPitch(passage: Passage): Pitch | null {
  const event = passage.bars[0]?.events[0];
  return event && event.kind === 'note' ? (event.pitches[0] ?? null) : null;
}

/** The stave in "pitch only" mode: one semibreve that a tap, drag or letter key sets. Check commits. */
export function PlaceView({ payload, terminology, locked, result, onAnswer }: PlaceViewProps) {
  const [passage, setPassage] = useState<Passage>(() => singleNotePassage(payload.clef, payload.key, null));
  const placed = placedPitch(passage);
  const palette = useMemo(
    () => ({ durations: [...DURATION], accidentals: payload.accidentals }),
    [payload.accidentals],
  );
  const edit = useMemo(() => ({ kind: 'single-note' as const }), []);
  const readOnly = locked || result !== null;
  const marks = useMemo(
    () => (result === null ? undefined : ({ '0:0': result.correct ? 'correct' : 'wrong' } as const)),
    [result],
  );

  return (
    <div className="flex flex-col gap-4">
      <Stave
        mode={readOnly ? 'read' : 'edit'}
        passage={passage}
        onChange={setPassage}
        palette={palette}
        edit={edit}
        marks={marks}
        show={SHOW}
        terminology={terminology}
        ariaLabel={readOnly ? 'The note you placed on the stave' : 'Place the note on the stave'}
      />
      <div>
        <Button
          size="lg"
          className="w-full sm:w-auto"
          disabled={readOnly || placed === null}
          onClick={() => placed && onAnswer({ mode: 'place', pitch: placed })}
        >
          Check
        </Button>
      </div>
    </div>
  );
}
