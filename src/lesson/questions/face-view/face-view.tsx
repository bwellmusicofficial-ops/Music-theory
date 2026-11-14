import type { ReactNode } from 'react';
import { rhythm } from '@/engine/rhythm';
import type { Passage } from '@/engine/types';
import type { Face, Glyph } from '@/lesson/questions/shared';
import { plainText } from './plain-text';

export interface FaceViewProps {
  face: Face;
  /** Draws a glyph as notation. Without it, the UK note or rest name is shown. */
  renderGlyph?: (glyph: Glyph) => ReactNode;
  /** Draws a passage as notation. Without it, the word "Notation" is shown. */
  renderPassage?: (passage: Passage) => ReactNode;
}

function glyphFallback(glyph: Glyph): string {
  return glyph.kind === 'rest'
    ? rhythm.restName(glyph.duration, 'uk')
    : rhythm.noteValueName(glyph.duration, 'uk');
}

/** Renders any `Face`. Text is plain; glyphs and passages go through the optional render props. */
export function FaceView({ face, renderGlyph, renderPassage }: FaceViewProps) {
  switch (face.kind) {
    case 'text':
      return <span data-face="text">{plainText(face.text)}</span>;
    case 'glyph':
      return (
        <span data-face="glyph">{renderGlyph ? renderGlyph(face.glyph) : glyphFallback(face.glyph)}</span>
      );
    case 'passage':
      return <span data-face="passage">{renderPassage ? renderPassage(face.passage) : 'Notation'}</span>;
  }
}
