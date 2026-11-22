'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, Card } from '@/components/ui';
import { BAND_LABEL } from '../engine';
import { marks, percent, plural, shortDate } from '../format';
import { createLocalMockResultSink, type MockResultSink } from '../store';
import { useBestResult } from './use-best-result';

export interface MockListEntry {
  id: string;
  grade: string;
  title: string;
  summary: string;
  minutes: number;
  questionCount: number;
}

function Entry({ entry, sink }: { entry: MockListEntry; sink: MockResultSink }) {
  const { best } = useBestResult(sink, entry.id);
  return (
    <li>
      <Link href={`/mock/${entry.id}`} className="group block rounded-lg">
        <Card raised padding="lg" className="flex flex-col gap-3 group-hover:border-accent">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-muted">Grade {entry.grade}</p>
            <h2 className="mt-1 text-2xl font-extrabold">{entry.title}</h2>
            <p className="mt-2 text-fg-secondary">{entry.summary}</p>
          </div>
          <p className="text-sm text-fg-secondary">
            {plural(entry.questionCount, 'question')}, {plural(entry.minutes, 'minute')}
          </p>
          <p className="text-sm" data-testid={`best-${entry.id}`}>
            {best ? (
              <>
                Best:{' '}
                <strong>
                  {best.total > 0 ? `${marks(best.score * best.total)} out of ${best.total} (${percent(best.score)})` : percent(best.score)}
                </strong>{' '}
                <Badge tone={best.band === 'not-yet' ? 'warning' : 'success'}>{BAND_LABEL[best.band]}</Badge>{' '}
                <span className="text-muted">{shortDate(best.at)}</span>
              </>
            ) : (
              <span className="text-muted">Not attempted yet</span>
            )}
          </p>
          <span aria-hidden="true" className="text-lg font-bold text-accent">
            Go &rarr;
          </span>
        </Card>
      </Link>
    </li>
  );
}

/** The available mock tests, each with its best saved result. */
export function MockList({ entries, sink }: { entries: readonly MockListEntry[]; sink?: MockResultSink }) {
  const [defaultSink] = useState(() => createLocalMockResultSink());
  const used = sink ?? defaultSink;
  if (entries.length === 0) return <p className="text-fg-secondary">No mock tests are available yet.</p>;
  return (
    <ul className="flex flex-col gap-4">
      {entries.map((e) => (
        <Entry key={e.id} entry={e} sink={used} />
      ))}
    </ul>
  );
}
