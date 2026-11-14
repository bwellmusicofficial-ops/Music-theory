'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { getAudioEngine, installGestureUnlock } from '@/audio';
import type { LearnerSettings } from '@/lesson/contracts';
import { getServerSettingsSnapshot, getSettingsSnapshot, subscribeSettings, updateSettings } from './store';

export interface SettingsContextValue {
  settings: LearnerSettings;
  /** False on the server and during hydration, when `settings` are the defaults rather than the stored values. */
  loaded: boolean;
  update: (patch: Partial<LearnerSettings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const noop = () => () => {};

/** Applies settings to the page: theme and motion attributes on <html>, and the audio mute. */
function applyToDocument(settings: LearnerSettings) {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.dataset.reducedMotion = String(settings.reducedMotion);
  try {
    getAudioEngine().setMuted(!settings.soundOn);
  } catch {
    // Sound is best effort.
  }
}

/** Persists LearnerSettings in localStorage and keeps <html> and the audio engine in step with them. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const settings = useSyncExternalStore(subscribeSettings, getSettingsSnapshot, getServerSettingsSnapshot);
  const loaded = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const update = useCallback((patch: Partial<LearnerSettings>) => updateSettings(patch), []);

  // Sound must be started from a tap, and on iPhone only from the end of one.
  useEffect(() => {
    try {
      return installGestureUnlock(getAudioEngine());
    } catch {
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (loaded) applyToDocument(settings);
  }, [settings, loaded]);

  const value = useMemo(() => ({ settings, loaded, update }), [settings, loaded, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside a SettingsProvider');
  return value;
}
