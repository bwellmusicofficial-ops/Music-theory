import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { termSpellings } from './bank';
import { availableTypes, buildableTypes, buildCard, canBuild, OPTION_COUNT, type Card } from './cards';
import { containsTerm } from './meaning';
import { realBank, TINY_IDS, tinyBank } from './test-data';

const { bank, decks } = realBank();

/** The texts a card's buttons show, in a terminology. */
function buttonTexts(card: Card, t: 'uk' | 'us'): string[] {
  return card.options.map((id) => {
    const info = bank.byId.get(id)!;
    return card.type === 'term-meaning' ? info.meaning[t] : t === 'us' && info.us ? info.us : info.term;
  });
}

describe('available types', () => {
  it('offers abbreviation cards only to entries with an abbreviation in their definition', () => {
    expect(availableTypes(bank.byId.get('crescendo')!)).toEqual(['term-meaning', 'meaning-term', 'abbr-term']);
    expect(availableTypes(bank.byId.get('allegro')!)).toEqual(['term-meaning', 'meaning-term']);
    expect(availableTypes(bank.byId.get('crotchet')!)).toEqual(['term-meaning', 'meaning-term']);
  });
  it('offers meaning cards to line now that its meaning no longer names itself', () => {
    expect(availableTypes(bank.byId.get('line')!)).toEqual(['term-meaning', 'meaning-term']);
  });
});

describe.each(decks.map((d) => [d.name, d] as const))('1,000 seeded cards from %s', (_name, deck) => {
  const cards: Card[] = [];
  for (let i = 0; i < 1000; i++) {
    const rng = createRng(1000 + i);
    const id = rng.pick(deck.entryIds);
    const type = rng.pick(buildableTypes(bank, deck.entryIds, id));
    const card = buildCard(bank, deck.entryIds, id, type, rng, i + 1);
    expect(card, `${id} ${type}`).not.toBeNull();
    cards.push(card!);
  }

  it('has four different options with the right answer present exactly once', () => {
    for (const c of cards) {
      expect(c.options).toHaveLength(OPTION_COUNT);
      expect(new Set(c.options).size).toBe(OPTION_COUNT);
      expect(c.options.filter((id) => id === c.entryId)).toHaveLength(1);
      expect(c.options[c.correctIndex]).toBe(c.entryId);
      for (const id of c.options) expect(deck.entryIds).toContain(id);
    }
  });
  it('never offers an equivalent of the right answer as a wrong one', () => {
    for (const c of cards) {
      for (const id of c.options) {
        if (id !== c.entryId) expect(bank.equivalent(c.entryId, id), `${c.entryId} vs ${id}`).toBe(false);
      }
    }
  });
  it('never shows two identical button texts, in either terminology', () => {
    for (const c of cards) {
      for (const t of ['uk', 'us'] as const) {
        const texts = buttonTexts(c, t).map((x) => x.toLowerCase());
        expect(new Set(texts).size, `${c.entryId} ${c.type} ${t}: ${texts.join(' | ')}`).toBe(OPTION_COUNT);
      }
    }
  });
  it('never puts the asked term inside a meaning button, and never asks with a meaning that names its term', () => {
    for (const c of cards) {
      const asked = bank.byId.get(c.entryId)!;
      if (c.type === 'term-meaning') {
        for (const t of ['uk', 'us'] as const) {
          for (const text of buttonTexts(c, t)) {
            for (const s of termSpellings(asked)) expect(containsTerm(text, s), `"${text}" contains ${s}`).toBe(false);
          }
        }
      }
      if (c.type === 'meaning-term') expect(asked.selfReferring).toBe(false);
    }
  });
  it('shows an abbreviation that belongs to the asked entry on abbreviation cards', () => {
    for (const c of cards.filter((x) => x.type === 'abbr-term')) {
      expect(bank.byId.get(c.entryId)!.abbreviations).toContain(c.abbreviation);
    }
    for (const c of cards.filter((x) => x.type !== 'abbr-term')) expect(c.abbreviation).toBeUndefined();
  });
  it('mixes the three card types and moves the right answer around', () => {
    const types = new Set(cards.map((c) => c.type));
    expect(types.has('term-meaning')).toBe(true);
    expect(types.has('meaning-term')).toBe(true);
    const positions = new Set(cards.map((c) => c.correctIndex));
    expect(positions.size).toBe(OPTION_COUNT);
  });
});

describe('abbreviation cards exist where the glossary gives abbreviations', () => {
  it('appear in the Dynamics, Tempo and Articulation decks', () => {
    for (const id of ['dynamics', 'tempo', 'articulation-signs']) {
      const deck = decks.find((d) => d.id === id)!;
      expect(deck.entryIds.some((e) => bank.byId.get(e)!.abbreviations.length > 0), id).toBe(true);
    }
  });
});

describe('plausible wrong answers', () => {
  const deck = (id: string) => decks.find((d) => d.id === id)!;
  const make = (deckId: string, entry: string, type: Card['type'], seed: number) =>
    buildCard(bank, deck(deckId).entryIds, entry, type, createRng(seed), 1)!;

  it('never offers decrescendo for diminuendo or the reverse, nor ritardando for rallentando or the reverse', () => {
    for (let seed = 0; seed < 300; seed++) {
      for (const deckId of ['dynamics', 'italian', 'grade-1']) {
        for (const type of ['term-meaning', 'meaning-term', 'abbr-term'] as const) {
          const a = make(deckId, 'diminuendo', type, seed);
          expect(a.options).not.toContain('decrescendo');
          const b = make(deckId, 'decrescendo', type, seed);
          expect(b.options).not.toContain('diminuendo');
        }
      }
      for (const deckId of ['tempo', 'italian', 'grade-1']) {
        for (const type of ['term-meaning', 'meaning-term', 'abbr-term'] as const) {
          expect(make(deckId, 'ritardando', type, seed).options).not.toContain('rallentando');
          expect(make(deckId, 'rallentando', type, seed).options).not.toContain('ritardando');
        }
      }
    }
  });
  it('draws wrong answers from the same family when the deck has enough of them', () => {
    for (let seed = 0; seed < 200; seed++) {
      // Dynamic levels: pianissimo, piano, mezzo piano, mezzo forte, fortissimo are the other five.
      const forte = make('dynamics', 'forte', 'term-meaning', seed);
      for (const id of forte.options) expect(bank.byId.get(id)!.family).toBe('dynamic-levels');
      // Tempo words: adagio, andante, moderato, allegretto, allegro (lento is an equivalent of adagio, not of allegro).
      const allegro = make('tempo', 'allegro', 'meaning-term', seed);
      for (const id of allegro.options) expect(bank.byId.get(id)!.family).toBe('tempo-words');
      // Rests: the other four rests ('rest' itself is an equivalent).
      const minimRest = make('note-values-rests', 'minim-rest', 'term-meaning', seed);
      for (const id of minimRest.options) expect(bank.byId.get(id)!.family).toBe('rests');
      // Note values: crotchet's equivalents (quaver, semiquaver) are left out, leaving semibreve, minim, dotted note.
      const crotchet = make('note-values-rests', 'crotchet', 'meaning-term', seed);
      expect([...crotchet.options].sort()).toEqual(['crotchet', 'dotted-note', 'minim', 'semibreve']);
    }
  });
  it('falls back to other families when the family is small', () => {
    const c = make('dynamics', 'crescendo', 'term-meaning', 3);
    // Dynamic changes: only decrescendo and diminuendo, both equivalents of each other but not of crescendo.
    const families = c.options.map((id) => bank.byId.get(id)!.family);
    expect(families.filter((f) => f === 'dynamic-changes').length).toBeGreaterThanOrEqual(2);
    expect(families.length).toBe(4);
  });
  it('prefers abbreviation-bearing terms as wrong answers on abbreviation cards', () => {
    for (let seed = 0; seed < 100; seed++) {
      const c = make('dynamics', 'forte', 'abbr-term', seed);
      for (const id of c.options) expect(bank.byId.get(id)!.abbreviations.length).toBeGreaterThan(0);
    }
  });
  it('does not offer a meaning that contains the asked term (allegro vs allegretto)', () => {
    for (let seed = 0; seed < 200; seed++) {
      const c = make('tempo', 'allegro', 'term-meaning', seed);
      expect(c.options).not.toContain('allegretto');
    }
  });
});

describe('small decks', () => {
  const tiny = tinyBank();
  it('builds a card from a deck of exactly four', () => {
    const pool = TINY_IDS.slice(0, 4);
    const c = buildCard(tiny, pool, 'alpha', 'term-meaning', createRng(1), 1)!;
    expect([...c.options].sort()).toEqual([...pool].sort());
  });
  it('returns null when fewer than three fair wrong answers exist', () => {
    expect(buildCard(tiny, TINY_IDS.slice(0, 3), 'alpha', 'term-meaning', createRng(1), 1)).toBeNull();
    expect(canBuild(tiny, TINY_IDS.slice(0, 3), 'alpha', 'term-meaning')).toBe(false);
    expect(canBuild(tiny, TINY_IDS, 'alpha', 'abbr-term')).toBe(true);
    expect(canBuild(tiny, TINY_IDS, 'echo', 'abbr-term')).toBe(false);
    expect(buildCard(tiny, TINY_IDS, 'nope', 'term-meaning', createRng(1), 1)).toBeNull();
  });
  it('is repeatable from a seed', () => {
    const a = buildCard(tiny, TINY_IDS, 'echo', 'meaning-term', createRng(9), 1);
    const b = buildCard(tiny, TINY_IDS, 'echo', 'meaning-term', createRng(9), 1);
    expect(a).toEqual(b);
  });
});
