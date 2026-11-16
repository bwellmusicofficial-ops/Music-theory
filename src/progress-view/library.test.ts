import { describe, expect, it } from 'vitest';
import { filterLessons, filterOptions, glossaryRow, groupGlossary, languageLabel, matchesQuery, normalise, NO_LESSON_FILTER, orderRecaps, toProgressMap, type GlossaryItem } from './index';
import { meta, prog, sampleLessons } from './test-fixtures';

const entry = (id: string, term: string, over: Partial<GlossaryItem> = {}): GlossaryItem => ({
  id, term, language: 'en', definition: `About ${term}.`, grade: '1', strand: 'rhythm', ...over,
});

describe('search helpers', () => {
  it('ignores case and accents and needs every word', () => {
    expect(normalise('Più MOSSO')).toBe('piu mosso');
    expect(matchesQuery('piu mosso faster', 'PIÙ fast')).toBe(true);
    expect(matchesQuery('piu mosso', 'slow')).toBe(false);
    expect(matchesQuery('anything', '   ')).toBe(true);
  });
});

describe('filterLessons', () => {
  const lessons = [
    meta('a', { title: 'Quavers', usTitle: 'Eighth notes', summary: 'Split the beat.', grade: '1', strand: 'rhythm' }),
    meta('b', { title: 'Treble clef', summary: 'Name the notes.', grade: 'start', strand: 'pitch' }),
    meta('c', { title: 'Bass clef', summary: 'Low notes and quavers.', grade: '1', strand: 'pitch' }),
  ];
  it('filters by grade, strand and text over title and summary', () => {
    expect(filterLessons(lessons, NO_LESSON_FILTER)).toHaveLength(3);
    expect(filterLessons(lessons, { ...NO_LESSON_FILTER, grade: '1' }).map((l) => l.id)).toEqual(['a', 'c']);
    expect(filterLessons(lessons, { ...NO_LESSON_FILTER, strand: 'pitch' }).map((l) => l.id)).toEqual(['b', 'c']);
    expect(filterLessons(lessons, { ...NO_LESSON_FILTER, query: 'quaver' }).map((l) => l.id)).toEqual(['a', 'c']);
    expect(filterLessons(lessons, { grade: '1', strand: 'pitch', query: 'quaver' }).map((l) => l.id)).toEqual(['c']);
    expect(filterLessons(lessons, { ...NO_LESSON_FILTER, query: 'eighth' }).map((l) => l.id)).toEqual(['a']);
    expect(filterLessons(lessons, { ...NO_LESSON_FILTER, query: 'zzz' })).toEqual([]);
  });
  it('lists the grades and strands present', () => {
    expect(filterOptions(lessons)).toEqual({ grades: ['1', 'start'], strands: ['rhythm', 'pitch'] });
  });
});

describe('orderRecaps', () => {
  it('puts completed lessons first, each group in teaching order, skipping lessons with no card', () => {
    const lessons = sampleLessons();
    const cards = ['s1', 's2', 'g1', 'g3'].map((lessonId) => ({ lessonId, points: ['x'] }));
    const rows = orderRecaps(lessons, cards, toProgressMap([prog('g3', 'complete'), prog('s2', 'mastered'), prog('g1', 'in-progress')]));
    expect(rows.map((r) => [r.lesson.id, r.earned])).toEqual([['s2', true], ['g3', true], ['s1', false], ['g1', false]]);
  });
});

describe('glossary rows', () => {
  const crotchet = entry('crotchet', 'crotchet', { us: 'quarter note' });
  it('shows the UK term with the US form as "also called", and the reverse for US', () => {
    expect(glossaryRow(crotchet, 'uk')).toMatchObject({ term: 'crotchet', alsoCalled: 'quarter note' });
    expect(glossaryRow(crotchet, 'us')).toMatchObject({ term: 'quarter note', alsoCalled: 'crotchet' });
    expect(glossaryRow(entry('beat', 'beat'), 'us')).toMatchObject({ term: 'beat', alsoCalled: null });
  });
  it('labels Italian terms', () => {
    expect(languageLabel(entry('a', 'adagio', { language: 'it' }))).toBe('Italian');
    expect(languageLabel(entry('b', 'beat'))).toBeNull();
  });
  it('groups A to Z with numbers first, searches term, US form and definition', () => {
    const rows = [entry('b', 'beat'), entry('a', 'adagio', { language: 'it', definition: 'Slow and [[beat|calm]].' }), entry('c', 'crotchet', { us: 'quarter note' }), entry('t', '2nd')].map((e) => glossaryRow(e, 'uk'));
    expect(groupGlossary(rows, '').map((g) => g.letter)).toEqual(['#', 'A', 'B', 'C']);
    expect(groupGlossary(rows, 'calm')[0]!.rows[0]!.entry.id).toBe('a');
    expect(groupGlossary(rows, 'quarter')[0]!.rows[0]!.entry.id).toBe('c');
    expect(groupGlossary(rows, 'nothing')).toEqual([]);
    const us = [entry('c', 'crotchet', { us: 'quarter note' })].map((e) => glossaryRow(e, 'us'));
    expect(groupGlossary(us, '')[0]!.letter).toBe('Q');
  });
});
