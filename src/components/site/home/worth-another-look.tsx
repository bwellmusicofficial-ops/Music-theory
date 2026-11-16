import Link from 'next/link';
import type { Terminology } from '@/engine/types';
import { lessonHref, lessonTitle, type WeakSkill } from '@/progress-view';
import { IconArrowRight } from '../icons';
import { SectionCard } from '../section-card';

/** Up to three skills with the lowest recent accuracy, each linking to a lesson that teaches it. */
export function WorthAnotherLook({ skills, terminology }: { skills: readonly WeakSkill[]; terminology: Terminology }) {
  if (skills.length === 0) return null;
  return (
    <SectionCard title="Worth another look">
      <ul className="flex flex-col gap-2">
        {skills.map((s) => {
          const lesson = s.lessons[0]!;
          return (
            <li key={s.skill}>
              <Link href={lessonHref(lesson)} className="group flex items-center gap-3 rounded-2xl bg-surface-raised p-3 hover:bg-border-subtle">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-bold">{s.label}</span>
                  <span className="text-sm text-fg-secondary">
                    {Math.round(s.accuracy * 100)}% right lately. Revisit {lessonTitle(lesson, terminology)}
                  </span>
                </span>
                <IconArrowRight width={20} height={20} className="shrink-0 text-fg-secondary group-hover:text-fg" />
              </Link>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
