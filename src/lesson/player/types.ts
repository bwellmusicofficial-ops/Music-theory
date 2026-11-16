import type { ReactNode } from 'react';
import type { StaveMark } from '@/components/stave';
import type { Passage } from '@/engine/types';
import type { GlossaryEntry } from '../schema';

/** Renderers the orchestrator supplies for exhibits that need components the player does not own. */
export type ExhibitRenderers = {
  passage?: (props: {
    passage: Passage;
    tempo?: number;
    ariaLabel: string;
    /** Live feedback from a play-along (explore step); absent elsewhere. Keys "bar:event". */
    marks?: Record<string, StaveMark>;
    /** The note on the current beat; absent elsewhere. */
    cursor?: { bar: number; event: number } | null;
    /** Draw without the clef / the time signature. */
    hideClef?: boolean;
    hideTime?: boolean;
  }) => ReactNode;
};

export type GlossaryInput = readonly GlossaryEntry[] | ReadonlyMap<string, GlossaryEntry>;

/** What the player reports when the learner presses Finish on the recap. */
export interface LessonCompletion {
  lessonId: string;
  /** True when the challenge has been passed now or in an earlier session. */
  completed: boolean;
  bestScore: number | null;
}
