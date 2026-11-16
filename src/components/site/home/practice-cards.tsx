import Link from 'next/link';
import { GAMES } from '../games';
import { IconArrowRight, IconGames, IconMock } from '../icons';
import { percent } from '@/mock/format';
import { BAND_LABEL } from '@/mock/engine';
import type { Bests } from '@/progress-view/hooks';

function Card({ href, icon, title, children }: { href: string; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="group flex min-w-0 flex-col items-start gap-3 min-[240px]:flex-row rounded-3xl border border-border-subtle bg-surface p-4 sm:gap-4 sm:p-5 shadow-md hover:-translate-y-0.5 hover:border-border hover:shadow-lg">
      <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-surface-raised text-accent">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1 [overflow-wrap:anywhere]">
        <span className="flex flex-wrap items-center justify-between gap-x-2 text-xl font-extrabold tracking-tight">
          {title}
          <IconArrowRight width={20} height={20} className="text-fg-secondary group-hover:text-fg" />
        </span>
        <span className="text-sm text-fg-secondary">{children}</span>
      </span>
    </Link>
  );
}

/** Cards for the games and the mock tests, with personal bests where stored. */
export function PracticeCards({ bests }: { bests: Bests }) {
  const withBest = GAMES.filter((g) => bests.games[g.id] !== undefined);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card href="/games" icon={<IconGames width={24} height={24} />} title="Games">
        {bests.loaded && withBest.length > 0 ? (
          <span className="flex flex-col">
            {withBest.map((g) => (
              <span key={g.id}>
                {g.name}: best <strong className="text-fg">{bests.games[g.id]!.toLocaleString('en-GB')}</strong>
              </span>
            ))}
          </span>
        ) : (
          'Quick rounds that sharpen your note reading and terms.'
        )}
      </Card>
      <Card href="/mock" icon={<IconMock width={24} height={24} />} title="Mock tests">
        {bests.loaded && bests.mock ? (
          <span>
            Best: <strong className="text-fg">{percent(bests.mock.score)}</strong>, {BAND_LABEL[bests.mock.band]}
          </span>
        ) : (
          'Timed practice papers in the style of the exam.'
        )}
      </Card>
    </div>
  );
}
