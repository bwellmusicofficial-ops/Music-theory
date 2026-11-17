/** Passages used by the "no expression, no change" test: hand-written ones plus real lesson and mock passages. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Passage } from '@/engine/types';
import { bar, note, passage, rest } from '../fixtures';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}

function isPassage(v: unknown): v is Passage {
  const o = v as Record<string, unknown> | null;
  return !!o && typeof o === 'object' && typeof o.clef === 'string' && Array.isArray(o.bars) && !!o.key && !!o.time;
}

function collect(v: unknown, found: Passage[]): void {
  if (isPassage(v)) {
    found.push(v);
    return;
  }
  if (Array.isArray(v)) v.forEach((x) => collect(x, found));
  else if (v && typeof v === 'object') Object.values(v as object).forEach((x) => collect(x, found));
}

/** Every passage in content/, in file order, then `count` of them spread evenly across the whole list. */
export function lessonPassages(count: number): { id: string; passage: Passage }[] {
  const all: { id: string; passage: Passage }[] = [];
  for (const file of walk(join(process.cwd(), 'content'))) {
    const found: Passage[] = [];
    collect(JSON.parse(readFileSync(file, 'utf8')), found);
    found.forEach((p, i) => all.push({ id: `${file.split('/content/')[1]}#${i}`, passage: p }));
  }
  const step = Math.max(1, Math.floor(all.length / count));
  return all.filter((_, i) => i % step === 0).slice(0, count);
}

export function handPassages(): { id: string; passage: Passage }[] {
  return [
    { id: 'one-bar', passage: passage([bar(note('C4'), note('E4'), note('G4'), rest())]) },
    {
      id: 'ties-and-accidentals',
      passage: passage([bar(note('F#4', 'crotchet', { tieToNext: true }), note('F#4'), note('A4', 'quaver'), note('B4', 'quaver'), rest())], { key: 'D' }),
    },
    {
      id: 'four-bars-bass',
      passage: passage(
        Array.from({ length: 4 }, (_, i) => bar(note('C3'), note('E3', 'quaver'), note('G3', 'quaver'), note(i % 2 ? 'B2' : 'D3', 'minim'))),
        { clef: 'bass', key: 'F' },
      ),
    },
    {
      id: 'high-and-low',
      passage: passage([bar(note('C6'), note('A3'), note('E5', 'minim')), bar(note('G2', 'semibreve'))]),
    },
    {
      id: 'six-eight',
      passage: passage([bar(note('G4', 'quaver'), note('A4', 'quaver'), note('B4', 'quaver'), note('C5', 'minim'))], { beats: 6, unit: 8 }),
    },
    { id: 'empty', passage: passage([bar()]) },
  ];
}
