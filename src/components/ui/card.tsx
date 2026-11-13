import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'article';
  padding?: 'none' | 'md' | 'lg';
  /** Lifts on hover; use when the whole card is a visual target (put the real control inside). */
  raised?: boolean;
  children?: ReactNode;
}

const PADDING = { none: '', md: 'p-5', lg: 'p-7' } as const;

export function Card({ as: Tag = 'div', padding = 'md', raised = false, className, children, ...rest }: CardProps) {
  return (
    <Tag
      className={cn(
        'rounded-lg border border-border-subtle bg-surface text-fg shadow-md',
        'transition-[transform,box-shadow] duration-(--motion-duration-base) ease-standard',
        raised && 'hover:-translate-y-0.5 hover:shadow-lg',
        PADDING[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
