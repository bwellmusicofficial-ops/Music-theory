// @vitest-environment jsdom
/** `pressed`: event buttons that act as toggles (find-in-passage). */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { bar, note, passage } from './fixtures';
import { Stave } from './stave';
import { installStaveStubs } from './test-utils';

vi.mock('@/audio', () => ({ getAudioEngine: () => ({ noteOn() {}, noteOff() {}, isUnlocked: () => true, unlock: async () => {} }) }));

beforeAll(() => installStaveStubs());
afterEach(cleanup);

const p = passage([bar(note('C5'), note('D5')), bar(note('E5'), note('F5'))]);

describe('pressed (read mode with onEventTap)', () => {
  it('without it the buttons are plain buttons, as before', async () => {
    render(<Stave mode="read" passage={p} ariaLabel="x" onEventTap={() => {}} />);
    const buttons = await screen.findAllByRole('button');
    expect(buttons).toHaveLength(4);
    buttons.forEach((b) => expect(b).not.toHaveAttribute('aria-pressed'));
  });

  it('gives every button aria-pressed: true for the listed events, false for the rest', async () => {
    render(<Stave mode="read" passage={p} ariaLabel="x" onEventTap={() => {}} pressed={['0:1', '1:0']} />);
    const buttons = await screen.findAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'true', 'false']);
  });

  it('a bare bar number presses every event of that bar', async () => {
    render(<Stave mode="read" passage={p} ariaLabel="x" onEventTap={() => {}} pressed={['1']} />);
    const buttons = await screen.findAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', 'true']);
  });

  it('follows changes of the list', async () => {
    const { rerender } = render(<Stave mode="read" passage={p} ariaLabel="x" onEventTap={() => {}} pressed={[]} />);
    await screen.findAllByRole('button');
    rerender(<Stave mode="read" passage={p} ariaLabel="x" onEventTap={() => {}} pressed={['0:0']} />);
    await waitFor(() => expect(screen.getAllByRole('button')[0]).toHaveAttribute('aria-pressed', 'true'));
  });
});
