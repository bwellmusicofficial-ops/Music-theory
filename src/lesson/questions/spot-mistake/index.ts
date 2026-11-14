import type { QuestionTypeModule } from '@/lesson/contracts';
import { SpotMistake } from './component';
import { mark } from './mark';
import { payloadSchema } from './schema';
import type { SpotMistakeAnswer, SpotMistakePayload } from './types';

export type { SpotMistakeAnswer, SpotMistakePayload } from './types';

export const spotMistake: QuestionTypeModule<SpotMistakePayload, SpotMistakeAnswer> = {
  type: 'spot-mistake',
  payloadSchema,
  Component: SpotMistake,
  mark,
};
