/**
 * Zod building blocks for the stave-based question types.
 *
 * The primitives and the length-free passage schema live in
 * `face-view/face-schema.ts` (one copy, shared by every type). `complete-bar`
 * and `spot-mistake` may break the bar-length rule for one named bar
 * (docs/question-payloads.md 1.3, rule 2), so the length rule is applied here
 * by `addBarLengthIssues`, which takes the exempt bar.
 */

import type { z } from 'zod';
import { rhythm } from '@/engine/rhythm';
import type { Passage } from '@/engine/types';

export {
  clefSchema,
  keySchema,
  letterSchema,
  passageShapeSchema,
  pitchClassSchema,
  pitchSchema,
} from '@/lesson/questions/face-view/face-schema';

/**
 * Rule 2 of 1.3 with at most one exempt bar. For every other bar a status other
 * than 'complete' is an issue. Returns the status of the exempt bar.
 */
export function addBarLengthIssues(
  passage: Passage,
  ctx: z.RefinementCtx,
  basePath: (string | number)[],
  exemptBar: number | null,
): void {
  passage.bars.forEach((bar, index) => {
    if (index === exemptBar) return;
    const check = rhythm.checkBarLength(bar, passage.time);
    if (check.status !== 'complete') {
      ctx.addIssue({
        code: 'custom',
        path: [...basePath, 'bars', index],
        message: `Bar ${index + 1} is ${check.status}: every bar must be exactly full`,
      });
    }
  });
}
