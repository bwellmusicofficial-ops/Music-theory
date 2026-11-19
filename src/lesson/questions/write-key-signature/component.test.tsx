import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getStaveLayout } from '@/components/stave/layout-registry';
import { installStaveStubs } from '@/components/stave/test-utils';
import { pitch } from '@/engine/pitch';
import type { Clef, Key } from '@/engine/types';
import type { MarkResult } from '@/lesson/contracts';
import { WriteKeySignature } from './component';
import { mark } from './mark';
import type { WriteKeySignatureAnswer, WriteKeySignaturePayload } from './types';

vi.mock('@/audio', () => ({
  getAudioEngine: () => ({ noteOn: vi.fn(), noteOff: vi.fn(), isUnlocked: () => true, unlock: async () => {}, load: async () => {} }),
}));

beforeAll(() => installStaveStubs());
afterEach(cleanup);

const D: Key = { tonic: pitch.parsePitchClass('D'), mode: 'major' };
const payload = (clef: Clef = 'treble', key: Key = D): WriteKeySignaturePayload => ({ clef, key });

function renderQuestion(over: Partial<{ payload: WriteKeySignaturePayload; locked: boolean; result: MarkResult | null; initialAnswer: WriteKeySignatureAnswer; hideCheck: boolean; onAnswerChange: (a: WriteKeySignatureAnswer | null) => void }> = {}) {
  const onAnswer = vi.fn<(answer: WriteKeySignatureAnswer) => void>();
  const props = { payload: payload(), terminology: 'uk' as const, locked: false, result: null, onAnswer, ...over };
  const view = render(<WriteKeySignature {...props} />);
  return { ...view, onAnswer };
}

async function ready(container: HTMLElement) {
  await waitFor(() => expect(container.querySelector('[data-testid="stave-surface"]')).toBeTruthy());
  const surface = () => screen.getByTestId('stave-surface');
  const model = () => getStaveLayout(container.querySelector('.mtn-stave__canvas') as HTMLElement)!;
  const at = (position: number, x = 90) => {
    const m = model();
    return { clientX: x * m.scale, clientY: (m.systems[0].bottomLineY - position * 5) * m.scale };
  };
  const tap = (position: number) => {
    fireEvent.pointerDown(surface(), { pointerId: 1, pointerType: 'mouse', button: 0, ...at(position) });
    fireEvent.pointerUp(surface(), { pointerId: 1, pointerType: 'mouse', button: 0, ...at(position) });
  };
  /** The positions of the signs drawn, left to right. */
  const drawnSigns = () =>
    [...container.querySelectorAll('.vf-keysignature text')].map((t) => {
      const lines = [...container.querySelectorAll('.vf-stave path')].map((p) => Number(/M[-\d.]+ ([-\d.]+)/.exec(p.getAttribute('d') ?? '')?.[1]));
      const bottom = Math.max(...lines) - 0.5;
      return Math.round((bottom - Number(t.getAttribute('y'))) / 5);
    });
  return { surface, tap, drawnSigns };
}

const button = (name: string) => screen.getByRole('button', { name });
const check = () => button('Check');

describe('write-key-signature component', () => {
  it('shows the key-signature stave with a sharp / flat palette (sharp chosen), Check, Undo and Clear disabled', async () => {
    const { container } = renderQuestion();
    await ready(container);
    expect(screen.getByRole('application', { name: /Key signature, treble clef/ })).toBeInTheDocument();
    expect(button('Sharp')).toHaveAttribute('aria-pressed', 'true');
    expect(button('Flat')).toHaveAttribute('aria-pressed', 'false');
    expect(check()).toBeDisabled();
    expect(button('Undo')).toBeDisabled();
    expect(button('Clear')).toBeDisabled();
    expect(container.querySelectorAll('.vf-keysignature text')).toHaveLength(0);
  });

  it('does not name the key: the prompt does that', async () => {
    const { container } = renderQuestion();
    await ready(container);
    expect(screen.queryByText(/D major/)).toBeNull();
  });

  it('the palette buttons are 44 px or more tall and pressed state follows the choice', async () => {
    const user = userEvent.setup();
    const { container } = renderQuestion();
    await ready(container);
    await user.click(button('Flat'));
    expect(button('Flat')).toHaveAttribute('aria-pressed', 'true');
    expect(button('Sharp')).toHaveAttribute('aria-pressed', 'false');
    expect(button('Flat').className).toMatch(/min-h-11/);
  });

  it('each tap adds a sign of the chosen kind at the tapped position, left to right', async () => {
    const { container, onAnswer } = renderQuestion();
    const { tap, drawnSigns } = await ready(container);
    tap(8);
    await waitFor(() => expect(drawnSigns()).toEqual([8]));
    tap(5);
    await waitFor(() => expect(drawnSigns()).toEqual([8, 5]));
    expect(check()).toBeEnabled();
    await userEvent.click(check());
    expect(onAnswer).toHaveBeenCalledWith({ signs: [{ sign: 1, position: 8 }, { sign: 1, position: 5 }] });
    expect(mark(payload(), onAnswer.mock.calls[0]![0]).correct).toBe(true);
  });

  it('flats go in when Flat is chosen, and a change of choice does not change signs already placed', async () => {
    const user = userEvent.setup();
    const { container, onAnswer } = renderQuestion({ payload: payload('treble', { tonic: pitch.parsePitchClass('Bb'), mode: 'major' }) });
    const { tap, drawnSigns } = await ready(container);
    tap(8);
    await waitFor(() => expect(drawnSigns()).toEqual([8]));
    await user.click(button('Flat'));
    tap(4);
    await waitFor(() => expect(drawnSigns()).toEqual([8, 4]));
    await user.click(check());
    expect(onAnswer.mock.calls[0]![0].signs).toEqual([{ sign: 1, position: 8 }, { sign: -1, position: 4 }]);
  });

  it('Undo takes off the last sign and Clear takes off all of them', async () => {
    const user = userEvent.setup();
    const { container } = renderQuestion();
    const { tap, drawnSigns } = await ready(container);
    tap(8);
    tap(5);
    await waitFor(() => expect(drawnSigns()).toEqual([8, 5]));
    await user.click(button('Undo'));
    await waitFor(() => expect(drawnSigns()).toEqual([8]));
    tap(3);
    await waitFor(() => expect(drawnSigns()).toEqual([8, 3]));
    await user.click(button('Clear'));
    await waitFor(() => expect(drawnSigns()).toEqual([]));
    expect(check()).toBeDisabled();
  });

  it('holds seven signs at most (the stave says it is full)', async () => {
    const { container } = renderQuestion();
    const { tap, drawnSigns } = await ready(container);
    for (const p of [8, 5, 9, 6, 3, 7, 4]) tap(p);
    await waitFor(() => expect(drawnSigns()).toHaveLength(7));
    tap(2);
    await waitFor(() => expect(screen.getByTestId('stave-live')).toHaveTextContent('The key signature is full'));
    expect(drawnSigns()).toHaveLength(7);
  });

  it('restores an earlier answer as the signs placed and reports later changes, never on mount', async () => {
    const user = userEvent.setup();
    const onAnswerChange = vi.fn<(a: WriteKeySignatureAnswer | null) => void>();
    const initialAnswer = { signs: [{ sign: 1 as const, position: 8 }] };
    const { container } = renderQuestion({ initialAnswer, onAnswerChange });
    const { tap, drawnSigns } = await ready(container);
    await waitFor(() => expect(drawnSigns()).toEqual([8]));
    expect(onAnswerChange).not.toHaveBeenCalled();
    tap(5);
    expect(onAnswerChange).toHaveBeenLastCalledWith({ signs: [{ sign: 1, position: 8 }, { sign: 1, position: 5 }] });
    await user.click(button('Clear'));
    expect(onAnswerChange).toHaveBeenLastCalledWith(null);
  });

  it('ignores an answer that does not fit', async () => {
    const { container } = renderQuestion({ initialAnswer: { signs: [{ sign: 1, position: 40 }] } });
    const { drawnSigns } = await ready(container);
    expect(drawnSigns()).toEqual([]);
    expect(check()).toBeDisabled();
  });

  it('keyboard: Up and Down move a ghost, Enter places a sign of the chosen kind', async () => {
    const user = userEvent.setup();
    const { container, onAnswer } = renderQuestion();
    const { surface, drawnSigns } = await ready(container);
    surface().focus();
    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{Enter}');
    await waitFor(() => expect(drawnSigns()).toEqual([8]));
    await user.click(check());
    expect(onAnswer.mock.calls[0]![0].signs).toEqual([{ sign: 1, position: 8 }]);
  });

  it('Check is left out for a host that saves answers; Undo and Clear stay', async () => {
    const { container } = renderQuestion({ hideCheck: true });
    await ready(container);
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();
    expect(button('Undo')).toBeInTheDocument();
  });

  it('after an answer nothing can be changed', async () => {
    const answer = { signs: [{ sign: 1 as const, position: 8 }] };
    const result = mark(payload(), answer);
    const { container } = renderQuestion({ initialAnswer: answer, result });
    const { tap, drawnSigns } = await ready(container);
    tap(5);
    expect(drawnSigns()).toEqual([8]);
    expect(check()).toBeDisabled();
    expect(button('Undo')).toBeDisabled();
    expect(button('Sharp')).toBeDisabled();
  });

  it('works in the bass clef', async () => {
    const { container } = renderQuestion({ payload: payload('bass') });
    await ready(container);
    expect(screen.getByRole('application', { name: /Key signature, bass clef/ })).toBeInTheDocument();
  });
});
