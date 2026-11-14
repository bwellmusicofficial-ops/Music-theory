import { pitch } from '@/engine/pitch';
import { rhythm } from '@/engine/rhythm';
import { createReducer } from './reducer';

/** The reducer bound to the real engines. */
export const reduce = createReducer({ pitch, rhythm });
