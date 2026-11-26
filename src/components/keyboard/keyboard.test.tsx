import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pitch } from '@/engine/pitch';
import type { Pitch } from '@/engine/types';

const audio = vi.hoisted(() => ({
  unlock: vi.fn(() => Promise.resolve()),
  load: vi.fn(() => Promise.resolve()),
  noteOn: vi.fn(),
  noteOff: vi.fn(),
}));
const getAudioEngine = vi.hoisted(() => vi.fn());
vi.mock('@/audio', () => ({ getAudioEngine }));

import { Keyboard } from './index';

const p = (s: string): Pitch => pitch.parsePitch(s);
const fmt = (x: Pitch) => pitch.formatPitch(x);
const keys = () => screen.getAllByRole('button');
const key = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  vi.clearAllMocks();
  getAudioEngine.mockReturnValue(audio);
});

describe('key layout', () => {
  it.each([
    ['C4', 'B4', 12, 7, 5],
    ['C4', 'C5', 13, 8, 5],
    ['A3', 'D#4', 7, 4, 3],
    ['C#4', 'F#4', 6, 3, 3],
    ['E4', 'E4', 1, 1, 0],
  ])('%s..%s renders %i keys (%i white, %i black)', (lo, hi, total, whites, blacks) => {
    render(<Keyboard low={p(lo)} high={p(hi)} />);
    expect(keys()).toHaveLength(total);
    expect(document.querySelectorAll('[data-key="white"]')).toHaveLength(whites);
    expect(document.querySelectorAll('[data-key="black"]')).toHaveLength(blacks);
  });

  it('orders keys ascending by pitch', () => {
    render(<Keyboard low={p('A3')} high={p('C5')} />);
    const midis = keys().map((k) => Number(k.getAttribute('data-midi')));
    expect(midis).toEqual([...midis].sort((a, b) => a - b));
    expect(midis[0]).toBe(57);
    expect(midis.at(-1)).toBe(72);
  });

  it('swaps a reversed range', () => {
    render(<Keyboard low={p('E4')} high={p('C4')} />);
    expect(keys()).toHaveLength(5);
  });
});

describe('accessible names and labels', () => {
  it('names keys as buttons with sharps spelled out', () => {
    render(<Keyboard low={p('C4')} high={p('C5')} />);
    expect(key('C 4')).toBeInTheDocument();
    expect(key('C sharp 4')).toBeInTheDocument();
    expect(key('F sharp 4')).toBeInTheDocument();
    expect(key('C 5')).toBeInTheDocument();
  });

  it('shows labels on white keys only when asked, with the octave on C', () => {
    const { rerender } = render(<Keyboard low={p('C4')} high={p('E4')} />);
    expect(screen.queryByText('C4')).not.toBeInTheDocument();
    rerender(<Keyboard low={p('C4')} high={p('E4')} showLabels />);
    expect(screen.getByText('C4')).toBeInTheDocument();
    expect(screen.getByText('D')).toBeInTheDocument();
    expect(screen.queryByText('C#')).not.toBeInTheDocument();
  });
});

describe('pointer input', () => {
  it('reports a white key', async () => {
    const onNote = vi.fn();
    render(<Keyboard low={p('C4')} high={p('C5')} onNote={onNote} />);
    await userEvent.click(key('E 4'));
    expect(onNote).toHaveBeenCalledTimes(1);
    expect(fmt(onNote.mock.calls[0][0])).toBe('E4');
  });

  it('reports black keys as sharps', async () => {
    const onNote = vi.fn();
    render(<Keyboard low={p('C4')} high={p('C5')} onNote={onNote} />);
    await userEvent.click(key('A sharp 4'));
    expect(onNote.mock.calls[0][0]).toEqual({ letter: 'A', accidental: 1, octave: 4 });
  });

  it('plays on press and releases on pointer up', () => {
    render(<Keyboard low={p('C4')} high={p('C5')} />);
    fireEvent.pointerDown(key('G 4'), { pointerId: 1, pointerType: 'touch' });
    expect(audio.noteOn).toHaveBeenCalledTimes(1);
    expect(key('G 4')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.pointerUp(key('G 4'), { pointerId: 1, pointerType: 'touch' });
    expect(audio.noteOff).toHaveBeenCalledTimes(1);
    expect(key('G 4')).toHaveAttribute('aria-pressed', 'false');
  });

  it('releases on pointer cancel and on leaving the keyboard', () => {
    render(<Keyboard low={p('C4')} high={p('C5')} />);
    const group = screen.getByRole('group');
    fireEvent.pointerDown(key('C 4'), { pointerId: 1 });
    fireEvent.pointerCancel(key('C 4'), { pointerId: 1 });
    expect(audio.noteOff).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(key('D 4'), { pointerId: 1 });
    fireEvent.pointerLeave(group, { pointerId: 1 });
    expect(audio.noteOff).toHaveBeenCalledTimes(2);
  });

  it('slides across keys (glissando)', () => {
    const onNote = vi.fn();
    render(<Keyboard low={p('C4')} high={p('C5')} onNote={onNote} />);
    fireEvent.pointerDown(key('C 4'), { pointerId: 1 });
    fireEvent.pointerMove(key('D 4'), { pointerId: 1 });
    fireEvent.pointerMove(key('E 4'), { pointerId: 1 });
    expect(onNote.mock.calls.map((c) => fmt(c[0]))).toEqual(['C4', 'D4', 'E4']);
    expect(audio.noteOn).toHaveBeenCalledTimes(3);
    expect(audio.noteOff).toHaveBeenCalledTimes(2);
    expect(key('E 4')).toHaveAttribute('aria-pressed', 'true');
    expect(key('C 4')).toHaveAttribute('aria-pressed', 'false');
  });

  it('ignores pointer movement when nothing is pressed', () => {
    const onNote = vi.fn();
    render(<Keyboard low={p('C4')} high={p('C5')} onNote={onNote} />);
    fireEvent.pointerMove(key('D 4'), { pointerId: 1 });
    expect(onNote).not.toHaveBeenCalled();
  });

  it('supports several pointers at once', () => {
    const onNote = vi.fn();
    render(<Keyboard low={p('C4')} high={p('C5')} onNote={onNote} />);
    fireEvent.pointerDown(key('C 4'), { pointerId: 1 });
    fireEvent.pointerDown(key('E 4'), { pointerId: 2 });
    expect(key('C 4')).toHaveAttribute('aria-pressed', 'true');
    expect(key('E 4')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.pointerUp(key('C 4'), { pointerId: 1 });
    expect(key('C 4')).toHaveAttribute('aria-pressed', 'false');
    expect(key('E 4')).toHaveAttribute('aria-pressed', 'true');
    expect(audio.noteOff).toHaveBeenCalledTimes(1);
  });
});

describe('keyboard access', () => {
  it('is a single tab stop (roving tabindex) starting at middle C', () => {
    render(<Keyboard low={p('A3')} high={p('C5')} />);
    const stops = keys().filter((k) => k.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveAccessibleName('C 4');
  });

  it('starts at the nearest end when middle C is outside the range', () => {
    render(<Keyboard low={p('C5')} high={p('C6')} />);
    expect(keys().find((k) => k.tabIndex === 0)).toHaveAccessibleName('C 5');
  });

  it('moves focus with Left/Right, Home and End, and the tab stop follows', async () => {
    const user = userEvent.setup();
    render(<Keyboard low={p('C4')} high={p('C5')} />);
    await user.tab();
    expect(key('C 4')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(key('C sharp 4')).toHaveFocus();
    expect(key('C sharp 4').tabIndex).toBe(0);
    expect(key('C 4').tabIndex).toBe(-1);
    await user.keyboard('{ArrowRight}{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    expect(key('C 4')).toHaveFocus();
    await user.keyboard('{End}');
    expect(key('C 5')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(key('C 5')).toHaveFocus();
    await user.keyboard('{Home}');
    expect(key('C 4')).toHaveFocus();
  });

  it('moves up to the black key and down to the white key', async () => {
    const user = userEvent.setup();
    render(<Keyboard low={p('C4')} high={p('C5')} />);
    await user.tab();
    await user.keyboard('{ArrowUp}');
    expect(key('C sharp 4')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(key('C 4')).toHaveFocus();
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}'); // E4
    expect(key('E 4')).toHaveFocus();
    await user.keyboard('{ArrowUp}'); // no sharp above E: nearest black is D#
    expect(key('D sharp 4')).toHaveFocus();
  });

  it('plays the focused key with Space and Enter, releasing on key up', async () => {
    const user = userEvent.setup();
    const onNote = vi.fn();
    render(<Keyboard low={p('C4')} high={p('C5')} onNote={onNote} />);
    await user.tab();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    await user.keyboard(' ');
    expect(fmt(onNote.mock.calls[0][0])).toBe('D4');
    expect(audio.noteOn).toHaveBeenCalledTimes(1);
    expect(audio.noteOff).toHaveBeenCalledTimes(1);
    await user.keyboard('{Enter}');
    expect(onNote).toHaveBeenCalledTimes(2);
  });

  it('holds the note while Space is held', async () => {
    const user = userEvent.setup();
    render(<Keyboard low={p('C4')} high={p('C5')} />);
    await user.tab();
    await user.keyboard('[Space>]');
    expect(audio.noteOn).toHaveBeenCalledTimes(1);
    expect(key('C 4')).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('[/Space]');
    expect(audio.noteOff).toHaveBeenCalledTimes(1);
  });

  it('maps computer keys from the C nearest the middle of the range', async () => {
    const user = userEvent.setup();
    const onNote = vi.fn();
    render(<Keyboard low={p('C3')} high={p('C6')} onNote={onNote} />);
    await user.tab();
    await user.keyboard('asdfghjkwetyu');
    expect(onNote.mock.calls.map((c) => fmt(c[0]))).toEqual([
      'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'C#4', 'D#4', 'F#4', 'G#4', 'A#4',
    ]);
  });

  it('ignores computer keys that fall outside the range and modified keys', async () => {
    const user = userEvent.setup();
    const onNote = vi.fn();
    render(<Keyboard low={p('C4')} high={p('E4')} onNote={onNote} />);
    await user.tab();
    await user.keyboard('fgk');
    expect(onNote).not.toHaveBeenCalled();
    await user.keyboard('{Control>}a{/Control}');
    expect(onNote).not.toHaveBeenCalled();
    await user.keyboard('a');
    expect(onNote).toHaveBeenCalledTimes(1);
  });

  it('does not respond to computer keys without focus', async () => {
    const onNote = vi.fn();
    render(<Keyboard low={p('C4')} high={p('C5')} onNote={onNote} />);
    await userEvent.keyboard('a');
    expect(onNote).not.toHaveBeenCalled();
  });

  it('releases held computer keys when focus leaves', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Keyboard low={p('C4')} high={p('C5')} />
        <button>after</button>
      </>,
    );
    await user.tab();
    await user.keyboard('{a>}');
    expect(audio.noteOn).toHaveBeenCalledTimes(1);
    await user.tab();
    expect(audio.noteOff).toHaveBeenCalledTimes(1);
  });
});

describe('highlights', () => {
  const marker = (name: string) => key(name).querySelector('[data-marker]');

  it('renders the three states with a non-colour marker', () => {
    render(
      <Keyboard
        low={p('C4')}
        high={p('C5')}
        highlight={[
          { pitch: p('C4'), state: 'target' },
          { pitch: p('E4'), state: 'correct' },
          { pitch: p('G4'), state: 'wrong' },
        ]}
      />,
    );
    expect(marker('C 4')).toHaveAttribute('data-marker', 'target');
    expect(marker('E 4')).toHaveAttribute('data-marker', 'correct');
    expect(marker('G 4')).toHaveAttribute('data-marker', 'wrong');
    expect(key('E 4').querySelector('svg')).not.toBeNull();
    expect(marker('D 4')).toBeNull();
    expect(key('G 4')).toHaveAttribute('aria-description', 'wrong');
  });

  it('matches by sounding pitch across enharmonic spellings', () => {
    render(
      <Keyboard
        low={p('C4')}
        high={p('C5')}
        highlight={[
          { pitch: p('Db4'), state: 'target' },
          { pitch: p('B#3'), state: 'correct' },
          { pitch: p('Fb4'), state: 'wrong' },
        ]}
      />,
    );
    expect(marker('C sharp 4')).toHaveAttribute('data-marker', 'target');
    expect(marker('C 4')).toHaveAttribute('data-marker', 'correct');
    expect(marker('E 4')).toHaveAttribute('data-marker', 'wrong');
  });

  it('ignores highlights outside the range', () => {
    render(<Keyboard low={p('C4')} high={p('E4')} highlight={[{ pitch: p('C6'), state: 'target' }]} />);
    expect(document.querySelector('[data-marker]')).toBeNull();
  });
});

describe('disabled', () => {
  it('blocks pointer and keyboard input and sound, and dims', async () => {
    const onNote = vi.fn();
    render(<Keyboard low={p('C4')} high={p('C5')} onNote={onNote} disabled />);
    fireEvent.pointerDown(key('C 4'), { pointerId: 1 });
    await userEvent.keyboard('a');
    expect(onNote).not.toHaveBeenCalled();
    expect(audio.noteOn).not.toHaveBeenCalled();
    expect(keys().every((k) => k.hasAttribute('disabled'))).toBe(true);
    expect(screen.getByTestId('keyboard')).toHaveAttribute('data-disabled', 'true');
  });

  it('stops a held note when disabled mid-press', () => {
    const { rerender } = render(<Keyboard low={p('C4')} high={p('C5')} />);
    fireEvent.pointerDown(key('C 4'), { pointerId: 1 });
    rerender(<Keyboard low={p('C4')} high={p('C5')} disabled />);
    expect(audio.noteOff).toHaveBeenCalledTimes(1);
  });
});

describe('audio', () => {
  it('touches no audio on render', () => {
    render(<Keyboard low={p('C4')} high={p('C5')} />);
    expect(getAudioEngine).not.toHaveBeenCalled();
  });

  it('unlocks and loads once, only after the first gesture', () => {
    render(<Keyboard low={p('C4')} high={p('C5')} />);
    expect(audio.unlock).not.toHaveBeenCalled();
    fireEvent.pointerDown(key('C 4'), { pointerId: 1 });
    fireEvent.pointerUp(key('C 4'), { pointerId: 1 });
    fireEvent.pointerDown(key('D 4'), { pointerId: 1 });
    expect(audio.unlock).toHaveBeenCalledTimes(1);
    expect(audio.load).toHaveBeenCalledTimes(1);
    expect(audio.noteOn).toHaveBeenCalledTimes(2);
  });

  it('plays the reported pitch, sharp for black keys', () => {
    render(<Keyboard low={p('C4')} high={p('C5')} />);
    fireEvent.pointerDown(key('F sharp 4'), { pointerId: 1 });
    expect(audio.noteOn).toHaveBeenCalledWith({ letter: 'F', accidental: 1, octave: 4 });
  });

  it('makes no audio calls with sound={false} but still reports notes', async () => {
    const onNote = vi.fn();
    render(<Keyboard low={p('C4')} high={p('C5')} sound={false} onNote={onNote} />);
    fireEvent.pointerDown(key('C 4'), { pointerId: 1 });
    fireEvent.pointerUp(key('C 4'), { pointerId: 1 });
    await userEvent.keyboard('a');
    expect(onNote).toHaveBeenCalled();
    expect(getAudioEngine).not.toHaveBeenCalled();
  });

  it('survives audio failures', () => {
    audio.unlock.mockImplementationOnce(() => Promise.reject(new Error('blocked')));
    audio.noteOn.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const onNote = vi.fn();
    render(<Keyboard low={p('C4')} high={p('C5')} onNote={onNote} />);
    fireEvent.pointerDown(key('C 4'), { pointerId: 1 });
    expect(onNote).toHaveBeenCalledTimes(1);
  });

  it('releases sounding notes on unmount', () => {
    const { unmount } = render(<Keyboard low={p('C4')} high={p('C5')} />);
    fireEvent.pointerDown(key('C 4'), { pointerId: 1 });
    act(() => unmount());
    expect(audio.noteOff).toHaveBeenCalledTimes(1);
  });
});

describe('fit to width and scrolling', () => {
  /** jsdom has no layout: give the scrolling box a width and a scroll position we control. */
  let width = 0;
  let observers: (() => void)[] = [];
  let scrollLeft = 0;
  const scrollTo = vi.fn((opts: ScrollToOptions) => {
    scrollLeft = opts.left ?? 0;
  });

  beforeEach(() => {
    width = 0;
    scrollLeft = 0;
    observers = [];
    scrollTo.mockClear();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          observers.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width });
    Object.defineProperty(HTMLElement.prototype, 'scrollLeft', {
      configurable: true,
      get: () => scrollLeft,
      set: (v: number) => {
        scrollLeft = v;
      },
    });
    HTMLElement.prototype.scrollTo = scrollTo as unknown as HTMLElement['scrollTo'];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // @ts-expect-error: remove the test stubs so other suites see plain jsdom
    delete HTMLElement.prototype.clientWidth;
    // @ts-expect-error: as above
    delete HTMLElement.prototype.scrollLeft;
    // @ts-expect-error: as above
    delete HTMLElement.prototype.scrollTo;
  });

  const resizeTo = (w: number) => {
    width = w;
    act(() => observers.forEach((cb) => cb()));
  };
  const kb = () => screen.getByTestId('keyboard');
  const lower = () => screen.queryByRole('button', { name: 'Show lower keys' });
  const higher = () => screen.queryByRole('button', { name: 'Show higher keys' });

  it('keys fill the width: narrower as the box shrinks, until the minimum', () => {
    width = 600;
    render(<Keyboard low={p('C4')} high={p('C6')} sound={false} />); // 15 white keys
    expect(kb()).toHaveAttribute('data-fit', 'fit');
    expect(kb()).toHaveAttribute('data-key-px', '40.0');
    resizeTo(450);
    expect(kb()).toHaveAttribute('data-key-px', '30.0');
    resizeTo(342);
    expect(kb()).toHaveAttribute('data-key-px', '22.8');
    expect(kb()).toHaveAttribute('data-fit', 'fit');
    expect(lower()).toBeNull();
    expect(higher()).toBeNull();
    // The minimum: 15 keys x 21px = 315px. At exactly that it still fits.
    resizeTo(315);
    expect(kb()).toHaveAttribute('data-key-px', '21.0');
    expect(kb()).toHaveAttribute('data-fit', 'fit');
  });

  it('below the minimum it stops shrinking and offers scroll buttons', () => {
    width = 342;
    render(<Keyboard low={p('C4')} high={p('C6')} sound={false} />);
    expect(lower()).toBeNull();
    resizeTo(280);
    expect(kb()).toHaveAttribute('data-fit', 'scroll');
    expect(kb()).toHaveAttribute('data-key-px', '21.0');
    expect(lower()).toBeInTheDocument();
    expect(higher()).toBeInTheDocument();
    // Growing again removes them.
    resizeTo(400);
    expect(lower()).toBeNull();
    expect(kb()).toHaveAttribute('data-fit', 'fit');
  });

  it('a long range overflows on a phone', () => {
    width = 342;
    render(<Keyboard low={p('C3')} high={p('C6')} sound={false} />); // 22 white keys = 462px
    expect(kb()).toHaveAttribute('data-fit', 'scroll');
    expect(higher()).toBeEnabled();
  });

  it('the buttons are labelled, at least 44px, and disabled at the ends', () => {
    width = 300;
    render(<Keyboard low={p('C3')} high={p('C5')} sound={false} />); // 15 keys = 315px, max scroll 15
    // Opens centred: scrolled to the middle of a 15px overflow
    expect(scrollTo).toHaveBeenCalledWith({ left: 7.5, behavior: 'auto' });
    expect(lower()).toBeEnabled();
    expect(higher()).toBeEnabled();
    expect(lower()!.className).toMatch(/min-h-11/);
    expect(lower()!.className).toMatch(/min-w-11/);
    act(() => {
      scrollLeft = 0;
      fireEvent.scroll(document.querySelector('[data-overflow]')!);
    });
    expect(lower()).toBeDisabled();
    expect(higher()).toBeEnabled();
    act(() => {
      scrollLeft = 15;
      fireEvent.scroll(document.querySelector('[data-overflow]')!);
    });
    expect(lower()).toBeEnabled();
    expect(higher()).toBeDisabled();
  });

  it('the buttons scroll by pointer and by keyboard, and the hint goes after the first use', async () => {
    const user = userEvent.setup();
    width = 342;
    render(<Keyboard low={p('C3')} high={p('C6')} sound={false} />); // content 462, max scroll 120
    const hint = screen.getByTestId('keyboard-scroll-hint');
    expect(hint).toHaveTextContent(/More keys this way/);
    scrollTo.mockClear();
    act(() => {
      scrollLeft = 0;
      fireEvent.scroll(document.querySelector('[data-overflow]')!);
    });
    await user.click(higher()!);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 120, behavior: 'smooth' });
    expect(hint).toBeEmptyDOMElement();
    // Keyboard: Tab to the button, press Enter.
    act(() => {
      scrollLeft = 120;
      fireEvent.scroll(document.querySelector('[data-overflow]')!);
    });
    expect(higher()).toBeDisabled();
    expect(lower()).toBeEnabled();
    lower()!.focus();
    await user.keyboard('{Enter}');
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: 'smooth' });
    // The scroll reaches the start: the button disables itself.
    act(() => {
      scrollLeft = 0;
      fireEvent.scroll(document.querySelector('[data-overflow]')!);
    });
    expect(lower()).toBeDisabled();
    // The button that hit the end handed focus to the other one rather than dropping it.
    expect(higher()).toHaveFocus();
  });

  it('reduced motion scrolls without animation', async () => {
    const user = userEvent.setup();
    document.documentElement.dataset.reducedMotion = 'true';
    try {
      width = 342;
      render(<Keyboard low={p('C3')} high={p('C6')} sound={false} />);
      await user.click(higher()!);
      expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: 'auto' }));
    } finally {
      delete document.documentElement.dataset.reducedMotion;
    }
  });

  it('opens on the highlighted keys, else the middle of the range', () => {
    width = 242; // 22 keys = 462px; max scroll 220
    const view = render(<Keyboard low={p('C3')} high={p('C6')} sound={false} />);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 110, behavior: 'auto' });
    view.unmount();
    scrollTo.mockClear();
    render(
      <Keyboard low={p('C3')} high={p('C6')} sound={false} highlight={[{ pitch: p('C6'), state: 'target' }]} />,
    );
    // Highlight at the far right: scrolled as far right as it goes.
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 220, behavior: 'auto' });
  });

  it('the scroll buttons are not keys: key presses still report notes', async () => {
    const onNote = vi.fn();
    const user = userEvent.setup();
    width = 242;
    render(<Keyboard low={p('C3')} high={p('C6')} sound={false} onNote={onNote} />);
    expect(screen.getAllByRole('button').filter((b) => b.hasAttribute('data-midi'))).toHaveLength(37);
    await user.click(higher()!);
    expect(onNote).not.toHaveBeenCalled();
  });
});
