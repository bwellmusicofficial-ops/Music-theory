import Link from 'next/link';
import { PageContainer } from '@/components/site/page-container';

export default function SiteNotFound() {
  return (
    <PageContainer width="md">
      <div className="flex flex-col items-start gap-4 rounded-3xl border border-border-subtle bg-surface p-6 shadow-md">
        <h1 className="text-2xl font-extrabold tracking-tight">Page not found</h1>
        <p className="text-fg-secondary">There is nothing here. The course map has everything that exists.</p>
        <Link href="/learn" className="inline-flex min-h-11 items-center rounded-md bg-accent px-5 font-semibold text-on-accent hover:bg-accent-hover">
          Open the course map
        </Link>
      </div>
    </PageContainer>
  );
}
