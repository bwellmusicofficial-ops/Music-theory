import { ToneAudioEngine } from './engine';
import type { AudioEngine, AudioEngineVoice } from './types';

export type { AudioEngine, AudioEngineVoice } from './types';
export { ToneAudioEngine } from './engine';
export type { AudioEngineOptions } from './engine';

let instance: ToneAudioEngine | null = null;

/**
 * Lazy singleton. Constructing it touches nothing: Tone is imported
 * dynamically on `unlock()` / `load()`, and only in a browser, so this is safe
 * during server rendering and in Node tests.
 *
 * The result is an `AudioEngine` that also offers `voice()`.
 */
export function getAudioEngine(): AudioEngine & AudioEngineVoice {
  if (!instance) {
    const fromEnv =
      typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_PIANO_SAMPLES_URL : undefined;
    instance = new ToneAudioEngine(fromEnv ? { sampleBaseUrl: fromEnv } : {});
  }
  return instance;
}
