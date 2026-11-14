import type { AudioEngine, AudioEngineVoice } from './types';

/**
 * The gestures every browser accepts as permission to start audio. On iPhone
 * and iPad the start of a touch (touchstart / pointerdown) does NOT count, only
 * its end, so components that play on press cannot unlock sound by themselves.
 */
const UNLOCK_EVENTS = ['pointerup', 'touchend', 'click', 'keydown'] as const;

/**
 * Keeps sound available for the whole visit:
 * - downloads the audio library straight away, so the first tap can start the
 *   audio context synchronously (required on iOS);
 * - starts the context on the first accepted gesture anywhere on the page;
 * - starts it again after the browser suspends it (tab in the background,
 *   phone call, screen lock), on the next gesture.
 *
 * Returns a function that removes the listeners.
 */
export function installGestureUnlock(engine: AudioEngine & AudioEngineVoice): () => void {
  if (typeof document === 'undefined') return () => {};
  void engine.preload();
  const onGesture = () => {
    // Cheap when already running; never throws.
    void engine.unlock().catch(() => undefined);
  };
  const options = { capture: true, passive: true } as const;
  for (const type of UNLOCK_EVENTS) document.addEventListener(type, onGesture, options);
  return () => {
    for (const type of UNLOCK_EVENTS) document.removeEventListener(type, onGesture, options);
  };
}
