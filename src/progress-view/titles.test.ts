import { describe, expect, it } from 'vitest';
import { listLessons } from '@/content/load';
import { GRADES } from '@/lesson/schema';
import { GRADE_SUMMARIES, GRADE_TITLES, hasUnitTitle, UNIT_TITLES, unitTitle } from './titles';

describe('unit and grade titles', () => {
  it('has a title for every unit id in content', () => {
    const units = new Set(listLessons().map((l) => `${l.grade}/${l.unit}`));
    expect(units.size).toBeGreaterThan(0);
    const missing = [...units].filter((u) => !(u in UNIT_TITLES));
    expect(missing).toEqual([]);
  });

  it('has no title for a unit that does not exist (no stale entries)', () => {
    const units = new Set(listLessons().map((l) => `${l.grade}/${l.unit}`));
    expect(Object.keys(UNIT_TITLES).filter((k) => !units.has(k))).toEqual([]);
  });

  it('gives each unit a distinct, human title', () => {
    const titles = Object.values(UNIT_TITLES);
    expect(new Set(titles).size).toBe(titles.length);
    for (const t of titles) expect(t).toMatch(/^[A-Z][A-Za-z ,]+$/);
  });

  it('looks titles up by grade and unit', () => {
    expect(unitTitle('1', 'rhythm-1')).toBe('Note values and time');
    expect(hasUnitTitle('1', 'rhythm-1')).toBe(true);
    expect(hasUnitTitle('2', 'rhythm-1')).toBe(false);
    expect(unitTitle('2', 'rhythm-1')).toBe('Rhythm 1');
  });

  it('titles every grade and summarises grades 2 to 8', () => {
    for (const g of GRADES) expect(GRADE_TITLES[g]).toBeTruthy();
    for (const g of ['2', '3', '4', '5', '6', '7', '8'] as const) expect(GRADE_SUMMARIES[g]).toBeTruthy();
    expect(GRADE_SUMMARIES.start).toBeUndefined();
    expect(GRADE_SUMMARIES['1']).toBeUndefined();
  });
});
