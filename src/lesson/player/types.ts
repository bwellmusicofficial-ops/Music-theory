import type { ReactNode } from 'react';
import type { Passage } from '@/engine/types';
import type { GlossaryEntry } from '../schema';

/** Renderers the orchestrator supplies for exhibits that need components the player does not own. */
export type ExhibitRenderers = {
  passage?: (props: { passage: Passage; tempo?: number; ariaLabel: string }) => ReactNode;
};

export type GlossaryInput = readonly GlossaryEntry[] | ReadonlyMap<string, GlossaryEntry>;

/** What the player reports when the learner presses Finish on the recap. */
export interface LessonCompletion {
  lessonId: string;
  /** True when the challenge has been passed now or in an earlier session. */
  completed: boolean;
  bestScore: number | null;
}
