import type { ReactNode } from 'react';

/** No site header here: the lesson player draws its own (close button, progress, step). */
export default function LessonsLayout({ children }: { children: ReactNode }) {
  return <main className="flex flex-1 flex-col">{children}</main>;
}
