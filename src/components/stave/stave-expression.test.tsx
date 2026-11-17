// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Passage } from '@/engine/types';
import { bar, note, passage } from './fixtures';
import { installStaveStubs } from './test-utils';
import { Stave } from './stave';

vi.mock('@/audio', () => ({ getAudioEngine: () => ({ noteOn() {}, noteOff() {}, isUnlocked: () => true, unlock: async () => {} }) }));
beforeAll(() => installStaveStubs());
afterEach(cleanup);

const p = (): Passage => ({
  ...passage([bar(note('C4', 'crotchet', { articulations: ['staccato'] }), note('D4'), note('E4'), note('F4'))]),
  expression: { tempo: { text: 'Allegro', bpm: 120 }, dynamics: [{ at: { bar: 0, event: 0 }, level: 'mf' }] },
});

describe('the Stave component with expression', () => {
  it('read mode: draws the marks and describes them, Italian terms with lang="it"', async () => {
    const { container } = render(<Stave mode="read" passage={p()} ariaLabel="Four notes" />);
    await waitFor(() => expect(container.querySelector('.mtn-dyn')).toBeTruthy());
    expect(container.querySelector('.mtn-tempo')).toBeTruthy();
    expect(container.querySelector('.mtn-artic')).toBeTruthy();
    const desc = container.querySelector('.mtn-stave__sr') as HTMLElement;
    expect(desc.textContent).toContain('Tempo: Allegro, 120 crotchets a minute.');
    expect([...desc.querySelectorAll('[lang="it"]')].map((e) => e.textContent)).toEqual(['Allegro', 'mezzo forte']);
  });
  it('US terminology changes the note names in the description, not the drawn mark', async () => {
    const uk = render(<Stave mode="read" passage={p()} ariaLabel="x" terminology="uk" />);
    await waitFor(() => expect(uk.container.querySelector('.mtn-tempo')).toBeTruthy());
    const ukMark = uk.container.querySelector('.mtn-tempo')?.innerHTML;
    cleanup();
    const us = render(<Stave mode="read" passage={p()} ariaLabel="x" terminology="us" />);
    await waitFor(() => expect(us.container.querySelector('.mtn-tempo')).toBeTruthy());
    expect(us.container.querySelector('.mtn-tempo')?.innerHTML).toBe(ukMark);
    expect(us.container.querySelector('.mtn-stave__sr')?.textContent).toContain('120 quarter notes a minute');
  });
  it('edit mode shows the marks too', async () => {
    const { container } = render(<Stave mode="edit" passage={p()} ariaLabel="x" onChange={() => {}} />);
    await waitFor(() => expect(container.querySelector('.mtn-dyn')).toBeTruthy());
  });
});
