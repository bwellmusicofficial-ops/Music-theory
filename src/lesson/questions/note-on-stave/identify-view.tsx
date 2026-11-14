'use client';

import { useMemo, useState } from 'react';
import { Stave } from '@/components/stave';
import { cn } from '@/components/ui/cn';
import { pitch } from '@/engine/pitch';
import type { Accidental, Letter, PitchClass } from '@/engine/types';
import type { MarkResult } from '@/lesson/contracts';
import { ResultMark } from '@/lesson/questions/face-view';
import type { Terminology } from '@/engine/types';
import { singleNotePassage } from './passage';
import type { NoteOnStaveAnswer, NoteOnStaveIdentify } from './types';

const LETTERS: readonly Letter[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const SIGNS: { sign: Accidental; label: string; glyph: string }[] = [
  { sign: -1, label: 'Flat', glyph: '♭' },
  { sign: 0, label: 'Natural', glyph: '♮' },
  { sign: 1, label: 'Sharp', glyph: '♯' },
];

const CHOICE =
  'flex min-h-14 min-w-12 flex-1 items-center justify-center rounded-lg border-2 bg-surface px-2 text-xl font-bold text-fg ' +
  'transition-[border-color,opacity] duration-(--motion-duration-fast) ease-standard ' +
  'enabled:cursor-pointer enabled:hover:border-accent disabled:cursor-default';

export interface IdentifyViewProps {
  payload: NoteOnStaveIdentify;
  terminology: Terminology;
  locked: boolean;
  result: MarkResult | null;
  onAnswer: (answer: NoteOnStaveAnswer) => void;
}

/** The note on a read-only stave; letter buttons (and a sign row when `accidentals`) name it. */
export function IdentifyView({ payload, terminology, locked, result, onAnswer }: IdentifyViewProps) {
  const [sign, setSign] = useState<Accidental>(0);
  const [chosen, setChosen] = useState<PitchClass | null>(null);
  const passage = useMemo(
    () => singleNotePassage(payload.clef, payload.key, payload.pitch),
    [payload.clef, payload.key, payload.pitch],
  );
  const marks = useMemo(
    () => (result === null ? undefined : ({ '0:0': result.correct ? 'correct' : 'wrong' } as const)),
    [result],
  );

  function choose(letter: Letter) {
    if (locked) return;
    const name: PitchClass = { letter, accidental: payload.accidentals ? sign : 0 };
    setChosen(name);
    onAnswer({ mode: 'identify', name });
  }

  const shown: PitchClass = payload.pitch;
  const right = (letter: Letter) => result !== null && letter === shown.letter;
  const wrong = (letter: Letter) => result !== null && !result.correct && chosen?.letter === letter;

  return (
    <div className="flex flex-col gap-4">
      <Stave
        mode="read"
        passage={passage}
        ariaLabel={`A note on the ${payload.clef} stave`}
        marks={marks}
        pitchSpeech="positions"
        terminology={terminology}
        show={{ timeSignature: false, finalBarline: false }}
      />
      {payload.accidentals ? (
        <div role="group" aria-label="Sign" className="flex gap-2">
          {SIGNS.map((s) => (
            <button
              key={s.sign}
              type="button"
              aria-pressed={sign === s.sign}
              disabled={locked}
              onClick={() => setSign(s.sign)}
              className={cn(CHOICE, 'min-h-11 text-base', sign === s.sign ? 'border-accent' : 'border-border')}
            >
              <span aria-hidden="true" className="mr-2 text-xl">
                {s.glyph}
              </span>
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
      <div role="group" aria-label="Note name" className="flex flex-wrap gap-2">
        {LETTERS.map((letter) => (
          <button
            key={letter}
            type="button"
            disabled={locked}
            data-state={right(letter) ? 'right' : wrong(letter) ? 'wrong' : 'idle'}
            onClick={() => choose(letter)}
            className={cn(CHOICE, right(letter) ? 'border-success' : wrong(letter) ? 'border-danger' : 'border-border')}
          >
            {letter}
          </button>
        ))}
      </div>
      {result !== null ? (
        <div className="flex flex-wrap gap-2" data-testid="identify-result">
          {chosen && !result.correct ? (
            <ResultMark tone="wrong">Your answer: {pitch.displayPitchClass(chosen)}</ResultMark>
          ) : null}
          <ResultMark tone="right">
            {result.correct ? 'Correct' : 'Correct answer'}: {pitch.displayPitchClass(shown)}
          </ResultMark>
        </div>
      ) : null}
    </div>
  );
}
