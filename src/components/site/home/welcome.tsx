import Link from 'next/link';
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

/** The welcome for someone with no stored progress. */
export function Welcome({ startHref }: { startHref: string }) {
  return (
    <section aria-labelledby="welcome-title" className="relative flex flex-col gap-5 overflow-hidden rounded-3xl border border-border-subtle bg-surface p-6 shadow-lg sm:p-10">
      <span aria-hidden="true" className="absolute -left-16 -top-16 size-64 rounded-full bg-accent opacity-20 blur-3xl" />
      <Bars />
      <div className="relative flex flex-col gap-3">
        <h1 id="welcome-title" className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
          Music theory that clicks.
        </h1>
        <p className="max-w-prose text-lg text-fg-secondary">
          Short, hands-on lessons you can do on your phone: tap, listen and play your way from your first note to Grade 8.
        </p>
      </div>
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link href={startHref} className={buttonClasses('primary', 'lg', 'w-full sm:w-auto')}>
          Start here
          <IconArrowRight width={20} height={20} />
        </Link>
        <Link href="/learn#grade-1" className={buttonClasses('ghost', 'lg', 'w-full border border-border-subtle text-center text-base leading-snug sm:w-auto')}>
          I already know some theory
        </Link>
      </div>
    </section>
  );
}
