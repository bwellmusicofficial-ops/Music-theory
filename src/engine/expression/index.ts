import type { ExpressionEngine } from '../api';
import { SLUR_OVERLAP_SECONDS, STACCATO_MIN_SECONDS, soundingDetails, soundingLengths } from './length';
import { loudnessAt } from './loudness';
import { performanceOrder } from './order';
import { performedEvents, tempoMap } from './tempo';
import { validateExpression } from './validate';

export const expression: ExpressionEngine = {
  validateExpression,
  performanceOrder,
  loudnessAt,
  soundingLengths,
  soundingDetails,
  tempoMap,
  performedEvents,
  staccatoMinSeconds: STACCATO_MIN_SECONDS,
  slurOverlapSeconds: SLUR_OVERLAP_SECONDS,
};
