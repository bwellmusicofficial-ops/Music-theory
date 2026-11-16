import type { ReactNode } from 'react';
import Link from 'next/link';
import { BottomTabBar, SiteHeader } from '@/components/site/site-header';

/**
 * Pages that show the site header: home, learn, library, games, mock tests and
 * settings. Lessons have their own header. On phones the five links sit in a
 * bottom tab bar (sticky, after the page) and the top bar carries the name only.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col outline-none">{children}</main>
      <footer className="border-t border-border-subtle">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 text-sm text-fg-secondary">
          <span>Music Theory Now</span>
          <Link href="/accessibility" className="inline-flex min-h-11 items-center rounded-md px-2 font-semibold underline underline-offset-2">
            Accessibility
          </Link>
        </div>
      </footer>
      <BottomTabBar />
    </>
  );
}
