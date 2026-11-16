import { describe, expect, it } from 'vitest';
import { lessonSchema, type Lesson } from '@/lesson/schema';
import { sortInTeachingOrder } from './order';
import { buildLesson } from '@/lesson/player/test-fixtures';

function lesson(over: Partial<Lesson> & Pick<Lesson, 'id' | 'grade' | 'unit' | 'order' | 'strand'>): Lesson {
  return lessonSchema.parse({ ...buildLesson(), prerequisites: [], status: 'draft', ...over });
}

describe('sortInTeachingOrder', () => {
  const pulse2 = lesson({ id: 'pulse-2', grade: 'start', unit: 'pulse-1', order: 2, strand: 'rhythm', prerequisites: ['pulse-1'] });
  const pulse1 = lesson({ id: 'pulse-1', grade: 'start', unit: 'pulse-1', order: 1, strand: 'rhythm' });
  const high1 = lesson({ id: 'high-1', grade: 'start', unit: 'high-low-1', order: 1, strand: 'pitch' });
  const stave1 = lesson({ id: 'stave-1', grade: 'start', unit: 'stave-1', order: 1, strand: 'pitch', prerequisites: ['high-1'] });
  const keys1 = lesson({ id: 'keys-1', grade: 'start', unit: 'keyboard-1', order: 1, strand: 'pitch', prerequisites: ['high-1'] });
  const keys2 = lesson({ id: 'keys-2', grade: 'start', unit: 'keyboard-1', order: 2, strand: 'pitch', prerequisites: ['keys-1'] });
  const stave2 = lesson({ id: 'stave-2', grade: 'start', unit: 'stave-1', order: 2, strand: 'pitch', prerequisites: ['stave-1', 'keys-2'] });
  const g1r = lesson({ id: 'g1-r', grade: '1', unit: 'rhythm-1', order: 1, strand: 'rhythm' });
  const g1p = lesson({ id: 'g1-p', grade: '1', unit: 'pitch-1', order: 1, strand: 'pitch' });
  const g1r2 = lesson({ id: 'g1-r2', grade: '1', unit: 'rhythm-2', order: 1, strand: 'rhythm', prerequisites: ['g1-r'] });
  const g1s = lesson({ id: 'g1-s', grade: '1', unit: 'scales-1', order: 1, strand: 'scales-keys' });
  const all = [g1s, stave2, g1p, pulse2, keys2, g1r2, stave1, keys1, high1, pulse1, g1r];

  it('puts Start here before Grade 1, and Grade 1 before Grade 2', () => {
    const g2 = lesson({ id: 'g2', grade: '2', unit: 'a-1', order: 1, strand: 'rhythm' });
    const ids = sortInTeachingOrder([g2, ...all]).map((l) => l.id);
    expect(ids.indexOf('stave-2')).toBeLessThan(ids.indexOf('g1-r'));
    expect(ids.indexOf('g1-s')).toBeLessThan(ids.indexOf('g2'));
  });

  it('orders units by strand, then by how deep they sit in the prerequisites, and lessons by position', () => {
    expect(sortInTeachingOrder(all).map((l) => l.id)).toEqual([
      'pulse-1', 'pulse-2',
      'high-1',
      'keys-1', 'keys-2',
      'stave-1', 'stave-2',
      'g1-r', 'g1-r2',
      'g1-p',
      'g1-s',
    ]);
  });

  it('is stable for any input order and survives a prerequisite cycle', () => {
    const forward = sortInTeachingOrder(all).map((l) => l.id);
    expect(sortInTeachingOrder([...all].reverse()).map((l) => l.id)).toEqual(forward);
    const a = lesson({ id: 'a', grade: '1', unit: 'x-1', order: 1, strand: 'rhythm', prerequisites: ['b'] });
    const b = lesson({ id: 'b', grade: '1', unit: 'x-1', order: 2, strand: 'rhythm', prerequisites: ['a'] });
    expect(sortInTeachingOrder([b, a]).map((l) => l.id)).toEqual(['a', 'b']);
  });
});
