import { redirect } from 'next/navigation';

/** The plain lesson list became the course map. */
export default function LessonsPage(): never {
  redirect('/learn');
}
