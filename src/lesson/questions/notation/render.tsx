import type { ReactNode } from 'react';
import type { Passage, Terminology } from '@/engine/types';
import type { ExhibitRenderers } from '@/lesson/player';
import type { Glyph } from '@/lesson/questions/shared';
import { GlyphView } from './glyph-view';
import { PassageView } from './passage-view';

/** For `FaceView`'s `renderGlyph`. UK names; use `glyphRenderer` for the US setting. */
export function renderGlyph(glyph: Glyph): ReactNode {
  return <GlyphView glyph={glyph} />;
}

/** For `FaceView`'s `renderPassage`. A read-only stave with no play button (a face must not be playable). */
export function renderPassage(passage: Passage): ReactNode {
  return <PassageView passage={passage} />;
}

/** `renderGlyph` for a terminology setting. */
export function glyphRenderer(terminology: Terminology): (glyph: Glyph) => ReactNode {
  return function renderGlyphIn(glyph) {
    return <GlyphView glyph={glyph} terminology={terminology} />;
  };
}

/** `renderPassage` for a terminology setting. */
export function passageRenderer(terminology: Terminology): (passage: Passage) => ReactNode {
  return function renderPassageIn(passage) {
    return <PassageView passage={passage} terminology={terminology} />;
  };
}

/**
 * For `ExhibitView`'s `renderers.passage`. The exhibit draws its own play
 * button, so this shows the notation only.
 */
export const passageExhibitRenderer: NonNullable<ExhibitRenderers['passage']> = ({ passage, ariaLabel }) => (
  <PassageView passage={passage} ariaLabel={ariaLabel} />
);
