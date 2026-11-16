import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bar, Passage } from '@/engine/types';
import { DEFAULT_SETTINGS } from '../contracts';
import type { Lesson } from '../schema';
import { ExploreStage } from './explore-stage';
import type { ExhibitRenderers } from './types';

const fake = vi.hoisted(() => ({ clock: 0, stop: vi.fn() }));
vi.mock('@/audio', () => ({
  getAudioEngine: () => ({
    now: () => fake.clock,
    unlock: async () => {},
    load: async () => {},
    startMetronome: () => ({ stop: fake.stop, startTime: fake.clock + 0.1 }),
    playUi: () => {},
    playPassage: () => ({ stop: () => {}, done: Promise.resolve() }),
  }),
}));

const n = (value: 'crotchet' | 'minim'): Bar['events'][number] => ({
  kind: 'note',
  pitches: [{ letter: 'B', accidental: 0, octave: 4 }],
  duration: { value, dots: 0 },
});
const passage: Passage = {
  clef: 'treble',
  key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
  time: { beats: 4, beatUnit: 4 },
  // Onsets at beats 0, 1, 2 (a minim), then 4, 5, 6 (a minim).
  bars: [
    { events: [n('crotchet'), n('crotchet'), n('minim')] },
    { events: [n('crotchet'), n('crotchet'), n('minim')] },
  ],
};
const step = {
  text: 'Play along.',
  goal: 'Tap along with the click.',
  instrument: 'rhythm-pad',
  exhibit: { kind: 'passage', passage, tempo: 120 },
} as unknown as Lesson['steps']['explore'];

const START = 0.1;
const SPB = 0.5;

function advanceTo(seconds: number) {
  while (fake.clock < seconds - 1e-9) {
    const stepS = Math.min(0.02, seconds - fake.clock);
    fake.clock += stepS;
    act(() => {
      vi.advanceTimersByTime(stepS * 1000);
    });
  }
}

type Live = Parameters<NonNullable<ExhibitRenderers['passage']>>[0];

beforeEach(() => {
  vi.useFakeTimers();
  fake.clock = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  const calls: Live[] = [];
  const renderers: ExhibitRenderers = {
    passage: (props) => {
      calls.push(props);
      return <p>STAVE</p>;
    },
  };
  const onInteract = vi.fn();
  render(
    <ExploreStage
      step={step}
      settings={DEFAULT_SETTINGS}
      glossary={[]}
      renderers={renderers}
      done={false}
      onInteract={onInteract}
      onContinue={() => {}}
      onBack={() => {}}
    />,
  );
  return { last: () => calls.at(-1), onInteract };
}

const tap = () => fireEvent.pointerDown(screen.getByTestId('tap-target'));

describe('ExploreStage play-along (free mode)', () => {
  it('lights each tapped note in order and loops back at the end of the passage', async () => {
    const { last } = setup();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });
    expect(last()?.marks ?? {}).toEqual({});
    const lit = () => Object.keys(last()?.marks ?? {}).sort();
    advanceTo(START + 0.2);
    tap();
    expect(lit()).toEqual(['0:0']);
    expect(last()?.marks?.['0:0']).toBe('lit');
    tap();
    tap();
    expect(lit()).toEqual(['0:0', '0:1', '0:2']);
    tap();
    tap();
    tap();
    expect(lit()).toEqual(['0:0', '0:1', '0:2', '1:0', '1:1', '1:2']);
    tap(); // the seventh tap starts the passage again
    expect(lit()).toEqual(['0:0']);
  });

  it('still opens the gate (onInteract) on a tap', async () => {
    const { onInteract } = setup();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });
    tap();
    expect(onInteract).toHaveBeenCalled();
  });

  it('pulses the note on the current beat with the click', async () => {
    const { last } = setup();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });
    advanceTo(START + 0.03);
    expect(last()?.cursor).toEqual({ bar: 0, event: 0 });
    advanceTo(START + SPB + 0.03);
    expect(last()?.cursor).toEqual({ bar: 0, event: 1 });
    advanceTo(START + 2 * SPB + 0.03);
    expect(last()?.cursor).toEqual({ bar: 0, event: 2 });
    advanceTo(START + 3 * SPB + 0.03); // the minim is still sounding
    expect(last()?.cursor).toEqual({ bar: 0, event: 2 });
    advanceTo(START + 4 * SPB + 0.03);
    expect(last()?.cursor).toEqual({ bar: 1, event: 0 });
    // Eight beats: back to the start.
    advanceTo(START + 8 * SPB + 0.03);
    expect(last()?.cursor).toEqual({ bar: 0, event: 0 });
  });

  it('clears the lit notes when Stop is pressed', async () => {
    const { last } = setup();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });
    advanceTo(START + 0.2);
    tap();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(last()?.marks ?? {}).toEqual({});
    expect(last()?.cursor ?? null).toBeNull();
  });

  it('shows no count-in and no tally: free play is unscored', async () => {
    setup();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });
    advanceTo(START + 0.2);
    tap();
    expect(screen.queryByTestId('count-in-cue')).toBeNull();
    expect(screen.queryByTestId('tally')).toBeNull();
    expect(screen.queryByTestId('verdict-chip')).toBeNull();
  });
});

describe('ExploreStage without notation (showNotation: false)', () => {
  function setupDots(showNotation: boolean | undefined) {
    const calls: Live[] = [];
    render(
      <ExploreStage
        step={{ ...step, showNotation } as unknown as Lesson['steps']['explore']}
        settings={DEFAULT_SETTINGS}
        glossary={[]}
        renderers={{ passage: (props) => (calls.push(props), (<p>STAVE</p>)) }}
        done={false}
        onInteract={() => {}}
        onContinue={() => {}}
        onBack={() => {}}
      />,
    );
    return calls;
  }
  const dots = () => within(screen.getByTestId('pulse-dots')).getAllByRole('listitem');

  it('draws no stave, one dot per onset, and lights them as they are tapped', async () => {
    const calls = setupDots(false);
    expect(calls).toHaveLength(0);
    expect(screen.queryByText('STAVE')).toBeNull();
    expect(dots()).toHaveLength(6);
    expect(dots().every((d) => d.getAttribute('data-lit') === 'false')).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });
    advanceTo(START + 0.2);
    tap();
    tap();
    expect(dots().map((d) => d.getAttribute('data-lit'))).toEqual(['true', 'true', 'false', 'false', 'false', 'false']);
    expect(dots()[1]).toHaveAccessibleName('Pulse 2, tapped');
    for (let i = 0; i < 4; i++) tap();
    expect(dots().every((d) => d.getAttribute('data-lit') === 'true')).toBe(true);
  });

  it('draws the stave and no dots by default and when showNotation is true', () => {
    for (const value of [undefined, true]) {
      cleanup();
      setupDots(value);
      expect(screen.getByText('STAVE')).toBeInTheDocument();
      expect(screen.queryByTestId('pulse-dots')).toBeNull();
    }
  });
});

describe('ExploreStage keyboard labels', () => {
  const keyboardStep = (extra: object) =>
    ({ text: 'Explore.', goal: 'Press a key.', instrument: 'keyboard', exhibit: { kind: 'keyboard', highlight: [], low: 'C4', high: 'G4', ...extra } }) as unknown as Lesson['steps']['explore'];
  const labelled = (s: Lesson['steps']['explore']) => {
    cleanup();
    render(
      <ExploreStage step={s} settings={DEFAULT_SETTINGS} glossary={[]} done={false} onInteract={() => {}} onContinue={() => {}} onBack={() => {}} />,
    );
    return document.querySelectorAll('button span[aria-hidden="true"].text-xs').length;
  };
  it('shows labels by default and hides them with showLabels false on the step or the exhibit', () => {
    const base = labelled(keyboardStep({}));
    expect(base).toBeGreaterThan(0);
    expect(labelled({ ...keyboardStep({}), showLabels: false } as Lesson['steps']['explore'])).toBe(0);
    expect(labelled(keyboardStep({ showLabels: false }))).toBe(0);
    expect(labelled({ ...keyboardStep({ showLabels: false }), showLabels: true } as Lesson['steps']['explore'])).toBe(base);
  });
});
