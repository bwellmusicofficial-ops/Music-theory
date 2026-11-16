'use client';

import { useMemo, useState } from 'react';
import { Stave } from '@/components/stave';
import { cn } from '@/components/ui/cn';
import { pitch } from '@/engine/pitch';
import type { Accidental, Letter, PitchClass } from '@/engine/types';
import type { MarkResult } from '@/lesson/contracts';
import { ResultMark } from '@/lesson/questions/face-view';
import type { Terminology } from '@/engine/types';
import { useAnswerReporting } from '@/lesson/questions/use-answer-reporting';
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
  initialAnswer?: Extract<NoteOnStaveAnswer, { mode: 'identify' }>;
  onAnswerChange?: (answer: NoteOnStaveAnswer | null) => void;
}

/** The note on a read-only stave; letter buttons (and a sign row when `accidentals`) name it. */
export function IdentifyView({
  payload,
  terminology,
  locked,
  result,
  onAnswer,
  initialAnswer,
  onAnswerChange,
}: IdentifyViewProps) {
  const [sign, setSign] = useState<Accidental>(() => (payload.accidentals ? (initialAnswer?.name.accidental ?? 0) : 0));
  const [letter, setLetter] = useState<Letter | null>(() => initialAnswer?.name.letter ?? null);
  // The answer is always the current letter and sign together, whichever was picked last.
  const chosen: PitchClass | null = letter === null ? null : { letter, accidental: payload.accidentals ? sign : 0 };
  useAnswerReporting<NoteOnStaveAnswer>(chosen === null ? null : { mode: 'identify', name: chosen }, onAnswerChange);
  const passage = useMemo(
    () => singleNotePassage(payload.clef, payload.key, payload.pitch),
    [payload.clef, payload.key, payload.pitch],
  );
  const marks = useMemo(
    () => (result === null ? undefined : ({ '0:0': result.correct ? 'correct' : 'wrong' } as const)),
    [result],
  );

  function choose(next: Letter) {
    if (locked) return;
    setLetter(next);
    onAnswer({ mode: 'identify', name: { letter: next, accidental: payload.accidentals ? sign : 0 } });
  }

  function chooseSign(next: Accidental) {
    if (locked) return;
    setSign(next);
    // The letter was already committed: commit the new sign with it, so the answer is not stale.
    if (letter !== null) onAnswer({ mode: 'identify', name: { letter, accidental: next } });
  }

  const shown: PitchClass = payload.pitch;
  const right = (l: Letter) => result !== null && l === shown.letter;
  const wrong = (l: Letter) => result !== null && !result.correct && chosen?.letter === l;
  const selected = (l: Letter) => chosen?.letter === l;

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
              onClick={() => chooseSign(s.sign)}
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
        {LETTERS.map((l) => (
          <button
            key={l}
            type="button"
            disabled={locked}
            aria-pressed={result === null ? selected(l) : undefined}
            data-state={right(l) ? 'right' : wrong(l) ? 'wrong' : selected(l) && result === null ? 'selected' : 'idle'}
            onClick={() => choose(l)}
            className={cn(
              CHOICE,
              right(l)
                ? 'border-success'
                : wrong(l)
                  ? 'border-danger'
                  : selected(l) && result === null
                    ? 'border-accent'
                    : 'border-border',
            )}
          >
            {selected(l) && result === null ? (
              <span aria-hidden="true" className="mr-1.5 text-accent">
                {'\u2713'}
              </span>
            ) : null}
            {l}
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
