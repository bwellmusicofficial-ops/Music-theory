import { cn } from '@/components/ui/cn';

/** A calm placeholder block shown until the learner's stored progress has been read. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('rounded-lg bg-surface-raised motion-safe:animate-pulse', className)} />;
}
