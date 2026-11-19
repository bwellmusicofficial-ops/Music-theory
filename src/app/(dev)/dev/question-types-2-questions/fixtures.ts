import { pitch } from '@/engine/pitch';
import type { Bar, Duration, NoteValue, Passage, ScoreEvent } from '@/engine/types';

/** Authored questions for the question-types-2 harness. Every pitch comes from the engine's parser. */
const n = (p: string, value: NoteValue = 'crotchet', dots: 0 | 1 = 0): ScoreEvent => ({ kind: 'note', pitches: [pitch.parsePitch(p)], duration: { value, dots } as Duration });
const rest = (value: NoteValue = 'crotchet'): ScoreEvent => ({ kind: 'rest', duration: { value, dots: 0 } });
const passage = (bars: Bar[], over: Partial<Passage> = {}): Passage => ({
  clef: 'treble',
  key: { tonic: pitch.parsePitchClass('C'), mode: 'major' },
  time: { beats: 4, beatUnit: 4 },
  bars,
  ...over,
});

export interface AuthoredItem {
  id: string;
  type: string;
  prompt: string;
  payload: unknown;
}

export const AUTHORED: AuthoredItem[] = [
  {
    id: 'place-bar-lines',
    type: 'place-bar-lines',
    prompt: 'Tap the gaps where the missing [[bar-line|bar lines]] go.',
    payload: {
      passage: passage([
        { events: [n('E5'), n('F5'), n('G5'), n('E5')] },
        { events: [n('D5', 'minim'), n('C5'), rest()] },
        { events: [n('E5', 'quaver'), n('F5', 'quaver'), n('G5'), n('A5', 'minim')] },
      ]),
    },
  },
  {
    id: 'fix-beaming',
    type: 'fix-beaming',
    prompt: 'Beam the [[quaver|quavers]] correctly: tap between notes to join or split.',
    payload: {
      passage: passage([
        { events: [n('E5', 'minim'), n('D5', 'minim')] },
        { events: ['C5', 'D5', 'E5', 'F5', 'G5', 'F5', 'E5', 'D5'].map((p) => n(p, 'quaver')), beams: [[0, 1, 2, 3, 4, 5, 6, 7]] },
      ]),
      barIndex: 1,
    },
  },
  {
    id: 'write-key-signature',
    type: 'write-key-signature',
    prompt: 'Write the [[key-signature|key signature]] of D major.',
    payload: { clef: 'treble', key: { tonic: pitch.parsePitchClass('D'), mode: 'major' } },
  },
  {
    id: 'find-in-passage-event',
    type: 'find-in-passage',
    prompt: 'Tap both dotted notes.',
    payload: {
      passage: passage([
        { events: [n('E5', 'minim', 1), n('D5')] },
        { events: [n('C5'), n('D5'), n('E5', 'minim')] },
        { events: [n('F5', 'crotchet', 1), n('E5', 'quaver'), n('D5', 'minim')] },
      ]),
      select: 'event',
      targets: [{ bar: 0, event: 0 }, { bar: 2, event: 0 }],
      feature: 'dotted notes',
    },
  },
  {
    id: 'find-in-passage-bar',
    type: 'find-in-passage',
    prompt: 'Tap the bar that has no minim.',
    payload: {
      passage: passage([
        { events: [n('E5', 'minim'), n('D5', 'minim')] },
        { events: [n('C5'), n('D5'), n('E5'), n('F5')] },
        { events: [n('G5', 'minim', 1), n('E5')] },
      ]),
      select: 'bar',
      targets: [{ bar: 1 }],
      feature: 'the bar with no minim',
    },
  },
];

/** The generated items: one per generator, drawn with the page's seed. */
export const GENERATORS: { id: string; params: unknown }[] = [
  { id: 'place-bar-lines', params: { melody: 'tune', values: [{ value: 'crotchet', dots: 0 }, { value: 'minim', dots: 0 }, { value: 'quaver', dots: 0 }] } },
  { id: 'fix-beaming', params: {} },
  { id: 'write-key-signature', params: {} },
];
