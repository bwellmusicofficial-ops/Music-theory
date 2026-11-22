'use client';

import { Badge, Button, Card } from '@/components/ui';
import { BAND_LABEL } from '../engine';
import { duration, marks, percent, plural, shortDate } from '../format';
import { itemQuestionCount, type MockConfig } from '../schema';
import type { MockAttempt } from '../store';

export interface IntroScreenProps {
  config: MockConfig;
  untimed: boolean;
  best: MockAttempt | null;
  questionCount: number;
  onStart: () => void;
}

export function IntroScreen({ config, untimed, best, questionCount, onStart }: IntroScreenProps) {
  return (
    <div className="flex flex-1 flex-col gap-6 py-6" data-testid="mock-intro">
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-muted">Grade {config.grade} practice paper</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{config.title}</h1>
        <p className="mt-3 text-lg text-fg-secondary">{config.summary}</p>
      </div>

      <ul className="flex flex-col gap-2 text-lg" data-testid="mock-facts">
        <li>
          <strong>{questionCount}</strong> questions
        </li>
        <li>
          {untimed ? (
            <>
              <strong>No clock:</strong> untimed mode is on in your settings
            </>
          ) : (
            <>
              <strong>{plural(config.minutes, 'minute')}</strong> allowed, with a countdown
            </>
          )}
        </li>
        <li>
          Pass mark <strong>{percent(config.passMark)}</strong>, merit {percent(config.meritMark)}, distinction{' '}
          {percent(config.distinctionMark)}
        </li>
      </ul>

      <Card as="section" aria-labelledby="mock-covers">
        <h2 id="mock-covers" className="text-lg font-bold">
          What it covers
        </h2>
        <ul className="mt-2 flex flex-col gap-1 text-fg-secondary">
          {config.sections.map((s) => (
            <li key={s.id} className="flex justify-between gap-4">
              <span>{s.title}</span>
              <span className="tabular-nums">{plural(s.items.reduce((n, i) => n + itemQuestionCount(i), 0), 'question')}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card as="section" aria-labelledby="mock-rules">
        <h2 id="mock-rules" className="text-lg font-bold">
          How it works
        </h2>
        <ul className="mt-2 list-disc pl-5 text-fg-secondary">
          <li>
            <strong className="text-fg">There is no feedback until the end.</strong> You will not be told if an answer
            is right while you work.
          </li>
          <li>Move between questions freely and change an answer any time before you finish.</li>
          <li>Flag a question to come back to it. Unanswered questions count as wrong.</li>
          <li>This is practice. It is not an official exam and has no connection with any exam board.</li>
        </ul>
      </Card>

      {best ? (
        <p className="text-fg-secondary" data-testid="mock-best">
          Your best so far:{' '}
          <strong className="text-fg">
            {best.total > 0 ? `${marks(best.score * best.total)} out of ${best.total} (${percent(best.score)})` : percent(best.score)}
          </strong>{' '}
          <Badge tone={best.band === 'not-yet' ? 'warning' : 'success'}>{BAND_LABEL[best.band]}</Badge>{' '}
          <span className="text-sm">on {shortDate(best.at)}</span>
        </p>
      ) : null}

      <div className="mt-auto flex flex-col gap-3 pb-4">
        <Button size="lg" onClick={onStart} disabled={questionCount === 0}>
          Start the test
        </Button>
        {untimed ? null : (
          <p className="text-center text-sm text-muted">The clock starts when you press Start ({duration(config.minutes * 60_000)}).</p>
        )}
      </div>
    </div>
  );
}
