import { describe, expect, it } from 'vitest';
import { buildBank } from './bank';
import { buildableTypes } from './cards';
import { CURATED_DECKS, EQUIVALENTS, FAMILIES, MIN_DECK_CARDS } from './deck-data';
import { buildDecks } from './decks';
import { realBank } from './test-data';

describe('deck data', () => {
  const { entries, bank } = realBank();
  const ids = new Set(entries.map((e) => e.id));

  it('names only ids that exist in the glossary, with none repeated inside a deck', () => {
    for (const [deck, list] of Object.entries(CURATED_DECKS)) {
      for (const id of list) expect(ids.has(id), `${deck}: unknown id ${id}`).toBe(true);
      expect(new Set(list).size, `${deck} repeats an id`).toBe(list.length);
    }
  });
  it('keeps every id in FAMILIES and EQUIVALENTS real', () => {
    for (const id of Object.keys(FAMILIES)) expect(ids.has(id), `FAMILIES: unknown id ${id}`).toBe(true);
    for (const group of EQUIVALENTS) {
      expect(group.length).toBeGreaterThanOrEqual(2);
      for (const id of group) expect(ids.has(id), `EQUIVALENTS: unknown id ${id}`).toBe(true);
    }
  });
  it('puts every Italian entry in at least one curated deck', () => {
    const covered = new Set(Object.values(CURATED_DECKS).flat());
    const missing = entries.filter((e) => e.language === 'it' && !covered.has(e.id)).map((e) => e.id);
    expect(missing, `add these Italian ids to a deck in deck-data.ts: ${missing.join(', ')}`).toEqual([]);
  });
  it('puts every Grade 1 terms-strand entry in a curated deck or marks it as outside', () => {
    // Signs and symbols that belong with Italian terms: slur, accent, pause, repeat marks, metronome mark.
    const covered = new Set(Object.values(CURATED_DECKS).flat());
    const missing = entries.filter((e) => e.strand === 'terms' && !covered.has(e.id)).map((e) => e.id);
    expect(missing).toEqual([]);
  });
  it('declares equivalents both ways round', () => {
    expect(bank.equivalent('decrescendo', 'diminuendo')).toBe(true);
    expect(bank.equivalent('diminuendo', 'decrescendo')).toBe(true);
    expect(bank.equivalent('ritardando', 'rallentando')).toBe(true);
    expect(bank.equivalent('rallentando', 'ritardando')).toBe(true);
    expect(bank.equivalent('forte', 'piano')).toBe(false);
  });
});

describe('deck membership', () => {
  const { entries, bank, decks } = realBank();
  const byId = new Map(decks.map((d) => [d.id, d]));
  const members = (id: string) => byId.get(id)!.entryIds;

  it('offers the decks the design names, in order, and only those with data', () => {
    expect(decks.map((d) => d.name)).toEqual([
      'Start here words',
      'Italian terms',
      'Tempo',
      'Dynamics',
      'Articulation and signs',
      'Note values and rests',
      'Everything in Grade 1',
    ]);
    console.log(decks.map((d) => `${d.name}: ${d.entryIds.length} cards`).join('\n'));
  });
  it('shows no grade that has no glossary file', () => {
    expect(decks.some((d) => d.id === 'grade-2')).toBe(false);
  });
  it('builds each deck by its rule', () => {
    expect(members('start').every((id) => entries.find((e) => e.id === id)!.grade === 'start')).toBe(true);
    expect(members('start')).toContain('stave');
    const italian = entries.filter((e) => e.language === 'it').map((e) => e.id);
    expect(members('italian')).toEqual(italian);
    expect(members('grade-1').every((id) => entries.find((e) => e.id === id)!.grade === '1')).toBe(true);
    expect(members('tempo')).toEqual(expect.arrayContaining(['adagio', 'allegro', 'accelerando', 'a-tempo']));
    expect(members('tempo')).not.toContain('forte');
    expect(members('dynamics')).toEqual(expect.arrayContaining(['forte', 'piano', 'crescendo', 'diminuendo']));
    expect(members('dynamics')).not.toContain('allegro');
    expect(members('articulation-signs')).toEqual(expect.arrayContaining(['legato', 'staccato', 'slur', 'accent', 'pause']));
    expect(members('note-values-rests')).toEqual(expect.arrayContaining(['crotchet', 'quaver', 'rest', 'minim-rest']));
    expect(members('note-values-rests')).not.toContain('forte');
  });
  it('puts every Italian entry in at least one offered deck, other than Italian terms itself', () => {
    const inDecks = new Set(decks.filter((d) => d.id !== 'italian').flatMap((d) => d.entryIds));
    for (const e of entries.filter((x) => x.language === 'it')) expect(inDecks.has(e.id), e.id).toBe(true);
  });
  it('gives every offered deck enough different cards, and every entry a card type', () => {
    for (const d of decks) {
      expect(d.entryIds.length, d.name).toBeGreaterThanOrEqual(MIN_DECK_CARDS);
      for (const id of d.entryIds) expect(buildableTypes(bank, d.entryIds, id).length, `${d.name}/${id}`).toBeGreaterThan(0);
    }
  });
  it('drops only the entries that cannot be asked, and reports them', () => {
    const dropped = entries.filter((e) => e.grade === '1' || e.grade === 'start').filter((e) => !members('start').concat(members('grade-1')).includes(e.id));
    console.log(`NOT ASKABLE (dropped from decks): ${dropped.map((e) => e.id).join(', ') || 'none'}`);
    expect(dropped.map((e) => e.id)).toEqual(['line']);
  });
  it('does not offer a deck that is too small, and ignores curated ids that are not in the glossary', () => {
    const few = entries.filter((e) => e.language === 'it').slice(0, 3);
    expect(buildDecks(few, buildBank(few))).toEqual([]);
    const only = entries.filter((e) => e.grade === 'start');
    const names = buildDecks(only, buildBank(only)).map((d) => d.name);
    expect(names).toEqual(['Start here words']);
  });
});
