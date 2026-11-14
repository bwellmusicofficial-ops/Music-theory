import type * as ToneNs from 'tone';
import type { Passage, Pitch, TimeSignature } from '@/engine/types';
import { pitchToFrequency } from './pitch';
import { DEFAULT_PIANO_BASE_URL, normaliseBaseUrl, pianoSampleUrls } from './samples';
import { feltBeatsPerBar, beatSeconds, schedulePassage } from './timing';
import type { AudioEngine, AudioEngineVoice, UiSound } from './types';

type ToneModule = typeof ToneNs;

/** Minimal surface shared by Tone.Sampler and Tone.PolySynth. */
interface Voice {
  triggerAttack(note: number, time?: number, velocity?: number): unknown;
  triggerRelease(note: number, time?: number): unknown;
  triggerAttackRelease(note: number, duration: number, time?: number, velocity?: number): unknown;
  releaseAll(time?: number): unknown;
}

interface Clicker {
  triggerAttackRelease(note: number, duration: number, time?: number, velocity?: number): unknown;
}

export interface AudioEngineOptions {
  /** Where piano samples live. Default "/audio/piano/". */
  sampleBaseUrl?: string;
  /** Give up on samples (and use the synth) after this long. Default 8000 ms. */
  loadTimeoutMs?: number;
}

/** Audio context lookAhead in seconds: low for responsive taps. */
export const INTERACTIVE_LOOK_AHEAD = 0.01;
/** Delay between "play" and the first scheduled sound, to avoid a clipped start. */
const START_LEAD = 0.1;
/** The scheduler tops up this far ahead of the audio clock. */
const HORIZON = 0.25;
const PUMP_INTERVAL_MS = 25;
const DEFAULT_VELOCITY = 0.8;

const ACCENT_HZ = 1568;
const CLICK_HZ = 1046.5;
const CLICK_SECONDS = 0.03;

function inBrowser(): boolean {
  return typeof window !== 'undefined';
}

/** Short pleasant jingles: [frequency Hz, offset s, duration s]. */
const UI_SOUNDS: Record<UiSound, ReadonlyArray<readonly [number, number, number]>> = {
  tap: [[1318.5, 0, 0.04]],
  correct: [
    [659.25, 0, 0.09],
    [987.77, 0.08, 0.18],
  ],
  wrong: [
    [233.08, 0, 0.12],
    [185, 0.11, 0.2],
  ],
  complete: [
    [523.25, 0, 0.1],
    [659.25, 0.09, 0.1],
    [783.99, 0.18, 0.1],
    [1046.5, 0.27, 0.32],
  ],
};

export class ToneAudioEngine implements AudioEngine, AudioEngineVoice {
  private readonly baseUrl: string;
  private readonly loadTimeoutMs: number;

  private tonePromise: Promise<ToneModule> | null = null;
  private tone: ToneModule | null = null;
  private unlocked = false;
  private unlockPromise: Promise<void> | null = null;
  private loadPromise: Promise<void> | null = null;
  private muted = false;

  private sampler: Voice | null = null;
  private synth: Voice | null = null;
  private clicker: Clicker | null = null;
  private uiSynth: Clicker | null = null;

  constructor(options: AudioEngineOptions = {}) {
    this.baseUrl = normaliseBaseUrl(options.sampleBaseUrl ?? DEFAULT_PIANO_BASE_URL);
    this.loadTimeoutMs = options.loadTimeoutMs ?? 8000;
  }

  // --- lifecycle ------------------------------------------------------------

  private loadTone(): Promise<ToneModule> {
    if (!this.tonePromise) {
      this.tonePromise = import('tone').then((Tone) => {
        this.setup(Tone);
        return Tone;
      });
      this.tonePromise.catch(() => {
        this.tonePromise = null;
      });
    }
    return this.tonePromise;
  }

  /** Creates the context-dependent nodes once Tone is available. */
  private setup(Tone: ToneModule): void {
    this.tone = Tone;
    Tone.getContext().lookAhead = INTERACTIVE_LOOK_AHEAD;
    Tone.getDestination().mute = this.muted;

    const piano = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 1.4, sustain: 0.04, release: 0.6 },
    });
    piano.maxPolyphony = 32;
    piano.volume.value = -8;
    this.synth = piano.toDestination() as unknown as Voice;

    this.clicker = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.02, sustain: 0, release: 0.01 },
      volume: -14,
    }).toDestination() as unknown as Clicker;

    const ui = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0.2, release: 0.12 },
    });
    ui.maxPolyphony = 8;
    ui.volume.value = -14;
    this.uiSynth = ui.toDestination() as unknown as Clicker;
  }

  unlock(): Promise<void> {
    if (!inBrowser()) return Promise.resolve();
    if (!this.unlockPromise) {
      this.unlockPromise = this.loadTone()
        .then(async (Tone) => {
          await Tone.start();
          this.unlocked = true;
        })
        .catch((error: unknown) => {
          this.unlockPromise = null;
          throw error;
        });
    }
    return this.unlockPromise;
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  load(): Promise<void> {
    if (!this.loadPromise) this.loadPromise = this.loadSamples();
    return this.loadPromise;
  }

  /** Never rejects: any failure leaves the synth voice in place. */
  private async loadSamples(): Promise<void> {
    if (!inBrowser()) return;
    let Tone: ToneModule;
    try {
      Tone = await this.loadTone();
    } catch {
      return;
    }
    let candidate: ToneNs.Sampler | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Piano samples timed out')), this.loadTimeoutMs);
        candidate = new Tone.Sampler({
          urls: pianoSampleUrls(),
          baseUrl: this.baseUrl,
          release: 1,
          onload: () => resolve(),
          onerror: (error: Error) => reject(error),
        }).toDestination();
      });
      this.sampler = candidate as unknown as Voice;
    } catch {
      try {
        (candidate as ToneNs.Sampler | null)?.dispose();
      } catch {
        // already torn down
      }
      this.sampler = null;
    } finally {
      clearTimeout(timer);
    }
  }

  voice(): 'sampled' | 'synth' {
    return this.sampler ? 'sampled' : 'synth';
  }

  private activeVoice(): Voice | null {
    return this.sampler ?? this.synth;
  }

  /** The Tone module, only when sound is allowed (unlocked and loaded). */
  private ready(): ToneModule | null {
    return this.unlocked && this.tone ? this.tone : null;
  }

  // --- immediate notes -----------------------------------------------------------

  noteOn(pitch: Pitch, velocity = DEFAULT_VELOCITY): void {
    const Tone = this.ready();
    const voice = this.activeVoice();
    if (!Tone || !voice) return;
    voice.triggerAttack(pitchToFrequency(pitch), Tone.now(), clamp01(velocity));
  }

  noteOff(pitch: Pitch): void {
    const Tone = this.ready();
    const voice = this.activeVoice();
    if (!Tone || !voice) return;
    voice.triggerRelease(pitchToFrequency(pitch), Tone.now());
  }

  // --- passages -----------------------------------------------------------------

  playPassage(
    passage: Passage,
    options: { bpm: number; countInBeats?: number; onEvent?: (bar: number, event: number) => void },
  ): { stop(): void; done: Promise<void> } {
    const timing = schedulePassage(passage, options.bpm, options.countInBeats ?? 0);
    const Tone = this.ready();
    const voice = this.activeVoice();
    const clicker = this.clicker;
    if (!Tone || !voice || !clicker) {
      return { stop() {}, done: Promise.resolve() };
    }

    const ctx = Tone.getContext();
    const base = ctx.currentTime + START_LEAD;
    const draw = Tone.getDraw();

    type Action = { time: number; run: () => void };
    const actions: Action[] = [];
    for (const click of timing.clicks) {
      actions.push({
        time: base + click.time,
        run: () =>
          clicker.triggerAttackRelease(
            click.accent ? ACCENT_HZ : CLICK_HZ,
            CLICK_SECONDS,
            base + click.time,
          ),
      });
    }
    let stopped = false;
    let cancelled = false;
    for (const ev of timing.events) {
      const at = base + ev.start;
      actions.push({
        time: at,
        run: () => {
          for (const attack of ev.attacks) {
            const gap = Math.min(0.03, attack.sustain * 0.1);
            voice.triggerAttackRelease(
              attack.frequency,
              Math.max(0.01, attack.sustain - gap),
              at,
              DEFAULT_VELOCITY,
            );
          }
          if (options.onEvent) {
            const { bar, event } = ev;
            draw.schedule(() => {
              if (!cancelled) options.onEvent?.(bar, event);
            }, at);
          }
        },
      });
    }
    actions.sort((a, b) => a.time - b.time);
    const endTime = base + timing.totalSeconds;

    let finish!: () => void;
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let next = 0;

    const pump = () => {
      if (stopped) return;
      const now = ctx.currentTime;
      while (next < actions.length && actions[next].time < now + HORIZON) {
        actions[next++].run();
      }
      if (next >= actions.length && now >= endTime) {
        stopped = true;
        clearInterval(interval);
        finish();
      }
    };

    const interval = setInterval(pump, PUMP_INTERVAL_MS);
    pump();

    return {
      stop: () => {
        if (stopped) return;
        stopped = true;
        cancelled = true;
        clearInterval(interval);
        const now = ctx.currentTime;
        // Release what sounds now, and what the scheduler already queued ahead.
        voice.releaseAll(now);
        voice.releaseAll(now + HORIZON + 0.01);
        finish();
      },
      done,
    };
  }

  // --- metronome --------------------------------------------------------------

  startMetronome(
    time: TimeSignature,
    bpm: number,
    onBeat?: (beat: number) => void,
  ): { stop(): void; startTime: number } {
    const interval = beatSeconds(bpm);
    const perBar = feltBeatsPerBar(time);
    const Tone = this.ready();
    const clicker = this.clicker;
    if (!Tone || !clicker) return { stop() {}, startTime: this.now() };

    const ctx = Tone.getContext();
    const draw = Tone.getDraw();
    const startTime = ctx.currentTime + START_LEAD;
    let nextTime = startTime;
    let beat = 0;
    let stopped = false;

    const pump = () => {
      if (stopped) return;
      const now = ctx.currentTime;
      while (nextTime < now + HORIZON) {
        const index = beat % perBar;
        const at = nextTime;
        clicker.triggerAttackRelease(index === 0 ? ACCENT_HZ : CLICK_HZ, CLICK_SECONDS, at);
        if (onBeat) {
          draw.schedule(() => {
            if (!stopped) onBeat(index);
          }, at);
        }
        beat += 1;
        nextTime += interval;
      }
    };

    const handle = setInterval(pump, PUMP_INTERVAL_MS);
    pump();
    return {
      stop: () => {
        stopped = true;
        clearInterval(handle);
      },
      startTime,
    };
  }

  // --- interface sounds, mute, clock ---------------------------------------------------

  playUi(sound: UiSound): void {
    const Tone = this.ready();
    const synth = this.uiSynth;
    if (!Tone || !synth || this.muted) return;
    const t0 = Tone.getContext().currentTime + 0.005;
    for (const [frequency, offset, duration] of UI_SOUNDS[sound]) {
      synth.triggerAttackRelease(frequency, duration, t0 + offset);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.tone) this.tone.getDestination().mute = muted;
  }

  now(): number {
    return this.tone ? this.tone.getContext().currentTime : 0;
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
