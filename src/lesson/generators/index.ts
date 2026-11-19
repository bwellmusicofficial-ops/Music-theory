import type { GeneratorRegistry } from '@/lesson/contracts';
import { accidentalLasts } from './accidental-lasts';
import { chooseNoteValue } from './choose-note-value';
import { completeTheBar } from './complete-the-bar';
import { contrastByEar } from './contrast-by-ear';
import { countBeats } from './count-beats';
import { intervalByNumber } from './interval-by-number';
import { fixBeaming } from './fix-beaming';
import { intervalPlace } from './interval-place';
import { keyFacts } from './key-facts';
import { keyboardFind } from './keyboard-find';
import { matchNoteValues } from './match-note-values';
import { nameNoteOnStave } from './name-note-on-stave';
import { orderNoteValues } from './order-note-values';
import { placeBarLines } from './place-bar-lines';
import { playScaleOrTriad } from './play-scale-or-triad';
import { playWrittenNote } from './play-written-note';
import { sameNoteOtherClef } from './same-note-other-clef';
import { spotScaleNote } from './spot-scale-note';
import { spotTheBar } from './spot-the-bar';
import { tapNoteValues } from './tap-note-values';
import { tapRestsAndTies } from './tap-rests-and-ties';
import { toneOrSemitone } from './tone-or-semitone';
import { writeKeySignature } from './write-key-signature';

/** Every question generator, keyed by the id used in lesson files. */
export const generators: GeneratorRegistry = {
  [accidentalLasts.id]: accidentalLasts,
  [chooseNoteValue.id]: chooseNoteValue,
  [completeTheBar.id]: completeTheBar,
  [contrastByEar.id]: contrastByEar,
  [countBeats.id]: countBeats,
  [fixBeaming.id]: fixBeaming,
  [intervalByNumber.id]: intervalByNumber,
  [intervalPlace.id]: intervalPlace,
  [keyFacts.id]: keyFacts,
  [keyboardFind.id]: keyboardFind,
  [matchNoteValues.id]: matchNoteValues,
  [nameNoteOnStave.id]: nameNoteOnStave,
  [orderNoteValues.id]: orderNoteValues,
  [placeBarLines.id]: placeBarLines,
  [playScaleOrTriad.id]: playScaleOrTriad,
  [playWrittenNote.id]: playWrittenNote,
  [sameNoteOtherClef.id]: sameNoteOtherClef,
  [spotScaleNote.id]: spotScaleNote,
  [spotTheBar.id]: spotTheBar,
  [tapNoteValues.id]: tapNoteValues,
  [tapRestsAndTies.id]: tapRestsAndTies,
  [toneOrSemitone.id]: toneOrSemitone,
  [writeKeySignature.id]: writeKeySignature,
};
