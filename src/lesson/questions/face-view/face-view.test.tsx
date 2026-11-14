import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Passage } from '@/engine/types';
import { FaceView } from './face-view';

const passage: Passage = {
  clef: 'treble',
  key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
  time: { beats: 4, beatUnit: 4 },
  bars: [{ events: [0, 1, 2, 3].map(() => ({ kind: 'note' as const, pitches: [{ letter: 'B' as const, accidental: 0 as const, octave: 4 }], duration: { value: 'crotchet' as const, dots: 0 as const } })) }],
};

describe('FaceView', () => {
  it('shows text as plain text without markers', () => {
    render(<FaceView face={{ kind: 'text', text: '**Clap** the [[minim|minims]]' }} />);
    expect(screen.getByText('Clap the minims')).toBeInTheDocument();
  });

  it('shows the UK note name for a glyph when no renderer is given', () => {
    render(<FaceView face={{ kind: 'glyph', glyph: { kind: 'note', duration: { value: 'crotchet', dots: 0 } } }} />);
    expect(screen.getByText('crotchet')).toBeInTheDocument();
  });

  it('shows the UK note name with its dots', () => {
    render(<FaceView face={{ kind: 'glyph', glyph: { kind: 'note', duration: { value: 'minim', dots: 1 } } }} />);
    expect(screen.getByText('dotted minim')).toBeInTheDocument();
  });

  it('shows the UK rest name for a rest glyph when no renderer is given', () => {
    render(<FaceView face={{ kind: 'glyph', glyph: { kind: 'rest', duration: { value: 'crotchet', dots: 0 } } }} />);
    expect(screen.getByText('crotchet rest')).toBeInTheDocument();
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

  it('shows the word Notation for a passage when no renderer is given', () => {
    render(<FaceView face={{ kind: 'passage', passage }} />);
    expect(screen.getByText('Notation')).toBeInTheDocument();
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
