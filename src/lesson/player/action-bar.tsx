import type { ReactNode } from 'react';

/** Sticky row of buttons at the bottom of a screen, in the thumb zone. */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-8 flex gap-3 border-t border-border-subtle bg-bg px-4 py-3 [&>*:last-child]:flex-1">
      {children}
    </div>
  );
}
