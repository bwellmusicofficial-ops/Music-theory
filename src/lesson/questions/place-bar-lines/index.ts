import type { QuestionTypeModule } from '@/lesson/contracts';
import { PlaceBarLines } from './component';
import { mark } from './mark';
import { payloadSchema } from './schema';
import type { PlaceBarLinesAnswer, PlaceBarLinesPayload } from './types';

export type { PlaceBarLinesAnswer, PlaceBarLinesPayload } from './types';

export const placeBarLines: QuestionTypeModule<PlaceBarLinesPayload, PlaceBarLinesAnswer> = {
  type: 'place-bar-lines',
  payloadSchema,
  Component: PlaceBarLines,
  mark,
};
