/**
 * Term Blitz: the one data file that decides which glossary entries go in which deck,
 * which entries are alike (families), and which must never be offered against each other.
 *
 * Everything else is derived from the glossary files, so a new grade's glossary file needs
 * no code. A new Italian term does need its id added to a deck here: `decks.test.ts` fails
 * until it is (every language 'it' entry must be in at least one curated deck).
 *
 * Why curated and not computed: the glossary has no field for "tempo word" or "dynamic".
 * The `strand` is 'terms' for all of them, so a rule on the data alone cannot split them.
 */

export type CuratedDeckId = 'tempo' | 'dynamics' | 'articulation-signs' | 'note-values-rests';

/** Ids in each curated deck, in glossary order. An id in a grade without a glossary file yet is ignored. */
export const CURATED_DECKS: Readonly<Record<CuratedDeckId, readonly string[]>> = {
  tempo: [
    'tempo',
    'metronome-mark',
    'adagio',
    'lento',
    'andante',
    'moderato',
    'allegretto',
    'allegro',
    'accelerando',
    'ritardando',
    'rallentando',
    'a-tempo',
    // Words that modify a tempo word ("molto allegro", "poco rit.").
    'poco',
    'molto',
    'mezzo',
  ],
  dynamics: [
    'pianissimo',
    'piano',
    'mezzo-piano',
    'mezzo-forte',
    'forte',
    'fortissimo',
    'crescendo',
    'decrescendo',
    'diminuendo',
    'dynamics',
    'hairpin',
    // Words that modify a dynamic ("molto forte", "poco piano").
    'poco',
    'molto',
    'mezzo',
  ],
  'articulation-signs': [
    'legato',
    'staccato',
    'cantabile',
    'dolce',
    'slur',
    'accent',
    'pause',
    'repeat-marks',
    'da-capo',
    'dal-segno',
    'segno',
    'al-fine',
    'fine',
  ],
  'note-values-rests': [
    'semibreve',
    'minim',
    'crotchet',
    'quaver',
    'semiquaver',
    'dotted-note',
    'rest',
    'semibreve-rest',
    'minim-rest',
    'crotchet-rest',
    'quaver-rest',
    'semiquaver-rest',
  ],
};

/**
 * Family of an entry: distractors come from the same family first (another tempo word
 * for a tempo word). An entry not listed here falls back to its glossary `strand`.
 */
export const FAMILIES: Readonly<Record<string, string>> = {
  // tempo
  tempo: 'tempo-signs',
  'metronome-mark': 'tempo-signs',
  adagio: 'tempo-words',
  lento: 'tempo-words',
  andante: 'tempo-words',
  moderato: 'tempo-words',
  allegretto: 'tempo-words',
  allegro: 'tempo-words',
  accelerando: 'tempo-changes',
  ritardando: 'tempo-changes',
  rallentando: 'tempo-changes',
  'a-tempo': 'tempo-changes',
  // modifiers
  poco: 'modifiers',
  molto: 'modifiers',
  mezzo: 'modifiers',
  // dynamics
  pianissimo: 'dynamic-levels',
  piano: 'dynamic-levels',
  'mezzo-piano': 'dynamic-levels',
  'mezzo-forte': 'dynamic-levels',
  forte: 'dynamic-levels',
  fortissimo: 'dynamic-levels',
  crescendo: 'dynamic-changes',
  decrescendo: 'dynamic-changes',
  diminuendo: 'dynamic-changes',
  // articulation and signs
  legato: 'touch',
  staccato: 'touch',
  slur: 'touch',
  accent: 'touch',
  cantabile: 'character',
  dolce: 'character',
  pause: 'navigation',
  'repeat-marks': 'navigation',
  'da-capo': 'navigation',
  'dal-segno': 'navigation',
  segno: 'navigation',
  'al-fine': 'navigation',
  fine: 'navigation',
  // note values and rests
  semibreve: 'note-values',
  minim: 'note-values',
  crotchet: 'note-values',
  quaver: 'note-values',
  semiquaver: 'note-values',
  'dotted-note': 'note-values',
  rest: 'rests',
  'semibreve-rest': 'rests',
  'minim-rest': 'rests',
  'crotchet-rest': 'rests',
  'quaver-rest': 'rests',
  'semiquaver-rest': 'rests',
  // other Grade 1 groups worth keeping together
  'time-signature': 'time',
  'simple-time': 'time',
  'duple-time': 'time',
  'triple-time': 'time',
  'quadruple-time': 'time',
  sharp: 'accidentals',
  flat: 'accidentals',
  natural: 'accidentals',
  accidental: 'accidentals',
  semitone: 'steps',
  tone: 'steps',
  'treble-clef': 'clefs',
  'bass-clef': 'clefs',
  clef: 'clefs',
  '2nd': 'interval-sizes',
  '3rd': 'interval-sizes',
  '4th': 'interval-sizes',
  '5th': 'interval-sizes',
  '6th': 'interval-sizes',
  '7th': 'interval-sizes',
  triad: 'chords',
  'tonic-triad': 'chords',
  chord: 'chords',
};

/**
 * Groups of entries that must never be offered as wrong answers for each other, because a
 * learner could fairly argue the answer is also right: true synonyms, near-identical terms,
 * and a general entry whose definition also fits a specific one. Every pair inside a group
 * counts. Ids that are not in the glossary are ignored.
 */
export const EQUIVALENTS: readonly (readonly string[])[] = [
  // The glossary says these mean the same, or nearly.
  ['decrescendo', 'diminuendo'],
  ['ritardando', 'rallentando'],
  // "Slow." and "Slow and calm." cannot be told apart from the answer text alone.
  ['lento', 'adagio'],
  // "Sweet and soft." and "Quiet." overlap: soft is the everyday word for piano.
  ['dolce', 'piano'],
  // A slur means play legato.
  ['legato', 'slur'],
  // "The end" and "Play on to the end".
  ['fine', 'al-fine'],
  // The first sentence of crotchet ("a filled-in head and a stem") also describes the shorter notes.
  ['crotchet', 'quaver'],
  ['crotchet', 'semiquaver'],
  // A general entry and its specific kinds.
  ['rest', 'semibreve-rest'],
  ['rest', 'minim-rest'],
  ['rest', 'crotchet-rest'],
  ['rest', 'quaver-rest'],
  ['rest', 'semiquaver-rest'],
  ['clef', 'treble-clef'],
  ['clef', 'bass-clef'],
  ['chord', 'triad'],
  ['chord', 'tonic-triad'],
  ['triad', 'tonic-triad'],
  ['scale', 'major-scale'],
  ['tempo', 'metronome-mark'],
  ['interval', '2nd'],
  ['interval', '3rd'],
  ['interval', '4th'],
  ['interval', '5th'],
  ['interval', '6th'],
  ['interval', '7th'],
];

/** Terms where a US word replaces the UK one are listed in the glossary (`us`); nothing to keep here. */

// --- round rules (kept with the data so they can be tuned in one place) ----------------

/** Round length in seconds. */
export const ROUND_SECONDS = 60;
/** Cards in an untimed round. */
export const UNTIMED_CARDS = 20;
/** Cards a deck must be able to ask before it is offered. */
export const MIN_DECK_CARDS = 8;
