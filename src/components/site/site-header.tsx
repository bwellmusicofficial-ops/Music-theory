import Link from 'next/link';

const LINKS = [
  { href: '/mock', label: 'Mock tests' },
  { href: '/settings', label: 'Settings' },
] as const;

/** The header shared by every page: the product name, the mock tests and the settings. */
export function SiteHeader() {
  return (
    <header className="border-b border-border-subtle bg-bg">
      <div className="mx-auto flex min-h-14 w-full max-w-3xl items-center justify-between gap-4 px-4">
        <Link href="/" className="rounded-sm text-lg font-extrabold tracking-tight text-fg">
          Music Theory Now
        </Link>
        <nav aria-label="Site" className="flex items-center gap-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex min-h-11 items-center rounded-md px-3 font-semibold text-fg-secondary hover:bg-surface-raised hover:text-fg"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
