import { DEFAULT_SETTINGS, type LearnerSettings } from '@/lesson/contracts';

export const SETTINGS_KEY = 'mtn:v1:settings';

/** Largest latency offset the calibration can store, matching LatencyCalibration's range. */
export const LATENCY_MIN_MS = -50;
export const LATENCY_MAX_MS = 300;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Reads stored settings. Anything missing, of the wrong type or corrupt falls
 * back to the default for that field. `prefersReducedMotion` is the default for
 * `reducedMotion` when it has not been stored.
 */
export function parseSettings(raw: string | null, prefersReducedMotion = false): LearnerSettings {
  const base: LearnerSettings = { ...DEFAULT_SETTINGS, reducedMotion: prefersReducedMotion };
  if (!raw) return base;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return base;
  }
  if (!isRecord(value)) return base;
  const offset = value.latencyOffsetMs;
  return {
    terminology: value.terminology === 'us' || value.terminology === 'uk' ? value.terminology : base.terminology,
    soundOn: typeof value.soundOn === 'boolean' ? value.soundOn : base.soundOn,
    reducedMotion: typeof value.reducedMotion === 'boolean' ? value.reducedMotion : base.reducedMotion,
    untimed: typeof value.untimed === 'boolean' ? value.untimed : base.untimed,
    theme: value.theme === 'light' || value.theme === 'dark' ? value.theme : base.theme,
    latencyOffsetMs:
      typeof offset === 'number' && Number.isFinite(offset)
        ? Math.min(LATENCY_MAX_MS, Math.max(LATENCY_MIN_MS, Math.round(offset)))
        : base.latencyOffsetMs,
  };
}

export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Loads settings from localStorage; never throws. */
export function loadSettings(): LearnerSettings {
  let raw: string | null = null;
  try {
    raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(SETTINGS_KEY);
  } catch {
    raw = null;
  }
  return parseSettings(raw, prefersReducedMotion());
}

/** Saves settings; a missing, full or blocked storage is ignored (the page keeps its in-memory copy). */
export function saveSettings(settings: LearnerSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or quota: settings last for this page only.
  }
}
