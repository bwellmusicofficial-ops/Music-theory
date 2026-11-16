import { Skeleton } from '../skeleton';

/** What the home page shows until the learner's progress has been read: calm blocks, no numbers. */
export function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your progress</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-56 rounded-3xl" />
      <Skeleton className="h-36 rounded-3xl" />
    </div>
  );
}
