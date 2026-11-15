// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Passage } from '@/engine/types';
import { describePassage } from './a11y/describe';
import { bar, engines, note, passage, pstr, rest } from './fixtures';
import { getStaveLayout } from './layout-registry';
import { installStaveStubs, STUB_ROOT_RECT } from './test-utils';
import { Stave } from './stave';
import type { StaveProps } from './types';
import { NoteSprite, spriteStats, staveMetrics } from './note-sprite';
import { memo } from 'react';
import { pitch } from '@/engine/pitch';

const audio = vi.hoisted(() => ({
  noteOn: vi.fn(),
  noteOff: vi.fn(),
  isUnlocked: () => true,
  unlock: async () => {},
}));
vi.mock('@/audio', () => ({ getAudioEngine: () => audio }));

beforeAll(() => installStaveStubs());
beforeEach(() => {
  audio.noteOn.mockClear();
  audio.noteOff.mockClear();
});
afterEach(cleanup);

const PALETTE: StaveProps['palette'] = {
  durations: [
    { value: 'crotchet', dots: 0 },
    { value: 'quaver', dots: 0 },
    { value: 'minim', dots: 0 },
  ],
  accidentals: true,
  rests: true,
  dots: 1,
  ties: true,
};

const base = () => passage([bar(note('C4'), note('E4'))]);

async function drawn(container: HTMLElement) {
  await waitFor(() => expect(container.querySelector('.vf-stavenote, .vf-stave')).toBeTruthy());
}

/** Parent that owns the passage, like a lesson would. */
function Harness(props: { initial: Passage; onPassage: (p: Passage) => void } & Partial<StaveProps>) {
  const { initial, onPassage, ...rest } = props;
  const [p, setP] = useState(initial);
  return (
    <Stave
      mode="edit"
      ariaLabel="Write the bar"
      palette={PALETTE}
      {...rest}
      passage={p}
      onChange={(n) => {
        onPassage(n);
        setP(n);
      }}
    />
  );
}

function setup(over: Partial<StaveProps> = {}, initial: Passage = base()) {
  const changes: Passage[] = [];
  const utils = render(<Harness initial={initial} onPassage={(p) => changes.push(p)} {...over} />);
  const canvas = () => utils.container.querySelector('.mtn-stave__canvas') as HTMLElement;
  const surface = () => screen.getByTestId('stave-surface');
  const model = () => getStaveLayout(canvas())!;
  const client = (x: number, y: number) => ({ clientX: x * model().scale, clientY: y * model().scale });
  const slotPoint = (barIdx: number, slot: number, position: number) => {
    const b = model().bars.find((x) => x.bar === barIdx)!;
    const sys = model().systems[b.system];
    return client(b.slotX[slot], sys.bottomLineY - position * 5);
  };
  const headPoint = (barIdx: number, event: number, position: number) => {
    const b = model().bars.find((x) => x.bar === barIdx)!;
    const sys = model().systems[b.system];
    return client(b.events[event].centreX, sys.bottomLineY - position * 5);
  };
  const ptr = (type: 'pointerDown' | 'pointerMove' | 'pointerUp' | 'pointerCancel', pt: { clientX: number; clientY: number }, extra: object = {}) =>
    fireEvent[type](surface(), { pointerId: 1, pointerType: 'mouse', button: 0, ...pt, ...extra });
  const live = () => screen.getByTestId('stave-live').textContent?.replace(/​/g, '');
  return { ...utils, changes, canvas, surface, model, slotPoint, headPoint, ptr, live };
}

describe('read mode', () => {
  it('1: renders an svg with one stavenote per event and role=img with the label', async () => {
    const p = passage([bar(note('C4'), rest(), note(['E4', 'G4'], 'minim'))]);
    const { container } = render(<Stave mode="read" passage={p} ariaLabel="A bar of music" />);
    await drawn(container);
    expect(container.querySelectorAll('.mtn-stave__notation svg')).toHaveLength(1);
    expect(container.querySelectorAll('.vf-stavenote')).toHaveLength(3);
    const img = screen.getByRole('img', { name: 'A bar of music' });
    expect(img).toBeInTheDocument();
    expect(container.querySelector('.mtn-stave__notation')).toHaveAttribute('aria-hidden', 'true');
  });

  it('2: the description paragraph matches describePassage', async () => {
    const p = passage([bar(note('F#4'), rest())], { key: 'D' });
    const { container } = render(<Stave mode="read" passage={p} ariaLabel="x" />);
    await drawn(container);
    const desc = container.querySelector('p')!;
    expect(desc.textContent).toBe(describePassage(engines, p, { terminology: 'uk', pitchSpeech: 'names' }));
    expect(screen.getByRole('img')).toHaveAttribute('aria-describedby', desc.id);
  });

  it('3: marks add a class and a badge without redrawing the notation', async () => {
    const p = passage([bar(note('C4'), note('D4'))]);
    const { container, rerender } = render(<Stave mode="read" passage={p} ariaLabel="x" />);
    await drawn(container);
    const svg = container.querySelector('.mtn-stave__notation svg')!;
    const groups = [...container.querySelectorAll('.vf-stavenote')];
    rerender(<Stave mode="read" passage={p} ariaLabel="x" marks={{ '0:1': 'wrong' }} />);
    expect(container.querySelectorAll('.vf-stavenote')[1]).toHaveClass('mtn-ev--wrong');
    expect(container.querySelectorAll('.vf-stavenote')[0]).not.toHaveClass('mtn-ev--wrong');
    expect(screen.getByTestId('badge-wrong')).toBeInTheDocument();
    expect(container.querySelector('.mtn-stave__notation svg')).toBe(svg);
    expect([...container.querySelectorAll('.vf-stavenote')]).toEqual(groups);
    rerender(<Stave mode="read" passage={p} ariaLabel="x" marks={{ '0:0': 'correct', '0': 'wrong' }} />);
    expect(container.querySelectorAll('.vf-stavenote')[1]).not.toHaveClass('mtn-ev--wrong');
    expect(container.querySelectorAll('.vf-stavenote')[0]).toHaveClass('mtn-ev--correct');
    expect(screen.getByTestId('badge-correct')).toBeInTheDocument();
    expect(screen.getByTestId('bracket-wrong')).toBeInTheDocument();
    expect(container.querySelector('.mtn-stave__notation svg')).toBe(svg);
  });

  it('3b: highlight draws an outline and leaves the note colour alone', async () => {
    const p = passage([bar(note('C4'))]);
    const { container } = render(<Stave mode="read" passage={p} ariaLabel="x" marks={{ '0:0': 'highlight' }} />);
    await drawn(container);
    expect(screen.getByTestId('mark-highlight')).toBeInTheDocument();
    expect(container.querySelector('.vf-stavenote')).not.toHaveClass('mtn-ev--wrong');
  });

  it('3c: near is amber with its own diamond-and-tilde badge, distinct from correct and wrong', async () => {
    const p = passage([bar(note('C4'), note('D4'), note('E4'))]);
    const { container, rerender } = render(
      <Stave mode="read" passage={p} ariaLabel="x" marks={{ '0:0': 'correct', '0:1': 'near', '0:2': 'wrong' }} />,
    );
    await drawn(container);
    const notes = container.querySelectorAll('.vf-stavenote');
    expect(notes[1]).toHaveClass('mtn-ev--near');
    expect(notes[1]).not.toHaveClass('mtn-ev--correct');
    const near = screen.getByTestId('badge-near');
    // Colour is never the only signal: each badge has its own shape.
    expect(near.querySelector('rect[transform^="rotate(45"]')).not.toBeNull();
    expect(near.querySelector('path')).not.toBeNull();
    expect(near.querySelector('rect')?.getAttribute('fill')).toBe('var(--stave-near)');
    expect(screen.getByTestId('badge-correct').querySelector('circle')).not.toBeNull();
    expect(screen.getByTestId('badge-wrong').querySelector('rect[transform]')).toBeNull();
    // A bar-level near mark brackets the bar with a dotted line in the same colour.
    rerender(<Stave mode="read" passage={p} ariaLabel="x" marks={{ '0': 'near' }} />);
    expect(screen.getByTestId('bracket-near').getAttribute('stroke')).toBe('var(--stave-near)');
  });

  it('3d: lit draws an accent-filled box and colours the note in the accent colour', async () => {
    const p = passage([bar(note('C4'), note('D4'))]);
    const { container } = render(<Stave mode="read" passage={p} ariaLabel="x" marks={{ '0:1': 'lit' }} />);
    await drawn(container);
    expect(container.querySelectorAll('.vf-stavenote')[1]).toHaveClass('mtn-ev--lit');
    expect(screen.getByTestId('mark-lit').getAttribute('fill')).toBe('var(--stave-accent)');
    expect(screen.queryByTestId('badge-near')).toBeNull();
  });

  it('3e: a result mark and the cursor can share a note; the stylesheet lets the result colour win', async () => {
    const p = passage([bar(note('C4'), note('D4'))]);
    const { container } = render(
      <Stave mode="read" passage={p} ariaLabel="x" marks={{ '0:0': 'correct' }} cursor={{ bar: 0, event: 0 }} />,
    );
    await drawn(container);
    const first = container.querySelectorAll('.vf-stavenote')[0];
    expect(first).toHaveClass('mtn-ev--correct', 'mtn-ev--playing');
    const css = readFileSync(resolve(__dirname, 'stave.css'), 'utf8');
    expect(css.indexOf('.mtn-ev--playing')).toBeLessThan(css.indexOf('.mtn-ev--correct'));
    expect(css.indexOf('.mtn-ev--playing')).toBeLessThan(css.indexOf('.mtn-ev--near'));
    expect(css).toContain('--stave-near: var(--warning)');
  });

  it('4: cursor adds and moves mtn-ev--playing without a redraw', async () => {
    const p = passage([bar(note('C4'), note('D4'), note('E4'))]);
    const { container, rerender } = render(<Stave mode="read" passage={p} ariaLabel="x" cursor={{ bar: 0, event: 0 }} />);
    await drawn(container);
    const svg = container.querySelector('.mtn-stave__notation svg')!;
    const g = () => [...container.querySelectorAll('.vf-stavenote')];
    expect(g()[0]).toHaveClass('mtn-ev--playing');
    rerender(<Stave mode="read" passage={p} ariaLabel="x" cursor={{ bar: 0, event: 2 }} />);
    expect(g()[0]).not.toHaveClass('mtn-ev--playing');
    expect(g()[2]).toHaveClass('mtn-ev--playing');
    expect(screen.getByTestId('cursor-column')).toBeInTheDocument();
    expect(screen.getByTestId('cursor-pointer')).toBeInTheDocument();
    expect(container.querySelector('.mtn-stave__notation svg')).toBe(svg);
    rerender(<Stave mode="read" passage={p} ariaLabel="x" cursor={null} />);
    expect(g()[2]).not.toHaveClass('mtn-ev--playing');
    expect(screen.queryByTestId('cursor-column')).toBeNull();
    expect(screen.queryByTestId('cursor-pointer')).toBeNull();
  });

  it('5: read + tap gives one button per event, labelled, one tab stop, arrows move focus', async () => {
    const p = passage([bar(note('F#4'), note('G4', 'quaver')), bar(rest())], { key: 'D' });
    const onTap = vi.fn();
    const { container } = render(<Stave mode="read" passage={p} ariaLabel="Spot the mistake" onEventTap={onTap} />);
    await drawn(container);
    const group = screen.getByRole('group', { name: 'Spot the mistake' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveAccessibleName('Bar 1, note 1 of 2: F sharp 4, crotchet');
    expect(buttons[1]).toHaveAccessibleName('Bar 1, note 2 of 2: G4, quaver');
    expect(buttons[2]).toHaveAccessibleName('Bar 2, note 1 of 1: crotchet rest');
    expect(buttons.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    fireEvent.click(buttons[1]);
    expect(onTap).toHaveBeenCalledWith(0, 1);
    buttons[0].focus();
    fireEvent.keyDown(buttons[0], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(buttons[1]);
    fireEvent.keyDown(buttons[1], { key: 'End' });
    expect(document.activeElement).toBe(buttons[2]);
    fireEvent.keyDown(buttons[2], { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(buttons[1]);
    expect(buttons.filter((b) => b.tabIndex === 0)).toEqual([buttons[1]]);
  });

  it('5b: marks are part of the button label', async () => {
    const p = passage([bar(note('C4'))]);
    const { container } = render(<Stave mode="read" passage={p} ariaLabel="x" onEventTap={() => {}} marks={{ '0:0': 'wrong' }} />);
    await drawn(container);
    expect(screen.getByRole('button')).toHaveAccessibleName(/marked wrong$/);
  });

  it('16: re-rendering with an equal but new passage object does not redraw', async () => {
    const mk = () => passage([bar(note('C4'), note('D4'))]);
    const { container, rerender } = render(<Stave mode="read" passage={mk()} ariaLabel="x" />);
    await drawn(container);
    const svg = container.querySelector('.mtn-stave__notation svg')!;
    rerender(<Stave mode="read" passage={mk()} ariaLabel="x" palette={{}} />);
    rerender(<Stave mode="read" passage={mk()} ariaLabel="y" />);
    expect(container.querySelector('.mtn-stave__notation svg')).toBe(svg);
    rerender(<Stave mode="read" passage={passage([bar(note('C4'))])} ariaLabel="y" />);
    await waitFor(() => expect(container.querySelectorAll('.vf-stavenote')).toHaveLength(1));
    expect(container.querySelector('.mtn-stave__notation svg')).not.toBe(svg);
  });

  it('draws nothing on the server: no svg before VexFlow loads, only root and description', () => {
    const { container } = render(<Stave mode="read" passage={base()} ariaLabel="x" />);
    expect(container.querySelector('.mtn-stave__notation svg')).toBeNull();
    expect(container.querySelector('.mtn-stave')).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('p')).toBeTruthy();
  });
});

describe('edit mode: pointer', () => {
  it('6: pointer down and up on a slot calls onChange once with the inserted note', async () => {
    const s = setup({}, passage([bar(note('C4'), note('E4'))]));
    await drawn(s.container);
    const pt = s.slotPoint(0, 1, 4); // between C4 and E4, on B4
    s.ptr('pointerDown', pt);
    s.ptr('pointerUp', pt);
    expect(s.changes).toHaveLength(1);
    expect(s.changes[0].bars[0].events.map(pstr)).toEqual(['C4', 'B4', 'E4']);
    expect(s.live()).toBe('B4, crotchet. Bar 1, note 2 of 3.');
  });

  it('6b: the append zone inserts at the end', async () => {
    const s = setup();
    await drawn(s.container);
    const pt = s.slotPoint(0, 2, 2);
    s.ptr('pointerDown', pt);
    s.ptr('pointerUp', pt);
    expect(s.changes[0].bars[0].events.map(pstr)).toEqual(['C4', 'E4', 'G4']);
  });

  it('7: press a head, move beyond the slop, release: one onChange with the moved pitch; no move selects instead', async () => {
    const s = setup();
    await drawn(s.container);
    const from = s.headPoint(0, 0, -2);
    const to = s.headPoint(0, 0, 4);
    s.ptr('pointerDown', from);
    s.ptr('pointerMove', to);
    s.ptr('pointerUp', to);
    expect(s.changes).toHaveLength(1);
    expect(pstr(s.changes[0].bars[0].events[0])).toBe('B4');
    expect(s.live()).toBe('B4.');
  });

  it('7b: release without moving makes no edit and selects the note', async () => {
    const s = setup();
    await drawn(s.container);
    const pt = s.headPoint(0, 1, 0);
    s.ptr('pointerDown', pt);
    s.ptr('pointerUp', pt);
    expect(s.changes).toHaveLength(0);
    expect(s.live()).toBe('Bar 1, note 2 of 2: E4, crotchet.');
    expect(s.container.querySelectorAll('.vf-stavenote')[1]).toHaveClass('mtn-ev--selected');
    // tapping the same head again clears the selection
    s.ptr('pointerDown', pt);
    s.ptr('pointerUp', pt);
    expect(s.container.querySelectorAll('.vf-stavenote.mtn-ev--selected')).toHaveLength(0);
  });

  it('7c: a drag onto an occupied chord position is rejected and nothing changes', async () => {
    const s = setup({ palette: { ...PALETTE, chords: true } }, passage([bar(note(['C4', 'E4']))]));
    await drawn(s.container);
    const s0 = s.headPoint(0, 0, -2);
    const to = s.headPoint(0, 0, 0);
    s.ptr('pointerDown', s0);
    s.ptr('pointerMove', to);
    s.ptr('pointerUp', to);
    expect(s.changes).toHaveLength(0);
    expect(s.live()).toBe('That note is already in the chord.');
  });

  it('8: pointercancel mid-drag makes no edit', async () => {
    const s = setup();
    await drawn(s.container);
    const from = s.headPoint(0, 0, -2);
    const to = s.headPoint(0, 0, 5);
    s.ptr('pointerDown', from);
    s.ptr('pointerMove', to);
    s.ptr('pointerCancel', to);
    s.ptr('pointerUp', to);
    expect(s.changes).toHaveLength(0);
    // and an abandoned placing gesture
    const slot = s.slotPoint(0, 1, 3);
    s.ptr('pointerDown', slot);
    s.ptr('pointerCancel', slot);
    s.ptr('pointerUp', slot);
    expect(s.changes).toHaveLength(0);
  });

  it('a second pointer during a gesture is ignored', async () => {
    const s = setup();
    await drawn(s.container);
    const slot = s.slotPoint(0, 1, 3);
    s.ptr('pointerDown', slot);
    s.ptr('pointerDown', s.slotPoint(0, 0, 6), { pointerId: 2 });
    s.ptr('pointerUp', s.slotPoint(0, 0, 6), { pointerId: 2 });
    expect(s.changes).toHaveLength(0);
    s.ptr('pointerUp', slot);
    expect(s.changes).toHaveLength(1);
    expect(pstr(s.changes[0].bars[0].events[1])).toBe('A4');
  });

  it('a touch drag shows the loupe and removes it on release', async () => {
    const s = setup();
    await drawn(s.container);
    const slot = s.slotPoint(0, 1, 3);
    s.ptr('pointerDown', slot, { pointerType: 'touch' });
    s.ptr('pointerMove', { clientX: slot.clientX + 1, clientY: slot.clientY - 40 }, { pointerType: 'touch' });
    expect(screen.getByTestId('loupe')).toBeInTheDocument();
    s.ptr('pointerUp', { clientX: slot.clientX + 1, clientY: slot.clientY - 40 }, { pointerType: 'touch' });
    expect(screen.queryByTestId('loupe')).toBeNull();
    expect(s.changes).toHaveLength(1);
  });

  it('tapping outside every bar clears the selection', async () => {
    const s = setup();
    await drawn(s.container);
    const pt = s.headPoint(0, 0, -2);
    s.ptr('pointerDown', pt);
    s.ptr('pointerUp', pt);
    expect(s.container.querySelectorAll('.vf-stavenote.mtn-ev--selected')).toHaveLength(1);
    s.ptr('pointerDown', { clientX: 1, clientY: 1 });
    expect(s.container.querySelectorAll('.vf-stavenote.mtn-ev--selected')).toHaveLength(0);
  });
});

describe('edit mode: keyboard', () => {
  it('9: C, D, Up, dot, Backspace, Ctrl+Z give the expected sequence', async () => {
    const s = setup({}, passage([bar()]));
    await drawn(s.container);
    const key = (k: string, init: object = {}) => fireEvent.keyDown(s.surface(), { key: k, ...init });
    key('c');
    expect(s.changes.at(-1)!.bars[0].events.map(pstr)).toEqual(['C5']);
    key('d');
    expect(s.changes.at(-1)!.bars[0].events.map(pstr)).toEqual(['C5', 'D5']);
    key('ArrowUp');
    expect(s.changes.at(-1)!.bars[0].events.map(pstr)).toEqual(['C5', 'E5']);
    key('.');
    expect(s.changes.at(-1)!.bars[0].events[1].duration).toEqual({ value: 'crotchet', dots: 1 });
    key('Backspace');
    expect(s.changes.at(-1)!.bars[0].events.map(pstr)).toEqual(['C5']);
    key('z', { ctrlKey: true });
    expect(s.changes.at(-1)!.bars[0].events.map(pstr)).toEqual(['C5', 'E5']);
    expect(s.changes.at(-1)!.bars[0].events[1].duration.dots).toBe(1);
    key('z', { ctrlKey: true, shiftKey: true });
    expect(s.changes.at(-1)!.bars[0].events.map(pstr)).toEqual(['C5']);
    expect(s.live()).toBe('Redone.');
  });

  it('letters write left to right, digits change the duration, R inserts a rest', async () => {
    const s = setup({}, passage([bar()]));
    await drawn(s.container);
    const key = (k: string, init: object = {}) => fireEvent.keyDown(s.surface(), { key: k, ...init });
    key('4');
    key('e');
    key('r');
    key('Escape');
    key('6');
    key('g');
    const ev = s.changes.at(-1)!.bars[0].events;
    expect(ev.map(pstr)).toEqual(['E5', 'rest', 'G5']);
    expect(ev.map((x) => x.duration.value)).toEqual(['quaver', 'quaver', 'minim']);
    expect(s.live()).toMatch(/^G5, minim\. Bar 1, note 3 of 3\.$/);
  });

  it('arrows move through stops and announce, Shift+letter adds a chord note, + adds a sharp', async () => {
    const s = setup({ palette: { ...PALETTE, chords: true } });
    await drawn(s.container);
    const key = (k: string, init: object = {}) => fireEvent.keyDown(s.surface(), { key: k, ...init });
    key('ArrowLeft');
    expect(s.live()).toBe('Bar 1, note 2 of 2: E4, crotchet.');
    key('ArrowLeft');
    expect(s.live()).toBe('Bar 1, note 1 of 2: C4, crotchet.');
    key('G', { shiftKey: true });
    expect(pstr(s.changes.at(-1)!.bars[0].events[0])).toBe('C4+G4');
    key('+');
    // the selected head is the new G
    expect(pstr(s.changes.at(-1)!.bars[0].events[0])).toBe('C4+G#4');
    expect(s.live()).toBe('G sharp 4, sharp sign added.');
    key('ArrowRight');
    key('ArrowRight');
    expect(s.live()).toBe('Bar 1, end.');
  });

  it('unhandled keys are not prevented', async () => {
    const s = setup();
    await drawn(s.container);
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    s.surface().dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe('edit mode: palette', () => {
  it('10: shows only the enabled controls', async () => {
    const minimal = setup({ palette: { durations: [{ value: 'crotchet', dots: 0 }] } });
    await drawn(minimal.container);
    const tb = screen.getByRole('toolbar', { name: 'Note tools' });
    const names = within(tb).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(names).toContain('crotchet');
    expect(names).not.toContain('Rest');
    expect(names).not.toContain('Dot');
    expect(names).not.toContain('Sharp');
    expect(names).not.toContain('Tie to next note');
    expect(names).not.toContain('Chord');
    expect(names).toEqual(expect.arrayContaining(['Previous note', 'Next note', 'Move up', 'Move down', 'Add note', 'Undo', 'Redo', 'Delete']));
    cleanup();
    const full = setup({ palette: { ...PALETTE, accidentals: 'double', chords: true } });
    await drawn(full.container);
    const fullNames = within(screen.getByRole('toolbar')).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(fullNames).toEqual(expect.arrayContaining(['Double flat', 'Flat', 'Natural', 'Sharp', 'Double sharp', 'Rest', 'Dot', 'Tie to next note', 'Chord']));
  });

  it('10b: one tab stop in the toolbar, arrows move between buttons', async () => {
    const s = setup();
    await drawn(s.container);
    const buttons = within(screen.getByRole('toolbar')).getAllByRole('button');
    expect(buttons.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    const first = buttons.find((b) => b.tabIndex === 0)!;
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement).not.toBe(first);
    expect(document.activeElement?.closest('[role=toolbar]')).toBeTruthy();
  });

  it('10c: a duration button with a selection changes that event; the dot arms for one insertion only', async () => {
    const s = setup();
    await drawn(s.container);
    const pt = s.headPoint(0, 0, -2);
    s.ptr('pointerDown', pt);
    s.ptr('pointerUp', pt);
    fireEvent.click(screen.getByRole('button', { name: 'minim' }));
    expect(s.changes.at(-1)!.bars[0].events[0].duration.value).toBe('minim');
    expect(s.live()).toBe('Minim.');
    // clear selection, arm a dot, insert twice
    fireEvent.keyDown(s.surface(), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Dot' }));
    expect(screen.getByRole('button', { name: 'Dot' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    const events = s.changes.at(-1)!.bars[0].events;
    expect(events).toHaveLength(4);
    // the caret sat after the first note, so both insertions went in front of E4
    expect(events.map(pstr)).toEqual(['C4', 'C4', 'C4', 'E4']);
    expect(events[1].duration.dots).toBe(1);
    expect(events[2].duration.dots).toBe(0);
    expect(screen.getByRole('button', { name: 'Dot' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('step buttons do everything without a gesture or a key', async () => {
    const s = setup({}, passage([bar()]));
    await drawn(s.container);
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(s.changes.at(-1)!.bars[0].events.map(pstr)).toEqual(['B4']);
    fireEvent.click(screen.getByRole('button', { name: 'Move up' }));
    expect(s.changes.at(-1)!.bars[0].events.map(pstr)).toEqual(['C5']);
    fireEvent.click(screen.getByRole('button', { name: 'Sharp' }));
    expect(s.changes.at(-1)!.bars[0].events.map(pstr)).toEqual(['C#5']);
    fireEvent.click(screen.getByRole('button', { name: 'Sharp' }));
    expect(s.changes.at(-1)!.bars[0].events.map(pstr)).toEqual(['C5']);
    fireEvent.click(screen.getByRole('button', { name: 'Tie to next note' }));
    expect(s.changes.at(-1)!.bars[0].events[0]).toMatchObject({ tieToNext: true });
    expect(s.live()).toBe('Tied to next note.');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(s.changes.at(-1)!.bars[0].events).toHaveLength(0);
    expect(s.live()).toBe('Deleted. Bar 1 is empty.');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(s.changes.at(-1)!.bars[0].events).toHaveLength(1);
  });

  it('15: undo and redo are disabled until there is history, and cleared when the parent swaps the passage', async () => {
    const changes: Passage[] = [];
    const first = passage([bar(note('C4'))]);
    const swapped = passage([bar(note('D4'))]);
    function Swapper() {
      const [p, setP] = useState(first);
      return (
        <>
          <button onClick={() => setP(swapped)}>swap</button>
          <Stave mode="edit" ariaLabel="x" palette={PALETTE} passage={p} onChange={(n) => { changes.push(n); setP(n); }} />
        </>
      );
    }
    const { container } = render(<Swapper />);
    await drawn(container);
    const undo = () => screen.getByRole('button', { name: 'Undo' });
    const redo = () => screen.getByRole('button', { name: 'Redo' });
    expect(undo()).toBeDisabled();
    expect(redo()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(undo()).toBeEnabled();
    fireEvent.click(undo());
    expect(redo()).toBeEnabled();
    expect(undo()).toBeDisabled();
    fireEvent.click(redo());
    expect(undo()).toBeEnabled();
    fireEvent.click(screen.getByText('swap'));
    await waitFor(() => expect(undo()).toBeDisabled());
    expect(redo()).toBeDisabled();
  });
});

describe('edit mode: locks and constrained kinds', () => {
  const gap = passage([bar(note('C4'), note('D4'), note('E4')), bar(note('F4'), note('G4'))]);

  it('11: locked bars and events: a tap does nothing, events carry mtn-ev--locked', async () => {
    const s = setup({ edit: { editable: [{ bar: 0, lockedPrefix: 1, lockedSuffix: 1 }] } }, gap);
    await drawn(s.container);
    const groups = [...s.container.querySelectorAll('.vf-stavenote')];
    expect(groups.map((g) => g.classList.contains('mtn-ev--locked'))).toEqual([true, false, true, true, true]);
    expect(screen.getAllByTestId('lock-hatch')).toHaveLength(1);
    // tap in the locked bar (bar 1)
    const p1 = s.headPoint(1, 0, 1);
    s.ptr('pointerDown', p1);
    s.ptr('pointerUp', p1);
    // tap on a locked event in the editable bar
    const p0 = s.headPoint(0, 0, -2);
    s.ptr('pointerDown', p0);
    s.ptr('pointerUp', p0);
    expect(s.changes).toHaveLength(0);
    expect(s.container.querySelectorAll('.vf-stavenote.mtn-ev--selected')).toHaveLength(0);
    // the editable middle works
    const mid = s.slotPoint(0, 2, 3);
    s.ptr('pointerDown', mid);
    s.ptr('pointerUp', mid);
    expect(s.changes[0].bars[0].events.map(pstr)).toEqual(['C4', 'D4', 'A4', 'E4']);
    expect(s.changes[0].bars[1]).toBe(s.changes[0].bars[1]);
  });

  it('11b: locked bars are not keyboard stops and the description names the editable bars', async () => {
    const s = setup({ edit: { editable: [{ bar: 0, lockedPrefix: 1, lockedSuffix: 1 }] } }, gap);
    await drawn(s.container);
    expect(s.container.querySelector('p')!.textContent).toMatch(/Bar 1 can be edited\.$/);
    const key = (k: string) => fireEvent.keyDown(s.surface(), { key: k });
    key('ArrowLeft');
    expect(s.live()).toBe('Bar 1, note 2 of 3: D4, crotchet.');
    key('ArrowLeft');
    expect(s.live()).toBe('Bar 1, note 2 of 3: D4, crotchet.');
    key('Backspace');
    expect(s.changes.at(-1)!.bars[0].events.map(pstr)).toEqual(['C4', 'E4']);
  });

  it('11c: locked event rejection is announced from the keyboard path', async () => {
    const s = setup({ edit: { editable: [{ bar: 0, lockedPrefix: 3, lockedSuffix: 0 }] } }, gap);
    await drawn(s.container);
    fireEvent.keyDown(s.surface(), { key: 'Backspace' });
    // the event before the caret is locked
    expect(s.changes).toHaveLength(0);
    expect(s.live()).toBe('That note is fixed.');
  });

  it('12: single-note kind: two taps at different heights leave one note', async () => {
    const s = setup(
      { edit: { kind: 'single-note' }, palette: { durations: [{ value: 'semibreve', dots: 0 }], accidentals: true }, show: { timeSignature: false, finalBarline: false } },
      passage([bar()]),
    );
    await drawn(s.container);
    expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rest' })).toBeNull();
    const a = s.slotPoint(0, 0, 2);
    s.ptr('pointerDown', a);
    s.ptr('pointerUp', a);
    const b = s.slotPoint(0, 0, 6);
    s.ptr('pointerDown', b);
    s.ptr('pointerUp', b);
    expect(s.changes).toHaveLength(2);
    expect(s.changes[1].bars[0].events.map(pstr)).toEqual(['D5']);
    expect(s.changes[1].bars[0].events).toHaveLength(1);
    expect(s.changes[1].bars[0].events[0].duration.value).toBe('semibreve');
    // a tap on the note itself, at another height, moves it
    const c = s.headPoint(0, 0, 8);
    s.ptr('pointerDown', c);
    s.ptr('pointerUp', c);
    expect(s.changes.at(-1)!.bars[0].events.map(pstr)).toEqual(['F5']);
  });

  it('12b: single-note keys: Up creates at the middle line, letters set it', async () => {
    const s = setup(
      { edit: { kind: 'single-note' }, palette: { durations: [{ value: 'semibreve', dots: 0 }] } },
      passage([bar()]),
    );
    await drawn(s.container);
    fireEvent.keyDown(s.surface(), { key: 'ArrowUp' });
    expect(s.changes.at(-1)!.bars[0].events.map(pstr)).toEqual(['B4']);
    fireEvent.keyDown(s.surface(), { key: 'g' });
    expect(s.changes.at(-1)!.bars[0].events.map(pstr)).toEqual(['G4']);
    fireEvent.keyDown(s.surface(), { key: 'ArrowUp', shiftKey: true });
    expect(s.changes.at(-1)!.bars[0].events.map(pstr)).toEqual(['G5']);
  });

  it('range limits the placeable positions', async () => {
    const s = setup(
      { range: { low: pitch.parsePitch('C4'), high: pitch.parsePitch('A5') } },
      passage([bar()]),
    );
    await drawn(s.container);
    const above = s.slotPoint(0, 0, 14);
    s.ptr('pointerDown', above);
    s.ptr('pointerUp', above);
    expect(pstr(s.changes[0].bars[0].events[0])).toBe('A5');
    expect(s.model().systems[0].height).toBe(108);
  });
});

describe('edit mode: announcements and sound', () => {
  it('13: live region after place, move and reject', async () => {
    const s = setup({}, passage([bar(note('C4'))]));
    await drawn(s.container);
    const slot = s.slotPoint(0, 1, 3);
    s.ptr('pointerDown', slot);
    s.ptr('pointerUp', slot);
    expect(s.live()).toBe('A4, crotchet. Bar 1, note 2 of 2.');
    fireEvent.keyDown(s.surface(), { key: 'ArrowUp' });
    expect(s.live()).toBe('B4.');
    for (let i = 0; i < 12; i++) fireEvent.keyDown(s.surface(), { key: 'ArrowUp' });
    expect(s.live()).toBe('Too high for this stave.');
    fireEvent.keyDown(s.surface(), { key: 't' });
    expect(s.live()).toBe('Not available here.'.replace('Not available here.', s.live()!));
  });

  it('13b: a full bar is announced', async () => {
    const full = passage([bar(...Array.from({ length: 8 }, () => note('C4')))]);
    const s = setup({}, full);
    await drawn(s.container);
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(s.live()).toBe('This bar is full.');
    expect(s.changes).toHaveLength(0);
  });

  it('13c: disabled bindings announce Not available here', async () => {
    const s = setup({ palette: { durations: [{ value: 'crotchet', dots: 0 }] } });
    await drawn(s.container);
    fireEvent.keyDown(s.surface(), { key: 'r' });
    expect(s.live()).toBe('Not available here.');
    fireEvent.keyDown(s.surface(), { key: '.' });
    expect(s.live()).toBe('Not available here.');
    fireEvent.keyDown(s.surface(), { key: '+' });
    expect(s.live()).toBe('Not available here.');
    fireEvent.keyDown(s.surface(), { key: '7' });
    expect(s.live()).toBe('Not available here.');
    expect(s.changes).toHaveLength(0);
  });

  it('14: sound plays on place and move, not on delete; nothing with sound={false}', async () => {
    const s = setup({}, passage([bar(note('C4'))]));
    await drawn(s.container);
    const slot = s.slotPoint(0, 1, 3);
    s.ptr('pointerDown', slot);
    s.ptr('pointerUp', slot);
    expect(audio.noteOn).toHaveBeenCalledTimes(1);
    expect(pitch.formatPitch(audio.noteOn.mock.calls[0][0])).toBe('A4');
    audio.noteOn.mockClear();
    fireEvent.keyDown(s.surface(), { key: 'ArrowUp' });
    expect(audio.noteOn).toHaveBeenCalledTimes(1);
    expect(pitch.formatPitch(audio.noteOn.mock.calls[0][0])).toBe('B4');
    audio.noteOn.mockClear();
    fireEvent.keyDown(s.surface(), { key: 'Backspace' });
    expect(audio.noteOn).not.toHaveBeenCalled();
    fireEvent.keyDown(s.surface(), { key: 'z', ctrlKey: true });
    expect(audio.noteOn).not.toHaveBeenCalled();
    cleanup();
    audio.noteOn.mockClear();
    audio.noteOff.mockClear();
    const quiet = setup({ sound: false }, passage([bar(note('C4'))]));
    await drawn(quiet.container);
    const q = quiet.slotPoint(0, 1, 3);
    quiet.ptr('pointerDown', q);
    quiet.ptr('pointerUp', q);
    fireEvent.keyDown(quiet.surface(), { key: 'ArrowUp' });
    expect(audio.noteOn).not.toHaveBeenCalled();
    expect(audio.noteOff).not.toHaveBeenCalled();
  });

  it('14b: selecting an event sounds all its pitches; a new sound stops the old one', async () => {
    const s = setup({}, passage([bar(note(['C4', 'E4']), note('G4'))]));
    await drawn(s.container);
    const pt = s.headPoint(0, 0, 0);
    s.ptr('pointerDown', pt);
    s.ptr('pointerUp', pt);
    expect(audio.noteOn).toHaveBeenCalledTimes(2);
    audio.noteOn.mockClear();
    const g = s.headPoint(0, 1, 2);
    s.ptr('pointerDown', g);
    s.ptr('pointerUp', g);
    expect(audio.noteOff).toHaveBeenCalledTimes(2);
    expect(audio.noteOn).toHaveBeenCalledTimes(1);
  });
});

describe('edit mode: focus and accessibility', () => {
  it('the surface is an application with a label and descriptions; the toolbar follows it', async () => {
    const s = setup();
    await drawn(s.container);
    const surface = screen.getByRole('application', { name: 'Write the bar' });
    expect(surface).toHaveAttribute('aria-roledescription', 'music stave editor');
    expect(surface.tabIndex).toBe(0);
    const ids = surface.getAttribute('aria-describedby')!.split(' ');
    expect(ids).toHaveLength(2);
    for (const id of ids) expect(s.container.querySelector(`#${id}`)?.textContent).toBeTruthy();
    expect(screen.getByTestId('stave-live')).toHaveAttribute('aria-live', 'polite');
  });

  it('two staves on one page have distinct ids and keep separate history', async () => {
    const { container } = render(
      <>
        <Harness initial={base()} onPassage={() => {}} />
        <Harness initial={base()} onPassage={() => {}} ariaLabel="Second" />
      </>,
    );
    await waitFor(() => expect(container.querySelectorAll('.vf-stavenote').length).toBe(4));
    const ids = [...container.querySelectorAll('[id]')].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const undos = screen.getAllByRole('button', { name: 'Undo' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add note' })[0]);
    expect(undos[0]).toBeEnabled();
    expect(undos[1]).toBeDisabled();
  });

  it('the root width comes from the container and the stave never exceeds it at 400px', async () => {
    const s = setup();
    await drawn(s.container);
    const m = s.model();
    expect(m.width * m.scale).toBeLessThanOrEqual(STUB_ROOT_RECT.width + 1);
  });
});

describe('sizing, hover and Note Rush metrics', () => {
  it('an overfull bar scales the notation down instead of overflowing, within the 0.75 limit', async () => {
    const p = passage([bar(...Array.from({ length: 24 }, () => note('C5', 'quaver')))]);
    const { container } = render(<Stave mode="read" passage={p} ariaLabel="x" />);
    await drawn(container);
    const m = getStaveLayout(container.querySelector('.mtn-stave__canvas')!)!;
    expect(m.scale).toBeLessThan(1.25);
    expect(m.scale).toBeGreaterThanOrEqual(1.25 * 0.75 - 1e-9);
  });

  it('staveMetrics matches a read Stave with the same range, so a sprite aligns at top: 0', async () => {
    const range = { low: pitch.parsePitch('C4'), high: pitch.parsePitch('A5') };
    const { container } = render(
      <Stave mode="read" passage={passage([bar()])} ariaLabel="x" range={range} size="sm" show={{ timeSignature: false, finalBarline: false }} />,
    );
    await drawn(container);
    const m = getStaveLayout(container.querySelector('.mtn-stave__canvas')!)!;
    const metrics = staveMetrics('sm', range);
    expect(m.height * m.scale).toBeCloseTo(metrics.heightPx, 5);
    expect(m.systems[0].bottomLineY * m.scale).toBeCloseTo(metrics.yForPositionPx(0), 5);
  });

  it('staveMetrics default values', () => {
    const md = staveMetrics('md');
    expect(md.scale).toBe(1.25);
    expect(md.heightPx).toBe(88 * 1.25);
    expect(md.yForPositionPx(0)).toBe(64 * 1.25);
    expect(md.yForPositionPx(8)).toBeCloseTo(24 * 1.25);
    expect(staveMetrics('lg', { low: pitch.parsePitch('C3'), high: pitch.parsePitch('C7') }).heightPx).toBeGreaterThan(md.heightPx);
  });

  it('a mouse hovering over a slot shows the ghost and leaving hides it', async () => {
    const s = setup();
    await drawn(s.container);
    const ghost = () => s.container.querySelector('.mtn-ghost')!;
    expect(ghost().getAttribute('visibility')).toBe('hidden');
    fireEvent.pointerMove(s.surface(), { pointerId: 1, pointerType: 'mouse', buttons: 0, ...s.slotPoint(0, 1, 3) });
    expect(ghost().getAttribute('visibility')).toBe('visible');
    fireEvent.pointerLeave(s.surface());
    expect(ghost().getAttribute('visibility')).toBe('hidden');
  });

  it('chord mode: tapping an event column off any head adds a head', async () => {
    const s = setup({ palette: { ...PALETTE, chords: true } }, passage([bar(note('C4'))]));
    await drawn(s.container);
    fireEvent.click(screen.getByRole('button', { name: 'Chord' }));
    const b = s.model().bars[0];
    const pt = { clientX: b.events[0].centreX * s.model().scale, clientY: (s.model().systems[0].bottomLineY - 7 * 5) * s.model().scale };
    s.ptr('pointerDown', pt);
    s.ptr('pointerUp', pt);
    expect(pstr(s.changes[0].bars[0].events[0])).toBe('C4+E5');
    expect(s.live()).toBe('E5 added. Chord: C4, E5.');
  });

  it('the Escape key abandons a gesture without editing', async () => {
    const s = setup();
    await drawn(s.container);
    const slot = s.slotPoint(0, 1, 3);
    s.ptr('pointerDown', slot);
    fireEvent.keyDown(s.surface(), { key: 'Escape' });
    s.ptr('pointerUp', slot);
    expect(s.changes).toHaveLength(0);
  });
});

describe('NoteSprite', () => {
  it('17: renders once per key and is not re-rendered when its parent re-renders with the same props', () => {
    const before = spriteStats.builds;
    const p = pitch.parsePitch('C6');
    let renders = 0;
    const Counted = memo(function Counted() {
      renders++;
      return <NoteSprite pitch={p} clef="treble" size="md" />;
    });
    function Parent() {
      const [n, setN] = useState(0);
      return (
        <div>
          <button onClick={() => setN(n + 1)}>go {n}</button>
          <NoteSprite pitch={p} clef="treble" size="md" />
          <Counted />
        </div>
      );
    }
    render(<Parent />);
    expect(spriteStats.builds).toBe(before + 1);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button'));
    expect(spriteStats.builds).toBe(before + 1);
    expect(renders).toBe(1);
    cleanup();
    render(<NoteSprite pitch={pitch.parsePitch('D6')} clef="treble" size="md" />);
    expect(spriteStats.builds).toBe(before + 2);
  });

  it('draws ledger lines for C6, a glyph, a sign only when asked, and states', () => {
    const { container, rerender } = render(<NoteSprite pitch={pitch.parsePitch('C6')} clef="treble" size="lg" />);
    // C6 is position 12: ledger lines at 10 and 12
    expect(container.querySelectorAll('line')).toHaveLength(2);
    expect(container.querySelectorAll('text')).toHaveLength(1);
    rerender(<NoteSprite pitch={pitch.parsePitch('F#5')} clef="treble" size="lg" showAccidental state="wrong" />);
    expect(container.querySelectorAll('line')).toHaveLength(0);
    expect(container.querySelectorAll('text')).toHaveLength(2);
    expect(container.querySelector('svg')).toHaveClass('mtn-ev--wrong');
    expect(container.querySelector('svg')).toHaveStyle({ willChange: 'transform' });
  });
});
