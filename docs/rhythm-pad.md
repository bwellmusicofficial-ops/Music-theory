# The rhythm pad and Tap It

Code: `src/components/rhythm-pad/` (pad, scoring, `pad-clock.ts`), `src/games/tap-it/` (the game).

## What the pad does

`RhythmPad` plays a count-in, then scores the learner's taps against the onsets of `bars` at `bpm`
(perform mode), or lets them tap along unscored (free mode). Taps are timed on the audio clock at the
pointer-down or key-down event. Scoring rules are in `scoring.ts`; the question type that uses it is
described in `docs/question-payloads.md` (tap-rhythm).

## Driving the pad from a parent

Defaults are unchanged: with no new props the pad shows its own Start button, "Try again" and result block
and starts its own metronome for each performance (tap-rhythm questions, the explore stage and the landing
demo all work this way).

| Prop | Meaning |
|---|---|
| `ref` (a `RhythmPadHandle`) | `start()` begins a performance exactly as the Start button does (does nothing while one is running); `stop()` ends one early with no `onComplete` and returns to idle. |
| `autoStart` | Calls `start()` once on mount. |
| `chrome="minimal"` | No Start button, no "Try again", no result block. The tap surface, beat dots, tally, verdict chip, live region and (free mode) Stop stay. The parent shows results itself. |
| `tapSize="large"` | Taller, full-width tap surface (a game). |
| `clock` (a `PadClock`) | A metronome owned by the parent; see below. Perform mode only. |

Audio starts only after a user gesture. `start()` calls `engine.unlock()` and `engine.load()` as the Start
button always did, which is harmless when already done. A parent that starts the pad without a tap of its
own (`autoStart`, or `start()` from a timer) must make sure something else unlocked audio inside a gesture
first. Tap It does: its Start press calls `unlock()`. No change was made to the unlock behaviour in
`src/audio`.

## One unbroken click: `PadClock`

`createPadClock()` (exported from the pad's index) owns the metronome for several pads in a row.

- `claimBarLine(time, bpm, notBefore?)`: makes sure the click runs at that metre and tempo and returns the
  audio-clock time of the first bar line at or after `notBefore` (default: 0.15 s from now). The pad calls
  this in `start()` and measures its count-in and every onset from that bar line, so each rhythm enters on a
  bar line of the one click.
- A new tempo or time signature hands over on a bar line: the old click is told `stopAt(bar line)`, a new one
  starts there with `startAt`. The bar line is at least 0.4 s ahead because the engine commits clicks 0.25 s
  early. If the claim comes late, the next bar line is used, never a gap or a double click.
- `nextBarLine(notBefore)`: lets the parent time what happens between rhythms.
- `stop()`: stops the click (pause, end of game).

Under a clock the pad starts no click of its own, never stops the click, and ignores `metronome={false}`.

The engine gained two optional things for this (`src/audio/types.ts`): `startMetronome(..., { startAt })` and
`stopAt(time)` on the returned handle. Calls without them behave as before.

## Tap It

- The Start press on the start screen is the user gesture: it unlocks and loads audio, then mounts the play
  screen, which creates one `PadClock` for the round.
- Each rhythm is a `RhythmRound` (keyed per rhythm) rendering the pad with `autoStart`, `chrome="minimal"`,
  `tapSize="large"` and the round's clock. There is no auto-clicking and no CSS hiding of pad internals.
- The click runs for the whole round. After a rhythm, feedback stays for at least 1.8 s and then until 0.5 s
  before a bar line of the click; the next rhythm appears then and its one-bar count-in starts on that bar line.
  Rhythms at a different tempo or metre take over exactly on that bar line.
- Pause (button or hidden tab) stops the click; resuming restarts it with the 3-2-1 and a fresh count-in.
- Scoring, streaks, levels, personal best and the Space-key shortcut are unchanged. `?e2eSeconds=` (round
  length for end-to-end tests) works only when `NEXT_PUBLIC_ENABLE_DEV_ROUTES=1`. In that build the pad also
  publishes `window.__rhythmRun` (onset times on the audio clock), which the e2e helpers use to tap on time.

## What the tests prove (nobody listened)

Tests use a fake audio clock and check numbers: claimed bar lines are whole bars from the first click;
onsets published by the pad equal `bar line + count-in + onset offsets` to 9 decimals; taps at those times
score 0 ms error; at a tempo change `stopAt` and `startAt` are the same bar line, at least 0.4 s ahead; the
pad never stops a click it does not own. They do not prove it sounds right: listen for the click carrying on
unbroken between rhythms on a phone, and for the tempo change landing on the downbeat.
