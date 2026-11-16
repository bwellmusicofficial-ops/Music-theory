import { ProgressBar } from '@/components/ui';
import type { CourseGrade, JourneyPosition, ProgressMap } from '@/progress-view';
import { gradeCompletion } from '@/progress-view';
import { SectionCard } from '../section-card';

/** Where the learner is on the whole course, with a bar per grade that has lessons. */
export function JourneyCard({ course, journey, progress }: { course: readonly CourseGrade[]; journey: JourneyPosition; progress: ProgressMap }) {
  return (
    <SectionCard
      title="Your journey"
      action={<p className="text-sm font-semibold text-fg-secondary">{journey.finished ? 'All done' : `Lesson ${journey.lessonNumber} of ${journey.total}`}</p>}
    >
      <div className="flex flex-col gap-4">
        {course.map((grade) => {
          const c = gradeCompletion(grade, progress);
          return (
            <div key={grade.grade} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <p className="font-bold">{grade.title}</p>
                <p className="text-sm font-semibold text-fg-secondary">{c.percent}%</p>
              </div>
              <ProgressBar value={c.percent / 100} aria-label={`${grade.title} progress`} />
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
