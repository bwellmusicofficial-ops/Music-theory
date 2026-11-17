/**
 * Characterisation test (task E2, written BEFORE playback learned expression).
 * It pins the exact schedule `playPassage` produces for passages with no
 * expression: times, sounding lengths, velocities, pitches, count-in clicks and
 * cursor callbacks. After the expression work this test must pass unchanged
 * (the snapshot file must not be regenerated): a passage without expression
 * sounds exactly as it did.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Bar, Duration, NoteValue, Passage, Pitch, ScoreEvent, TimeSignature } from '@/engine/types';
import { record } from './test-schedule';

vi.mock('tone', async () => (await import('./test-tone-mock')).toneMockFactory());

const p = (letter: Pitch['letter'], octave: number, accidental: Pitch['accidental'] = 0): Pitch => ({
  letter,
  accidental,
  octave,
});
const d = (value: NoteValue, dots = 0, tuplet?: Duration['tuplet']): Duration =>
  ({ value, dots, ...(tuplet ? { tuplet } : {}) }) as Duration;
const note = (pitches: Pitch[], duration: Duration, tieToNext = false): ScoreEvent => ({
  kind: 'note',
  pitches,
  duration,
  ...(tieToNext ? { tieToNext: true } : {}),
});
const rest = (duration: Duration): ScoreEvent => ({ kind: 'rest', duration });
const make = (time: TimeSignature, bars: ScoreEvent[][]): Passage => ({
  clef: 'treble',
  key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
  time,
  bars: bars.map((events): Bar => ({ events })),
});

const C4 = p('C', 4);
const D4 = p('D', 4);
const E4 = p('E', 4);
const G4 = p('G', 4);
const F4 = p('F', 4);

const TABLE: { name: string; passage: Passage; bpm: number; countIn?: number }[] = [
  {
    name: 'four crotchets',
    passage: make({ beats: 4, beatUnit: 4 }, [[note([C4], d('crotchet')), note([D4], d('crotchet')), note([E4], d('crotchet')), note([F4], d('crotchet'))]]),
    bpm: 100,
  },
  {
    name: 'ties within and across bars, chord tie',
    passage: make({ beats: 4, beatUnit: 4 }, [
      [note([C4], d('minim'), true), note([C4], d('crotchet')), note([D4], d('crotchet'), true)],
      [note([D4, G4], d('crotchet'), true), note([D4, G4], d('minim')), note([E4], d('crotchet'))],
    ]),
    bpm: 90,
  },
  {
    name: 'chords and rests',
    passage: make({ beats: 4, beatUnit: 4 }, [
      [note([C4, E4, G4], d('crotchet')), rest(d('crotchet')), note([D4, F4], d('minim'))],
      [rest(d('minim')), note([C4], d('crotchet')), rest(d('crotchet'))],
    ]),
    bpm: 72,
  },
  {
    name: 'dotted notes and quavers',
    passage: make({ beats: 3, beatUnit: 4 }, [
      [note([C4], d('minim', 1)), ],
      [note([D4], d('crotchet', 1)), note([E4], d('quaver')), note([F4], d('crotchet'))],
      [note([G4], d('quaver')), note([F4], d('quaver')), note([E4], d('quaver')), note([D4], d('quaver')), note([C4], d('minim'))],
    ]),
    bpm: 120,
  },
  {
    name: 'triplet quavers',
    passage: make({ beats: 4, beatUnit: 4 }, [
      [
        note([C4], d('quaver', 0, { actual: 3, normal: 2 } as never)),
        note([D4], d('quaver', 0, { actual: 3, normal: 2 } as never)),
        note([E4], d('quaver', 0, { actual: 3, normal: 2 } as never)),
        note([F4], d('minim')),
        note([G4], d('crotchet')),
      ],
    ]),
    bpm: 80,
  },
  {
    name: 'compound time 6/8',
    passage: make({ beats: 6, beatUnit: 8 }, [
      [note([C4], d('quaver')), note([D4], d('quaver')), note([E4], d('quaver')), note([F4], d('crotchet', 1))],
      [note([G4], d('crotchet', 1)), rest(d('quaver')), note([E4], d('quaver')), note([C4], d('quaver'))],
    ]),
    bpm: 60,
    countIn: 2,
  },
  {
    name: 'two-four with count-in',
    passage: make({ beats: 2, beatUnit: 4 }, [[note([C4], d('crotchet')), note([D4], d('crotchet'))], [note([E4], d('minim'))]]),
    bpm: 110,
    countIn: 4,
  },
  {
    name: 'semiquavers and a semibreve',
    passage: make({ beats: 4, beatUnit: 4 }, [
      [note([C4], d('semiquaver')), note([D4], d('semiquaver')), note([E4], d('semiquaver')), note([F4], d('semiquaver')), note([G4], d('minim', 1))],
      [note([C4], d('semibreve'))],
    ]),
    bpm: 66,
    countIn: 4,
  },
  {
    name: 'six-four (felt as six crotchets in playback)',
    passage: make({ beats: 6, beatUnit: 4 }, [
      [note([C4], d('minim')), note([D4], d('minim')), note([E4], d('minim'))],
      [note([F4], d('crotchet')), note([G4], d('crotchet')), note([E4], d('minim', 1))],
    ]),
    bpm: 90,
    countIn: 6,
  },
  {
    name: 'five-four, irregular metre',
    passage: make({ beats: 5, beatUnit: 4 }, [
      [note([C4], d('minim')), note([D4], d('minim')), note([E4], d('crotchet'))],
      [note([F4], d('minim', 1)), note([G4], d('minim'))],
    ]),
    bpm: 100,
    countIn: 5,
  },
  {
    name: 'two-two and three-eight',
    passage: make({ beats: 2, beatUnit: 2 }, [[note([C4], d('minim')), note([D4], d('minim'))], [note([E4], d('semibreve'))]]),
    bpm: 70,
    countIn: 2,
  },
  {
    name: 'three-eight',
    passage: make({ beats: 3, beatUnit: 8 }, [[note([C4], d('quaver')), note([D4], d('quaver')), note([E4], d('quaver'))], [note([F4], d('crotchet', 1))]]),
    bpm: 120,
  },
  {
    name: 'whole-bar rests in 3/4 and 2/4 (semibreve rest)',
    passage: make({ beats: 3, beatUnit: 4 }, [[rest(d('semibreve'))], [note([C4], d('minim', 1))], [rest(d('semibreve'))], [note([D4], d('minim', 1))]]),
    bpm: 100,
  },
  {
    name: 'whole-bar rest in 2/4',
    passage: make({ beats: 2, beatUnit: 4 }, [[note([C4], d('minim'))], [rest(d('semibreve'))], [note([D4], d('minim'))]]),
    bpm: 100,
  },
  {
    name: 'short last bar (not padded)',
    passage: make({ beats: 4, beatUnit: 4 }, [[note([C4], d('semibreve'))], [note([D4], d('crotchet')), note([E4], d('crotchet'))]]),
    bpm: 100,
  },
  {
    name: 'empty bar between notes',
    passage: { ...make({ beats: 4, beatUnit: 4 }, [[note([C4], d('semibreve'))], [], [note([D4], d('semibreve'))]]) },
    bpm: 100,
  },
];

/** Passages from the lesson content that carry no expression, spread across lessons. */
function lessonPassages(): { name: string; passage: Passage }[] {
  const root = join(process.cwd(), 'content', 'lessons');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.json')) files.push(full);
    }
  };
  walk(root);
  const out: { name: string; passage: Passage }[] = [];
  for (const file of files) {
    const found: Passage[] = [];
    const seen = new Set<string>();
    const visit = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== 'object') return;
      const o = value as Record<string, unknown>;
      if (o.clef && o.key && o.time && Array.isArray(o.bars)) {
        const text = JSON.stringify(o);
        const marked = /"(expression|articulations|fermata|repeatStart|endBarline|marker)"/.test(text);
        if (!marked && !seen.has(text)) {
          seen.add(text);
          found.push(o as unknown as Passage);
        }
        return;
      }
      Object.values(o).forEach(visit);
    };
    visit(JSON.parse(readFileSync(file, 'utf8')));
    // First, middle and last passage of each file, so every lesson is represented.
    const picks = [...new Set([0, Math.floor(found.length / 2), found.length - 1])].filter((i) => i >= 0 && found[i]);
    for (const i of picks) out.push({ name: `${file.slice(root.length + 1)} #${i}`, passage: found[i]! });
  }
  return out;
}

describe('baseline schedule of passages without expression', () => {
  it.each(TABLE.map((t) => [t.name, t] as const))('%s', async (_name, t) => {
    const recorded = await record(t.passage, { bpm: t.bpm, countInBeats: t.countIn });
    expect(recorded.doneResolved).toBe(true);
    expect(recorded).toMatchSnapshot();
  });

  it('the sampled piano voice gets the same schedule as the synth', async () => {
    const t = TABLE[1]!;
    const synth = await record(t.passage, { bpm: t.bpm }, 'synth');
    const sampled = await record(t.passage, { bpm: t.bpm }, 'sampled');
    expect(sampled).toEqual(synth);
  });

  it('real lesson passages (first, middle and last without expression in every lesson file)', async () => {
    const all = lessonPassages();
    expect(all.length).toBeGreaterThan(40);
    const lines: string[] = [];
    for (const { name, passage } of all) {
      for (const [bpm, countIn] of [[96, 0], [60, 4]] as const) {
        const r = await record(passage, { bpm, countInBeats: countIn });
        const notes = r.notes.map((n) => `${n.time}/${n.duration}/${n.hz}/${n.velocity}`).join(' ');
        const clicks = r.clicks.map((c) => `${c.time}/${c.hz}`).join(' ');
        const cursor = r.cursor.map((c) => `${c.time}:${c.bar}.${c.event}`).join(' ');
        lines.push(`${name} @${bpm}+${countIn} done=${r.doneResolved}\n  N ${notes}\n  C ${clicks}\n  E ${cursor}`);
      }
    }
    expect(lines.join('\n')).toMatchSnapshot();
  }, 120_000);
});
