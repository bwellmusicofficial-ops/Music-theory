import Link from 'next/link';

/** The header shared by every page: the product name and a way to the settings. */
export function SiteHeader() {
  return (
    <header className="border-b border-border-subtle bg-bg">
      <div className="mx-auto flex min-h-14 w-full max-w-3xl items-center justify-between gap-4 px-4">
        <Link href="/" className="rounded-sm text-lg font-extrabold tracking-tight text-fg">
          Music Theory Now
        </Link>
        <nav aria-label="Site">
          <Link
            href="/settings"
            className="inline-flex min-h-11 items-center rounded-md px-3 font-semibold text-fg-secondary hover:bg-surface-raised hover:text-fg"
          >
            Settings
          </Link>
        </nav>
      </div>
    </header>
  );
}
