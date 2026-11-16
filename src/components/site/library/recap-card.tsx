import Link from 'next/link';
import { Badge } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import type { Terminology } from '@/engine/types';
import type { Passage } from '@/engine/types';
import { RichTextView, type GlossarySource } from '@/lesson/player';
import { PassageView } from '@/lesson/questions/notation';
import { gradeTitle, lessonHref, lessonTitle, type OrderedRecap } from '@/progress-view';
import { IconCheck, IconLock } from '../icons';
import { strandColour } from '../strand-colour';
import { LazyMount } from './lazy-mount';

/**
 * A lesson's recap card. Earned cards are full strength. The rest are still
 * readable, but outlined and marked "Finish the lesson to add this card".
 */
export function RecapCard({ row, glossary, terminology }: { row: OrderedRecap; glossary: GlossarySource; terminology: Terminology }) {
  const { lesson, card, earned } = row;
  const colour = strandColour(lesson.strand);
  return (
    <article
      aria-labelledby={`recap-${lesson.id}`}
      data-earned={earned}
      className={cn(
        'relative flex flex-col gap-4 overflow-hidden rounded-3xl p-5 pt-6',
        earned ? 'border border-border-subtle bg-surface shadow-md' : 'border-2 border-dashed border-border bg-bg-raised',
      )}
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5" style={{ background: earned ? colour : 'var(--border-subtle)' }} />
      <div className="flex flex-col gap-1">
        <p className="text-xs font-bold uppercase tracking-wider text-fg-secondary">{gradeTitle(lesson.grade)}</p>
        <h3 id={`recap-${lesson.id}`} className="flex flex-wrap items-center gap-2 text-xl font-extrabold leading-tight">
          {lessonTitle(lesson, terminology)}
          {lesson.status === 'draft' ? <Badge tone="warning">Draft</Badge> : null}
        </h3>
      </div>
      <ul className="flex flex-col gap-2.5 text-fg-secondary">
        {card.points.map((point, i) => (
          <li key={i} className="flex gap-3">
            <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full" style={{ background: colour }} />
            <RichTextView text={point} terminology={terminology} glossary={glossary} className="min-w-0" />
          </li>
        ))}
      </ul>
      {card.passage ? (
        <LazyMount minHeight={140}>
          <PassageView passage={card.passage.passage as Passage} terminology={terminology} hideClef={card.passage.hideClef} hideTime={card.passage.hideTime} />
        </LazyMount>
      ) : null}
      {earned ? (
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-success">
          <IconCheck width={16} height={16} />
          In your library
        </p>
      ) : (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-fg-secondary">
          <span className="inline-flex items-center gap-2">
            <IconLock width={16} height={16} />
            Finish the lesson to add this card
          </span>
          <Link href={lessonHref(lesson)} className="inline-flex min-h-11 items-center text-accent underline underline-offset-4">
            Open lesson
          </Link>
        </p>
      )}
    </article>
  );
}
