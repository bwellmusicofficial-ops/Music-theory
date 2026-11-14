import type { QuestionTypeModule } from '@/lesson/contracts';
import { PlayKeyboard } from './component';
import { mark } from './mark';
import { payloadSchema } from './schema';
import type { PlayKeyboardAnswer, PlayKeyboardPayload } from './types';

export type { PlayKeyboardAnswer, PlayKeyboardPayload } from './types';
export { setPlayKeyboardNotationRenderer } from './component';

export const playKeyboard: QuestionTypeModule<PlayKeyboardPayload, PlayKeyboardAnswer> = {
  type: 'play-keyboard',
  payloadSchema,
  Component: PlayKeyboard,
  mark,
};
