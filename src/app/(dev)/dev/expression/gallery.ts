import { pitch } from '@/engine/pitch';
import type { Bar, DynamicLevel, Expression, NoteValue, Passage, ScoreEvent } from '@/engine/types';

/** Passages for the expression harness (/dev/expression): one per marking kind, then a realistic one. */

export interface GalleryItem {
  id: string;
  title: string;
  passage: Passage;
  /** Squeeze the stave so it must break into systems at any screen width. */
  narrow?: boolean;
}

const n = (p: string, value: NoteValue = 'crotchet', extra: Partial<Extract<ScoreEvent, { kind: 'note' }>> = {}): ScoreEvent => ({
  kind: 'note',
  pitches: [pitch.parsePitch(p)],
  duration: { value, dots: 0 },
  ...extra,
});
const r = (value: NoteValue = 'crotchet', extra: Partial<Extract<ScoreEvent, { kind: 'rest' }>> = {}): ScoreEvent => ({ kind: 'rest', duration: { value, dots: 0 }, ...extra });
const bar = (events: ScoreEvent[], extra: Partial<Bar> = {}): Bar => ({ events, ...extra });
const ref = (b: number, e: number) => ({ bar: b, event: e });
const span = (b0: number, e0: number, b1: number, e1: number) => ({ from: ref(b0, e0), to: ref(b1, e1) });

function make(bars: Bar[], expression?: Expression, opts: { time?: [number, 1 | 2 | 4 | 8 | 16]; clef?: Passage['clef'] } = {}): Passage {
  const [beats, beatUnit] = opts.time ?? [4, 4];
  const p: Passage = {
    clef: opts.clef ?? 'treble',
    key: { tonic: pitch.parsePitchClass('C'), mode: 'major' },
    time: { beats, beatUnit },
    bars,
  };
  if (expression) p.expression = expression;
  return p;
}

const row = (pitches: string[], extra: Partial<Extract<ScoreEvent, { kind: 'note' }>> = {}) => pitches.map((p) => n(p, 'crotchet', extra));
const dyn = (b: number, e: number, level: DynamicLevel) => ({ at: ref(b, e), level });

export const GALLERY: GalleryItem[] = [
  {
    id: 'staccato',
    title: 'Staccato (stems up and down)',
    passage: make([bar(row(['E4', 'G4', 'B4', 'D5'], { articulations: ['staccato'] }))]),
  },
  {
    id: 'accent',
    title: 'Accent',
    passage: make([bar(row(['E4', 'G4', 'B4', 'D5'], { articulations: ['accent'] }))]),
  },
  {
    id: 'tenuto',
    title: 'Tenuto',
    passage: make([bar(row(['E4', 'G4', 'B4', 'D5'], { articulations: ['tenuto'] }))]),
  },
  {
    id: 'fermata',
    title: 'Pause on a note and on a rest',
    passage: make([
      bar([n('C5'), n('D5'), n('E5', 'minim', { fermata: true })]),
      bar([n('G4'), n('A4'), r('minim', { fermata: true })]),
    ]),
  },
  {
    id: 'dynamics',
    title: 'Dynamics pp to ff',
    passage: make(
      [bar(row(['C5', 'D5', 'E5'])), bar(row(['F5', 'E5', 'D5']))],
      { dynamics: [dyn(0, 0, 'pp'), dyn(0, 1, 'p'), dyn(0, 2, 'mp'), dyn(1, 0, 'mf'), dyn(1, 1, 'f'), dyn(1, 2, 'ff')] },
      { time: [3, 4] },
    ),
  },
  {
    id: 'hairpins',
    title: 'Crescendo and diminuendo hairpins, with dynamics at their ends',
    passage: make(
      [bar(row(['C5', 'D5', 'E5', 'F5'])), bar(row(['G5', 'F5', 'E5', 'D5']))],
      {
        dynamics: [dyn(0, 0, 'p'), dyn(1, 0, 'f'), dyn(1, 3, 'p')],
        hairpins: [
          { kind: 'cresc', ...span(0, 0, 0, 3) },
          { kind: 'dim', ...span(1, 0, 1, 3) },
        ],
      },
    ),
  },
  {
    id: 'hairpin-break',
    title: 'A hairpin crossing a system break',
    narrow: true,
    passage: make(
      [bar(row(['C5', 'D5', 'E5', 'F5'])), bar(row(['G5', 'A5', 'G5', 'F5'])), bar(row(['E5', 'D5', 'C5', 'D5'])), bar(row(['E5', 'D5', 'C5']).concat([r()]))],
      { dynamics: [dyn(0, 0, 'p'), dyn(2, 3, 'f')], hairpins: [{ kind: 'cresc', ...span(0, 1, 2, 2) }, { kind: 'dim', ...span(3, 0, 3, 2) }] },
    ),
  },
  {
    id: 'slurs',
    title: 'Slurs below stems-up notes and above stems-down notes',
    passage: make([bar(row(['C4', 'D4', 'E4', 'F4'])), bar(row(['A5', 'G5', 'F5', 'E5']))], { slurs: [span(0, 0, 0, 3), span(1, 0, 1, 3)] }),
  },
  {
    id: 'slur-barline',
    title: 'A slur across a bar line, and a slur over a tie',
    passage: make(
      [bar(row(['C4', 'E4', 'G4', 'E4'])), bar([n('G4', 'crotchet', { tieToNext: true }), n('G4'), n('A4'), n('B4')])],
      { slurs: [span(0, 2, 1, 0), span(1, 1, 1, 3)] },
    ),
  },
  {
    id: 'slur-break',
    title: 'A slur crossing a system break',
    narrow: true,
    passage: make(
      [bar(row(['C4', 'E4', 'G4', 'E4'])), bar(row(['D4', 'F4', 'A4', 'F4'])), bar(row(['E4', 'G4', 'B4', 'G4'])), bar(row(['C4', 'D4', 'E4', 'C4']))],
      { slurs: [span(0, 2, 2, 1)] },
    ),
  },
  {
    id: 'tempo',
    title: 'Tempo word and metronome mark',
    passage: make([bar(row(['C5', 'D5', 'E5', 'F5'])), bar([n('G5', 'semibreve')])], { tempo: { text: 'Allegro', bpm: 120 } }),
  },
  {
    id: 'tempo-compound',
    title: 'Metronome mark in compound time (dotted crotchet)',
    passage: make(
      [bar([n('G4', 'quaver'), n('A4', 'quaver'), n('B4', 'quaver'), n('C5', 'crotchet'), n('B4', 'quaver')])],
      { tempo: { text: 'Andante', bpm: 60 } },
      { time: [6, 8] },
    ),
  },
  {
    id: 'words',
    title: 'Words above and below, with rit. and a tempo',
    passage: make(
      [bar(row(['C5', 'D5', 'E5', 'F5'])), bar(row(['G5', 'F5', 'E5', 'D5']))],
      {
        words: [
          { at: ref(0, 0), text: 'dolce', place: 'below', lang: 'it' },
          { at: ref(0, 2), text: 'cresc.', place: 'below', lang: 'it' },
          { at: ref(1, 0), text: 'cantabile', place: 'above', lang: 'it' },
        ],
        tempoChanges: [{ kind: 'rit', ...span(1, 2, 1, 3) }],
      },
    ),
  },
  {
    id: 'repeat-bars',
    title: 'Repeat signs, double bar line and final bar line',
    passage: make(
      [
        bar(row(['C5', 'D5', 'E5', 'F5']), { repeatStart: true }),
        bar(row(['G5', 'F5', 'E5', 'D5']), { endBarline: 'repeat-end' }),
        bar(row(['C5', 'E5', 'G5', 'E5']), { endBarline: 'double' }),
        bar([n('C5', 'semibreve')], { endBarline: 'final' }),
      ],
    ),
  },
  {
    id: 'dc',
    title: 'D.C.',
    passage: make([bar(row(['C5', 'D5', 'E5', 'F5'])), bar(row(['G5', 'F5', 'E5', 'D5']), { marker: 'dc' })]),
  },
  {
    id: 'dc-al-fine',
    title: 'D.C. al Fine, with Fine',
    passage: make([bar(row(['C5', 'D5', 'E5', 'F5'])), bar(row(['G5', 'F5', 'E5', 'D5']), { marker: 'fine' }), bar(row(['E5', 'D5', 'C5', 'D5']), { marker: 'dc-al-fine' })]),
  },
  {
    id: 'ds',
    title: 'Segno and D.S.',
    passage: make([bar(row(['C5', 'D5', 'E5', 'F5']), { marker: 'segno' }), bar(row(['G5', 'F5', 'E5', 'D5']), { marker: 'ds' })]),
  },
  {
    id: 'ds-al-fine',
    title: 'Segno, Fine and D.S. al Fine',
    passage: make([
      bar(row(['C5', 'D5', 'E5', 'F5']), { marker: 'segno' }),
      bar(row(['G5', 'F5', 'E5', 'D5']), { marker: 'fine' }),
      bar(row(['E5', 'D5', 'C5', 'D5']), { marker: 'ds-al-fine' }),
    ]),
  },
  {
    id: 'realistic',
    title: 'Four bars with tempo, dynamics, hairpin, slurs, staccato, accents, a pause and D.C. al Fine',
    passage: make(
      [
        bar([n('C4'), n('E4'), n('G4'), n('E4')], { repeatStart: true }),
        bar([n('F4', 'crotchet', { articulations: ['accent'] }), n('A4', 'crotchet', { articulations: ['staccato'] }), n('A4', 'crotchet', { articulations: ['staccato'] }), n('G4')], { endBarline: 'repeat-end' }),
        bar([n('E5', 'crotchet', { articulations: ['accent'] }), n('D5'), n('C5', 'minim', { fermata: true })], { marker: 'fine' }),
        bar([n('G4', 'crotchet', { articulations: ['staccato'] }), n('A4', 'crotchet', { articulations: ['staccato'] }), n('B4'), r()], { marker: 'dc-al-fine' }),
      ],
      {
        tempo: { text: 'Allegro', bpm: 120 },
        dynamics: [dyn(0, 0, 'p'), dyn(1, 3, 'f'), dyn(3, 0, 'mf')],
        hairpins: [{ kind: 'cresc', ...span(0, 2, 1, 2) }],
        slurs: [span(0, 0, 0, 3), span(1, 3, 2, 0)],
      },
    ),
  },
];
