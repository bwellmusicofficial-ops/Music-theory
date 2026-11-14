'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Terminology } from '@/engine/types';
import { DEFAULT_SETTINGS, type LearnerSettings } from '../contracts';
import { makeGlossaryLookup, type GlossarySource } from './rich-text';

/** What a question component needs to render lesson text the way the player does. */
export interface LessonTextContextValue {
  terminology: Terminology;
  glossary: ReturnType<typeof makeGlossaryLookup>;
}

const LessonTextContext = createContext<LessonTextContextValue | null>(null);
const LearnerSettingsContext = createContext<LearnerSettings | null>(null);

/** Provided by `LessonPlayer`. Question components outside a player see no provider. */
export function LessonContextProvider({
  settings,
  glossary,
  children,
}: {
  settings: LearnerSettings;
  glossary: GlossarySource;
  children: ReactNode;
}) {
  const lookup = useMemo(() => makeGlossaryLookup(glossary), [glossary]);
  const text = useMemo(() => ({ terminology: settings.terminology, glossary: lookup }), [settings.terminology, lookup]);
  return (
    <LearnerSettingsContext.Provider value={settings}>
      <LessonTextContext.Provider value={text}>{children}</LessonTextContext.Provider>
    </LearnerSettingsContext.Provider>
  );
}

/** Terminology and glossary from the lesson player, or null when there is no player. */
export function useLessonText(): LessonTextContextValue | null {
  return useContext(LessonTextContext);
}

/** The learner's settings from the lesson player; the defaults when there is no player. */
export function useLearnerSettings(): LearnerSettings {
  return useContext(LearnerSettingsContext) ?? DEFAULT_SETTINGS;
}
