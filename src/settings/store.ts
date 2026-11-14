import { DEFAULT_SETTINGS, type LearnerSettings } from '@/lesson/contracts';
import { SETTINGS_KEY, loadSettings, saveSettings } from './storage';

/**
 * A tiny external store for the learner's settings, read by `useSettings`
 * through `useSyncExternalStore`: the server and the first client render both
 * see the defaults, then the client switches to the stored values.
 */

let current: LearnerSettings | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function getSettingsSnapshot(): LearnerSettings {
  if (current === null) current = loadSettings();
  return current;
}

export function getServerSettingsSnapshot(): LearnerSettings {
  return DEFAULT_SETTINGS;
}

export function updateSettings(patch: Partial<LearnerSettings>): void {
  current = { ...getSettingsSnapshot(), ...patch };
  saveSettings(current);
  emit();
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== SETTINGS_KEY) return;
    // Another tab changed them: read again.
    current = null;
    listener();
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

/** Tests only: forget the cached settings so the next read goes to storage. */
export function resetSettingsStoreForTests(): void {
  current = null;
  emit();
}
