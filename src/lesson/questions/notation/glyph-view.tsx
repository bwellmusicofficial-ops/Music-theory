'use client';

import { useEffect, useState } from 'react';
import { loadVexFlow } from '@/components/stave';
import { rhythm } from '@/engine/rhythm';
import type { NoteValue, Terminology } from '@/engine/types';
import type { Glyph } from '@/lesson/questions/shared';

const code = (point: number) => String.fromCodePoint(point);

/** SMuFL code points (Bravura): complete up-stem notes, and rests. */
const NOTES: Record<NoteValue, string> = {
  breve: code(0xe1d0),
  semibreve: code(0xe1d2),
  minim: code(0xe1d3),
  crotchet: code(0xe1d5),
  quaver: code(0xe1d7),
  semiquaver: code(0xe1d9),
  demisemiquaver: code(0xe1db),
};
const RESTS: Record<NoteValue, string> = {
  breve: code(0xe4e2),
  semibreve: code(0xe4e3),
  minim: code(0xe4e4),
  crotchet: code(0xe4e5),
  quaver: code(0xe4e6),
  semiquaver: code(0xe4e7),
  demisemiquaver: code(0xe4e8),
};
const AUGMENTATION_DOT = code(0xe1e7);

/** One staff space in the drawing, in SVG units. Bravura's em is four spaces. */
const SPACE = 10;
const FONT_SIZE = SPACE * 4;
/** Where the symbol's reference line sits. Notes put the head here; rests are centred around it. */
const NOTE_BASELINE = 0;
const REST_CENTRE = -15;
/** Whole and breve rests hang from a line, half rests sit on one: nudge each to the visual centre. */
const REST_OFFSET: Partial<Record<NoteValue, number>> = {
  semibreve: -SPACE / 4,
  minim: SPACE / 4,
};
const VIEW_BOX = '-2 -50 52 64';

export interface GlyphViewProps {
  glyph: Glyph;
  /** Used for the accessible name only. Default 'uk'. */
  terminology?: Terminology;
  /** Height in CSS pixels. Default 48. */
  height?: number;
  className?: string;
}

/**
 * A single note or rest symbol with no stave, drawn from the Bravura font with
 * SMuFL code points. Named for assistive technology with the engine's names.
 */
export function GlyphView({ glyph, terminology = 'uk', height = 48, className }: GlyphViewProps) {
  const [fontReady, setFontReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadVexFlow()
      .then(() => {
        if (alive) setFontReady(true);
      })
      .catch(() => {
        if (alive) setFontReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const isRest = glyph.kind === 'rest';
  const label = isRest
    ? rhythm.restName(glyph.duration, terminology)
    : rhythm.noteValueName(glyph.duration, terminology);
  const y = isRest ? REST_CENTRE + (REST_OFFSET[glyph.duration.value] ?? 0) : NOTE_BASELINE;
  const dotY = isRest ? REST_CENTRE - SPACE / 2 : NOTE_BASELINE - SPACE / 2;
  const dots = Array.from({ length: glyph.duration.dots }, (_, i) => 15 + i * 7);
  const common = { fontFamily: 'Bravura', fontSize: FONT_SIZE, fill: 'currentColor' } as const;

  return (
    <svg
      role="img"
      aria-label={label}
      data-glyph={isRest ? 'rest' : 'note'}
      viewBox={VIEW_BOX}
      height={height}
      width={(height * 52) / 64}
      className={className}
      style={{ opacity: fontReady ? 1 : 0, display: 'inline-block', verticalAlign: 'middle' }}
    >
      <text x={0} y={y} {...common}>
        {(isRest ? RESTS : NOTES)[glyph.duration.value]}
      </text>
      {dots.map((x) => (
        <text key={x} x={x} y={dotY} {...common}>
          {AUGMENTATION_DOT}
        </text>
      ))}
    </svg>
  );
}
