/**
 * Tap It: building the two-bar rhythms.
 *
 * Bars come from the lesson generators' own construction (`buildBar` with its three bar
 * rules), so every rhythm is exactly full bars written the way the lessons write them.
 * On top of that, a bar is kept only if it uses the level's vocabulary the way the level
 * introduces it (`barFitsLevel`) and passes the rhythm engine's grouping check.
 *
 * All randomness comes from the injected Rng.
 */
import { rhythm } from '@/engine/rhythm';
import type { Bar, Duration, Rng, TimeSignature } from '@/engine/types';
import { buildBar, noteCandidates, type Candidate } from '@/lesson/generators/shared/bars';
import { barFitsLevel, levelSpec, usesNewVocabulary, type LevelSpec } from './levels';

export const BARS_PER_RHYTHM = 2;
/** Whole-rhythm attempts before the vocabulary requirement is relaxed. */
const ATTEMPTS = 300;
/** Chance that a level 2 to 7 rhythm must show what the level introduced. */
const REQUIRE_NEW_CHANCE = 0.75;
/** Chance of a tie across the bar line, where the level has ties and the notes allow it. */
const TIE_CHANCE = 0.6;
const MIN_ONSETS = 3;
const B4 = { letter: 'B', accidental: 0, octave: 4 } as const;

export interface TapRhythm {
  level: number;
  time: TimeSignature;
  bars: Bar[];
  bpm: number;
  /** Notes the learner taps (rests and tied continuations excluded). */
  onsets: number;
  /** True when no rhythm met the level's rules in the attempt budget and plain crotchets were used. */
  fallback: boolean;
}

const dur = (value: Duration['value'], dots: 0 | 1 = 0): Duration => ({ value, dots });

/** Everything a level may put in a bar, as `buildBar` candidates. */
export function candidatesFor(spec: LevelSpec): Candidate[] {
  const notes: Duration[] = [...spec.notes];
  if (spec.pairedQuavers) notes.push(dur('quaver'));
  if (spec.dottedCrotchetQuaver) notes.push(dur('crotchet', 1));
  if (spec.semiquaverGroups) notes.push(dur('semiquaver'));
  return [...noteCandidates(notes), ...spec.rests.map((duration) => ({ kind: 'rest' as const, duration }))];
}

/** A short text key for a rhythm, to avoid repeating the last one. */
export function rhythmKey(time: TimeSignature, bars: Bar[]): string {
  const sym = (e: Bar['events'][number]) =>
    `${e.kind === 'rest' ? 'r' : 'n'}${e.duration.value}${e.duration.dots}${e.kind === 'note' && e.tieToNext ? '~' : ''}`;
  return `${time.beats}/${time.beatUnit}|${bars.map((b) => b.events.map(sym).join(' ')).join('|')}`;
}

export function countOnsets(bars: Bar[], time: TimeSignature): number {
  return rhythm.onsetTimes(bars, time, 60).length;
}

/** A good bar is full, cleanly grouped and has at least one note. */
function barIsGood(bar: Bar, time: TimeSignature): boolean {
  return (
    rhythm.checkBarLength(bar, time).status === 'complete' &&
    rhythm.groupingProblems(bar, time).length === 0 &&
    bar.events.some((e) => e.kind === 'note')
  );
}

/** Ties the last note of bar 1 to the first note of bar 2, when both are notes. */
function tieAcrossBarLine(bars: Bar[]): Bar[] {
  const first = bars[0] as Bar;
  const second = bars[1] as Bar;
  const last = first.events[first.events.length - 1];
  const next = second.events[0];
  if (last?.kind !== 'note' || next?.kind !== 'note') return bars;
  const events = first.events.map((e, i) => (i === first.events.length - 1 && e.kind === 'note' ? { ...e, tieToNext: true } : e));
  return [{ events }, second];
}

function fallbackRhythm(spec: LevelSpec): TapRhythm {
  const time = spec.times[0] as TimeSignature;
  const make = (): Bar => ({
    events: Array.from({ length: time.beats }, () => ({ kind: 'note' as const, pitches: [{ ...B4 }], duration: dur('crotchet') })),
  });
  const bars = [make(), make()];
  return { level: spec.level, time, bars, bpm: spec.bpm, onsets: countOnsets(bars, time), fallback: true };
}

/**
 * One rhythm for `level`. `avoid` is the key of the previous rhythm (see `rhythmKey`), which
 * is not repeated while another can be built.
 */
export function generateRhythm(level: number, rng: Rng, avoid?: string): TapRhythm {
  const spec = levelSpec(level);
  const candidates = candidatesFor(spec);
  const wantNew = spec.level >= 2 && spec.level <= 7 && rng.next() < REQUIRE_NEW_CHANCE;

  for (let attempt = 0; attempt < ATTEMPTS * 2; attempt += 1) {
    const requireNew = wantNew && attempt < ATTEMPTS;
    const time = rng.pick(spec.times);
    const built: Bar[] = [];
    let ok = true;
    for (let i = 0; i < BARS_PER_RHYTHM && ok; i += 1) {
      const bar = buildBar(rng, time, candidates);
      if (!bar || !barFitsLevel(bar, spec) || !barIsGood(bar, time)) ok = false;
      else built.push(bar);
    }
    if (!ok) continue;
    const bars = spec.ties && (requireNew || rng.next() < TIE_CHANCE) ? tieAcrossBarLine(built) : built;
    if (countOnsets(bars, time) < MIN_ONSETS) continue;
    if (requireNew && !usesNewVocabulary(bars, time, spec.level)) continue;
    if (avoid !== undefined && rhythmKey(time, bars) === avoid && attempt < ATTEMPTS * 2 - 1) continue;
    return { level: spec.level, time, bars, bpm: spec.bpm, onsets: countOnsets(bars, time), fallback: false };
  }
  return fallbackRhythm(spec);
}
