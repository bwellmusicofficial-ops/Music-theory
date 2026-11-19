import type { QuestionTypeModule } from '@/lesson/contracts';
import { FindInPassage } from './component';
import { mark } from './mark';
import { payloadSchema } from './schema';
import type { FindInPassageAnswer, FindInPassagePayload } from './types';

export type { FindInPassageAnswer, FindInPassagePayload } from './types';

export const findInPassage: QuestionTypeModule<FindInPassagePayload, FindInPassageAnswer> = {
  type: 'find-in-passage',
  payloadSchema,
  Component: FindInPassage,
  mark,
};
