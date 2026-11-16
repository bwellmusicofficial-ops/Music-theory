import Link from 'next/link';
import { buttonClasses } from '../button-link';

/** Shown instead of the Continue card when every lesson on the path is complete. */
export function FinishedCard() {
  return (
    <section aria-labelledby="finished-title" className="flex flex-col gap-4 rounded-3xl border border-border-subtle bg-surface p-6 shadow-lg">
      <h2 id="finished-title" className="text-2xl font-extrabold tracking-tight">
        Every lesson complete
      </h2>
      <p className="text-fg-secondary">Nicely done. Keep it sharp with a mock test or a game, or revisit any lesson from the course map.</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/mock" className={buttonClasses('primary', 'md')}>
          Try a mock test
        </Link>
        <Link href="/learn" className={buttonClasses('secondary', 'md')}>
          Open the course map
        </Link>
      </div>
    </section>
  );
}
