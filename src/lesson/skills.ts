/**
 * Every skill id, with its strand and its "The learner can ..." description.
 *
 * GENERATED from the tables in section 9 of docs/lesson-authoring-guide.md by
 * `node scripts/generate-skills.mjs`. Do not edit by hand: edit the guide and
 * run the script. `skills.test.ts` fails if the two drift apart.
 */

import type { Strand } from './schema';

export interface SkillInfo {
  readonly id: string;
  readonly strand: Strand;
  /** "The learner can ..." */
  readonly description: string;
}

export const SKILLS = [
  { id: "pitch.high-low.hear", strand: "pitch", description: "The learner can hear which of two sounds is higher" },
  { id: "pitch.direction.hear", strand: "pitch", description: "The learner can hear whether a tune goes up, goes down or stays the same" },
  { id: "pitch.keyboard.layout", strand: "pitch", description: "The learner can find their way around the keyboard by the pattern of black keys" },
  { id: "rhythm.long-short.hear", strand: "rhythm", description: "The learner can hear which of two sounds is longer" },
  { id: "rhythm.perform.patterns", strand: "rhythm", description: "The learner can copy a short pattern of long and short sounds by tapping" },
  { id: "pitch.keyboard.note-names", strand: "pitch", description: "The learner can name the white keys A to G" },
  { id: "rhythm.pulse.steady", strand: "rhythm", description: "The learner can keep and recognise a steady pulse" },
  { id: "rhythm.note-values.crotchet-minim", strand: "rhythm", description: "The learner can recognise crotchets and minims and say how long they last" },
  { id: "rhythm.note-values.semibreve", strand: "rhythm", description: "The learner can recognise the semibreve and its length" },
  { id: "rhythm.note-values.quaver", strand: "rhythm", description: "The learner can recognise quavers, single and beamed" },
  { id: "rhythm.note-values.semiquaver", strand: "rhythm", description: "The learner can recognise semiquavers, single and beamed" },
  { id: "rhythm.note-values.dotted", strand: "rhythm", description: "The learner can work out the length of a dotted note" },
  { id: "rhythm.note-values.compare", strand: "rhythm", description: "The learner can order and exchange note values (2 quavers = 1 crotchet)" },
  { id: "rhythm.rests.values", strand: "rhythm", description: "The learner can match each rest to its note value and length" },
  { id: "rhythm.rests.whole-bar", strand: "rhythm", description: "The learner can use the semibreve rest for a whole silent bar" },
  { id: "rhythm.ties.read", strand: "rhythm", description: "The learner can read a tie and add up its length" },
  { id: "rhythm.time.read-signature", strand: "rhythm", description: "The learner can say what the two numbers of a time signature mean" },
  { id: "rhythm.time.complete-bar", strand: "rhythm", description: "The learner can complete a bar in 2/4, 3/4 or 4/4" },
  { id: "rhythm.time.add-bar-lines", strand: "rhythm", description: "The learner can find where the bar lines go" },
  { id: "rhythm.time.identify", strand: "rhythm", description: "The learner can work out the time signature of a passage" },
  { id: "rhythm.grouping.beams", strand: "rhythm", description: "The learner can beam quavers and semiquavers in beats" },
  { id: "rhythm.grouping.bar-conventions", strand: "rhythm", description: "The learner can write notes, rests and ties so the beats and the middle of the bar can be seen" },
  { id: "rhythm.perform.crotchet-minim", strand: "rhythm", description: "The learner can tap rhythms of crotchets and minims" },
  { id: "rhythm.perform.semibreve", strand: "rhythm", description: "The learner can tap rhythms that include semibreves" },
  { id: "rhythm.perform.quaver", strand: "rhythm", description: "The learner can tap rhythms that include quavers" },
  { id: "rhythm.perform.semiquaver", strand: "rhythm", description: "The learner can tap rhythms that include semiquavers" },
  { id: "rhythm.perform.dotted", strand: "rhythm", description: "The learner can tap rhythms that include dotted notes" },
  { id: "rhythm.perform.rests", strand: "rhythm", description: "The learner can tap rhythms that include rests" },
  { id: "rhythm.perform.ties", strand: "rhythm", description: "The learner can tap rhythms that include ties" },
  { id: "rhythm.perform.triple-time", strand: "rhythm", description: "The learner can tap rhythms in 3/4 and feel the strong first beat" },
  { id: "pitch.treble.lines", strand: "pitch", description: "The learner can name and place notes on treble clef lines" },
  { id: "pitch.treble.spaces", strand: "pitch", description: "The learner can name and place notes in treble clef spaces" },
  { id: "pitch.treble.ledger", strand: "pitch", description: "The learner can read middle C and the notes just outside the treble stave" },
  { id: "pitch.bass.lines", strand: "pitch", description: "The learner can name and place notes on bass clef lines" },
  { id: "pitch.bass.spaces", strand: "pitch", description: "The learner can name and place notes in bass clef spaces" },
  { id: "pitch.bass.ledger", strand: "pitch", description: "The learner can read middle C and the notes just outside the bass stave" },
  { id: "pitch.clefs.same-note", strand: "pitch", description: "The learner can match a note in treble clef to the same note in bass clef" },
  { id: "pitch.keyboard.find-notes", strand: "pitch", description: "The learner can find a written note on the keyboard" },
  { id: "pitch.accidentals.read", strand: "pitch", description: "The learner can name a note with a sharp, flat or natural" },
  { id: "pitch.accidentals.write", strand: "pitch", description: "The learner can put a sharp, flat or natural in the right place" },
  { id: "pitch.accidentals.bar-rule", strand: "pitch", description: "The learner can know an accidental lasts until the next bar line" },
  { id: "pitch.steps.semitone", strand: "pitch", description: "The learner can find and recognise a semitone" },
  { id: "pitch.steps.tone", strand: "pitch", description: "The learner can find and recognise a tone" },
  { id: "scales-keys.major.pattern", strand: "scales-keys", description: "The learner can give the tone and semitone pattern of a major scale" },
  { id: "scales-keys.major.c", strand: "scales-keys", description: "The learner can write and play the scale of C major" },
  { id: "scales-keys.major.g", strand: "scales-keys", description: "The learner can write and play the scale of G major" },
  { id: "scales-keys.major.d", strand: "scales-keys", description: "The learner can write and play the scale of D major" },
  { id: "scales-keys.major.f", strand: "scales-keys", description: "The learner can write and play the scale of F major" },
  { id: "scales-keys.signature.read", strand: "scales-keys", description: "The learner can name the key from a key signature (C, G, D, F major)" },
  { id: "scales-keys.signature.write", strand: "scales-keys", description: "The learner can write those key signatures in treble and bass clef" },
  { id: "scales-keys.degrees.number", strand: "scales-keys", description: "The learner can number the degrees of a scale, 1st to 8th" },
  { id: "intervals.number.read", strand: "intervals", description: "The learner can name an interval above the key note by number, 2nd to 8th" },
  { id: "intervals.number.write", strand: "intervals", description: "The learner can write the note a given interval above the key note" },
  { id: "intervals.number.hear", strand: "intervals", description: "The learner can tell a step from a jump, and a small jump from a big one, by ear" },
  { id: "harmony.tonic-triad.build", strand: "harmony", description: "The learner can build the tonic triad of C, G, D or F major" },
  { id: "harmony.tonic-triad.identify", strand: "harmony", description: "The learner can name the key of a written tonic triad" },
  { id: "terms.dynamics.signs", strand: "terms", description: "The learner can give the meaning of dynamic signs and words (*p*, *f*, *cresc.*)" },
  { id: "terms.tempo.italian", strand: "terms", description: "The learner can give the meaning of Grade 1 tempo words" },
  { id: "terms.expression.italian", strand: "terms", description: "The learner can give the meaning of Grade 1 expression words (*cantabile*, *dolce*)" },
  { id: "terms.articulation.signs", strand: "terms", description: "The learner can recognise the slur, staccato dot and accent" },
  { id: "terms.signs.repeats-and-pauses", strand: "terms", description: "The learner can recognise repeat marks, the pause, octave signs and metronome marks" },
  { id: "score-reading.passage.find-features", strand: "score-reading", description: "The learner can find a named sign or note in a short passage" },
] as const satisfies readonly SkillInfo[];

export type SkillId = (typeof SKILLS)[number]['id'];

const BY_ID: ReadonlyMap<string, SkillInfo> = new Map(SKILLS.map((s) => [s.id, s]));

export function skillInfo(id: string): SkillInfo | undefined {
  return BY_ID.get(id);
}

const titleCase = (words: string): string =>
  words
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/**
 * A short title-case label for a skill id: its topic and detail, such as
 * "Note Values: Crotchet Minim" for `rhythm.note-values.crotchet-minim`. Works
 * for any well-formed id, listed or not, so a new skill never shows as blank.
 */
export function skillLabel(id: string): string {
  const [, ...rest] = id.split('.');
  if (rest.length === 0) return titleCase(id);
  const [topic, ...detail] = rest;
  return detail.length === 0 ? titleCase(topic!) : `${titleCase(topic!)}: ${titleCase(detail.join('-'))}`;
}
