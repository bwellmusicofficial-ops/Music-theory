# Music Theory Now: architecture record

Status: accepted for Phase 0 (P0-01). Changes to this file and to the contract
files it names go through the orchestrator.

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| App shape | One Next.js app (App Router), not a monorepo | One deployable, no workspace tooling; the engine stays separable by rule (below) rather than by package |
| Language | TypeScript, `strict` on | Contracts are the coordination mechanism between tasks |
| Styling | Tailwind CSS, colours only through CSS variables in `src/styles/tokens.css` | Theming and strand colours change in one place |
| Tests | Vitest; React Testing Library for components; Playwright from Phase 1 | Fast unit tests for the engine, which carries the correctness risk |
| Validation | Zod | One source for types and runtime checks of lesson files |
| Notation | VexFlow, wrapped by `src/components/stave` | Nothing outside that folder imports VexFlow |
| Audio | Tone.js, wrapped by `src/audio` | Nothing outside that folder imports Tone |
| Theory logic | In-house `src/engine`, no third-party theory library | Small, fully testable, and spelling rules must be exactly ours |
| Lesson content | JSON files under `content/`, validated in CI | Authors need no code; a CMS can replace files later |
| Progress storage | `ProgressSink` interface; localStorage in Phase 0, Supabase in Phase 1 | The lesson player never changes when storage does |
| Terminology | UK ids are canonical; display names come from the engine by setting | One switch, no duplicated content |

## Layout and ownership

Every task owns the folders listed for it and edits nothing else. Shared files
are edited only by the orchestrator between waves.

```
content/
  lessons/<grade>/<unit>/<slug>.json     lesson files            (P0-14, later content tasks)
  glossary/<grade>.json                  glossary entries
docs/
  architecture.md                        this file               (orchestrator)
  stave-interaction.md                   stave input design      (P0-07)
  lesson-authoring-guide.md              how to write a lesson   (P0-14)
src/
  app/                                   routes                  (orchestrator wires; pages by task)
  styles/tokens.css                      design tokens           (P0-03)
  components/ui/                         buttons, cards, etc.    (P0-03)
  components/stave/                      interactive stave       (P0-08)
  components/keyboard/                   piano keyboard          (P0-09)
  components/rhythm-pad/                 rhythm pad              (P0-10)
  engine/types.ts, engine/api.ts         CONTRACT                (orchestrator)
  engine/rng.ts, engine/pitch/           pitch engine            (P0-04)
  engine/rhythm/                         rhythm engine           (P0-05)
  audio/                                 audio engine            (P0-06)
  lesson/schema.ts, lesson/contracts.ts  CONTRACT                (orchestrator)
  lesson/player/                         six-step player         (P0-11)
  lesson/progress/                       ProgressSink (local)    (P0-11)
  lesson/questions/<type>/               one folder per type     (P0-12, P0-13)
  lesson/questions/index.ts              registry                (orchestrator)
  lesson/generators/                     question generators     (P1-04; two seeded in P0-12)
  games/<game>/                          one folder per game     (P0-15)
```

Shared files (orchestrator only): `package.json`, lockfile, `tsconfig.json`,
`tailwind.config.*`, `next.config.*`, `.github/`, `src/app/layout.tsx`,
registries, and the four contract files.

If a task needs a new dependency or a contract change, it says so in its report
instead of making the change.

## Dependency rules

```
engine      imports nothing from the app
audio       may import engine
components  may import engine, audio, components/ui
lesson      may import engine, audio, components
games       may import engine, audio, components, lesson/contracts
app         may import anything
```

`src/engine` must run in Node with no DOM, so it can later mark answers on the
server and be reused by a mobile app.

## Conventions

- Named exports only. One component per file. Files in kebab-case.
- Tests sit beside the code as `*.test.ts(x)`.
- Components take data through props; no component reads storage or the URL.
- Every interactive element works by touch, mouse and keyboard, and has an
  accessible name.
- Colour is never the only signal of right and wrong.
- Animation respects `LearnerSettings.reducedMotion`.
- No text in components that a lesson author would want to change; that text
  belongs in lesson files.
- Pitches in JSON and props use the engine's `Pitch` objects; ASCII strings
  ("F#4") appear only in lesson-file shorthand fields that say so.

## Audio contract (P0-06 implements in `src/audio/index.ts`)

```ts
export interface AudioEngine {
  /** Must be called from a user gesture before anything sounds (mobile browsers). */
  unlock(): Promise<void>;
  isUnlocked(): boolean;
  /** Loads piano samples; resolves when playable. Safe to call repeatedly. */
  load(): Promise<void>;
  /** Immediate note, for keyboard and stave taps. */
  noteOn(pitch: Pitch, velocity?: number): void;
  noteOff(pitch: Pitch): void;
  /** Plays a passage; resolves when it ends or is stopped. `onEvent` drives a cursor. */
  playPassage(
    passage: Passage,
    options: { bpm: number; countInBeats?: number; onEvent?: (bar: number, event: number) => void },
  ): { stop(): void; done: Promise<void> };
  /**
   * Metronome click on felt beats, with an accented first beat. `startTime` is
   * the audio-clock time (see `now()`) of the first click, so callers can line
   * beats and expected taps up with what the learner hears.
   */
  startMetronome(
    time: TimeSignature,
    bpm: number,
    onBeat?: (beat: number) => void,
  ): { stop(): void; startTime: number };
  /** Short interface sounds; silent when muted. */
  playUi(sound: 'correct' | 'wrong' | 'tap' | 'complete'): void;
  setMuted(muted: boolean): void;
  /** Seconds on the audio clock, for timing taps against scheduled beats. */
  now(): number;
}
export function getAudioEngine(): AudioEngine;
```

## Stave component contract (P0-07 refines, P0-08 implements)

Superseded: the accepted `StaveProps` is the revised interface in section 13 of
`docs/stave-interaction.md`. The original is kept below for history. Token names
in that document map to the real tokens as: `--text-primary` -> `--text`;
`--strand-current` is set by the parent and falls back to `--accent`.
The proposed engine functions `accidentalSigns` and `spokenPitch` stay local to
the stave folder until Phase 1.

```ts
export interface StaveProps {
  passage: Passage;
  /** 'read' shows notation only; 'edit' accepts input as designed in docs/stave-interaction.md. */
  mode: 'read' | 'edit';
  /** Called with the complete new passage after every edit. The parent owns state. */
  onChange?: (next: Passage) => void;
  /** What an edit may place. Omitted fields are not editable. */
  palette?: { durations?: Duration[]; accidentals?: boolean; rests?: boolean };
  /** Per-event visual state, keyed "bar:event". */
  marks?: Record<string, 'correct' | 'wrong' | 'highlight'>;
  /** Tapping a note in read mode, for "tap the mistake" and playback. */
  onEventTap?: (bar: number, event: number) => void;
  /** Playback cursor position, or null. */
  cursor?: { bar: number; event: number } | null;
  ariaLabel: string;
}
```

## Keyboard component contract (P0-09)

```ts
export interface KeyboardProps {
  low: Pitch;
  high: Pitch;
  showLabels?: boolean;
  highlight?: { pitch: Pitch; state: 'target' | 'correct' | 'wrong' }[];
  /** Reports the sounding key. Black keys are reported as sharps; callers respell if needed. */
  onNote?: (pitch: Pitch) => void;
  /** When false the component makes no sound itself. Default true. */
  sound?: boolean;
  disabled?: boolean;
}
```

## Rhythm pad contract (P0-10)

```ts
export interface RhythmPadProps {
  bars: Bar[];
  time: TimeSignature;
  bpm: number;
  countInBars?: number;
  /** Called when the performance ends. */
  onComplete: (result: TapResult) => void;
}
export interface TapResult {
  /** One entry per expected onset: signed error in ms, or null if missed. */
  errorsMs: (number | null)[];
  extraTaps: number;
  /** 0..1 */
  accuracy: number;
}
```

Latency calibration stores a single offset in ms as
`LearnerSettings.latencyOffsetMs` (default 0) and it is applied before scoring.
Sign: positive means taps arrive late (the device registers a tap after the
learner made it), so the pad subtracts the offset from every tap time. The
lesson player provides the settings to question components through a React
context (`useLearnerSettings()` in `src/lesson/player`); `tap-rhythm` passes
`latencyOffsetMs` to the pad. Tap matching uses a wider window than the
marking tolerance (2.5 times `toleranceMs`, at most 450 ms) so that `mark` can
report "early" and "late" rather than "missed".
