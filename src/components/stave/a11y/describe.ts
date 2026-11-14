/** Pure text for announcements, event descriptions and the passage description (6.3 to 6.5). */
import type { Accidental, NoteEvent, Passage, Pitch, ScoreEvent, Terminology } from '@/engine/types';
import { signsForBar } from '../edit/accidentals';
import type { RejectReason } from '../edit/actions';
import type { Engines, StaveMark } from '../types';
import { MESSAGES, SIGN_WORDS, strings } from './strings';

export interface DescribeOptions {
  terminology: Terminology;
  pitchSpeech: 'names' | 'positions';
  marks?: Record<string, StaveMark>;
  /** Bars the learner may edit; only mentioned when this is a strict subset. */
  editableBars?: number[];
}

const ACC_WORDS: Record<number, string> = { [-2]: ' double flat', [-1]: ' flat', 0: '', 1: ' sharp', 2: ' double sharp' };

/** "F sharp 4". Built locally because displayPitchClass returns glyphs. */
export function spokenPitch(p: Pitch): string {
  return p.accidental === 0 ? `${p.letter}${p.octave}` : `${p.letter}${ACC_WORDS[p.accidental]} ${p.octave}`;
}

/** "line 1".."line 5", "space 1".."space 4", ledger positions outward (6.3). */
export function positionName(position: number, terminology: Terminology = 'uk'): string {
  const stave = strings(terminology).stave;
  if (position >= 0 && position <= 8) {
    return position % 2 === 0 ? `line ${position / 2 + 1}` : `space ${(position + 1) / 2}`;
  }
  if (position === -1) return `space below the ${stave}`;
  if (position === 9) return `space above the ${stave}`;
  if (position < 0) {
    const n = Math.floor(-position / 2);
    return position % 2 === 0 ? `ledger line ${n} below` : `space below ledger line ${n} below`;
  }
  const n = Math.floor((position - 8) / 2);
  return position % 2 === 0 ? `ledger line ${n} above` : `space above ledger line ${n} above`;
}

/** Pitch as it should be spoken, honouring pitchSpeech and a drawn sign. */
export function pitchText(e: Engines, p: Pitch, clef: Passage['clef'], o: Pick<DescribeOptions, 'pitchSpeech' | 'terminology'>, drawn?: Accidental | null): string {
  if (o.pitchSpeech === 'positions') {
    const base = positionName(e.pitch.stavePosition(p, clef), o.terminology);
    return drawn === null || drawn === undefined ? base : `${base} with a ${SIGN_WORDS[drawn]}`;
  }
  return spokenPitch(p);
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function durationName(e: Engines, ev: ScoreEvent, t: Terminology): string {
  return ev.kind === 'rest' ? e.rhythm.restName(ev.duration, t) : e.rhythm.noteValueName(ev.duration, t);
}

function tupletWord(ev: ScoreEvent): string {
  const t = ev.duration.tuplet;
  if (!t) return '';
  return t.actual === 3 ? ', in a triplet' : `, in a tuplet of ${t.actual}`;
}

/** Pitch part of an event: "F sharp 4", "chord D4, F sharp 4, A4", or "" for a rest. */
function pitchPart(e: Engines, passage: Passage, bar: number, ev: NoteEvent, event: number, o: DescribeOptions): string {
  const signs = signsForBar(e, passage.bars[bar], passage.key, tieInFor(passage, bar))[event] ?? [];
  const names = ev.pitches.map((p, i) => pitchText(e, p, passage.clef, o, signs[i]));
  return names.length > 1 ? `chord ${names.join(', ')}` : names[0];
}

function tieInFor(passage: Passage, bar: number): NoteEvent | undefined {
  const last = passage.bars[bar - 1]?.events.at(-1);
  return last && last.kind === 'note' && last.tieToNext ? last : undefined;
}

function markSuffix(o: DescribeOptions, key: string): string {
  const m = o.marks?.[key];
  if (!m) return '';
  return m === 'highlight' ? ', highlighted' : `, marked ${m}`;
}

/** "Bar 2, note 1 of 3: F sharp 4, crotchet, tied, marked wrong". */
export function describeEvent(e: Engines, passage: Passage, bar: number, event: number, o: DescribeOptions): string {
  const s = strings(o.terminology);
  const b = passage.bars[bar];
  const ev = b.events[event];
  const lead = `${s.bar} ${bar + 1}, ${s.note} ${event + 1} ${s.of} ${b.events.length}: `;
  const name = durationName(e, ev, o.terminology);
  let body: string;
  if (ev.kind === 'rest') body = name;
  else body = `${pitchPart(e, passage, bar, ev, event, o)}, ${name}`;
  if (ev.kind === 'note' && ev.tieToNext) body += `, ${MESSAGES.tiedWord}`;
  return lead + body + tupletWord(ev) + markSuffix(o, `${bar}:${event}`);
}

/** Event text inside the passage description: "F sharp 4 crotchet", "crotchet rest". */
function inline(e: Engines, passage: Passage, bar: number, event: number, o: DescribeOptions): string {
  const ev = passage.bars[bar].events[event];
  const name = durationName(e, ev, o.terminology);
  let t = ev.kind === 'rest' ? name : `${pitchPart(e, passage, bar, ev, event, o)} ${name}`;
  if (ev.kind === 'note' && ev.tieToNext) t += `, ${MESSAGES.tiedWord}`;
  return t + tupletWord(ev) + markSuffix(o, `${bar}:${event}`);
}

function keySigText(e: Engines, passage: Passage): string {
  const n = e.pitch.keySignature(passage.key);
  if (n === 0) return 'none';
  const a = Math.abs(n);
  return `${a} ${n > 0 ? 'sharp' : 'flat'}${a === 1 ? '' : 's'}`;
}

function runs(bars: number[]): string {
  const sorted = [...new Set(bars)].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `${sorted[i] + 1} to ${sorted[j] + 1}` : `${sorted[i] + 1}`);
    i = j + 1;
  }
  return parts.join(' and ');
}

export interface ShowFlags {
  clef?: boolean;
  keySignature?: boolean;
  timeSignature?: boolean;
}

export function describePassage(e: Engines, passage: Passage, o: DescribeOptions, show: ShowFlags = {}): string {
  const s = strings(o.terminology);
  const parts: string[] = [];
  if (show.clef !== false) parts.push(`${s.clef[passage.clef]}.`);
  if (show.keySignature !== false) parts.push(`Key signature: ${keySigText(e, passage)}.`);
  if (show.timeSignature !== false) parts.push(`Time signature: ${passage.time.beats} ${passage.time.beatUnit}.`);
  passage.bars.forEach((b, bi) => {
    const body = b.events.length === 0 ? MESSAGES.empty : b.events.map((_, i) => inline(e, passage, bi, i, o)).join('; ');
    parts.push(`${s.bar} ${bi + 1}: ${body}${markSuffix(o, String(bi))}.`);
  });
  const ed = o.editableBars;
  if (ed && ed.length > 0 && ed.length < passage.bars.length) {
    parts.push(`${ed.length === 1 ? s.bar : s.barPlural} ${runs(ed)} can be edited.`);
  }
  return parts.join(' ');
}

// --- announcements --------------------------------------------------------

function countText(n: number): string {
  return `${n} note${n === 1 ? '' : 's'}`;
}

export function announcePlaced(e: Engines, passage: Passage, bar: number, event: number, o: DescribeOptions): string {
  const s = strings(o.terminology);
  const b = passage.bars[bar];
  const ev = b.events[event];
  const where = `${s.bar} ${bar + 1}, ${s.note} ${event + 1} ${s.of} ${b.events.length}.`;
  if (ev.kind === 'rest') return `${capital(e.rhythm.restName(ev.duration, o.terminology))}. ${where}`;
  const signs = signsForBar(e, b, passage.key, tieInFor(passage, bar))[event] ?? [];
  const pitches = ev.pitches.map((p, i) => pitchText(e, p, passage.clef, o, signs[i])).join(', ');
  return `${capital(pitches)}, ${e.rhythm.noteValueName(ev.duration, o.terminology)}. ${where}`;
}

export function announceMoved(e: Engines, passage: Passage, bar: number, event: number, pitchIndex: number, o: DescribeOptions): string {
  const ev = passage.bars[bar].events[event];
  if (ev.kind !== 'note') return '';
  const signs = signsForBar(e, passage.bars[bar], passage.key, tieInFor(passage, bar))[event] ?? [];
  return `${capital(pitchText(e, ev.pitches[pitchIndex], passage.clef, o, signs[pitchIndex]))}.`;
}

export function announceSign(e: Engines, passage: Passage, bar: number, event: number, pitchIndex: number, sign: Accidental | null, o: DescribeOptions): string {
  const ev = passage.bars[bar].events[event];
  if (ev.kind !== 'note') return '';
  const name = pitchText(e, ev.pitches[pitchIndex], passage.clef, { ...o, pitchSpeech: o.pitchSpeech });
  const base = capital(name);
  return sign === null ? `${base}, ${MESSAGES.signRemoved}.` : `${base}, ${SIGN_WORDS[sign]} sign added.`;
}

export function announceDuration(e: Engines, passage: Passage, bar: number, event: number, o: DescribeOptions): string {
  const ev = passage.bars[bar].events[event];
  return `${capital(durationName(e, ev, o.terminology))}.`;
}

export function announceHeadAdded(e: Engines, passage: Passage, bar: number, event: number, pitchIndex: number, o: DescribeOptions): string {
  const ev = passage.bars[bar].events[event];
  if (ev.kind !== 'note') return '';
  const signs = signsForBar(e, passage.bars[bar], passage.key, tieInFor(passage, bar))[event] ?? [];
  const added = capital(pitchText(e, ev.pitches[pitchIndex], passage.clef, o, signs[pitchIndex]));
  const chord = ev.pitches.map((p, i) => pitchText(e, p, passage.clef, o, signs[i])).join(', ');
  return `${added} added. Chord: ${chord}.`;
}

export function announceTie(on: boolean): string {
  return on ? MESSAGES.tied : MESSAGES.tieRemoved;
}

export function announceDeleted(passage: Passage, bar: number, o: DescribeOptions): string {
  const s = strings(o.terminology);
  const n = passage.bars[bar]?.events.length ?? 0;
  return n === 0 ? `Deleted. ${s.bar} ${bar + 1} is empty.` : `Deleted. ${s.bar} ${bar + 1} has ${countText(n)}.`;
}

export function announceSelection(e: Engines, passage: Passage, bar: number, event: number | null, o: DescribeOptions): string {
  const s = strings(o.terminology);
  if (event === null) return `${s.bar} ${bar + 1}, end.`;
  const full = describeEvent(e, passage, bar, event, { ...o, marks: undefined });
  return `${full}.`;
}

export function announceRejected(reason: RejectReason, direction?: 'high' | 'low'): string {
  switch (reason) {
    case 'locked':
      return MESSAGES.fixed;
    case 'bar-full':
      return MESSAGES.full;
    case 'out-of-range':
      return direction === 'low' ? MESSAGES.tooLow : MESSAGES.tooHigh;
    case 'position-occupied':
      return MESSAGES.inChord;
    default:
      return MESSAGES.notAvailable;
  }
}
