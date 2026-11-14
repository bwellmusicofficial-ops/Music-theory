'use client';

import { memo, type ReactElement } from 'react';
import { pitch } from '@/engine/pitch';
import type { Accidental, Clef, Pitch } from '@/engine/types';
import {
  DOUBLE_FLAT_GLYPH,
  DOUBLE_SHARP_GLYPH,
  FLAT_GLYPH,
  NATURAL_GLYPH,
  NOTEHEAD_GLYPH,
  POSITION_UNITS,
  SCALES,
  SHARP_GLYPH,
} from './constants';
import { reservedFor, systemBox } from './layout/plan';
import type { StaveRange, StaveSize } from './types';

export interface StaveMetrics {
  scale: number;
  heightPx: number;
  yForPositionPx(position: number): number;
}

function rangeToPositions(range: StaveRange | undefined, clef: Clef): { lowest: number; highest: number } | null {
  if (!range) return null;
  const a = pitch.stavePosition(range.low, clef);
  const b = pitch.stavePosition(range.high, clef);
  return { lowest: Math.min(a, b), highest: Math.max(a, b) };
}

/** Vertical metrics shared with a read-mode Stave given the same `range` (so that `top: 0` aligns a sprite). */
export function staveMetrics(size: StaveSize, range?: StaveRange, clef: Clef = 'treble'): StaveMetrics {
  const scale = SCALES[size];
  const r = reservedFor(false, { min: -6, max: 14 }, rangeToPositions(range, clef));
  const box = systemBox(r.min, r.max);
  return {
    scale,
    heightPx: box.height * scale,
    yForPositionPx: (position) => (box.bottomLineY - position * POSITION_UNITS) * scale,
  };
}

const SIGN_GLYPHS: Record<number, string> = {
  [-2]: DOUBLE_FLAT_GLYPH,
  [-1]: FLAT_GLYPH,
  0: NATURAL_GLYPH,
  1: SHARP_GLYPH,
  2: DOUBLE_SHARP_GLYPH,
};

const SPRITE_WIDTH = 44;
/** Horizontal centre of the notehead inside a sprite, in stave units. */
export const NOTE_SPRITE_HEAD_X = 28;
const HEAD_X = NOTE_SPRITE_HEAD_X;

export interface NoteSpriteProps {
  pitch: Pitch;
  clef: Clef;
  size: StaveSize;
  range?: StaveRange;
  showAccidental?: boolean;
  state?: 'correct' | 'wrong';
}

export const spriteStats = { builds: 0 };
const cache = new Map<string, ReactElement>();

function keyOf(p: NoteSpriteProps): string {
  const r = p.range ? `${pitch.formatPitch(p.range.low)}-${pitch.formatPitch(p.range.high)}` : '';
  return [pitch.formatPitch(p.pitch), p.clef, p.size, r, p.showAccidental ? 1 : 0, p.state ?? ''].join('|');
}

function build(p: NoteSpriteProps): ReactElement {
  spriteStats.builds++;
  const m = staveMetrics(p.size, p.range, p.clef);
  const scale = m.scale;
  const heightUnits = m.heightPx / scale;
  const position = pitch.stavePosition(p.pitch, p.clef);
  const y = m.yForPositionPx(position) / scale;
  const yAt = (q: number) => m.yForPositionPx(q) / scale;
  const ledgers: number[] = [];
  const lowest = position % 2 === 0 ? position : position + 1;
  for (let q = -2; q >= lowest; q -= 2) ledgers.push(q);
  for (let q = 10; q <= position; q += 2) ledgers.push(q);
  const sign: Accidental | null = p.showAccidental ? p.pitch.accidental : null;
  const cls = p.state === 'correct' ? 'mtn-ev--correct' : p.state === 'wrong' ? 'mtn-ev--wrong' : undefined;
  return (
    <svg
      className={['mtn-sprite', cls].filter(Boolean).join(' ')}
      aria-hidden="true"
      focusable="false"
      width={SPRITE_WIDTH * scale}
      height={heightUnits * scale}
      viewBox={`0 0 ${SPRITE_WIDTH} ${heightUnits}`}
      style={{ willChange: 'transform', display: 'block', color: 'inherit' }}
    >
      {ledgers.map((q) => (
        <line key={q} x1={HEAD_X - 13} x2={HEAD_X + 13} y1={yAt(q)} y2={yAt(q)} stroke="currentColor" strokeWidth={1.5} />
      ))}
      <text x={HEAD_X} y={y} textAnchor="middle" fontFamily="Bravura" fontSize="30pt" fill="currentColor" stroke="none">
        {NOTEHEAD_GLYPH}
      </text>
      {sign !== null ? (
        <text x={HEAD_X - 22} y={y} textAnchor="middle" fontFamily="Bravura" fontSize="30pt" fill="currentColor" stroke="none">
          {SIGN_GLYPHS[sign]}
        </text>
      ) : null}
      {p.state === 'correct' ? (
        <path d={`M${HEAD_X + 16} ${y}l3 3l6 -7`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      ) : null}
      {p.state === 'wrong' ? (
        <path d={`M${HEAD_X + 16} ${y - 4}l8 8M${HEAD_X + 24} ${y - 4}l-8 8`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

function NoteSpriteImpl(props: NoteSpriteProps) {
  const key = keyOf(props);
  let el = cache.get(key);
  if (!el) {
    el = build(props);
    cache.set(key, el);
  }
  return el;
}

export const NoteSprite = memo(NoteSpriteImpl, (a, b) => keyOf(a) === keyOf(b));
