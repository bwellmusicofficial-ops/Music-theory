import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';

const WIDTHS = { md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' } as const;

/** The centred column every site page sits in. */
export function PageContainer({ width = 'lg', className, children }: { width?: keyof typeof WIDTHS; className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto flex w-full flex-col gap-6 px-4 py-6 sm:py-10', WIDTHS[width], className)}>{children}</div>;
}

/** The page's h1 with an optional eyebrow and one line under it. */
export function PageTitle({ title, eyebrow, children }: { title: string; eyebrow?: string; children?: ReactNode }) {
  return (
    <div>
      {eyebrow ? <p className="text-sm font-bold uppercase tracking-wider text-muted">{eyebrow}</p> : null}
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
      {children ? <p className="mt-2 max-w-prose text-base text-fg-secondary sm:text-lg">{children}</p> : null}
    </div>
  );
}
