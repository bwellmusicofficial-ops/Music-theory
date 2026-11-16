'use client';

/**
 * Client-side wiring for lessons. Import this module (for its side effect)
 * wherever lessons run: it injects the notation renderers into the question
 * types that draw a passage but do not import the stave themselves.
 */

import type { ReactNode } from 'react';
import type { Passage } from '@/engine/types';
import { useLessonText } from '@/lesson/player';
import { setByEarNotationRenderer } from '@/lesson/questions/by-ear';
import { PassageView } from '@/lesson/questions/notation';
import { setPlayKeyboardNotationRenderer } from '@/lesson/questions/play-keyboard';
import { setTapRhythmNotationRenderer, type TapRhythmNotationLive } from '@/lesson/questions/tap-rhythm';

/** A read-only stave that follows the lesson's terminology setting. */
function LessonPassage({
  passage,
  live,
  display,
}: {
  passage: Passage;
  live?: TapRhythmNotationLive;
  display?: { hideClef?: boolean; hideTime?: boolean };
}) {
  const terminology = useLessonText()?.terminology ?? 'uk';
  return <PassageView passage={passage} terminology={terminology} marks={live?.marks} cursor={live?.cursor} hideClef={display?.hideClef} hideTime={display?.hideTime} />;
}

const renderPassage = (passage: Passage, display?: { hideClef?: boolean; hideTime?: boolean }): ReactNode => (
  <LessonPassage passage={passage} display={display} />
);
/** The tap-rhythm renderer also draws the live tap feedback: judged notes and the note due now. */
const renderLivePassage = (passage: Passage, live?: TapRhythmNotationLive): ReactNode => (
  <LessonPassage passage={passage} live={live} />
);

export function installNotationRenderers(): void {
  setTapRhythmNotationRenderer(renderLivePassage);
  setPlayKeyboardNotationRenderer(renderPassage);
  setByEarNotationRenderer(renderPassage);
}

installNotationRenderers();
