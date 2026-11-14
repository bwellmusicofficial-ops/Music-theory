/** The only file that imports @/audio (section 7). */
import { getAudioEngine } from '@/audio';
import type { Pitch } from '@/engine/types';
import { DRAG_SOUND_INTERVAL_MS, SOUND_DURATION_MS } from './constants';

export interface StaveSound {
  setEnabled(enabled: boolean): void;
  play(pitches: Pitch[], opts?: { throttle?: boolean }): void;
  dispose(): void;
}

export function createStaveSound(): StaveSound {
  let enabled = true;
  let sounding: Pitch[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastAt = -Infinity;
  let disposed = false;

  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const engine = getAudioEngine();
    for (const p of sounding) engine.noteOff(p);
    sounding = [];
  };

  const start = (pitches: Pitch[]) => {
    if (disposed) return;
    stop();
    const engine = getAudioEngine();
    sounding = pitches;
    for (const p of pitches) engine.noteOn(p);
    timer = setTimeout(stop, SOUND_DURATION_MS);
  };

  return {
    setEnabled(v) {
      enabled = v;
      if (!v) stop();
    },
    play(pitches, opts) {
      if (!enabled || disposed || pitches.length === 0) return;
      const now = Date.now();
      if (opts?.throttle && now - lastAt < DRAG_SOUND_INTERVAL_MS) return;
      lastAt = now;
      const engine = getAudioEngine();
      if (!engine.isUnlocked()) {
        void engine.unlock().then(() => start(pitches)).catch(() => {});
        return;
      }
      start(pitches);
    },
    dispose() {
      disposed = true;
      stop();
    },
  };
}
