import type { Metadata } from 'next';
import { CourseMap } from '@/components/site/course-map';
import { listLessons } from '@/content/load';
import { toLessonMeta } from '@/progress-view';

export const metadata: Metadata = { title: 'Learn' };

export default function LearnPage() {
  return <CourseMap lessons={listLessons().map(toLessonMeta)} />;
}
