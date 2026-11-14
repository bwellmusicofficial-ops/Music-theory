import type { GeneratorRegistry } from '@/lesson/contracts';
import { nameNoteOnStave } from './name-note-on-stave';
import { tapNoteValues } from './tap-note-values';

/** Every question generator, keyed by the id used in lesson files. */
export const generators: GeneratorRegistry = {
  [nameNoteOnStave.id]: nameNoteOnStave,
  [tapNoteValues.id]: tapNoteValues,
};
