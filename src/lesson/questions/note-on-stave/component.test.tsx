import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installStaveStubs } from '@/components/stave/test-utils';
import { pitch } from '@/engine/pitch';
import type { MarkResult } from '@/lesson/contracts';
import { drawn, editSurface } from '@/lesson/questions/notation/stave-test-helpers';
import { NoteOnStave } from './component';
import { mark } from './mark';
import type { NoteOnStaveAnswer, NoteOnStavePayload } from './types';

vi.mock('@/audio', () => ({
  getAudioEngine: () => ({ noteOn: vi.fn(), noteOff: vi.fn(), isUnlocked: () => true, unlock: async () => {}, load: async () => {} }),
}));

beforeAll(() => installStaveStubs());
afterEach(cleanup);

const C_MAJOR = { tonic: { letter: 'C' as const, accidental: 0 as const }, mode: 'major' as const };
const G_MAJOR = { tonic: { letter: 'G' as const, accidental: 0 as const }, mode: 'major' as const };

const identify: NoteOnStavePayload = {
  mode: 'identify',
  clef: 'treble',
  key: C_MAJOR,
  pitch: pitch.parsePitch('G4'),
  accidentals: false,
};
const place: NoteOnStavePayload = {
  mode: 'place',
  clef: 'treble',
  key: C_MAJOR,
  target: pitch.parsePitchClass('G'),
  accidentals: false,
};

function renderQuestion(
  payload: NoteOnStavePayload,
  over: Partial<{ locked: boolean; result: MarkResult | null }> = {},
) {
  const onAnswer = vi.fn<(answer: NoteOnStaveAnswer) => void>();
  const props = { payload, terminology: 'uk' as const, locked: false, result: null, onAnswer, ...over };
  const view = render(<NoteOnStave {...props} />);
  const again = (next: Partial<typeof props>) => view.rerender(<NoteOnStave {...props} {...next} />);
  return { ...view, onAnswer, rerender: again };
}

describe('note-on-stave component: identify', () => {
  it('shows the note on a read-only stave named without giving the answer away', async () => {
    const { container } = renderQuestion(identify);
    await drawn(container);
    expect(screen.getByRole('img', { name: 'A note on the treble stave' })).toBeInTheDocument();
    // The screen reader description speaks positions, not letter names.
    const description = container.querySelector('p.mtn-stave__sr')!.textContent!;
    expect(description).not.toMatch(/\bG\b|G4/);
    expect(description).toMatch(/line/);
    // No time signature or final barline is drawn.
    expect(description).not.toMatch(/Time signature/i);
  });

  it('has seven letter buttons, A to G in order, and no sign row when accidentals is false', () => {
    renderQuestion(identify);
    const group = screen.getByRole('group', { name: 'Note name' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(screen.queryByRole('group', { name: 'Sign' })).toBeNull();
    expect(screen.queryByRole('button', { name: /sharp|flat|natural/i })).toBeNull();
  });

  it('commits at once when a letter is tapped', async () => {
    const { onAnswer } = renderQuestion(identify);
    await userEvent.click(screen.getByRole('button', { name: 'G' }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({ mode: 'identify', name: { letter: 'G', accidental: 0 } });
  });

  it('can be answered from the keyboard alone', async () => {
    const { onAnswer } = renderQuestion(identify);
    const user = userEvent.setup();
    const group = screen.getByRole('group', { name: 'Note name' });
    const buttons = within(group).getAllByRole('button');
    await user.tab();
    expect(buttons[0]).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(buttons[2]).toHaveFocus();
    await user.keyboard(' ');
    expect(onAnswer).toHaveBeenCalledWith({ mode: 'identify', name: { letter: 'C', accidental: 0 } });
    await user.keyboard('{Tab}{Enter}');
    expect(onAnswer).toHaveBeenLastCalledWith({ mode: 'identify', name: { letter: 'D', accidental: 0 } });
  });

  it('with accidentals, shows Flat, Natural, Sharp with Natural pressed first, and answers with the chosen sign', async () => {
    const withSigns: NoteOnStavePayload = {
      ...identify,
      key: G_MAJOR,
      pitch: pitch.parsePitch('F#5'),
      accidentals: true,
    };
    const { onAnswer } = renderQuestion(withSigns);
    const signs = screen.getByRole('group', { name: 'Sign' });
    const [flat, natural, sharp] = within(signs).getAllByRole('button');
    expect([flat, natural, sharp].map((b) => b.textContent)).toEqual(['♭Flat', '♮Natural', '♯Sharp']);
    expect(natural).toHaveAttribute('aria-pressed', 'true');
    expect(flat).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(screen.getByRole('button', { name: 'F' }));
    expect(onAnswer).toHaveBeenLastCalledWith({ mode: 'identify', name: { letter: 'F', accidental: 0 } });

    await userEvent.click(sharp);
    expect(sharp).toHaveAttribute('aria-pressed', 'true');
    expect(natural).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'F' }));
    expect(onAnswer).toHaveBeenLastCalledWith({ mode: 'identify', name: { letter: 'F', accidental: 1 } });

    await userEvent.click(flat);
    await userEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(onAnswer).toHaveBeenLastCalledWith({ mode: 'identify', name: { letter: 'B', accidental: -1 } });
  });

  it('the sign row can be used from the keyboard', async () => {
    const withSigns: NoteOnStavePayload = { ...identify, accidentals: true };
    const { onAnswer } = renderQuestion(withSigns);
    const user = userEvent.setup();
    await user.tab(); // Flat
    await user.tab(); // Natural
    await user.tab(); // Sharp
    await user.keyboard('{Enter}');
    expect(within(screen.getByRole('group', { name: 'Sign' })).getByRole('button', { name: /Sharp/ })).toHaveAttribute('aria-pressed', 'true');
    await user.tab(); // A
    await user.keyboard(' ');
    expect(onAnswer).toHaveBeenCalledWith({ mode: 'identify', name: { letter: 'A', accidental: 1 } });
  });

  it('ignores letters and signs when locked: every button is disabled', async () => {
    const { onAnswer } = renderQuestion({ ...identify, accidentals: true }, { locked: true });
    screen.getAllByRole('button').forEach((button) => expect(button).toBeDisabled());
    await userEvent.click(screen.getByRole('button', { name: 'G' }));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('after a right answer: marks the chosen letter and the note as correct, with a label', async () => {
    const { rerender, container } = renderQuestion(identify);
    await userEvent.click(screen.getByRole('button', { name: 'G' }));
    rerender({ locked: true, result: mark(identify, { mode: 'identify', name: { letter: 'G', accidental: 0 } }) });
    await drawn(container);
    expect(screen.getByRole('button', { name: 'G' })).toHaveAttribute('data-state', 'right');
    expect(screen.getByTestId('identify-result')).toHaveTextContent('Correct: G');
    expect(screen.getByTestId('badge-correct')).toBeInTheDocument();
  });

  it('after a wrong answer: marks the chosen letter wrong and the right one right, by text as well as colour', async () => {
    const { rerender, container } = renderQuestion(identify);
    await userEvent.click(screen.getByRole('button', { name: 'A' }));
    rerender({ locked: true, result: mark(identify, { mode: 'identify', name: { letter: 'A', accidental: 0 } }) });
    await drawn(container);
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('data-state', 'wrong');
    expect(screen.getByRole('button', { name: 'G' })).toHaveAttribute('data-state', 'right');
    const result = screen.getByTestId('identify-result');
    expect(result).toHaveTextContent('Your answer: A');
    expect(result).toHaveTextContent('Correct answer: G');
    expect(screen.getByTestId('badge-wrong')).toBeInTheDocument();
  });
});

describe('note-on-stave component: place', () => {
  it('shows an empty stave in pitch-only mode with a disabled Check button', async () => {
    const { container } = renderQuestion(place);
    await drawn(container);
    expect(screen.getByRole('application', { name: 'Place the note on the stave' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
    // Pitch only: no duration, rest, dot or add controls.
    expect(screen.queryByRole('button', { name: 'Rest' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull();
    // No accidentals unless the payload says so.
    expect(screen.queryByRole('button', { name: /sharp/i })).toBeNull();
  });

  it('places a note by pointer, moves it by placing again, and Check commits its pitch', async () => {
    const { container, onAnswer } = renderQuestion(place);
    await drawn(container);
    const stave = editSurface(container);
    stave.tapSlot(0, 0, 2);
    expect(screen.getByRole('button', { name: 'Check' })).toBeEnabled();
    stave.tapSlot(0, 0, 3);
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({ mode: 'place', pitch: { letter: 'A', accidental: 0, octave: 4 } });
  });

  it('can be answered from the keyboard: a letter key places the note, Tab then Enter checks', async () => {
    const { container, onAnswer } = renderQuestion(place);
    await drawn(container);
    const user = userEvent.setup();
    const surface = screen.getByTestId('stave-surface');
    surface.focus();
    await user.keyboard('g');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check' })).toBeEnabled());
    // Move up an octave with Shift+Up: the answer follows.
    fireEvent.keyDown(surface, { key: 'ArrowUp', shiftKey: true });
    // Tab through the palette to Check.
    const check = screen.getByRole('button', { name: 'Check' });
    check.focus();
    await user.keyboard('{Enter}');
    expect(onAnswer).toHaveBeenCalledWith({ mode: 'place', pitch: { letter: 'G', accidental: 0, octave: 5 } });
  });

  it('with accidentals, a sign from the palette changes the answer', async () => {
    const { container, onAnswer } = renderQuestion({ ...place, accidentals: true, target: pitch.parsePitchClass('F#') });
    await drawn(container);
    const stave = editSurface(container);
    stave.tapSlot(0, 0, 1); // F4
    await userEvent.click(screen.getByRole('button', { name: /sharp/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(onAnswer).toHaveBeenCalledWith({ mode: 'place', pitch: { letter: 'F', accidental: 1, octave: 4 } });
  });

  it('with a key signature, a plain note on the line reads as the signature says', async () => {
    const keyed: NoteOnStavePayload = { ...place, key: G_MAJOR, accidentals: true, target: pitch.parsePitchClass('F#') };
    const { container, onAnswer } = renderQuestion(keyed);
    await drawn(container);
    editSurface(container).tapSlot(0, 0, 8); // top line F5
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(onAnswer).toHaveBeenCalledWith({ mode: 'place', pitch: { letter: 'F', accidental: 1, octave: 5 } });
  });

  it('when locked, the stave stops accepting input and Check is disabled', async () => {
    const { container, onAnswer, rerender } = renderQuestion(place);
    await drawn(container);
    editSurface(container).tapSlot(0, 0, 2);
    rerender({ locked: true });
    await waitFor(() => expect(screen.queryByTestId('stave-surface')).toBeNull());
    expect(screen.getByRole('img', { name: 'The note you placed on the stave' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('with a result, marks the placed note correct or wrong', async () => {
    const view = renderQuestion(place);
    await drawn(view.container);
    editSurface(view.container).tapSlot(0, 0, 3);
    view.rerender({ locked: true, result: mark(place, { mode: 'place', pitch: pitch.parsePitch('A4') }) });
    await waitFor(() => expect(screen.getByTestId('badge-wrong')).toBeInTheDocument());
    view.rerender({ locked: true, result: { correct: true, score: 1 } });
    await waitFor(() => expect(screen.getByTestId('badge-correct')).toBeInTheDocument());
  });

  it('keeps the placed note when a retry unlocks the question', async () => {
    const view = renderQuestion(place);
    await drawn(view.container);
    editSurface(view.container).tapSlot(0, 0, 3);
    view.rerender({ locked: true, result: { correct: false, score: 0, reason: 'x' } });
    view.rerender({ locked: false, result: null });
    await drawn(view.container);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check' })).toBeEnabled());
  });
});
