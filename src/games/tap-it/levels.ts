/**
 * Tap It: what each level teaches. Pure data plus the vocabulary check; no randomness.
 *
 * Levels 1 to 8 decide the vocabulary and the tempo. Each level keeps everything the
 * levels before it introduced.
 */
import type { Bar, Duration, ScoreEvent, TimeSignature } from '@/engine/types';

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 8;

export interface LevelSpec {
  level: number;
  /** Felt beats per minute. */
  bpm: number;
  /** Time signatures a rhythm at this level may use. */
  times: readonly TimeSignature[];
  /** Plain note values that may stand alone (crotchet, minim and so on). */
  notes: readonly Duration[];
  /** Rests that may appear. */
  rests: readonly Duration[];
  /** Paired quavers (two quavers filling one beat). */
  pairedQuavers: boolean;
  /** A dotted crotchet followed by a quaver. */
  dottedCrotchetQuaver: boolean;
  /** Four semiquavers filling one beat. */
  semiquaverGroups: boolean;
  /** A tie across the bar line. */
  ties: boolean;
  /** Name of what this level adds, for the "practise this" line. */
  focus: string;
}

const T44: TimeSignature = { beats: 4, beatUnit: 4 };
const T34: TimeSignature = { beats: 3, beatUnit: 4 };
const T24: TimeSignature = { beats: 2, beatUnit: 4 };
const d = (value: Duration['value'], dots: 0 | 1 = 0): Duration => ({ value, dots });

const CROTCHET = d('crotchet');
const MINIM = d('minim');
const SEMIBREVE = d('semibreve');
const DOTTED_MINIM = d('minim', 1);

const ALL_TIMES = [T44, T34, T24] as const;

export const LEVELS: readonly LevelSpec[] = [
  {
    level: 1,
    bpm: 70,
    times: [T44],
    notes: [CROTCHET, MINIM],
    rests: [],
    pairedQuavers: false,
    dottedCrotchetQuaver: false,
    semiquaverGroups: false,
    ties: false,
    focus: 'crotchets and minims in 4/4',
  },
  {
    level: 2,
    bpm: 72,
    times: ALL_TIMES,
    notes: [CROTCHET, MINIM, SEMIBREVE],
    rests: [],
    pairedQuavers: false,
    dottedCrotchetQuaver: false,
    semiquaverGroups: false,
    ties: false,
    focus: 'semibreves, and 3/4 and 2/4 time',
  },
  {
    level: 3,
    bpm: 75,
    times: ALL_TIMES,
    notes: [CROTCHET, MINIM, SEMIBREVE],
    rests: [],
    pairedQuavers: true,
    dottedCrotchetQuaver: false,
    semiquaverGroups: false,
    ties: false,
    focus: 'paired quavers',
  },
  {
    level: 4,
    bpm: 78,
    times: ALL_TIMES,
    notes: [CROTCHET, MINIM, SEMIBREVE],
    rests: [CROTCHET, MINIM],
    pairedQuavers: true,
    dottedCrotchetQuaver: false,
    semiquaverGroups: false,
    ties: false,
    focus: 'crotchet and minim rests',
  },
  {
    level: 5,
    bpm: 82,
    times: ALL_TIMES,
    notes: [CROTCHET, MINIM, SEMIBREVE, DOTTED_MINIM],
    rests: [CROTCHET, MINIM],
    pairedQuavers: true,
    dottedCrotchetQuaver: true,
    semiquaverGroups: false,
    ties: false,
    focus: 'dotted minims and dotted crotchet-quaver patterns',
  },
  {
    level: 6,
    bpm: 85,
    times: ALL_TIMES,
    notes: [CROTCHET, MINIM, SEMIBREVE, DOTTED_MINIM],
    rests: [CROTCHET, MINIM],
    pairedQuavers: true,
    dottedCrotchetQuaver: true,
    semiquaverGroups: false,
    ties: true,
    focus: 'ties across the bar line',
  },
  {
    level: 7,
    bpm: 90,
    times: ALL_TIMES,
    notes: [CROTCHET, MINIM, SEMIBREVE, DOTTED_MINIM],
    rests: [CROTCHET, MINIM],
    pairedQuavers: true,
    dottedCrotchetQuaver: true,
    semiquaverGroups: true,
    ties: true,
    focus: 'groups of four semiquavers',
  },
  {
    level: 8,
    bpm: 96,
    times: ALL_TIMES,
    notes: [CROTCHET, MINIM, SEMIBREVE, DOTTED_MINIM],
    rests: [CROTCHET, MINIM],
    pairedQuavers: true,
    dottedCrotchetQuaver: true,
    semiquaverGroups: true,
    ties: true,
    focus: 'everything together at speed',
  },
];

export function clampLevel(level: number): number {
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(level)));
}

export function levelSpec(level: number): LevelSpec {
  return LEVELS[clampLevel(level) - 1] as LevelSpec;
}

/** Length of a duration in sixteenths: semiquaver 1, quaver 2, crotchet 4, minim 8, semibreve 16, dots add half. */
export function sixteenths(duration: Duration): number {
  const base: Record<string, number> = { semibreve: 16, minim: 8, crotchet: 4, quaver: 2, semiquaver: 1 };
  const length = base[duration.value] ?? Number.NaN;
  return duration.dots === 1 ? length * 1.5 : length;
}

const isNote = (e: ScoreEvent | undefined, value: Duration['value'], dots = 0): boolean =>
  e?.kind === 'note' && e.duration.value === value && e.duration.dots === dots;

/**
 * True when every symbol in the bar belongs to the level's vocabulary and is written as its
 * level introduces it: quavers only in pairs on the beat (or after a dotted crotchet), and
 * semiquavers only in whole groups of four. Beats are crotchets, so x/4 time only.
 */
export function barFitsLevel(bar: Bar, spec: LevelSpec): boolean {
  const events = bar.events;
  let offset = 0;
  for (let i = 0; i < events.length; i += 1) {
    const e = events[i] as ScoreEvent;
    const { value, dots } = e.duration;
    const length = sixteenths(e.duration);
    if (e.kind === 'rest') {
      if (!spec.rests.some((r) => r.value === value && r.dots === dots)) return false;
      offset += length;
      continue;
    }
    if (value === 'quaver' && dots === 0) {
      if (!spec.pairedQuavers || offset % 4 !== 0 || !isNote(events[i + 1], 'quaver')) return false;
      i += 1;
      offset += 4;
      continue;
    }
    if (value === 'crotchet' && dots === 1) {
      if (!spec.dottedCrotchetQuaver || offset % 4 !== 0 || !isNote(events[i + 1], 'quaver')) return false;
      i += 1;
      offset += 8;
      continue;
    }
    if (value === 'semiquaver') {
      if (!spec.semiquaverGroups || offset % 4 !== 0) return false;
      for (let k = 1; k < 4; k += 1) if (!isNote(events[i + k], 'semiquaver')) return false;
      i += 3;
      offset += 4;
      continue;
    }
    if (!spec.notes.some((n) => n.value === value && n.dots === dots)) return false;
    offset += length;
  }
  return true;
}

/** True when a rhythm uses something this level introduced (for levels 2 to 7). */
export function usesNewVocabulary(bars: Bar[], time: TimeSignature, level: number): boolean {
  const events = bars.flatMap((b) => b.events);
  const has = (pred: (e: ScoreEvent) => boolean) => events.some(pred);
  switch (clampLevel(level)) {
    case 2:
      return time.beats !== 4 || has((e) => e.duration.value === 'semibreve');
    case 3:
      return has((e) => e.duration.value === 'quaver');
    case 4:
      return has((e) => e.kind === 'rest');
    case 5:
      return has((e) => e.duration.dots === 1);
    case 6:
      return bars.some((b) => b.events.some((e) => e.kind === 'note' && e.tieToNext === true));
    case 7:
      return has((e) => e.duration.value === 'semiquaver');
    default:
      return true;
  }
}
