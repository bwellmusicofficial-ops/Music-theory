import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { installStaveStubs } from '@/components/stave/test-utils';
import { DEFAULT_SETTINGS } from '@/lesson/contracts';
import { LessonContextProvider } from '@/lesson/player';
import type { GlossaryEntry } from '@/lesson/schema';
import { drawn } from '@/lesson/questions/notation/stave-test-helpers';
import type { Passage } from '@/engine/types';
import { FaceView } from './face-view';

const passage: Passage = {
  clef: 'treble',
  key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
  time: { beats: 4, beatUnit: 4 },
  bars: [{ events: [0, 1, 2, 3].map(() => ({ kind: 'note' as const, pitches: [{ letter: 'B' as const, accidental: 0 as const, octave: 4 }], duration: { value: 'crotchet' as const, dots: 0 as const } })) }],
};

beforeAll(() => installStaveStubs());

const crotchetEntry: GlossaryEntry = {
  id: 'crotchet',
  term: 'crotchet',
  us: 'quarter note',
  language: 'en',
  definition: 'A note worth 1 beat.',
  grade: '1',
  strand: 'rhythm',
};

describe('FaceView', () => {
  it('shows text as plain text without markers', () => {
    render(<FaceView face={{ kind: 'text', text: '**Clap** the [[minim|minims]]' }} />);
    expect(screen.getByText('Clap the minims')).toBeInTheDocument();
  });

  it('draws a glyph as notation named with the UK note name by default', () => {
    render(<FaceView face={{ kind: 'glyph', glyph: { kind: 'note', duration: { value: 'crotchet', dots: 0 } } }} />);
    expect(screen.getByRole('img', { name: 'crotchet' })).toHaveAttribute('data-glyph', 'note');
  });

  it('names a dotted glyph with its dots', () => {
    render(<FaceView face={{ kind: 'glyph', glyph: { kind: 'note', duration: { value: 'minim', dots: 1 } } }} />);
    expect(screen.getByRole('img', { name: 'dotted minim' })).toBeInTheDocument();
  });

  it('draws a rest glyph as notation by default', () => {
    render(<FaceView face={{ kind: 'glyph', glyph: { kind: 'rest', duration: { value: 'crotchet', dots: 0 } } }} />);
    expect(screen.getByRole('img', { name: 'crotchet rest' })).toHaveAttribute('data-glyph', 'rest');
  });

  it('names a glyph in US terms inside a player set to US', () => {
    render(
      <LessonContextProvider settings={{ ...DEFAULT_SETTINGS, terminology: 'us' }} glossary={[]}>
        <FaceView face={{ kind: 'glyph', glyph: { kind: 'note', duration: { value: 'crotchet', dots: 0 } } }} />
      </LessonContextProvider>,
    );
    expect(screen.getByRole('img', { name: 'quarter note' })).toBeInTheDocument();
  });

  it('renders text with bold and the US swap inside a player, with glossary links as plain text', () => {
    const { container } = render(
      <LessonContextProvider settings={{ ...DEFAULT_SETTINGS, terminology: 'us' }} glossary={[crotchetEntry]}>
        <FaceView face={{ kind: 'text', text: '**Clap** the [[crotchet|crotchets]]' }} />
      </LessonContextProvider>,
    );
    expect(container).toHaveTextContent('Clap the quarter notes');
    expect(container.querySelector('strong')).toHaveTextContent('Clap');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('uses renderGlyph for a glyph when it is given', () => {
    render(
      <FaceView
        face={{ kind: 'glyph', glyph: { kind: 'note', duration: { value: 'minim', dots: 0 } } }}
        renderGlyph={(glyph) => <span>custom {glyph.duration.value}</span>}
      />,
    );
    expect(screen.getByText('custom minim')).toBeInTheDocument();
    expect(screen.queryByText('minim')).not.toBeInTheDocument();
  });

  it('draws a passage as a read-only stave by default', async () => {
    const { container } = render(<FaceView face={{ kind: 'passage', passage }} />);
    await drawn(container);
    expect(screen.getByRole('img', { name: '1 bar of music in 4/4, treble clef' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /play/i })).toBeNull();
  });

  it('uses renderPassage for a passage when it is given', () => {
    render(
      <FaceView
        face={{ kind: 'passage', passage }}
        renderPassage={(received) => <span>stave with {received.bars.length} bar</span>}
      />,
    );
    expect(screen.getByText('stave with 1 bar')).toBeInTheDocument();
    expect(screen.queryByText('Notation')).not.toBeInTheDocument();
  });
});
