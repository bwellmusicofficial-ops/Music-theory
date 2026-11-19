import Link from 'next/link';
import type { ReactNode } from 'react';
import { buttonClasses } from '../button-link';
import { IconArrowRight } from '../icons';

/** Decorative bars in the strand colours, like an equaliser. */
function Bars() {
  const bars = [
    ['rhythm', 34],
    ['pitch', 64],
    ['scales-keys', 46],
    ['intervals', 82],
    ['harmony', 52],
    ['composition', 70],
    ['terms', 40],
    ['score-reading', 58],
  ] as const;
  return (
    <div aria-hidden="true" className="flex h-16 items-end gap-2">
      {bars.map(([strand, h], i) => (
        <span
          key={strand}
          className="w-3 rounded-full motion-safe:animate-pulse"
          style={{ height: `${h}%`, background: `var(--strand-${strand})`, animationDelay: `${i * 140}ms`, animationDuration: '2.4s' }}
        />
      ))}
    </div>
  );
}

/**
 * The welcome for someone with no stored progress. The playable demo (`demo`) sits straight under
 * the heading, so it is on the first screen of a phone; the buttons and the pitch follow it. The buttons
 * come before the pitch so that, on a phone, neither of them straddles the fixed tab bar at the fold.
 */
export function Welcome({ startHref, demo, hideActions = false }: { startHref: string; demo?: ReactNode; hideActions?: boolean }) {
  return (
    <section aria-labelledby="welcome-title" className="relative flex flex-col gap-4 sm:gap-5 sm:overflow-hidden sm:rounded-3xl sm:border sm:border-border-subtle sm:bg-surface sm:p-10 sm:shadow-lg">
      <span aria-hidden="true" className="absolute -left-16 -top-16 hidden size-64 sm:block rounded-full bg-accent opacity-20 blur-3xl" />
      <h1 id="welcome-title" className="relative text-[1.375rem] font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
        Music theory that clicks.
      </h1>
      {demo ? <div className="relative">{demo}</div> : null}
      {hideActions ? null : (
      <div data-testid="welcome-actions" className="relative flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link href={startHref} className={buttonClasses('primary', 'lg', 'w-full sm:w-auto')}>
          Start here
          <IconArrowRight width={20} height={20} />
        </Link>
        <Link href="/learn#grade-1" className={buttonClasses('ghost', 'lg', 'w-full border border-border-subtle text-center text-base leading-snug sm:w-auto')}>
          I already know some theory
        </Link>
      </div>
      )}
      <p className="relative max-w-prose px-1 text-lg text-fg-secondary sm:px-0">
        Short, hands-on lessons you can do on your phone: tap, listen and play your way from your first note to Grade 8.
      </p>
      <Bars />
    </section>
  );
}
