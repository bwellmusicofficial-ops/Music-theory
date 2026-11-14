'use client';

import type { Letter } from '@/engine/types';

export const LETTERS: readonly Letter[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

export interface LetterPadProps {
  disabled: boolean;
  onAnswer: (letter: Letter) => void;
}

/** Seven large answer buttons: two rows on a phone, one row from 480 px. */
export function LetterPad({ disabled, onAnswer }: LetterPadProps) {
  return (
    <div role="group" aria-label="Note names" className="grid grid-cols-4 gap-2 min-[480px]:grid-cols-7">
      {LETTERS.map((l) => (
        <button key={l} type="button" className="nr-key min-h-14 min-w-12" disabled={disabled} onClick={() => onAnswer(l)}>
          {l}
        </button>
      ))}
    </div>
  );
}
