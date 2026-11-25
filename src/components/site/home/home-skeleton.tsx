import { Skeleton } from '../skeleton';

/**
 * What the home page shows until the learner's progress has been read: calm blocks, no numbers.
 *
 * The blocks add up to about the height of the new-visitor page (heading, demo, buttons and pitch, practice
 * cards), so the footer and tab bar do not jump when the real page arrives. Heights are in rem and were read
 * off the real page at 390px and at desktop width; a returning learner's dashboard is a different height,
 * which no placeholder can match.
 */
export function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your progress</span>
      <Skeleton className="h-6 w-56 sm:h-12" />
      <Skeleton className="h-[24.25rem] rounded-3xl sm:h-[26.25rem]" />
      <Skeleton className="h-80 rounded-3xl sm:h-48" />
      <Skeleton className="h-[15.75rem] rounded-3xl sm:h-[14.5rem]" />
    </div>
  );
}
