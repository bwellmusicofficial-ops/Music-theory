import { describe, expect, it } from 'vitest';
import { buildBank, meaningLabel, termLabel } from './bank';
import {
  containsTerm,
  firstSentence,
  MEANING_LIMIT,
  parseAbbreviations,
  shortenMeaning,
  stripAbbreviations,
} from './meaning';
import { realBank, realEntries } from './test-data';

describe('parseAbbreviations', () => {
  it('reads abbreviations in brackets, as written', () => {
    expect(parseAbbreviations('Gradually getting louder (cresc.).')).toEqual(['cresc.']);
    expect(parseAbbreviations('Loud (f).')).toEqual(['f']);
    expect(parseAbbreviations('Go back to the beginning (D.C.).')).toEqual(['D.C.']);
    expect(parseAbbreviations('Moderately loud (mf).')).toEqual(['mf']);
  });
  it('finds none where there is no bracket', () => {
    expect(parseAbbreviations('Quick and lively.')).toEqual([]);
    expect(parseAbbreviations('')).toEqual([]);
  });
  it('ignores brackets that are not abbreviations', () => {
    expect(parseAbbreviations('A pause (see below) or a rest (1 beat).')).toEqual([]);
    expect(parseAbbreviations('Slow (very slow indeed).')).toEqual([]);
    expect(parseAbbreviations('Two notes (C and D).')).toEqual([]);
  });
  it('returns several in order', () => {
    expect(parseAbbreviations('Softer (dim.), or (decresc.).')).toEqual(['dim.', 'decresc.']);
  });
});

describe('stripAbbreviations and firstSentence', () => {
  it('removes the brackets and the space before them', () => {
    expect(stripAbbreviations('Gradually getting louder (cresc.).')).toBe('Gradually getting louder.');
    expect(stripAbbreviations('Loud (f).')).toBe('Loud.');
    expect(stripAbbreviations('A (b) c')).toBe('A c');
  });
  it('keeps brackets that are not abbreviations', () => {
    expect(stripAbbreviations('Two notes (C and D).')).toBe('Two notes (C and D).');
  });
  it('splits sentences at a full stop before a capital or digit, not inside numbers or phrases', () => {
    expect(firstSentence('Two numbers, such as 3/4. The top number counts.')).toBe('Two numbers, such as 3/4.');
    expect(firstSentence('It lasts 1 and a half beats. Next.')).toBe('It lasts 1 and a half beats.');
    expect(firstSentence('No stop here')).toBe('No stop here');
    expect(firstSentence('What? Yes.')).toBe('What?');
    expect(firstSentence('Slow.')).toBe('Slow.');
  });
});

describe('shortenMeaning', () => {
  const glossary = realEntries();
  const short = (id: string, t: 'uk' | 'us' = 'uk') => shortenMeaning(glossary.find((g) => g.id === id)!.definition, t, glossary);

  it('takes the first sentence, drops the abbreviation, strips markers', () => {
    expect(short('crescendo')).toBe('Gradually getting louder.');
    expect(short('diminuendo')).toBe('Gradually getting quieter.');
    expect(short('forte')).toBe('Loud.');
    expect(short('al-fine')).toBe('Play on to the end, marked Fine.');
    expect(short('bar')).toBe('One of the equal boxes that music is divided into.');
  });
  it('swaps linked terms for a US learner and keeps them for a UK learner', () => {
    expect(short('bar-line')).toContain('one bar ends');
    expect(short('bar-line', 'us')).toContain('one measure ends');
    expect(short('tone', 'us')).toContain('two half steps');
    expect(short('tone')).toContain('two semitones');
    expect(short('beam', 'us')).toContain('eighth notes or sixteenth notes');
  });
  it('shortens an over-long sentence at a clause break, or at a word without a dangling word', () => {
    const long = 'A very long first sentence that goes on, and then carries on for quite a while longer than a button can hold.';
    expect(shortenMeaning(long, 'uk', [], 60)).toBe('A very long first sentence that goes on.');
    expect(shortenMeaning('One two three four five six seven eight nine ten with the extra words', 'uk', [], 40)).toBe(
      'One two three four five six seven eight.',
    );
    expect(shortenMeaning('Short.', 'uk', [], 60)).toBe('Short.');
  });
  it('never ends on a dangling word', () => {
    const text = 'A mark, usually shaped like a sideways V, telling you to play that note louder or with more force.';
    expect(shortenMeaning(text, 'uk', [], 82)).toBe('A mark, usually shaped like a sideways V, telling you to play that note louder.');
  });
});

describe('containsTerm', () => {
  it('matches whole words, with a plural s, ignoring case', () => {
    expect(containsTerm('One of the five horizontal lines', 'line')).toBe(true);
    expect(containsTerm('A Line', 'line')).toBe(true);
    expect(containsTerm('Quite quick, but slower than allegro.', 'allegro')).toBe(true);
    expect(containsTerm('Quite quick, but slower than allegro.', 'allegretto')).toBe(false);
    expect(containsTerm('two semitones', 'tone')).toBe(false);
    expect(containsTerm('two quarter notes', 'quarter note')).toBe(true);
    expect(containsTerm('anything', '')).toBe(false);
  });
});

describe('every glossary entry', () => {
  const { entries, bank } = realBank();

  it('is shortened to a clean sentence within the limit, in both terminologies', () => {
    const rows: string[] = [];
    for (const e of entries) {
      const info = bank.byId.get(e.id)!;
      for (const t of ['uk', 'us'] as const) {
        const m = info.meaning[t];
        expect(m, `${e.id} ${t}`).not.toBe('');
        expect(m.length, `${e.id} ${t} too long: ${m}`).toBeLessThanOrEqual(MEANING_LIMIT);
        expect(m, `${e.id} ${t}`).not.toMatch(/\[\[|\]\]|\*|\(.*\)/);
        expect(m, `${e.id} ${t}`).toMatch(/[.!?]$/);
        expect(m, `${e.id} ${t}`).not.toMatch(/\s{2}|\s[.,;:]/);
      }
      rows.push(
        `${e.grade.padEnd(5)} ${e.id.padEnd(17)} ${String(info.meaning.uk.length).padStart(2)}/${String(info.meaning.us.length).padStart(2)} ` +
          `${info.selfReferring ? 'SELF ' : '     '}${(info.abbreviations.join(' ') || '-').padEnd(8)} ${info.meaning.uk}` +
          (info.meaning.us !== info.meaning.uk ? `\n${' '.repeat(36)}US: ${info.meaning.us}` : ''),
      );
    }
    // The results, for a human to read (grade, id, length uk/us, self-reference, abbreviations, text).
    console.log(`SHORTENED MEANINGS (limit ${MEANING_LIMIT})\n${rows.join('\n')}`);
  });

  it('gives each abbreviation to one entry only, and none of them is a term', () => {
    const owner = new Map<string, string>();
    for (const info of bank.byId.values()) {
      for (const a of info.abbreviations) {
        expect(owner.get(a), `${a} is claimed by ${owner.get(a)} and ${info.id}`).toBeUndefined();
        owner.set(a, info.id);
      }
    }
    expect([...owner.keys()].sort()).toEqual(
      ['D.C.', 'D.S.', 'accel.', 'cresc.', 'decresc.', 'dim.', 'f', 'ff', 'mf', 'mp', 'p', 'pp', 'rall.', 'rit.'].sort(),
    );
  });

  it('keeps every abbreviation out of the shortened meaning', () => {
    for (const info of bank.byId.values()) {
      for (const a of info.abbreviations) expect(info.meaning.uk).not.toContain(`(${a})`);
    }
  });

  it('flags entries whose meaning contains their own term (they cannot be asked as meaning cards)', () => {
    const selfReferring = [...bank.byId.values()].filter((i) => i.selfReferring).map((i) => i.id);
    console.log(`SELF-REFERRING (no meaning cards): ${selfReferring.join(', ') || 'none'}`);
    expect(selfReferring).toEqual(['line']);
  });
});

describe('US terms written without a glossary link', () => {
  it('lists definitions that use a UK term with a US equivalent as plain text, which the US swap cannot reach', () => {
    const { entries } = realBank();
    const withUs = entries.filter((e) => e.us);
    const found: string[] = [];
    for (const e of entries) {
      // Remove linked text first: only plain-text uses are a problem.
      const unlinked = e.definition.replace(/\[\[[^\]]*\]\]/g, ' ');
      for (const u of withUs) {
        if (u.id === e.id) continue;
        if (containsTerm(unlinked, u.term)) found.push(`${e.id}: "${u.term}" should be [[${u.id}|${u.term}]]`);
      }
    }
    console.log(`UNLINKED US TERMS IN DEFINITIONS (${found.length})\n${found.join('\n') || 'none'}`);
    // Known today: the major scale definition. This guard stops the list growing unnoticed.
    expect(found.length).toBeLessThanOrEqual(2);
  });
});

describe('labels', () => {
  const { bank } = realBank();
  it('uses the US word for a US learner and never changes Italian terms', () => {
    const crotchet = bank.byId.get('crotchet')!;
    expect(termLabel(crotchet, 'uk')).toBe('Crotchet');
    expect(termLabel(crotchet, 'us')).toBe('Quarter note');
    expect(termLabel(bank.byId.get('pause')!, 'us')).toBe('Fermata');
    expect(termLabel(bank.byId.get('allegro')!, 'us')).toBe('Allegro');
    expect(meaningLabel(bank.byId.get('tone')!, 'us')).toContain('half steps');
  });
  it('builds a bank from a trimmed copy of the entries as well (no exhibits)', () => {
    const trimmed = realEntries().map((e) => ({ id: e.id, term: e.term, us: e.us, language: e.language, definition: e.definition, grade: e.grade, strand: e.strand }));
    expect(buildBank(trimmed).ids.length).toBe(bank.ids.length);
  });
});
