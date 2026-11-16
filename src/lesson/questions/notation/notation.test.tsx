import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installStaveStubs } from '@/components/stave/test-utils';
import { pitch } from '@/engine/pitch';
import type { Passage } from '@/engine/types';
import { FaceView } from '@/lesson/questions/face-view';
import { drawn } from './stave-test-helpers';
import { GlyphView } from './glyph-view';
import { PassageView, passageLabel } from './passage-view';
import { glyphRenderer, passageExhibitRenderer, passageRenderer, renderGlyph, renderPassage } from './render';

const audio = vi.hoisted(() => {
  const state: { onEvent?: (bar: number, event: number) => void; resolve: () => void } = { resolve: () => {} };
  return {
    state,
    stop: vi.fn(),
    playPassage: vi.fn(),
    isUnlocked: () => true,
    unlock: async () => {},
    load: async () => {},
  };
});
vi.mock('@/audio', () => ({ getAudioEngine: () => audio }));

beforeAll(() => installStaveStubs());
beforeEach(() => {
  audio.stop.mockClear();
  audio.playPassage.mockReset();
  audio.playPassage.mockImplementation((_passage: Passage, options: { onEvent?: (bar: number, event: number) => void }) => {
    audio.state.onEvent = options.onEvent;
    return {
      stop: audio.stop,
      done: new Promise<void>((resolve) => {
        audio.state.resolve = resolve;
      }),
    };
  });
});
afterEach(cleanup);

const B4 = pitch.parsePitch('B4');
const twoBars: Passage = {
  clef: 'treble',
  key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
  time: { beats: 4, beatUnit: 4 },
  bars: [
    { events: [{ kind: 'note', pitches: [B4], duration: { value: 'minim', dots: 0 } }, { kind: 'note', pitches: [B4], duration: { value: 'minim', dots: 0 } }] },
    { events: [{ kind: 'note', pitches: [B4], duration: { value: 'semibreve', dots: 0 } }] },
  ],
};

describe('GlyphView', () => {
  it.each([
    [{ kind: 'note', duration: { value: 'crotchet', dots: 0 } }, 'crotchet'],
    [{ kind: 'note', duration: { value: 'minim', dots: 1 } }, 'dotted minim'],
    [{ kind: 'note', duration: { value: 'semibreve', dots: 0 } }, 'semibreve'],
    [{ kind: 'rest', duration: { value: 'quaver', dots: 0 } }, 'quaver rest'],
    [{ kind: 'rest', duration: { value: 'minim', dots: 2 } }, 'double-dotted minim rest'],
  ] as const)('is named with the engine name (uk): %j', (glyph, name) => {
    render(<GlyphView glyph={glyph} />);
    expect(screen.getByRole('img', { name })).toBeInTheDocument();
  });

  it('uses US names when asked', () => {
    render(<GlyphView glyph={{ kind: 'note', duration: { value: 'crotchet', dots: 0 } }} terminology="us" />);
    expect(screen.getByRole('img', { name: 'quarter note' })).toBeInTheDocument();
    cleanup();
    render(<GlyphView glyph={{ kind: 'rest', duration: { value: 'minim', dots: 0 } }} terminology="us" />);
    expect(screen.getByRole('img', { name: 'half rest' })).toBeInTheDocument();
  });

  it('draws a Bravura symbol, one augmentation dot per dot, and no stave', async () => {
    const { container } = render(<GlyphView glyph={{ kind: 'note', duration: { value: 'minim', dots: 2 } }} />);
    const texts = container.querySelectorAll('svg text');
    expect(texts).toHaveLength(3);
    texts.forEach((t) => expect(t.getAttribute('font-family')).toBe('Bravura'));
    expect(container.querySelector('line, .vf-stave')).toBeNull();
    // Hidden until the font is ready, then shown.
    await waitFor(() => expect(container.querySelector('svg')).toHaveStyle({ opacity: '1' }));
  });

  it('uses different code points for different values and for notes and rests', () => {
    const symbol = (kind: 'note' | 'rest', value: 'crotchet' | 'minim') => {
      const { container, unmount } = render(<GlyphView glyph={{ kind, duration: { value, dots: 0 } }} />);
      const text = container.querySelector('svg text')!.textContent;
      unmount();
      return text;
    };
    const all = [symbol('note', 'crotchet'), symbol('note', 'minim'), symbol('rest', 'crotchet'), symbol('rest', 'minim')];
    expect(new Set(all).size).toBe(4);
    all.forEach((s) => expect(s!.length).toBeGreaterThan(0));
  });
});

describe('PassageView', () => {
  it('draws a read-only stave with a plain label that gives nothing away', async () => {
    const { container } = render(<PassageView passage={twoBars} />);
    await drawn(container);
    expect(screen.getByRole('img', { name: '2 bars of music in 4/4, treble clef' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('builds the label in US terms and for one bar', () => {
    expect(passageLabel(twoBars, 'us')).toBe('2 measures of music in 4/4, treble clef');
    expect(passageLabel({ ...twoBars, bars: [twoBars.bars[0]!], clef: 'bass' })).toBe('1 bar of music in 4/4, bass clef');
  });

  it('uses the label it is given', async () => {
    const { container } = render(<PassageView passage={twoBars} ariaLabel="The tune" />);
    await drawn(container);
    expect(screen.getByRole('img', { name: 'The tune' })).toBeInTheDocument();
  });

  it('has a play button only when playable, and plays at the bpm with a cursor that follows the events', async () => {
    const { container } = render(<PassageView passage={twoBars} playable bpm={100} />);
    await drawn(container);
    await userEvent.click(screen.getByRole('button', { name: 'Play the music' }));
    await waitFor(() => expect(audio.playPassage).toHaveBeenCalledTimes(1));
    expect(audio.playPassage.mock.calls[0]![0]).toBe(twoBars);
    expect(audio.playPassage.mock.calls[0]![1]).toMatchObject({ bpm: 100 });
    await act(async () => audio.state.onEvent?.(1, 0));
    await waitFor(() => expect(container.querySelectorAll('.vf-stavenote')[2]).toHaveClass('mtn-ev--playing'));
    await act(async () => audio.state.onEvent?.(0, 1));
    await waitFor(() => expect(container.querySelectorAll('.vf-stavenote')[1]).toHaveClass('mtn-ev--playing'));
    expect(container.querySelectorAll('.vf-stavenote.mtn-ev--playing')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Stop the music' }));
    expect(audio.stop).toHaveBeenCalled();
    await waitFor(() => expect(container.querySelector('.mtn-ev--playing')).toBeNull());
  });

  it('clears the cursor when the passage ends', async () => {
    const { container } = render(<PassageView passage={twoBars} playable />);
    await drawn(container);
    await userEvent.click(screen.getByRole('button', { name: 'Play the music' }));
    await waitFor(() => expect(audio.playPassage).toHaveBeenCalled());
    await act(async () => audio.state.onEvent?.(0, 0));
    await act(async () => audio.state.resolve());
    await waitFor(() => expect(container.querySelector('.mtn-ev--playing')).toBeNull());
    expect(screen.getByRole('button', { name: 'Play the music' })).toBeInTheDocument();
  });

  it('survives audio that fails to load', async () => {
    audio.playPassage.mockImplementation(() => {
      throw new Error('no audio');
    });
    const { container } = render(<PassageView passage={twoBars} playable />);
    await drawn(container);
    await userEvent.click(screen.getByRole('button', { name: 'Play the music' }));
    expect(await screen.findByRole('button', { name: 'Play the music' })).toBeInTheDocument();
  });
});

describe('renderers', () => {
  it('renderGlyph and renderPassage plug into FaceView', async () => {
    const { container } = render(
      <>
        <FaceView face={{ kind: 'glyph', glyph: { kind: 'note', duration: { value: 'minim', dots: 0 } } }} renderGlyph={renderGlyph} />
        <FaceView face={{ kind: 'passage', passage: twoBars }} renderPassage={renderPassage} />
      </>,
    );
    expect(screen.getByRole('img', { name: 'minim' })).toBeInTheDocument();
    await drawn(container);
    expect(screen.getByRole('img', { name: '2 bars of music in 4/4, treble clef' })).toBeInTheDocument();
    // A face must never be playable: it could give the answer away.
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('glyphRenderer and passageRenderer follow the terminology', async () => {
    const { container } = render(
      <>
        {glyphRenderer('us')({ kind: 'note', duration: { value: 'minim', dots: 0 } })}
        {passageRenderer('us')(twoBars)}
      </>,
    );
    expect(screen.getByRole('img', { name: 'half note' })).toBeInTheDocument();
    await drawn(container);
    expect(screen.getByRole('img', { name: '2 measures of music in 4/4, treble clef' })).toBeInTheDocument();
  });

  it('passageExhibitRenderer draws the exhibit with the label it is given and no play button of its own', async () => {
    const { container } = render(<>{passageExhibitRenderer({ passage: twoBars, tempo: 80, ariaLabel: 'Two minims' })}</>);
    await drawn(container);
    expect(screen.getByRole('img', { name: 'Two minims' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('PassageView: hideClef and hideTime', () => {
  const high = pitch.parsePitch('G5');
  const low = pitch.parsePitch('C4');
  const spread: Passage = {
    clef: 'treble',
    key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
    time: { beats: 4, beatUnit: 4 },
    bars: [
      {
        events: [
          { kind: 'note', pitches: [high], duration: { value: 'minim', dots: 0 } },
          { kind: 'note', pitches: [low], duration: { value: 'minim', dots: 0 } },
        ],
      },
    ],
  };
  const headYs = (c: HTMLElement) => Array.from(c.querySelectorAll('.vf-notehead text')).map((e) => e.getAttribute('y'));

  it('draws the clef and time signature by default', async () => {
    const { container } = render(<PassageView passage={spread} />);
    await drawn(container);
    expect(container.querySelectorAll('.vf-clef')).toHaveLength(1);
    expect(container.querySelectorAll('.vf-timesignature')).toHaveLength(1);
  });

  it('hides the clef and keeps every note exactly where a treble clef puts it', async () => {
    const shown = render(<PassageView passage={spread} />);
    await drawn(shown.container);
    const before = headYs(shown.container);
    cleanup();
    const { container } = render(<PassageView passage={spread} hideClef />);
    await drawn(container);
    expect(container.querySelectorAll('.vf-clef')).toHaveLength(0);
    expect(container.querySelectorAll('.vf-timesignature')).toHaveLength(1);
    expect(headYs(container)).toEqual(before);
    expect(before[0]).not.toEqual(before[1]);
  });

  it('hides the time signature on its own, and both together', async () => {
    const a = render(<PassageView passage={spread} hideTime />);
    await drawn(a.container);
    expect(a.container.querySelectorAll('.vf-clef')).toHaveLength(1);
    expect(a.container.querySelectorAll('.vf-timesignature')).toHaveLength(0);
    cleanup();
    const b = render(<PassageView passage={spread} hideClef hideTime />);
    await drawn(b.container);
    expect(b.container.querySelectorAll('.vf-clef, .vf-timesignature')).toHaveLength(0);
  });

  it('passes the flags through a passage face and the exhibit renderer', async () => {
    const face = render(<FaceView face={{ kind: 'passage', passage: spread, hideClef: true, hideTime: true }} />);
    await drawn(face.container);
    expect(face.container.querySelectorAll('.vf-clef, .vf-timesignature')).toHaveLength(0);
    cleanup();
    const ex = render(<>{passageExhibitRenderer({ passage: spread, ariaLabel: 'x', hideClef: true })}</>);
    await drawn(ex.container);
    expect(ex.container.querySelectorAll('.vf-clef')).toHaveLength(0);
  });
});
