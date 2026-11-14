import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { DEFAULT_SETTINGS, type LearnerSettings } from '../contracts';
import { glossaryEntrySchema, lessonSchema } from '../schema';
import { LessonPlayer } from './lesson-player';
import { MemorySink, fixtureGenerators, fixtureRegistry } from './test-fixtures';

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
  playPassage: vi.fn(() => ({ stop: vi.fn(), done: Promise.resolve() })),
}));
vi.mock('@/audio', () => ({ getAudioEngine: () => audio }));

const pad = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock('@/components/rhythm-pad', () => ({
  RhythmPad: (props: { onTap?: (n: number) => void; children?: React.ReactNode } & Record<string, unknown>) => {
    pad.props.push(props);
    return (
      <div data-testid="pad">
        {props.children}
        <button type="button" onClick={() => props.onTap?.(1)}>
          Tap pad
        </button>
      </div>
    );
  },
}));

const root = join(__dirname, '../../..');
const lesson = lessonSchema.parse(
  JSON.parse(readFileSync(join(root, 'content/lessons/1/rhythm-1/g1-rhythm-01-crotchets-and-minims.json'), 'utf8')),
);
const glossary = z.array(glossaryEntrySchema).parse(JSON.parse(readFileSync(join(root, 'content/glossary/1.json'), 'utf8')));

const btn = (name: string | RegExp) => screen.getByRole('button', { name });
const next = (name: string | RegExp = 'Continue') => fireEvent.click(btn(name));

async function mount(settings: Partial<LearnerSettings> = {}) {
  const sink = new MemorySink();
  const onComplete = vi.fn();
  render(
    <LessonPlayer
      lesson={lesson}
      glossary={glossary}
      settings={{ ...DEFAULT_SETTINGS, ...settings }}
      questionTypes={fixtureRegistry()}
      generators={fixtureGenerators}
      progress={sink}
      onExit={vi.fn()}
      onComplete={onComplete}
    />,
  );
  await act(async () => {});
  return { sink, onComplete };
}

beforeEach(() => {
  vi.clearAllMocks();
  pad.props.length = 0;
});

describe('LessonPlayer with the real exemplar lesson', () => {
  it('walks hook to recap and records every attempt', async () => {
    const { sink, onComplete } = await mount();

    // hook
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Crotchets and minims');
    expect(screen.getByText(/First-aiders learn to press on the chest/)).toBeInTheDocument();
    expect(screen.getByText('Stayin\' Alive').tagName).toBe('EM');
    next();

    // explore: rhythm pad in free mode with the exhibit's tempo, exhibit shown above it
    const p = pad.props.at(-1)!;
    expect(p.mode).toBe('free');
    expect(p.bpm).toBe(80);
    expect((p.bars as unknown[]).length).toBe(4);
    expect(p.time).toEqual({ beats: 4, beatUnit: 4 });
    expect(screen.getByTestId('pad')).toContainElement(screen.getByText('Notation preview unavailable'));
    expect(screen.getByTestId('goal')).toHaveTextContent('Tap along with all 8 short notes');
    expect(btn('Continue')).toBeDisabled();
    fireEvent.click(btn('Tap pad'));
    next();

    // name: three cards; links are buttons; the alternative can be revealed
    expect(screen.getByRole('button', { name: 'pulse' })).toBeInTheDocument();
    next();
    fireEvent.click(btn('Explain it another way'));
    expect(screen.getByTestId('name-alternative')).toHaveTextContent('Think of walking');
    next();
    expect(screen.getByRole('button', { name: 'bars' })).toBeInTheDocument();
    next();

    // practice (4 questions: 3 authored, 1 generated)
    for (let i = 1; i <= 4; i++) {
      expect(screen.getByTestId('eyebrow')).toHaveTextContent(`Practice ${i} of 4`);
      fireEvent.click(btn('Right answer'));
      next(/^Continue/);
    }

    // challenge: 8 questions in 90 seconds, pass mark 0.8 => 7 needed
    expect(screen.getByTestId('challenge-rules')).toHaveTextContent('8 questions');
    expect(screen.getByTestId('challenge-rules')).toHaveTextContent('90 seconds');
    expect(screen.getByTestId('challenge-rules')).toHaveTextContent('Get 7 right');
    next('Start');
    expect(screen.getByTestId('countdown')).toHaveTextContent('1:30');
    for (let i = 1; i <= 8; i++) {
      expect(screen.getByTestId('eyebrow')).toHaveTextContent(`Challenge ${i} of 8`);
      fireEvent.click(btn('Right answer'));
      next(i === 8 ? 'See result' : 'Next');
    }
    expect(screen.getByTestId('score')).toHaveTextContent('8 / 8');
    next();

    // recap: four points, plain links
    expect(screen.getByTestId('recap-points').querySelectorAll('li')).toHaveLength(4);
    next('Finish');
    expect(onComplete).toHaveBeenCalledWith({ lessonId: lesson.id, completed: true, bestScore: 1 });

    await act(async () => {});
    expect(sink.attempts).toHaveLength(12);
    expect(sink.attempts.map((a) => a.questionId).slice(0, 4)).toEqual(['p1-tap-the-pulse', 'p2-hear-the-minims', 'p3-fill-the-bar', 'p4-tap-the-rhythm']);
    expect(sink.attempts.find((a) => a.questionId === 'p4-tap-the-rhythm')?.seed).toBeTypeOf('number');
    expect(sink.attempts.find((a) => a.questionId === 'c1-tap-new-rhythm')?.seed).toBeTypeOf('number');
    expect(sink.attempts.find((a) => a.questionId === 'p1-tap-the-pulse')?.type).toBe('tap-rhythm');
    expect(sink.lastSave).toMatchObject({ lessonId: lesson.id, state: 'complete', step: 'recap', bestScore: 1 });
  });

  it('shows US terms from the real glossary, with plural and capital', async () => {
    await mount({ terminology: 'us' });
    next();
    fireEvent.click(btn('Tap pad'));
    next();
    next();
    expect(screen.getByRole('button', { name: 'quarter note' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'half note' })).toBeInTheDocument();
    next();
    expect(screen.getByRole('button', { name: 'measures' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'bar lines' })).toBeInTheDocument(); // no US form: unchanged
    expect(screen.getByRole('button', { name: 'quarter notes' })).toBeInTheDocument();
  });

  it('parses with the default challenge count of 8', () => {
    expect(lesson.steps.challenge.count).toBe(8);
    expect(lesson.steps.challenge.questions.length).toBe(8);
  });
});
