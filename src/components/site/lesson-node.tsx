import Link from 'next/link';
import type { LessonState } from '@/lesson/contracts';
import { Badge } from '@/components/ui';
import { STRAND_NAMES } from '@/components/ui';
import type { Terminology } from '@/engine/types';
import { lessonHref, lessonTitle, STATE_LABELS, type LessonMeta } from '@/progress-view';
import type { NodePosition } from '@/progress-view/map-layout';
import { StateMark } from './state-mark';

export interface LessonNodeProps {
  lesson: LessonMeta;
  /** "Grade 1" or "Start here": part of the accessible name. */
  gradeTitle: string;
  position: NodePosition;
  /** 1-based place in the unit. */
  number: number;
  /** Undefined until progress has loaded. */
  state?: LessonState;
  current: boolean;
  terminology: Terminology;
}

/** The accessible name: "Quavers, Grade 1 rhythm, complete". */
export function nodeName(lesson: LessonMeta, gradeTitle: string, terminology: Terminology, state: LessonState | undefined, current: boolean): string {
  const parts = [lessonTitle(lesson, terminology), `${gradeTitle} ${STRAND_NAMES[lesson.strand].toLowerCase()}`];
  if (state) parts.push(STATE_LABELS[state].toLowerCase());
  if (lesson.status === 'draft') parts.push('draft');
  if (current) parts.push('you are here');
  return parts.join(', ');
}

/** One lesson on the course map: a link made of a round marker and the lesson's title. Nothing is locked. */
export function LessonNode({ lesson, gradeTitle, position, number, state, current, terminology }: LessonNodeProps) {
  const half = 28; // half the marker (size-14)
  return (
    <li className="absolute" style={{ left: `calc(${position.x}% - ${half}px)`, top: position.y - half - 2, maxWidth: `calc(${100 - position.x}% + ${half}px)` }}>
      <Link
        href={lessonHref(lesson)}
        aria-label={nodeName(lesson, gradeTitle, terminology, state, current)}
        aria-current={current ? 'step' : undefined}
        data-current={current || undefined}
        id={current ? 'current-lesson' : undefined}
        className="group -m-1.5 flex items-center gap-3 rounded-2xl p-1.5 hover:bg-surface-raised"
      >
        <span className="relative shrink-0">
          {current ? (
            <span aria-hidden="true" className="absolute -inset-2 rounded-full border-2 border-accent shadow-glow motion-safe:animate-pulse" />
          ) : null}
          <StateMark state={state} strand={lesson.strand} number={number} size="lg" />
        </span>
        <span className="flex min-w-0 flex-col items-start gap-0.5">
          {current ? (
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-extrabold text-on-accent">You are here</span>
          ) : null}
          <span className="text-[0.9375rem] font-bold leading-snug text-fg">{lessonTitle(lesson, terminology)}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-secondary">
            {state ? <span className="font-semibold">{STATE_LABELS[state]}</span> : null}
            {state ? <span aria-hidden="true">·</span> : null}
            <span>{lesson.estimatedMinutes} min</span>
            {lesson.status === 'draft' ? <Badge tone="warning" className="px-2 py-0 text-[0.6875rem]">Draft</Badge> : null}
          </span>
        </span>
      </Link>
    </li>
  );
}
