import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pitch } from '@/engine/pitch';
import type { Pitch } from '@/engine/types';
import type { MarkResult } from '@/lesson/contracts';
import { PlayKeyboard, resultHighlights, setPlayKeyboardNotationRenderer } from './component';
import type { PlayKeyboardAnswer, PlayKeyboardPayload } from './types';

const audio = vi.hoisted(() => ({
  unlock: vi.fn(() => Promise.resolve()),
  load: vi.fn(() => Promise.resolve()),
  noteOn: vi.fn(),
  noteOff: vi.fn(),
}));
const getAudioEngine = vi.hoisted(() => vi.fn());
vi.mock('@/audio', () => ({ getAudioEngine }));

const p = (s: string): Pitch => pitch.parsePitch(s);
const ps = (...s: string[]) => s.map(p);
const sequence: PlayKeyboardPayload = {
  low: p('C4'),
  high: p('C5'),
  showLabels: false,
  targets: ps('C4', 'D4', 'E4'),
  mode: 'sequence',
  octave: 'exact',
};
const chord: PlayKeyboardPayload = { ...sequence, targets: ps('C4', 'E4', 'G4'), mode: 'together' };
const key = (name: string) => screen.getByRole('button', { name });

function renderQuestion(
  payload: PlayKeyboardPayload,
  options: { locked?: boolean; result?: MarkResult | null } = {},
) {
  const onAnswer = vi.fn<(a: PlayKeyboardAnswer) => void>();
  const ui = (locked: boolean, result: MarkResult | null) => (
    <PlayKeyboard payload={payload} terminology="uk" locked={locked} result={result} onAnswer={onAnswer} />
  );
  const view = render(ui(options.locked ?? false, options.result ?? null));
  return { onAnswer, rerenderWith: (l: boolean, r: MarkResult | null) => view.rerender(ui(l, r)) };
}

beforeEach(() => {
  vi.clearAllMocks();
  getAudioEngine.mockReturnValue(audio);
});
afterEach(() => setPlayKeyboardNotationRenderer(null));

describe('PlayKeyboard: no audio before a gesture', () => {
  it('makes no audio call on render', () => {
    renderQuestion(sequence);
    renderQuestion(chord);
    expect(getAudioEngine).not.toHaveBeenCalled();
    expect(audio.unlock).not.toHaveBeenCalled();
    expect(audio.noteOn).not.toHaveBeenCalled();
  });

  it('the keyboard sounds on a key press', async () => {
    const user = userEvent.setup();
    renderQuestion(sequence);
    await user.click(key('C 4'));
    expect(audio.noteOn).toHaveBeenCalledTimes(1);
  });
});

describe('PlayKeyboard: sequence', () => {
  it('has no Check button, and commits automatically after the last note', async () => {
    const user = userEvent.setup();
    const { onAnswer } = renderQuestion(sequence);
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();
    await user.click(key('C 4'));
    await user.click(key('D 4'));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByTestId('played-summary')).toHaveTextContent('Played: C4, D4');
    await user.click(key('E 4'));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({ played: ps('C4', 'D4', 'E4') });
  });

  it('reports black keys as sharps and keeps the order played', async () => {
    const user = userEvent.setup();
    const { onAnswer } = renderQuestion({ ...sequence, targets: ps('E4', 'F#4') });
    await user.click(key('F sharp 4'));
    await user.click(key('E 4'));
    expect(onAnswer).toHaveBeenCalledWith({ played: ps('F#4', 'E4') });
  });

  it('Clear starts the sequence again', async () => {
    const user = userEvent.setup();
    const { onAnswer } = renderQuestion(sequence);
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
    await user.click(key('C 4'));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByTestId('played-summary')).toHaveTextContent('No notes yet');
    await user.click(key('C 4'));
    await user.click(key('D 4'));
    await user.click(key('E 4'));
    expect(onAnswer).toHaveBeenCalledWith({ played: ps('C4', 'D4', 'E4') });
  });

  it('commits only once even if more keys follow', async () => {
    const user = userEvent.setup();
    const { onAnswer } = renderQuestion({ ...sequence, targets: ps('C4') });
    await user.click(key('C 4'));
    await user.click(key('D 4'));
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });
});

describe('PlayKeyboard: together', () => {
  it('toggles keys and commits them lowest first on Check', async () => {
    const user = userEvent.setup();
    const { onAnswer } = renderQuestion(chord);
    const check = screen.getByRole('button', { name: 'Check' });
    expect(check).toBeDisabled();
    await user.click(key('G 4'));
    await user.click(key('C 4'));
    await user.click(key('E 4'));
    expect(screen.getByTestId('played-summary')).toHaveTextContent('Chosen: C4, E4, G4');
    await user.click(check);
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({ played: ps('C4', 'E4', 'G4') });
  });

  it('pressing a chosen key again turns it off', async () => {
    const user = userEvent.setup();
    const { onAnswer } = renderQuestion(chord);
    await user.click(key('C 4'));
    await user.click(key('F 4'));
    await user.click(key('F 4'));
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(onAnswer).toHaveBeenCalledWith({ played: ps('C4') });
  });

  it('Clear removes every chosen key', async () => {
    const user = userEvent.setup();
    renderQuestion(chord);
    await user.click(key('C 4'));
    await user.click(key('E 4'));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByTestId('played-summary')).toHaveTextContent('No notes yet');
    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
  });

  it('announces what changed to screen readers', async () => {
    const user = userEvent.setup();
    renderQuestion(chord);
    await user.click(key('C 4'));
    expect(screen.getByRole('status')).toHaveTextContent('C4 on. 1 key chosen.');
  });
});

describe('PlayKeyboard: keyboard operation', () => {
  it('a key can be played from the computer keyboard focus (Enter) and Check is a real button', async () => {
    const user = userEvent.setup();
    const { onAnswer } = renderQuestion(chord);
    key('C 4').focus();
    await user.keyboard('{Enter}');
    await user.tab();
    await user.tab();
    expect(document.activeElement?.tagName).toBe('BUTTON');
    expect(screen.getByTestId('played-summary')).toHaveTextContent('Chosen: C4');
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

describe('PlayKeyboard: locked and result', () => {
  it('disables the keys, Check and Clear when locked', () => {
    renderQuestion(chord, { locked: true });
    screen.getAllByRole('button').forEach((button) => expect(button).toBeDisabled());
  });

  it('ignores presses when locked', async () => {
    const user = userEvent.setup();
    const { onAnswer } = renderQuestion(sequence, { locked: true });
    await user.click(key('C 4'));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(audio.noteOn).not.toHaveBeenCalled();
  });

  it('shows right and wrong in text and highlights on the keys', async () => {
    const user = userEvent.setup();
    const { rerenderWith } = renderQuestion(sequence);
    await user.click(key('C 4'));
    await user.click(key('D 4'));
    await user.click(key('F 4'));
    rerenderWith(true, { correct: false, score: 2 / 3, reason: 'x' });
    expect(screen.getByText('Not quite')).toBeInTheDocument();
    expect(key('C 4')).toHaveAttribute('data-highlight', 'correct');
    expect(key('D 4')).toHaveAttribute('data-highlight', 'correct');
    expect(key('F 4')).toHaveAttribute('data-highlight', 'wrong');
    expect(key('E 4')).toHaveAttribute('data-highlight', 'target');
  });

  it('says Correct when the answer was right', async () => {
    const user = userEvent.setup();
    const { rerenderWith } = renderQuestion({ ...sequence, targets: ps('C4') });
    await user.click(key('C 4'));
    rerenderWith(true, { correct: true, score: 1 });
    expect(screen.getByText('Correct')).toBeInTheDocument();
    expect(key('C 4')).toHaveAttribute('data-highlight', 'correct');
  });
});

describe('resultHighlights', () => {
  it('sequence: correct, wrong and missed target', () => {
    const h = resultHighlights(sequence, ps('C4', 'F4', 'E4'));
    const byName = Object.fromEntries(h.map((x) => [pitch.formatPitch(x.pitch), x.state]));
    expect(byName).toEqual({ C4: 'correct', F4: 'wrong', D4: 'target', E4: 'correct' });
  });

  it('together: matches any order and shows missing targets', () => {
    const h = resultHighlights(chord, ps('E4', 'A4'));
    const byName = Object.fromEntries(h.map((x) => [pitch.formatPitch(x.pitch), x.state]));
    expect(byName).toEqual({ E4: 'correct', A4: 'wrong', C4: 'target', G4: 'target' });
  });

  it('any octave counts the note name', () => {
    const h = resultHighlights({ ...sequence, octave: 'any', targets: ps('C4') }, ps('C5'));
    expect(h).toEqual([{ pitch: p('C5'), state: 'correct' }]);
  });
});

describe('PlayKeyboard: notation', () => {
  const passage = {
    clef: 'treble' as const,
    key: { tonic: { letter: 'C' as const, accidental: 0 as const }, mode: 'major' as const },
    time: { beats: 4, beatUnit: 4 as const },
    bars: [],
  };

  it('uses the injected renderer when a passage is given', () => {
    setPlayKeyboardNotationRenderer(() => <p>STAVE</p>);
    renderQuestion({ ...sequence, passage });
    expect(screen.getByTestId('notation')).toHaveTextContent('STAVE');
  });

  it('falls back to a placeholder label, and shows nothing without a passage', () => {
    renderQuestion({ ...sequence, passage });
    expect(screen.getByTestId('notation')).toHaveTextContent('Notation');
  });

  it('shows no notation block without a passage', () => {
    renderQuestion(sequence);
    expect(screen.queryByTestId('notation')).toBeNull();
  });
});

describe('PlayKeyboard: instruction wording on screen', () => {
  it('a find-every question does not talk about chords', () => {
    const findEvery: PlayKeyboardPayload = { ...sequence, high: p('C6'), targets: ps('C4', 'C5', 'C6'), mode: 'together' };
    renderQuestion(findEvery);
    expect(
      screen.getByText('Press each key to choose it (press again to undo), then press Check.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/chord/i)).toBeNull();
  });

  it('a chord question keeps the chord wording', () => {
    renderQuestion(chord);
    expect(
      screen.getByText('Press each key of the chord to turn it on or off, then press Check.'),
    ).toBeInTheDocument();
  });

  it('a single-note question reads naturally', () => {
    renderQuestion({ ...sequence, targets: ps('E4') });
    expect(screen.getByText('Press the key that plays the note.')).toBeInTheDocument();
  });
});
