import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GlossaryEntry } from '../schema';
import { displayTerm, parseRichText, plainText, stripRichText, makeGlossaryLookup } from './rich-text';
import { RichTextView } from './rich-text-view';

const entry = (id: string, term: string, us?: string, definition = `About ${term}.`): GlossaryEntry => ({
  id,
  term,
  us,
  language: 'en',
  definition,
  grade: '1',
  strand: 'rhythm',
});

const GLOSSARY: GlossaryEntry[] = [
  entry('crotchet', 'crotchet', 'quarter note', 'A note worth 1 beat, like a [[beat|beat]].'),
  entry('minim', 'minim', 'half note'),
  entry('bar', 'bar', 'measure'),
  entry('beat', 'beat'),
  entry('semitone', 'semitone', 'half step'),
  entry('tone', 'tone', 'whole step'),
];

function view(text: string, terminology: 'uk' | 'us' = 'uk', extra: Partial<React.ComponentProps<typeof RichTextView>> = {}) {
  return render(
    <p data-testid="out">
      <RichTextView text={text} terminology={terminology} glossary={GLOSSARY} {...extra} />
    </p>,
  );
}

describe('parseRichText', () => {
  it('parses plain text', () => {
    expect(parseRichText('hello')).toEqual([{ kind: 'text', text: 'hello' }]);
    expect(parseRichText('')).toEqual([]);
  });
  it('parses bold, italic and links in order', () => {
    expect(parseRichText('a **b** c *d* [[x|e]] f')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'bold', children: [{ kind: 'text', text: 'b' }] },
      { kind: 'text', text: ' c ' },
      { kind: 'italic', children: [{ kind: 'text', text: 'd' }] },
      { kind: 'text', text: ' ' },
      { kind: 'term', id: 'x', shown: 'e' },
      { kind: 'text', text: ' f' },
    ]);
  });
  it('nests italic inside bold', () => {
    expect(parseRichText('**a *b* c**')).toEqual([
      {
        kind: 'bold',
        children: [
          { kind: 'text', text: 'a ' },
          { kind: 'italic', children: [{ kind: 'text', text: 'b' }] },
          { kind: 'text', text: ' c' },
        ],
      },
    ]);
  });
  it('treats [[id]] as a link showing the id', () => {
    expect(parseRichText('[[pulse]]')).toEqual([{ kind: 'term', id: 'pulse', shown: 'pulse' }]);
  });
  it('leaves unclosed markers as literal text', () => {
    expect(stripRichText('2 ** 3')).toBe('2 ** 3');
    expect(stripRichText('**open')).toBe('**open');
    expect(stripRichText('*open')).toBe('*open');
    expect(stripRichText('[[a|b')).toBe('[[a|b');
    expect(stripRichText('a * b * c')).toBe('a * b * c');
  });
  it('is not a regex-backtracking hazard on long input', () => {
    const start = Date.now();
    parseRichText('*'.repeat(5000) + ' ' + '['.repeat(5000));
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe('displayTerm (the US swap)', () => {
  const crotchet = GLOSSARY[0];
  const bar = GLOSSARY[2];
  it('leaves UK text alone', () => {
    expect(displayTerm('crotchets', crotchet, 'uk')).toBe('crotchets');
  });
  it('swaps the term and keeps a plural s', () => {
    expect(displayTerm('crotchet', crotchet, 'us')).toBe('quarter note');
    expect(displayTerm('crotchets', crotchet, 'us')).toBe('quarter notes');
    expect(displayTerm('bars', bar, 'us')).toBe('measures');
  });
  it('keeps an initial capital', () => {
    expect(displayTerm('Bars', bar, 'us')).toBe('Measures');
    expect(displayTerm('Crotchet', crotchet, 'us')).toBe('Quarter note');
  });
  it('matches the term ignoring case and keeps surrounding words', () => {
    expect(displayTerm('CROTCHET', crotchet, 'us')).toBe('Quarter note');
    expect(displayTerm('two crotchets', crotchet, 'us')).toBe('two quarter notes');
  });
  it('does nothing without a us value, without an entry, or when the term is absent', () => {
    expect(displayTerm('beats', GLOSSARY[3], 'us')).toBe('beats');
    expect(displayTerm('crotchets', undefined, 'us')).toBe('crotchets');
    expect(displayTerm('the short one', crotchet, 'us')).toBe('the short one');
  });
  it('swaps semitone as a whole word, not tone inside it', () => {
    expect(displayTerm('semitones', GLOSSARY[4], 'us')).toBe('half steps');
    expect(displayTerm('tones', GLOSSARY[5], 'us')).toBe('whole steps');
  });
});

describe('plainText and lookup', () => {
  const lookup = makeGlossaryLookup(GLOSSARY);
  it('strips markers and swaps terms', () => {
    expect(plainText('Two **[[crotchet|crotchets]]** here', 'us', lookup)).toBe('Two quarter notes here');
    expect(plainText('Two [[crotchet|crotchets]] *here*', 'uk', lookup)).toBe('Two crotchets here');
  });
  it('accepts arrays, maps, functions and nothing', () => {
    expect(makeGlossaryLookup(GLOSSARY)('bar')?.term).toBe('bar');
    expect(makeGlossaryLookup(new Map(GLOSSARY.map((e) => [e.id, e])))('bar')?.term).toBe('bar');
    expect(makeGlossaryLookup((id) => GLOSSARY.find((e) => e.id === id))('bar')?.term).toBe('bar');
    expect(makeGlossaryLookup(undefined)('bar')).toBeUndefined();
  });
});

describe('RichTextView', () => {
  it('renders plain text', () => {
    view('Just words.');
    expect(screen.getByTestId('out')).toHaveTextContent('Just words.');
  });
  it('renders bold and italic as strong and em', () => {
    view('A **bold** and *italic* word');
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('italic').tagName).toBe('EM');
  });
  it('never injects markup: html in the text stays text', () => {
    const { container } = view('<img src=x onerror=alert(1)> **<b>x</b>** [[crotchet|<i>c</i>]]');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('i')).toBeNull();
    expect(screen.getByTestId('out').textContent).toContain('<img src=x onerror=alert(1)>');
  });
  it('renders glossary links as buttons with the UK text', () => {
    view('Play a [[crotchet|crotchet]].');
    const b = screen.getByRole('button', { name: 'crotchet' });
    expect(b).toHaveAttribute('data-term-id', 'crotchet');
  });
  it('swaps the shown text for US learners, keeping plural and capital', () => {
    view('[[bar|Bars]] hold [[crotchet|crotchets]].', 'us');
    expect(screen.getByRole('button', { name: 'Measures' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'quarter notes' })).toBeInTheDocument();
    expect(screen.getByTestId('out')).toHaveTextContent('Measures hold quarter notes.');
  });
  it('shows unknown term ids as plain text, not a button', () => {
    view('A [[mystery|thing]] here');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('out')).toHaveTextContent('A thing here');
  });
  it('works with no glossary at all', () => {
    render(<RichTextView text="x [[a|b]] y" terminology="uk" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('calls onTermClick with the entry instead of opening a popover', async () => {
    const onTermClick = vi.fn();
    view('Play a [[crotchet|crotchet]].', 'uk', { onTermClick });
    await userEvent.click(screen.getByRole('button', { name: 'crotchet' }));
    expect(onTermClick).toHaveBeenCalledWith(GLOSSARY[0]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  describe('popover', () => {
    it('opens a definition on click, with the US term when set', async () => {
      view('Play a [[crotchet|crotchet]].', 'us');
      const b = screen.getByRole('button', { name: 'quarter note' });
      expect(b).toHaveAttribute('aria-expanded', 'false');
      await userEvent.click(b);
      expect(b).toHaveAttribute('aria-expanded', 'true');
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('Quarter note');
      expect(dialog).toHaveTextContent('A note worth 1 beat, like a beat.');
      expect(b).toHaveAttribute('aria-controls', dialog.id);
    });
    it('shows the UK term for UK learners and no nested buttons for definition links', async () => {
      view('Play a [[crotchet|crotchet]].');
      await userEvent.click(screen.getByRole('button', { name: 'crotchet' }));
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('Crotchet');
      // Only the Close button is inside; the definition's own [[beat|beat]] is plain text.
      expect(dialog.querySelectorAll('button')).toHaveLength(1);
    });
    it('closes on the same button, Close, Escape and an outside press', async () => {
      view('Play a [[crotchet|crotchet]] now.');
      const b = screen.getByRole('button', { name: 'crotchet' });
      await userEvent.click(b);
      await userEvent.click(b);
      expect(screen.queryByRole('dialog')).toBeNull();
      await userEvent.click(b);
      await userEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      await userEvent.click(b);
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).toBeNull();
      await userEvent.click(b);
      fireEvent.mouseDown(document.body);
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    it('is keyboard operable', async () => {
      view('Play a [[crotchet|crotchet]].');
      await userEvent.tab();
      expect(screen.getByRole('button', { name: 'crotchet' })).toHaveFocus();
      await userEvent.keyboard('{Enter}');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    it('keeps only one popover open at a time', async () => {
      view('[[crotchet|crotchet]] and [[minim|minim]]');
      await userEvent.click(screen.getByRole('button', { name: 'crotchet' }));
      await userEvent.click(screen.getByRole('button', { name: 'minim' }));
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(screen.getByRole('dialog')).toHaveTextContent('Minim');
    });
  });
});
