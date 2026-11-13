// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

const touched = vi.hoisted(() => ({ tone: false }));
vi.mock('tone', () => {
  touched.tone = true;
  return {};
});

describe('importing src/audio on the server', () => {
  it('never touches Tone and never throws', async () => {
    const audio = await import('./index');
    const engine = audio.getAudioEngine();
    expect(audio.getAudioEngine()).toBe(engine); // singleton
    expect(engine.isUnlocked()).toBe(false);
    expect(engine.voice()).toBe('synth');
    expect(engine.now()).toBe(0);
    expect(touched.tone).toBe(false);
  });

  it('every method is a safe no-op without a browser', async () => {
    const { getAudioEngine } = await import('./index');
    const engine = getAudioEngine();
    const pitch = { letter: 'C', accidental: 0, octave: 4 } as const;
    await engine.unlock();
    await engine.load();
    engine.noteOn(pitch);
    engine.noteOff(pitch);
    engine.playUi('tap');
    engine.setMuted(true);
    engine.startMetronome({ beats: 4, beatUnit: 4 }, 90).stop();
    const h = engine.playPassage(
      { clef: 'treble', key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' }, time: { beats: 4, beatUnit: 4 }, bars: [] },
      { bpm: 90 },
    );
    await h.done;
    expect(touched.tone).toBe(false);
  });
});
