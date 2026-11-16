import { HomeView } from '@/components/site/home/home-view';
import { listLessons } from '@/content/load';
import { toLessonMeta } from '@/progress-view';

export default function HomePage() {
  return <HomeView lessons={listLessons().map(toLessonMeta)} />;
}
