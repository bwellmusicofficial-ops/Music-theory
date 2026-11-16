import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installStaveStubs } from '@/components/stave/test-utils';
import { pitch } from '@/engine/pitch';
import type { Bar, Passage, ScoreEvent } from '@/engine/types';
import { CompleteBar } from './complete-bar/component';
import type { CompleteBarAnswer, CompleteBarPayload } from './complete-bar/types';
import { MatchUp } from './match-up/component';
import type { MatchUpAnswer, MatchUpPayload } from './match-up/types';
import { MultipleChoice } from './multiple-choice/component';
import type { MultipleChoiceAnswer, MultipleChoicePayload } from './multiple-choice/types';
import { NoteOnStave } from './note-on-stave/component';
import type { NoteOnStaveAnswer, NoteOnStavePayload } from './note-on-stave/types';
import { drawn, editSurface } from './notation/stave-test-helpers';
import { Ordering } from './ordering/component';
import type { OrderingAnswer, OrderingPayload } from './ordering/types';
import { PlayKeyboard } from './play-keyboard/component';
import type { PlayKeyboardAnswer, PlayKeyboardPayload } from './play-keyboard/types';
import type { Glyph } from './shared';
import { SpotMistake } from './spot-mistake/component';
import type { SpotMistakeAnswer, SpotMistakePayload } from './spot-mistake/types';

// Restoring an answer (`initialAnswer`) and reporting changes (`onAnswerChange`) for the
// question types that need no audio. by-ear and tap-rhythm are covered in their own test files.

vi.mock('@/audio', () => ({
  getAudioEngine: () => ({ noteOn: vi.fn(), noteOff: vi.fn(), isUnlocked: () => true, unlock: async () => {}, load: async () => {} }),
}));
beforeAll(() => installStaveStubs());
afterEach(cleanup);

const B4 = pitch.parsePitch('B4');
const C_MAJOR = { tonic: { letter: 'C' as const, accidental: 0 as const }, mode: 'major' as const };
const props = { terminology: 'uk' as const, locked: false, result: null, onAnswer: () => {} };

describe('multiple-choice', () => {
  const payload: MultipleChoicePayload = {
    options: [
      { id: 'a', face: { kind: 'text', text: 'Minim' }, reason: 'No.' },
      { id: 'b', face: { kind: 'text', text: 'Crotchet' } },
    ],
    correct: 'b',
  };
  it('shows the restored option as selected without marking, and reports changes', async () => {
    const onAnswerChange = vi.fn<(a: MultipleChoiceAnswer | null) => void>();
    render(<MultipleChoice {...props} payload={payload} initialAnswer={{ optionId: 'a' }} onAnswerChange={onAnswerChange} />);
    const minim = screen.getByRole('button', { name: /Minim/ });
    expect(minim).toHaveAttribute('data-state', 'selected');
    expect(minim).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Crotchet/ })).toHaveAttribute('data-state', 'idle');
    expect(onAnswerChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Crotchet/ }));
    expect(onAnswerChange).toHaveBeenCalledWith({ optionId: 'b' });
    expect(screen.getByRole('button', { name: /Minim/ })).toHaveAttribute('data-state', 'idle');
  });
  it('ignores an initial answer that is not an option', () => {
    render(<MultipleChoice {...props} payload={payload} initialAnswer={{ optionId: 'zzz' }} />);
    screen.getAllByRole('button').forEach((b) => expect(b).toHaveAttribute('data-state', 'idle'));
  });
});

describe('match-up', () => {
  const payload: MatchUpPayload = {
    left: [
      { id: 'c', face: { kind: 'text', text: 'Crotchet' }, match: 'one', reason: 'r' },
      { id: 'm', face: { kind: 'text', text: 'Minim' }, match: 'two', reason: 'r' },
      { id: 's', face: { kind: 'text', text: 'Semibreve' }, match: 'four', reason: 'r' },
    ],
    right: [
      { id: 'four', face: { kind: 'text', text: 'Four beats' } },
      { id: 'one', face: { kind: 'text', text: 'One beat' } },
      { id: 'two', face: { kind: 'text', text: 'Two beats' } },
    ],
  };
  const btn = (name: RegExp) => screen.getByRole('button', { name });
  it('restores pairs, reports a complete answer then null when a pair is removed', async () => {
    const onAnswerChange = vi.fn<(a: MatchUpAnswer | null) => void>();
    const initialAnswer = { pairs: { c: 'two', m: 'one', s: 'four' } };
    render(<MatchUp {...props} payload={payload} initialAnswer={initialAnswer} onAnswerChange={onAnswerChange} />);
    expect(btn(/Crotchet/)).toHaveTextContent('Paired with C');
    expect(btn(/Minim/)).toHaveTextContent('Paired with B');
    expect(btn(/Semibreve/)).toHaveTextContent('Paired with A');
    expect(onAnswerChange).not.toHaveBeenCalled();
    await userEvent.click(btn(/Crotchet/));
    expect(onAnswerChange).toHaveBeenLastCalledWith(null);
    await userEvent.click(btn(/Crotchet/));
    await userEvent.click(btn(/One beat/));
    expect(onAnswerChange).toHaveBeenCalledTimes(1);
    await userEvent.click(btn(/Minim/));
    await userEvent.click(btn(/Two beats/));
    expect(onAnswerChange).toHaveBeenLastCalledWith({ pairs: { c: 'one', m: 'two', s: 'four' } });
  });
  it('hideCheck removes the Check button', () => {
    render(<MatchUp {...props} payload={payload} hideCheck />);
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();
  });
});

describe('ordering', () => {
  const payload: OrderingPayload = {
    items: [
      { id: 'minim', face: { kind: 'text', text: 'Minim' } },
      { id: 'semibreve', face: { kind: 'text', text: 'Semibreve' } },
      { id: 'crotchet', face: { kind: 'text', text: 'Crotchet' } },
    ],
    correctOrder: ['crotchet', 'minim', 'semibreve'],
    ends: { first: 'shortest', last: 'longest' },
    reason: 'r',
  };
  const order = () => screen.getAllByRole('listitem').map((r) => r.querySelector('[data-face]')?.textContent);
  it('restores the order, and reports each move', async () => {
    const onAnswerChange = vi.fn<(a: OrderingAnswer | null) => void>();
    render(
      <Ordering {...props} payload={payload} initialAnswer={{ order: ['crotchet', 'minim', 'semibreve'] }} onAnswerChange={onAnswerChange} />,
    );
    expect(order()).toEqual(['Crotchet', 'Minim', 'Semibreve']);
    expect(onAnswerChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getAllByRole('button', { name: /^Move .* down$/ })[0]!);
    expect(onAnswerChange).toHaveBeenCalledWith({ order: ['minim', 'crotchet', 'semibreve'] });
  });
  it('reports nothing until something is moved, and falls back to the start order for a bad answer', async () => {
    const onAnswerChange = vi.fn();
    render(<Ordering {...props} payload={payload} initialAnswer={{ order: ['x'] }} onAnswerChange={onAnswerChange} hideCheck />);
    expect(order()).toEqual(['Minim', 'Semibreve', 'Crotchet']);
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();
    expect(onAnswerChange).not.toHaveBeenCalled();
  });
});

describe('play-keyboard', () => {
  const p = (s: string) => pitch.parsePitch(s);
  const seq: PlayKeyboardPayload = {
    low: p('C4'), high: p('C5'), showLabels: false, targets: [p('C4'), p('D4')], mode: 'sequence', octave: 'exact',
  };
  const chord: PlayKeyboardPayload = { ...seq, targets: [p('C4'), p('E4')], mode: 'together' };
  it('restores played keys (sequence) and reports only when complete', async () => {
    const onAnswerChange = vi.fn<(a: PlayKeyboardAnswer | null) => void>();
    render(<PlayKeyboard {...props} payload={seq} initialAnswer={{ played: [p('C4'), p('D4')] }} onAnswerChange={onAnswerChange} />);
    expect(screen.getByTestId('played-summary')).toHaveTextContent('C4, D4');
    expect(onAnswerChange).not.toHaveBeenCalled();
    // Still changeable: the next key starts the sequence again; one key is incomplete.
    await userEvent.click(screen.getByRole('button', { name: 'E 4' }));
    expect(onAnswerChange).toHaveBeenLastCalledWith(null);
    await userEvent.click(screen.getByRole('button', { name: 'F 4' }));
    expect(onAnswerChange).toHaveBeenLastCalledWith({ played: [p('E4'), p('F4')] });
  });
  it('restores a chord, reports toggles, and Clear reports null', async () => {
    const onAnswerChange = vi.fn<(a: PlayKeyboardAnswer | null) => void>();
    render(<PlayKeyboard {...props} payload={chord} hideCheck initialAnswer={{ played: [p('C4'), p('E4')] }} onAnswerChange={onAnswerChange} />);
    expect(screen.getByTestId('played-summary')).toHaveTextContent('C4, E4');
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'G 4' }));
    expect(onAnswerChange).toHaveBeenLastCalledWith({ played: [p('C4'), p('E4'), p('G4')] });
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onAnswerChange).toHaveBeenLastCalledWith(null);
  });
});

describe('note-on-stave identify', () => {
  const payload: NoteOnStavePayload = { mode: 'identify', clef: 'treble', key: C_MAJOR, pitch: pitch.parsePitch('F#4'), accidentals: true };
  const letter = (l: string) => within(screen.getByRole('group', { name: 'Note name' })).getByRole('button', { name: l });
  const sign = (s: string) => within(screen.getByRole('group', { name: 'Sign' })).getByRole('button', { name: new RegExp(s) });
  it('restores letter and sign as selected, with no marking', async () => {
    render(<NoteOnStave {...props} payload={payload} initialAnswer={{ mode: 'identify', name: pitch.parsePitchClass('F#') }} />);
    expect(letter('F')).toHaveAttribute('aria-pressed', 'true');
    expect(letter('F')).toHaveAttribute('data-state', 'selected');
    expect(sign('Sharp')).toHaveAttribute('aria-pressed', 'true');
    expect(letter('G')).toHaveAttribute('data-state', 'idle');
  });
  it('updates the answer both ways: letter then sign, and sign then letter', async () => {
    const onAnswer = vi.fn();
    const onAnswerChange = vi.fn<(a: NoteOnStaveAnswer | null) => void>();
    render(<NoteOnStave {...props} onAnswer={onAnswer} payload={payload} onAnswerChange={onAnswerChange} />);
    await userEvent.click(letter('F'));
    expect(onAnswerChange).toHaveBeenLastCalledWith({ mode: 'identify', name: { letter: 'F', accidental: 0 } });
    await userEvent.click(sign('Sharp'));
    expect(onAnswerChange).toHaveBeenLastCalledWith({ mode: 'identify', name: { letter: 'F', accidental: 1 } });
    // The stale-answer bug: the sign picked after the letter must also be committed.
    expect(onAnswer).toHaveBeenLastCalledWith({ mode: 'identify', name: { letter: 'F', accidental: 1 } });
    await userEvent.click(sign('Flat'));
    expect(onAnswerChange).toHaveBeenLastCalledWith({ mode: 'identify', name: { letter: 'F', accidental: -1 } });
    await userEvent.click(letter('G'));
    expect(onAnswerChange).toHaveBeenLastCalledWith({ mode: 'identify', name: { letter: 'G', accidental: -1 } });
  });
});

describe('note-on-stave place', () => {
  const payload: NoteOnStavePayload = { mode: 'place', clef: 'treble', key: C_MAJOR, target: pitch.parsePitchClass('G'), accidentals: false };
  it('restores the placed note, and reports moves', async () => {
    const onAnswerChange = vi.fn<(a: NoteOnStaveAnswer | null) => void>();
    const { container } = render(
      <NoteOnStave {...props} payload={payload} hideCheck initialAnswer={{ mode: 'place', pitch: pitch.parsePitch('G4') }} onAnswerChange={onAnswerChange} />,
    );
    await drawn(container);
    expect(container.querySelectorAll('.vf-stavenote')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();
    expect(onAnswerChange).not.toHaveBeenCalled();
    editSurface(container).tapSlot(0, 0, 3);
    await waitFor(() => expect(onAnswerChange).toHaveBeenCalledWith({ mode: 'place', pitch: pitch.parsePitch('A4') }));
  });
});

const note = (value: 'minim' | 'crotchet'): ScoreEvent => ({ kind: 'note', pitches: [B4], duration: { value, dots: 0 } });
const bar = (...events: ScoreEvent[]): Bar => ({ events });
const passage = (...bars: Bar[]): Passage => ({ clef: 'treble', key: C_MAJOR, time: { beats: 4, beatUnit: 4 }, bars });

describe('spot-mistake', () => {
  const payload: SpotMistakePayload = {
    passage: passage(bar(note('minim'), note('minim')), bar(note('minim'), note('crotchet'), note('minim'))),
    select: 'bar',
    mistake: { bar: 1 },
    explanation: 'Bar 2 has 5 beats.',
  };
  it('restores the selected bar as highlighted, and reports a changed selection', async () => {
    const onAnswerChange = vi.fn<(a: SpotMistakeAnswer | null) => void>();
    const { container } = render(<SpotMistake {...props} payload={payload} hideCheck initialAnswer={{ bar: 0 }} onAnswerChange={onAnswerChange} />);
    await drawn(container);
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();
    expect(onAnswerChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('mark-highlight')).toBeInTheDocument();
    // Tapping a note in the other bar changes the selection and reports it.
    const buttons = within(screen.getByRole('group', { name: 'Tap the bar with the mistake' })).getAllByRole('button');
    await userEvent.click(buttons[3]!);
    expect(onAnswerChange).toHaveBeenLastCalledWith({ bar: 1 });
  });
});

describe('complete-bar', () => {
  const g = (value: Glyph['duration']['value']): Glyph => ({ kind: 'note', duration: { value, dots: 0 } });
  const payload: CompleteBarPayload = {
    passage: passage(bar(note('crotchet'), note('crotchet'))),
    barIndex: 0,
    palette: [g('crotchet'), g('minim')],
    fillPitch: B4,
    count: 1,
  };
  it('restores the added symbols into the bar, and reports adding and resetting', async () => {
    const onAnswerChange = vi.fn<(a: CompleteBarAnswer | null) => void>();
    const { container } = render(<CompleteBar {...props} payload={payload} hideCheck initialAnswer={{ added: [g('minim')] }} onAnswerChange={onAnswerChange} />);
    await drawn(container);
    expect(container.querySelectorAll('.vf-stavenote')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull();
    expect(onAnswerChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onAnswerChange).toHaveBeenLastCalledWith(null);
    await waitFor(() => expect(container.querySelectorAll('.vf-stavenote')).toHaveLength(2));
  });
});
