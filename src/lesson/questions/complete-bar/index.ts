import type { QuestionTypeModule } from '@/lesson/contracts';
import { CompleteBar } from './component';
import { mark } from './mark';
import { payloadSchema } from './schema';
import type { CompleteBarAnswer, CompleteBarPayload } from './types';

export type { CompleteBarAnswer, CompleteBarPayload } from './types';

export const completeBar: QuestionTypeModule<CompleteBarPayload, CompleteBarAnswer> = {
  type: 'complete-bar',
  payloadSchema,
  Component: CompleteBar,
  mark,
};
