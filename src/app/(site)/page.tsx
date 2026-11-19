import { HomeView } from '@/components/site/home/home-view';
import { buildLandingDemoContent } from '@/components/site/landing-demo/content';
import { listLessons, loadGlossary } from '@/content/load';
import { toLessonMeta } from '@/progress-view';

export default function HomePage() {
  const lessons = listLessons();
  return <HomeView lessons={lessons.map(toLessonMeta)} demo={buildLandingDemoContent(lessons, loadGlossary('start'))} />;
}
