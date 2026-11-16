'use client';

import Link from 'next/link';
import { Button } from '@/components/ui';
import { PageContainer } from '@/components/site/page-container';

/** Anything that throws while a site page renders lands here instead of a blank screen. */
export default function SiteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageContainer width="md">
      <div role="alert" className="flex flex-col items-start gap-4 rounded-3xl border border-border-subtle bg-surface p-6 shadow-md">
        <h1 className="text-2xl font-extrabold tracking-tight">Something went wrong</h1>
        <p className="text-fg-secondary">This page did not load properly. Your progress is safe. Try again, and if it keeps happening, go back to the home page.</p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={reset}>Try again</Button>
          <Link href="/" className="inline-flex min-h-11 items-center rounded-md border border-border bg-surface-raised px-5 font-semibold hover:bg-surface">
            Home
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}
