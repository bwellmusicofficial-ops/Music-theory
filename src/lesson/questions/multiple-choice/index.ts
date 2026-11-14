import type { QuestionTypeModule } from '@/lesson/contracts';
import { MultipleChoice } from './component';
import { mark } from './mark';
import { payloadSchema } from './schema';
import type { MultipleChoiceAnswer, MultipleChoicePayload } from './types';

export type { MultipleChoiceAnswer, MultipleChoiceOption, MultipleChoicePayload } from './types';

export const multipleChoice: QuestionTypeModule<MultipleChoicePayload, MultipleChoiceAnswer> = {
  type: 'multiple-choice',
  payloadSchema,
  Component: MultipleChoice,
  mark,
};
