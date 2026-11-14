'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { generators } from '@/lesson/generators';
import { LessonPlayer } from '@/lesson/player';
import { createLocalProgressSink } from '@/lesson/progress';
import { questionTypes } from '@/lesson/questions';
import { passageExhibitRenderer } from '@/lesson/questions/notation';
import type { GlossaryEntry, Lesson } from '@/lesson/schema';
import '@/lesson/setup';
import { useSettings } from '@/settings';

const exhibitRenderers = { passage: passageExhibitRenderer };

export function LessonRunner({ lesson, glossary }: { lesson: Lesson; glossary: GlossaryEntry[] }) {
  const router = useRouter();
  const { settings, loaded } = useSettings();
  const [progress] = useState(() => createLocalProgressSink());

  if (!loaded) {
    return (
      <div className="flex flex-1 items-center justify-center text-fg-secondary" role="status">
        Loading lesson
      </div>
    );
  }
  return (
    <LessonPlayer
      lesson={lesson}
      glossary={glossary}
      settings={settings}
      questionTypes={questionTypes}
      generators={generators}
      progress={progress}
      exhibitRenderers={exhibitRenderers}
      onExit={() => router.push('/')}
      onComplete={() => router.push('/')}
    />
  );
}
