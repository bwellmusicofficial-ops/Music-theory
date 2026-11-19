'use client';

import { useMemo, useState } from 'react';
import { Stave } from '@/components/stave';
import type { KeySignatureSign } from '@/components/stave';
import { Button } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import type { Clef, Passage } from '@/engine/types';
import type { QuestionProps } from '@/lesson/contracts';
import { useAnswerReporting } from '@/lesson/questions/use-answer-reporting';
import { HIGHEST_POSITION, LOWEST_POSITION, MAX_SIGNS, type WriteKeySignatureAnswer, type WriteKeySignaturePayload } from './types';

const SIGNS: { sign: 1 | -1; label: string; glyph: string }[] = [
  { sign: 1, label: 'Sharp', glyph: '♯' },
  { sign: -1, label: 'Flat', glyph: '♭' },
];

const CHOICE =
  'flex min-h-11 min-w-12 flex-1 items-center justify-center rounded-lg border-2 bg-surface px-2 text-base font-bold text-fg ' +
  'transition-[border-color,opacity] duration-(--motion-duration-fast) ease-standard ' +
  'enabled:cursor-pointer enabled:hover:border-accent disabled:cursor-default disabled:opacity-60';

/** The stave only takes its clef from the passage: one bar holding a whole-bar rest, which is not drawn. */
const stavePassage = (clef: Clef): Passage => ({
  clef,
  key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
  time: { beats: 4, beatUnit: 4 },
  bars: [{ events: [{ kind: 'rest', duration: { value: 'semibreve', dots: 0 } }] }],
});

/** A restored answer's signs, when every one is a sign on the stave. */
function restore(answer: WriteKeySignatureAnswer | undefined): KeySignatureSign[] {
  const signs = answer?.signs;
  if (!Array.isArray(signs) || signs.length > MAX_SIGNS) return [];
  const ok = signs.every(
    (s) => s && (s.sign === 1 || s.sign === -1) && Number.isInteger(s.position) && s.position >= LOWEST_POSITION && s.position <= HIGHEST_POSITION,
  );
  return ok ? signs.map((s) => ({ sign: s.sign, position: s.position })) : [];
}

/**
 * The key-signature stave with a sharp / flat palette. Each tap appends a sign of the chosen kind at the tapped
 * position; Undo takes off the last, Clear takes off all. Check commits the signs, left to right.
 */
export function WriteKeySignature({
  payload,
  terminology,
  locked,
  result,
  onAnswer,
  initialAnswer,
  onAnswerChange,
  hideCheck = false,
}: QuestionProps<WriteKeySignaturePayload, WriteKeySignatureAnswer>) {
  const [signs, setSigns] = useState<KeySignatureSign[]>(() => restore(initialAnswer));
  const [armed, setArmed] = useState<1 | -1>(1);
  const readOnly = locked || result !== null;
  const passage = useMemo(() => stavePassage(payload.clef), [payload.clef]);

  useAnswerReporting<WriteKeySignatureAnswer>(signs.length > 0 ? { signs } : null, onAnswerChange);

  function tap(position: number) {
    if (readOnly) return;
    // The stave itself says "The key signature is full" and reports nothing at seven; this is a second guard.
    if (signs.length >= MAX_SIGNS) return;
    setSigns((cur) => [...cur, { sign: armed, position }]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Sign to place" className="flex gap-2">
        {SIGNS.map((s) => (
          <button
            key={s.sign}
            type="button"
            aria-pressed={armed === s.sign}
            disabled={readOnly}
            onClick={() => setArmed(s.sign)}
            className={cn(CHOICE, armed === s.sign ? 'border-accent' : 'border-border')}
          >
            <span aria-hidden="true" className="mr-2 text-xl">
              {s.glyph}
            </span>
            {s.label}
          </button>
        ))}
      </div>
      <Stave
        mode="edit"
        passage={passage}
        edit={{ kind: 'key-signature' }}
        keySignatureSigns={signs}
        keySignatureArmed={armed}
        onKeySignatureTap={tap}
        terminology={terminology}
        sound={false}
        ariaLabel={readOnly ? 'Your key signature' : `Key signature, ${payload.clef} clef. Tap the stave to place a sign.`}
      />
      <div className="flex flex-wrap gap-3">
        {hideCheck ? null : (
          <Button size="lg" disabled={readOnly || signs.length === 0} onClick={() => onAnswer({ signs })}>
            Check
          </Button>
        )}
        <Button
          size="lg"
          variant="secondary"
          disabled={readOnly || signs.length === 0}
          onClick={() => setSigns((cur) => cur.slice(0, -1))}
        >
          Undo
        </Button>
        <Button
          size="lg"
          variant="secondary"
          disabled={readOnly || signs.length === 0}
          onClick={() => setSigns([])}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}
