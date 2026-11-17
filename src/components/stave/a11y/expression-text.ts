/**
 * Words for expression marks in the passage description (docs/expression.md section 4,
 * Accessibility). Italian terms are wrapped in language markers so the component can give
 * them lang="it"; `plain` removes the markers again.
 */
import type { BarMarker, DynamicLevel, Duration, EventRef, NoteValue, Passage, Terminology } from '@/engine/types';
import type { Engines } from '../types';
import { strings } from './strings';

const START = '';
const SEP = '';
const END = '';

/** Marks `text` as being in `lang`. */
export const inLang = (lang: string, text: string) => `${START}${lang}${SEP}${text}${END}`;
const italian = (text: string) => inLang('it', text);

export interface TextSegment {
  text: string;
  lang?: string;
}

/** Splits a marked-up description into plain and foreign-language pieces. */
export function toSegments(marked: string): TextSegment[] {
  const out: TextSegment[] = [];
  let rest = marked;
  while (rest.length > 0) {
    const s = rest.indexOf(START);
    if (s < 0) {
      out.push({ text: rest });
      break;
    }
    if (s > 0) out.push({ text: rest.slice(0, s) });
    const sep = rest.indexOf(SEP, s);
    const end = rest.indexOf(END, sep);
    out.push({ text: rest.slice(sep + 1, end), lang: rest.slice(s + 1, sep) });
    rest = rest.slice(end + 1);
  }
  return out;
}

export const plain = (marked: string) => marked.replace(new RegExp(`${START}[^${SEP}]*${SEP}`, 'g'), '').replaceAll(END, '');

const DYNAMIC_WORDS: Record<DynamicLevel, string> = {
  pp: 'pianissimo',
  p: 'piano',
  mp: 'mezzo piano',
  mf: 'mezzo forte',
  f: 'forte',
  ff: 'fortissimo',
};

const MARKER_TEXT: Record<BarMarker, { sign: string; then: string }> = {
  segno: { sign: 'segno', then: ' sign' },
  fine: { sign: 'Fine', then: '' },
  dc: { sign: 'D.C.', then: ': go back to the beginning' },
  'dc-al-fine': { sign: 'D.C. al Fine', then: ': go back to the beginning and stop at Fine' },
  ds: { sign: 'D.S.', then: ': go back to the segno' },
  'ds-al-fine': { sign: 'D.S. al Fine', then: ': go back to the segno and stop at Fine' },
};

const key = (r: EventRef) => `${r.bar}:${r.event}`;

/** "note 3" inside the bar of `from`, "bar 2, note 1" elsewhere. */
function placeText(passage: Passage, ref: EventRef, from: EventRef, t: Terminology): string {
  const noun = strings(t).bar.toLowerCase();
  return ref.bar === from.bar ? `note ${ref.event + 1}` : `${noun} ${ref.bar + 1}, note ${ref.event + 1}`;
}

/** The marks that belong to one event, each introduced by a comma: ", staccato, mezzo forte, slurred from note 1 to note 4". */
export function eventMarkText(passage: Passage, bar: number, event: number, t: Terminology): string {
  const ev = passage.bars[bar].events[event];
  const at = { bar, event };
  const x = passage.expression;
  const parts: string[] = [];
  if (ev.kind === 'note') for (const a of ev.articulations ?? []) parts.push(a);
  if (ev.fermata) parts.push('pause');
  for (const d of x?.dynamics ?? []) if (key(d.at) === key(at)) parts.push(italian(DYNAMIC_WORDS[d.level]));
  for (const w of x?.words ?? []) if (key(w.at) === key(at)) parts.push(`marked ${inLang(w.lang ?? 'it', w.text)}`);
  for (const h of x?.hairpins ?? []) {
    if (key(h.from) === key(at)) parts.push(`getting ${h.kind === 'cresc' ? 'louder' : 'quieter'} from ${placeText(passage, h.from, at, t)} to ${placeText(passage, h.to, at, t)}`);
  }
  for (const s of x?.slurs ?? []) {
    if (key(s.from) === key(at)) parts.push(`slurred from ${placeText(passage, s.from, at, t)} to ${placeText(passage, s.to, at, t)}`);
  }
  for (const c of x?.tempoChanges ?? []) {
    if (c.kind === 'a-tempo') {
      if (key(c.at) === key(at)) parts.push(`back to the original speed (${italian('a tempo')})`);
    } else if (key(c.from) === key(at)) {
      const what = c.kind === 'accel' ? ['getting faster', 'accelerando'] : c.kind === 'rit' ? ['getting slower', 'ritardando'] : ['getting slower', 'rallentando'];
      parts.push(`${what[0]} (${italian(what[1])}) from ${placeText(passage, c.from, at, t)} to ${placeText(passage, c.to, at, t)}`);
    }
  }
  return parts.map((p) => `, ${p}`).join('');
}

/** Entries before and after a bar's events: repeat signs, segno, D.C. and so on. */
export function barSigns(passage: Passage, bar: number): { before: string[]; after: string[] } {
  const b = passage.bars[bar];
  const before: string[] = [];
  const after: string[] = [];
  if (b.repeatStart) before.push('start repeat');
  if (b.marker === 'segno') before.push(`${italian('segno')} sign`);
  if (b.endBarline === 'repeat-end') {
    const hasStart = passage.bars.slice(0, bar + 1).some((x) => x.repeatStart);
    after.push(`end repeat: go back to ${hasStart ? 'the start repeat' : 'the beginning'}`);
  }
  if (b.endBarline === 'double') after.push('double bar line');
  if (b.endBarline === 'final') after.push('final bar line');
  if (b.marker && b.marker !== 'segno') {
    const m = MARKER_TEXT[b.marker];
    after.push(`${italian(m.sign)}${m.then}`);
  }
  return { before, after };
}

function beatDuration(passage: Passage, beat?: Duration): Duration {
  if (beat) return beat;
  const { beats, beatUnit } = passage.time;
  const compound = beats === 6 || beats === 9 || beats === 12;
  const unit = compound ? beatUnit / 2 : beatUnit;
  const value: NoteValue = ({ 1: 'semibreve', 2: 'minim', 4: 'crotchet', 8: 'quaver', 16: 'semiquaver' } as Record<number, NoteValue>)[unit] ?? 'crotchet';
  return { value, dots: compound ? 1 : 0 };
}

/** "Tempo: Allegro, 120 crotchets a minute." (US: "quarter notes"). Empty when the passage has no tempo mark. */
export function tempoText(e: Engines, passage: Passage, t: Terminology): string {
  const tempo = passage.expression?.tempo;
  if (!tempo || (!tempo.text && tempo.bpm === undefined)) return '';
  const bits: string[] = [];
  if (tempo.text) bits.push(italian(tempo.text));
  if (tempo.bpm !== undefined) bits.push(`${tempo.bpm} ${e.rhythm.noteValueName(beatDuration(passage, tempo.beat), t)}s a minute`);
  return `Tempo: ${bits.join(', ')}.`;
}
