export interface NavItem {
  href: string;
  label: string;
  icon: 'learn' | 'library' | 'games' | 'mock' | 'settings';
}

/** The five places in the site, in order. Used by the top bar and the bottom tab bar. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/learn', label: 'Learn', icon: 'learn' },
  { href: '/library', label: 'Library', icon: 'library' },
  { href: '/games', label: 'Games', icon: 'games' },
  { href: '/mock', label: 'Mock tests', icon: 'mock' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

/** True when `pathname` is the item's page or anywhere below it. */
export function isCurrent(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Pages that take over the screen (a game round, a mock test paper): the
 * bottom tab bar steps aside so it cannot cover the game's own controls.
 * The index pages (/games, /mock) keep it.
 */
export function isImmersive(pathname: string | null): boolean {
  if (!pathname) return false;
  return /^\/(games|mock)\/[^/]+/.test(pathname);
}
