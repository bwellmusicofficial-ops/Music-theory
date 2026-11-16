import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Exhibit } from '../schema';
import { ExhibitView, isPassage, keyboardRange } from './exhibit-view';
import { buildLesson } from './test-fixtures';

const audio = vi.hoisted(() => ({
  playUi: vi.fn(),
  unlock: vi.fn(async () => {}),
  load: vi.fn(async () => {}),
  noteOn: vi.fn(),
  noteOff: vi.fn(),
  setMuted: vi.fn(),
  isUnlocked: vi.fn(() => true),
  now: vi.fn(() => 0),
  startMetronome: vi.fn(() => ({ stop: vi.fn(), startTime: 0.1 })),
  playPassage: vi.fn(),
}));
vi.mock('@/audio', () => ({ getAudioEngine: () => audio }));

const passageExhibit = buildLesson().steps.hook.exhibit as Extract<Exhibit, { kind: 'passage' }>;

beforeEach(() => {
  vi.clearAllMocks();
  audio.playPassage.mockImplementation(() => ({ stop: vi.fn(), done: Promise.resolve() }));
});
afterEach(() => vi.unstubAllGlobals());

describe('isPassage and keyboardRange', () => {
  it('checks structure only', () => {
    expect(isPassage(passageExhibit.passage)).toBe(true);
    expect(isPassage(null)).toBe(false);
    expect(isPassage({ bars: [] })).toBe(false);
    expect(isPassage('x')).toBe(false);
  });
  it('falls back to C3..C5 for missing or invalid bounds', () => {
    const d = keyboardRange(undefined);
    expect([d.low.letter, d.low.octave, d.high.letter, d.high.octave]).toEqual(['C', 3, 'C', 5]);
    const bad = keyboardRange({ kind: 'keyboard', highlight: [], low: 'nonsense', high: 'H9' });
    expect(bad.low.octave).toBe(3);
    expect(bad.high.octave).toBe(5);
  });
});

describe('ExhibitView: keyboard', () => {
  it('renders keys for the range and marks highlighted ones, ignoring unparsable strings', () => {
    const { container } = render(
      <ExhibitView exhibit={{ kind: 'keyboard', highlight: ['C4', 'F#4', 'nope'], low: 'C4', high: 'C5' }} />,
    );
    expect(screen.getByRole('button', { name: 'C 4' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'C 3' })).toBeNull();
    expect(container.querySelectorAll('[data-marker="target"]')).toHaveLength(2);
  });
  it('reports interaction when a key is played', () => {
    const onInteract = vi.fn();
    render(<ExhibitView exhibit={{ kind: 'keyboard', highlight: [], low: 'C4', high: 'C5' }} onInteract={onInteract} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'E 4' }), { pointerId: 1, pointerType: 'touch' });
    expect(onInteract).toHaveBeenCalled();
  });
});

describe('ExhibitView: passage', () => {
  it('falls back to a text placeholder without a renderer', () => {
    render(<ExhibitView exhibit={passageExhibit} />);
    expect(screen.getByText('Notation preview unavailable')).toBeInTheDocument();
  });
  it('uses the supplied renderer with passage, tempo and a label', () => {
    const passage = vi.fn(() => <div data-testid="stave" />);
    render(<ExhibitView exhibit={passageExhibit} renderers={{ passage }} label="Hear the tick" />);
    expect(screen.getByTestId('stave')).toBeInTheDocument();
    expect(screen.queryByText('Notation preview unavailable')).toBeNull();
    expect(passage).toHaveBeenCalledWith({ passage: passageExhibit.passage, tempo: 100, ariaLabel: 'Hear the tick' });
  });
  it('shows an error for something that is not a passage and no play button', () => {
    render(<ExhibitView exhibit={{ kind: 'passage', passage: { nope: true } }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('not a valid passage');
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('plays through the audio engine at the exhibit tempo and toggles back when it ends', async () => {
    let finish!: () => void;
    const stop = vi.fn();
    audio.playPassage.mockImplementation(() => ({ stop, done: new Promise<void>((r) => (finish = r)) }));
    const onInteract = vi.fn();
    render(<ExhibitView exhibit={passageExhibit} label="Tune" onInteract={onInteract} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play: Tune' }));
    });
    expect(audio.unlock).toHaveBeenCalled();
    expect(audio.playPassage).toHaveBeenCalledWith(passageExhibit.passage, { bpm: 100 });
    expect(onInteract).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Stop: Tune' })).toHaveAttribute('aria-pressed', 'true');
    await act(async () => finish());
    expect(screen.getByRole('button', { name: 'Play: Tune' })).toBeInTheDocument();
  });
  it('Stop stops playback; unmounting stops it too; default tempo is 80', async () => {
    const stop = vi.fn();
    audio.playPassage.mockImplementation(() => ({ stop, done: new Promise<void>(() => {}) }));
    const exhibit = { kind: 'passage' as const, passage: passageExhibit.passage };
    const { unmount } = render(<ExhibitView exhibit={exhibit} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Play/ }));
    });
    expect(audio.playPassage).toHaveBeenCalledWith(passageExhibit.passage, { bpm: 80 });
    fireEvent.click(screen.getByRole('button', { name: /^Stop/ }));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /^Play/ })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Play/ }));
    });
    unmount();
    expect(stop).toHaveBeenCalledTimes(2);
  });
  it('survives an audio failure', async () => {
    audio.unlock.mockRejectedValueOnce(new Error('blocked'));
    render(<ExhibitView exhibit={passageExhibit} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Play/ }));
    });
    expect(screen.getByRole('button', { name: /^Play/ })).toBeInTheDocument();
  });
});

describe('ExhibitView: audioClip', () => {
  it('shows a caption and a play button that plays and stops the clip', async () => {
    const instances: { play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; src: string; listeners: Record<string, () => void>; currentTime: number }[] = [];
    class FakeAudio {
      play = vi.fn(async () => {});
      pause = vi.fn();
      currentTime = 0;
      listeners: Record<string, () => void> = {};
      constructor(public src: string) {
        instances.push(this);
      }
      addEventListener(type: string, fn: () => void) {
        this.listeners[type] = fn;
      }
    }
    vi.stubGlobal('Audio', FakeAudio);
    render(<ExhibitView exhibit={{ kind: 'audioClip', src: '/audio/x.mp3', caption: 'A clock ticking' }} />);
    expect(screen.getByText('A clock ticking')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play: A clock ticking' }));
    });
    expect(instances[0].src).toBe('/audio/x.mp3');
    expect(instances[0].play).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Stop: A clock ticking' })).toBeInTheDocument();
    act(() => instances[0].listeners.ended());
    expect(screen.getByRole('button', { name: 'Play: A clock ticking' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play: A clock ticking' }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Stop: A clock ticking' }));
    expect(instances[0].pause).toHaveBeenCalled();
    expect(instances).toHaveLength(1);
  });
  it('does not crash when Audio is unavailable', () => {
    vi.stubGlobal('Audio', undefined);
    render(<ExhibitView exhibit={{ kind: 'audioClip', src: '/x.mp3', caption: 'Clip' }} />);
    fireEvent.click(screen.getByRole('button', { name: /^Play/ }));
    expect(screen.getByRole('button', { name: /^Play/ })).toBeInTheDocument();
  });
});

describe('ExhibitView keyboard labels and passage display options', () => {
  const labels = (c: HTMLElement) => c.querySelectorAll('button span[aria-hidden="true"].text-xs').length;
  const keyboard = (extra: object): Exhibit => ({ kind: 'keyboard', highlight: [], low: 'C4', high: 'G4', ...extra }) as Exhibit;

  it('labels the keys by default and not when showLabels is false', () => {
    const on = render(<ExhibitView exhibit={keyboard({})} />);
    expect(labels(on.container)).toBeGreaterThan(0);
    on.unmount();
    const off = render(<ExhibitView exhibit={keyboard({ showLabels: false })} />);
    expect(labels(off.container)).toBe(0);
  });

  it('hands hideClef and hideTime to the passage renderer', () => {
    const calls: { hideClef?: boolean; hideTime?: boolean }[] = [];
    const renderers = { passage: (props: { hideClef?: boolean; hideTime?: boolean }) => (calls.push(props), (<p>S</p>)) };
    render(<ExhibitView exhibit={{ ...passageExhibit, hideClef: true, hideTime: true }} renderers={renderers} />);
    expect(calls.at(-1)).toMatchObject({ hideClef: true, hideTime: true });
  });
});
