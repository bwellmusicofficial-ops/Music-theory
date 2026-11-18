/**
 * A passage with no expression fields behaves exactly as if expression did not
 * exist: same onset times as `rhythm.onsetTimes`, mf everywhere, full length,
 * written order. Checked on hand-made passages and on every passage found in
 * content/ (lessons, glossary and mock tests).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rhythm } from '../rhythm';
import type { Passage } from '../types';
import { expression } from './index';
import { T, passage } from './test-helpers';

function jsonFiles(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return jsonFiles(path);
      return name.endsWith('.json') ? [path] : [];
    });
}

function collect(value: unknown, into: Passage[]): void {
  if (Array.isArray(value)) {
    value.forEach((v) => collect(v, into));
  } else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (Array.isArray(o.bars) && 'time' in o && 'clef' in o && 'key' in o) into.push(o as unknown as Passage);
    Object.values(o).forEach((v) => collect(v, into));
  }
}

const found: Passage[] = [];
for (const file of jsonFiles(join(process.cwd(), 'content'))) collect(JSON.parse(readFileSync(file, 'utf8')), found);

const handMade: Passage[] = [
  passage(['c c c c']),
  passage(['c c m', 'c. q m', 'rm m']),
  passage(['c~ c c c', 'c c c c~', 'm m']),
  passage(['q3 q3 q3 c c c', 'rc c c c']),
  passage(['rs', 'c c c'], undefined, T(3, 4)),
  passage(['q q q q q q', 'c. c.'], undefined, T(6, 8)),
  passage(['c. c. c. c.', 'rs', 'c.'], undefined, T(12, 8)),
  passage(['rB', 'm m m m'], undefined, T(4, 2)),
  passage(['m m', 'm m'], undefined, T(2, 2)),
  passage(['c c c c c'], undefined, T(5, 4)),
  passage(['q q q'], undefined, T(3, 8)),
];

const BPMS = [40, 60, 90, 120, 187];

function sameAsNoExpression(p: Passage): void {
  for (const bpm of BPMS) {
    const expected = rhythm.onsetTimes(p.bars, p.time, bpm);
    const map = expression.tempoMap(p, bpm);
    const got: number[] = [];
    let tied = false;
    p.bars.forEach((bar, b) => {
      bar.events.forEach((e, i) => {
        if (e.kind === 'note' && !tied) got.push(map.timeOf(b, i));
        tied = e.kind === 'note' && e.tieToNext === true;
      });
    });
    // The whole-bar-rest rule resets ties in onsetTimes; the lesson passages never tie across one.
    expect(got).toHaveLength(expected.length);
    got.forEach((t, i) => expect(t).toBeCloseTo(expected[i]!, 9));
  }
  expect(expression.performanceOrder(p)).toEqual(p.bars.map((_, i) => i));
  expect(expression.performedEvents(p, 100).map((e) => [e.bar, e.event])).toEqual(
    p.bars.flatMap((b, bi) => b.events.map((_, ei) => [bi, ei])),
  );
  const loud = expression.loudnessAt(p);
  const len = expression.soundingLengths(p);
  p.bars.forEach((bar, b) =>
    bar.events.forEach((e, i) => {
      expect(loud[b]![i]).toBe(e.kind === 'note' ? 0 : null);
    }),
  );
  const tiedFrom = new Set<string>();
  p.bars.forEach((bar, b) =>
    bar.events.forEach((e, i) => {
      if (e.kind === 'note' && e.tieToNext) {
        const next = bar.events[i + 1] ? `${b}:${i + 1}` : `${b + 1}:0`;
        tiedFrom.add(next);
      }
    }),
  );
  p.bars.forEach((bar, b) =>
    bar.events.forEach((e, i) => {
      expect(len[b]![i]).toBe(e.kind === 'note' && !tiedFrom.has(`${b}:${i}`) ? 1 : null);
    }),
  );
  expect(expression.validateExpression(p)).toEqual([]);
}

describe('a passage with no expression behaves as it did before', () => {
  it('finds passages in content/ to test (so this test cannot silently check nothing)', () => {
    expect(found.length).toBeGreaterThan(20);
  });

  it.each(handMade.map((p, i) => [`hand-made passage ${i + 1}`, p] as const))('%s', (_name, p) => {
    sameAsNoExpression(p);
  });

  it('holds for every passage in content/ that has no expression', () => {
    // "No expression" means no marking of any kind: passage-level, bar-level or on a note.
    const hasMarking = (p: Passage) =>
      p.expression !== undefined ||
      p.bars.some(
        (b) =>
          b.repeatStart !== undefined ||
          b.endBarline !== undefined ||
          b.marker !== undefined ||
          b.events.some((e) => e.fermata !== undefined || (e.kind === 'note' && e.articulations !== undefined)),
      );
    const plain = found.filter((p) => !hasMarking(p));
    expect(plain.length).toBeGreaterThan(20);
    const failures: string[] = [];
    plain.forEach((p, i) => {
      try {
        sameAsNoExpression(p);
      } catch (e) {
        failures.push(`passage ${i}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      }
    });
    expect(failures).toEqual([]);
  });
});
