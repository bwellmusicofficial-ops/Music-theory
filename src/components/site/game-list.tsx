'use client';

import Link from 'next/link';
import { STRAND_NAMES } from '@/components/ui';
import { useBests } from '@/progress-view/hooks';
import { GAMES, type GameInfo } from './games';
import { IconArrowRight } from './icons';
import { PageContainer, PageTitle } from './page-container';
import { strandColour } from './strand-colour';

/** The games index: one card per game in `games.ts`, with the personal best where there is one. */
export function GameList({ games = GAMES }: { games?: readonly GameInfo[] }) {
  const bests = useBests(games);
  return (
    <PageContainer width="lg">
      <PageTitle title="Games" eyebrow="Practice">
        Quick rounds that sharpen what you learn in the lessons.
      </PageTitle>
      {games.length === 0 ? (
        <p className="rounded-2xl border border-border-subtle bg-surface p-5 text-fg-secondary">No games are available yet. Check back soon.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {games.map((game) => {
            const best = bests.games[game.id];
            const colour = strandColour(game.strand);
            return (
              <li key={game.id}>
                <Link
                  href={game.href}
                  className="group relative flex h-full flex-col gap-3 overflow-hidden rounded-3xl border border-border-subtle p-6 shadow-md hover:-translate-y-0.5 hover:border-border hover:shadow-lg"
                  style={{ background: `linear-gradient(150deg, color-mix(in srgb, ${colour} 24%, var(--surface)), var(--surface) 70%)` }}
                >
                  <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: colour }}>
                    {STRAND_NAMES[game.strand]}
                  </span>
                  <span className="text-2xl font-extrabold tracking-tight">{game.name}</span>
                  <span className="text-fg-secondary">{game.description}</span>
                  <span className="mt-auto flex items-center justify-between pt-2 text-sm font-semibold">
                    <span className="text-fg-secondary">
                      {bests.loaded && best !== undefined ? (
                        <>
                          Personal best <strong className="text-fg">{best.toLocaleString('en-GB')}</strong>
                        </>
                      ) : null}
                    </span>
                    <span className="inline-flex items-center gap-1 text-accent">
                      Play <IconArrowRight width={18} height={18} />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}
