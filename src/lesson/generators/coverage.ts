/**
 * Which skills each generator can serve. Mirrors section 1 of
 * docs/generators-grade-1.md; coverage.test.ts keeps the two in step.
 * The last four ids are proposed Start here skills, not yet in the authoring guide.
 */
export const GENERATOR_SKILLS: Readonly<Record<string, readonly string[]>> = {
  'name-note-on-stave': [
    'pitch.treble.lines',
    'pitch.treble.spaces',
    'pitch.treble.ledger',
    'pitch.bass.lines',
    'pitch.bass.spaces',
    'pitch.bass.ledger',
    'pitch.accidentals.read',
    'pitch.accidentals.write',
  ],
  'tap-note-values': [
    'rhythm.pulse.steady',
    'rhythm.perform.crotchet-minim',
    'rhythm.perform.semibreve',
    'rhythm.perform.quaver',
    'rhythm.perform.semiquaver',
    'rhythm.perform.dotted',
    'rhythm.perform.triple-time',
  ],
  'choose-note-value': [
    'rhythm.note-values.crotchet-minim',
    'rhythm.note-values.semibreve',
    'rhythm.note-values.quaver',
    'rhythm.note-values.semiquaver',
    'rhythm.note-values.compare',
    'rhythm.rests.values',
    'rhythm.rests.whole-bar',
  ],
  'match-note-values': [
    'rhythm.note-values.crotchet-minim',
    'rhythm.note-values.semibreve',
    'rhythm.note-values.quaver',
    'rhythm.note-values.semiquaver',
    'rhythm.note-values.dotted',
    'rhythm.rests.values',
  ],
  'order-note-values': [
    'rhythm.note-values.semibreve',
    'rhythm.note-values.dotted',
    'rhythm.note-values.compare',
    'rhythm.rests.values',
  ],
  'count-beats': [
    'rhythm.note-values.dotted',
    'rhythm.note-values.compare',
    'rhythm.ties.read',
    'rhythm.time.read-signature',
    'rhythm.time.identify',
  ],
  'complete-the-bar': [
    'rhythm.note-values.dotted',
    'rhythm.rests.values',
    'rhythm.time.complete-bar',
  ],
  'spot-the-bar': [
    'rhythm.time.read-signature',
    'rhythm.time.complete-bar',
  ],
  'tap-rests-and-ties': [
    'rhythm.perform.rests',
    'rhythm.perform.ties',
  ],
  'same-note-other-clef': [
    'pitch.clefs.same-note',
  ],
  'play-written-note': [
    'pitch.treble.lines',
    'pitch.treble.spaces',
    'pitch.treble.ledger',
    'pitch.bass.lines',
    'pitch.bass.spaces',
    'pitch.bass.ledger',
    'pitch.keyboard.find-notes',
    'pitch.accidentals.read',
  ],
  'keyboard-find': [
    'pitch.keyboard.find-notes',
    'pitch.steps.semitone',
    'pitch.steps.tone',
    'pitch.keyboard.layout',
  ],
  'play-scale-or-triad': [
    'scales-keys.major.c',
    'scales-keys.major.g',
    'scales-keys.major.d',
    'scales-keys.major.f',
    'scales-keys.degrees.number',
    'harmony.tonic-triad.build',
  ],
  'tone-or-semitone': [
    'pitch.steps.semitone',
    'pitch.steps.tone',
    'scales-keys.major.pattern',
  ],
  'accidental-lasts': [
    'pitch.accidentals.bar-rule',
  ],
  'key-facts': [
    'scales-keys.major.c',
    'scales-keys.major.g',
    'scales-keys.major.d',
    'scales-keys.major.f',
    'scales-keys.signature.read',
    'scales-keys.degrees.number',
    'harmony.tonic-triad.identify',
  ],
  'spot-scale-note': [
    'scales-keys.major.c',
    'scales-keys.major.g',
    'scales-keys.major.d',
    'scales-keys.major.f',
    'scales-keys.signature.read',
  ],
  'interval-by-number': [
    'intervals.number.read',
  ],
  'interval-place': [
    'intervals.number.write',
  ],
  'contrast-by-ear': [
    'intervals.number.hear',
    'pitch.high-low.hear',
    'pitch.direction.hear',
    'rhythm.long-short.hear',
  ],
};

export const PROPOSED_SKILLS: readonly string[] = [
  'pitch.high-low.hear',
  'pitch.direction.hear',
  'rhythm.long-short.hear',
  'pitch.keyboard.layout',
];
