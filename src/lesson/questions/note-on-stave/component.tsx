'use client';

import type { QuestionProps } from '@/lesson/contracts';
import { IdentifyView } from './identify-view';
import { PlaceView } from './place-view';
import type { NoteOnStaveAnswer, NoteOnStavePayload } from './types';

/** `identify`: name the shown note. `place`: put the named note on an empty stave. */
export function NoteOnStave({
  payload,
  terminology,
  locked,
  result,
  onAnswer,
}: QuestionProps<NoteOnStavePayload, NoteOnStaveAnswer>) {
  return payload.mode === 'identify' ? (
    <IdentifyView payload={payload} terminology={terminology} locked={locked} result={result} onAnswer={onAnswer} />
  ) : (
    <PlaceView payload={payload} terminology={terminology} locked={locked} result={result} onAnswer={onAnswer} />
  );
}
