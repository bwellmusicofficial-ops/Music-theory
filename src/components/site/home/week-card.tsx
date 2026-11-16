import type { ReactNode } from 'react';
import type { Streak, WeekSummary } from '@/progress-view';
import { IconClock, IconFlame, IconSessions } from '../icons';
import { SectionCard } from '../section-card';

function Tile({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-col items-start gap-1 rounded-2xl bg-surface-raised p-3">
      <span aria-hidden="true" className="text-accent">
        {icon}
      </span>
      <p className="text-2xl font-extrabold leading-none tracking-tight">{value}</p>
      <p className="text-xs font-semibold text-fg-secondary">{label}</p>
    </div>
  );
}

/** This week: minutes practised, sessions and the day streak. */
export function WeekCard({ week, streak }: { week: WeekSummary; streak: Streak }) {
  return (
    <SectionCard title="This week">
      <div className="grid grid-cols-3 gap-3">
        <Tile icon={<IconClock width={20} height={20} />} value={String(week.minutes)} label={week.minutes === 1 ? 'minute practised' : 'minutes practised'} />
        <Tile icon={<IconSessions width={20} height={20} />} value={String(week.sessions)} label={week.sessions === 1 ? 'session' : 'sessions'} />
        <Tile icon={<IconFlame width={20} height={20} />} value={String(streak.days)} label={streak.days === 1 ? 'day streak' : 'day streak'} />
      </div>
    </SectionCard>
  );
}
