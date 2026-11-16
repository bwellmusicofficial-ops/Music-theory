import type { ReactNode } from 'react';

/** No site header here: the lesson player draws its own (close button, progress, step). */
export default function LessonsLayout({ children }: { children: ReactNode }) {
  return <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col outline-none">{children}</main>;
}
