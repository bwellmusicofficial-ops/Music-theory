import type { ReactNode } from 'react';
import type { Passage } from '@/engine/types';
import { RichTextView, useLessonText } from '@/lesson/player';
import { GlyphView } from '@/lesson/questions/notation/glyph-view';
import { PassageView } from '@/lesson/questions/notation/passage-view';
import type { Face, Glyph } from '@/lesson/questions/shared';
import { plainText } from './plain-text';

export interface FaceViewProps {
  face: Face;
  /** Overrides how a glyph is drawn. Default: the notation `GlyphView`. */
  renderGlyph?: (glyph: Glyph) => ReactNode;
  /** Overrides how a passage is drawn. Default: the notation `PassageView` (a read-only stave). */
  renderPassage?: (passage: Passage, display?: { hideClef?: boolean; hideTime?: boolean }) => ReactNode;
}

/**
 * Renders any `Face`. Glyphs and passages are drawn as notation unless a render
 * prop overrides that. Text uses the lesson player's `RichTextView` (bold,
 * italic and the US terminology swap) when there is a player around it; glossary
 * links show as plain text because a face usually sits inside a button. With no
 * player the text is plain.
 */
export function FaceView({ face, renderGlyph, renderPassage }: FaceViewProps) {
  const lesson = useLessonText();
  const terminology = lesson?.terminology ?? 'uk';
  switch (face.kind) {
    case 'text':
      return (
        <span data-face="text">
          {lesson ? (
            <RichTextView text={face.text} terminology={lesson.terminology} glossary={lesson.glossary} linksAsText />
          ) : (
            plainText(face.text)
          )}
        </span>
      );
    case 'glyph':
      return (
        <span data-face="glyph">
          {renderGlyph ? renderGlyph(face.glyph) : <GlyphView glyph={face.glyph} terminology={terminology} />}
        </span>
      );
    case 'passage':
      return (
        <span data-face="passage">
          {renderPassage ? (
            renderPassage(face.passage, { hideClef: face.hideClef, hideTime: face.hideTime })
          ) : (
            <PassageView passage={face.passage} terminology={terminology} hideClef={face.hideClef} hideTime={face.hideTime} />
          )}
        </span>
      );
  }
}
