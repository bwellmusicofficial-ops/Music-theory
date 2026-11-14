import Link from 'next/link';
import { Card } from '@/components/ui';
import { listLessons } from '@/content/load';

function HomeCard({ href, title, text, eyebrow }: { href: string; title: string; text: string; eyebrow: string }) {
  return (
    <Link href={href} className="group block rounded-lg">
      <Card raised padding="lg" className="flex min-h-40 flex-col justify-between gap-6 group-hover:border-accent">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-muted">{eyebrow}</p>
          <h2 className="mt-1 text-2xl font-extrabold">{title}</h2>
          <p className="mt-2 text-fg-secondary">{text}</p>
        </div>
        <span aria-hidden="true" className="text-lg font-bold text-accent">
          Go &rarr;
        </span>
      </Card>
    </Link>
  );
}

export default function HomePage() {
  const first = listLessons()[0];
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:py-12">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Music Theory Now</h1>
        <p className="mt-3 max-w-prose text-lg text-fg-secondary">
          Learn music theory by doing: short interactive lessons where you tap, listen and play, from your first note
          onwards.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {first ? (
          <HomeCard
            href={`/lessons/${first.id}`}
            eyebrow="Lesson"
            title="Start the first lesson"
            text={`${first.title}: ${first.summary}`}
          />
        ) : null}
        <HomeCard
          href="/games/note-rush"
          eyebrow="Game"
          title="Play Note Rush"
          text="Name the notes as they fly across the stave before they get away."
        />
      </div>
    </div>
  );
}
