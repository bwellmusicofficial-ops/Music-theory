'use client';

import { Stave, type StaveSize } from '@/components/stave';
import type { Passage } from '@/engine/types';

const SHOW = { timeSignature: false, finalBarline: false } as const;

export interface SignatureViewProps {
  /** A passage of one whole-bar rest with its key set (see `signaturePassage`). */
  passage: Passage;
  ariaLabel: string;
  size?: StaveSize;
  reducedMotion?: boolean;
}

/** The clef and key signature on a stave, with nothing else on it. */
export function SignatureView({ passage, ariaLabel, size = 'sm', reducedMotion }: SignatureViewProps) {
  return <Stave passage={passage} mode="read" size={size} show={SHOW} ariaLabel={ariaLabel} reducedMotion={reducedMotion} />;
}

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];

/** "Treble clef with two sharps": says what is drawn, in words, for the screen reader. */
export function signatureSpeech(passage: Passage, signature: number): string {
  const clef = passage.clef === 'bass' ? 'Bass clef' : 'Treble clef';
  if (signature === 0) return `${clef} with no sharps or flats`;
  const n = Math.abs(signature);
  return `${clef} with ${NUMBER_WORDS[n]} ${signature > 0 ? 'sharp' : 'flat'}${n > 1 ? 's' : ''}`;
}
