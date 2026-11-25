'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, SVGProps } from 'react';
import { AccountStatus } from '@/accounts/ui/account-status';
import { cn } from '@/components/ui/cn';
import { IconGames, IconLearn, IconLibrary, IconMock, IconSettings } from './icons';
import { isCurrent, isImmersive, NAV_ITEMS, type NavItem } from './nav-items';

/**
 * The navigation links do not prefetch. On a production build `<Link>` fetches the code of every route it points
 * to as soon as it is on screen, and the bar is on every page: a visitor reading the privacy page was downloading
 * the home page's lesson player, the library and the games (about 160 KB gzipped) before tapping anything. The
 * code is fetched when a link is tapped instead; it is static, cached for a year and about 100 KB gzipped per
 * route. Links in a page's own content (start a lesson, continue) still prefetch.
 */
const ICONS: Record<NavItem['icon'], ComponentType<SVGProps<SVGSVGElement>>> = {
  learn: IconLearn,
  library: IconLibrary,
  games: IconGames,
  mock: IconMock,
  settings: IconSettings,
};

/**
 * The top bar: the product name everywhere, and the five links from the
 * `md` breakpoint up. Below that the links live in the bottom tab bar, so the
 * top bar never has to wrap.
 */
export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-border-subtle bg-bg/90 backdrop-blur supports-[backdrop-filter]:bg-bg/80">
      <div className="mx-auto flex min-h-14 w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1">
        <Link
          prefetch={false}
          href="/"
          aria-current={pathname === '/' ? 'page' : undefined}
          className="flex items-center gap-2 rounded-md text-lg font-extrabold tracking-tight text-fg"
        >
          <span aria-hidden="true" className="flex items-end gap-0.5">
            <span className="h-2.5 w-1 rounded-full bg-strand-rhythm" />
            <span className="h-4 w-1 rounded-full bg-strand-pitch" />
            <span className="h-3 w-1 rounded-full bg-strand-terms" />
            <span className="h-5 w-1 rounded-full bg-accent" />
          </span>
          Music Theory Now
        </Link>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <nav aria-label="Site" className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const current = isCurrent(pathname, item.href);
              return (
                <Link
                  prefetch={false}
                  key={item.href}
                  href={item.href}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 font-semibold',
                    current
                      ? 'bg-accent text-on-accent'
                      : 'text-fg-secondary hover:bg-surface-raised hover:text-fg',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <AccountStatus />
        </div>
      </div>
    </header>
  );
}

/**
 * Five tabs with icon and label at the bottom of the screen on phones. The
 * current tab is marked three ways: `aria-current`, a bar above it with a filled
 * pill behind the icon, and a bolder label. Hidden from `md` up, and on
 * full-screen pages (a game round, a mock test paper).
 */
export function BottomTabBar() {
  const pathname = usePathname();
  if (isImmersive(pathname)) return null;
  return (
    <nav
      aria-label="Main tabs"
      className="sticky bottom-0 z-30 border-t border-border-subtle bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const current = isCurrent(pathname, item.href);
          const Icon = ICONS[item.icon];
          return (
            <li key={item.href}>
              <Link
                prefetch={false}
                href={item.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 pt-1 text-[0.6875rem] leading-tight',
                  current ? 'font-extrabold text-fg' : 'font-medium text-fg-secondary',
                )}
              >
                {current ? <span aria-hidden="true" className="absolute inset-x-4 top-0 h-1 rounded-b-full bg-accent" /> : null}
                <span
                  className={cn(
                    'flex h-8 w-full max-w-14 items-center justify-center rounded-full',
                    current ? 'bg-accent text-on-accent' : '',
                  )}
                >
                  <Icon width={22} height={22} strokeWidth={current ? 2.5 : 2} />
                </span>
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
