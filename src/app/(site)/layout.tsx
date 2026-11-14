import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/site/site-header';

/** Pages that show the site header: home, Note Rush and settings. Lessons have their own header. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col">{children}</main>
    </>
  );
}
