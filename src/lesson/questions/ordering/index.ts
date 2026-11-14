import type { QuestionTypeModule } from '@/lesson/contracts';
import { Ordering } from './component';
import { mark } from './mark';
import { payloadSchema } from './schema';
import type { OrderingAnswer, OrderingPayload } from './types';

export type { OrderingAnswer, OrderingPayload } from './types';

export const ordering: QuestionTypeModule<OrderingPayload, OrderingAnswer> = {
  type: 'ordering',
  payloadSchema,
  Component: Ordering,
  mark,
};
