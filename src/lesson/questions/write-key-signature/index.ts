import type { QuestionTypeModule } from '@/lesson/contracts';
import { WriteKeySignature } from './component';
import { mark } from './mark';
import { payloadSchema } from './schema';
import type { WriteKeySignatureAnswer, WriteKeySignaturePayload } from './types';

export type { WriteKeySignatureAnswer, WriteKeySignaturePayload } from './types';

export const writeKeySignature: QuestionTypeModule<WriteKeySignaturePayload, WriteKeySignatureAnswer> = {
  type: 'write-key-signature',
  payloadSchema,
  Component: WriteKeySignature,
  mark,
};
