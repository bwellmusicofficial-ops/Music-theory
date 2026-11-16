import type { ReactNode } from 'react';
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
      <main className="flex flex-1 flex-col">{children}</main>
      <BottomTabBar />
    </>
  );
}
