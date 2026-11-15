import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalMockResultSink } from '../store';
import { MockList } from './mock-list';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

const entry = { id: 'grade-1', grade: '1', title: 'Grade 1 mock test', summary: 'A paper.', minutes: 40, questionCount: 31 };

describe('MockList', () => {
  it('links to each test and says when it has not been attempted', async () => {
    const store = new Map<string, string>();
    const sink = createLocalMockResultSink({ getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as unknown as Storage);
    render(<MockList entries={[entry]} sink={sink} />);
    expect(screen.getByRole('link', { name: /Grade 1 mock test/ })).toHaveAttribute('href', '/mock/grade-1');
    expect(await screen.findByText('Not attempted yet')).toBeInTheDocument();
    expect(screen.getByText(/31 questions, 40 minutes/)).toBeInTheDocument();
  });

  it('shows the best result', async () => {
    const store = new Map<string, string>();
    const sink = createLocalMockResultSink({ getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as unknown as Storage);
    const base = { configId: 'grade-1', seed: 1, timedOut: false, elapsedMs: 1, sections: [], skills: [], total: 31 };
    await sink.save({ ...base, at: '2026-11-01T10:00:00Z', score: 0.5, correct: 16, band: 'not-yet' });
    await sink.save({ ...base, at: '2026-11-02T10:00:00Z', score: 0.9, correct: 28, band: 'distinction' });
    render(<MockList entries={[entry]} sink={sink} />);
    const best = await screen.findByTestId('best-grade-1');
    expect(best).toHaveTextContent('Distinction');
    expect(best).toHaveTextContent('90%');
  });

  it('says so when there are no tests', () => {
    render(<MockList entries={[]} />);
    expect(screen.getByText('No mock tests are available yet.')).toBeInTheDocument();
  });
});
