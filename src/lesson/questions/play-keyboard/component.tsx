'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Keyboard } from '@/components/keyboard';
import { Button } from '@/components/ui';
import { pitch } from '@/engine/pitch';
import type { Passage, Pitch } from '@/engine/types';
import type { QuestionProps } from '@/lesson/contracts';
import { ResultMark } from '@/lesson/questions/face-view';
import { useAnswerReporting } from '@/lesson/questions/use-answer-reporting';
import { playKeyboardInstruction } from './instruction';
import { name } from './reason';
import type { PlayKeyboardAnswer, PlayKeyboardPayload } from './types';

type NotationRenderer = (passage: Passage) => ReactNode;
type Highlight = { pitch: Pitch; state: 'target' | 'correct' | 'wrong' };

let notationRenderer: NotationRenderer | null = null;

/**
 * Optional injection point (the app wires the stave in; this folder does not import it).
 * Pass null to remove it. Without one, a placeholder label stands in for the notation.
 */
export function setPlayKeyboardNotationRenderer(fn: NotationRenderer | null): void {
  notationRenderer = fn;
}

const sameKey = (a: Pitch, b: Pitch, octave: PlayKeyboardPayload['octave']) =>
  octave === 'exact' ? pitch.toMidi(a) === pitch.toMidi(b) : pitch.chroma(a) === pitch.chroma(b);

/** Spoken or written name of a played key, with octave: "C sharp 4". */
function keyName(p: Pitch): string {
  return `${name(p)}${p.octave}`;
}

/** After marking: right keys green, wrong keys red, and any note that was missed shows as a target. */
export function resultHighlights(payload: PlayKeyboardPayload, played: Pitch[]): Highlight[] {
  const { targets, octave, mode } = payload;
  const byMidi = new Map<number, Highlight>();
  const set = (h: Highlight) => byMidi.set(pitch.toMidi(h.pitch), h);

  const playedRight = (p: Pitch, index: number) =>
    mode === 'sequence'
      ? targets[index] !== undefined && sameKey(targets[index] as Pitch, p, octave)
      : targets.some((t) => sameKey(t, p, octave));

  targets.forEach((target, index) => {
    const hit =
      mode === 'sequence'
        ? played[index] !== undefined && sameKey(target, played[index] as Pitch, octave)
        : played.some((p) => sameKey(target, p, octave));
    if (!hit) set({ pitch: target, state: 'target' });
  });
  played.forEach((p, index) => {
    if (!playedRight(p, index)) set({ pitch: p, state: 'wrong' });
  });
  played.forEach((p, index) => {
    if (playedRight(p, index)) set({ pitch: p, state: 'correct' });
  });
  return [...byMidi.values()];
}

/** A restored answer's keys, if they fit the payload (right count for a sequence, no repeats for a chord). */
function restorePlayed(payload: PlayKeyboardPayload, answer: PlayKeyboardAnswer | undefined): Pitch[] {
  const played = answer?.played ?? [];
  if (payload.mode === 'sequence') return played.length <= payload.targets.length ? [...played] : [];
  const midis = played.map((p) => pitch.toMidi(p));
  return new Set(midis).size === midis.length ? [...played] : [];
}

export function PlayKeyboard({
  payload,
  locked,
  result,
  onAnswer,
  initialAnswer,
  onAnswerChange,
  hideCheck = false,
}: QuestionProps<PlayKeyboardPayload, PlayKeyboardAnswer>) {
  const [restored] = useState<Pitch[]>(() => restorePlayed(payload, initialAnswer));
  const [played, setPlayed] = useState<Pitch[]>(restored);
  const playedRef = useRef<Pitch[]>(restored);
  const committed = useRef(false);
  const [announce, setAnnounce] = useState('');
  const sequence = payload.mode === 'sequence';
  const off = locked || result !== null;
  // A host that reads answers through onAnswerChange lets the learner keep changing them.
  const hosted = onAnswerChange !== undefined;
  const complete = sequence ? played.length === payload.targets.length : played.length > 0;
  useAnswerReporting<PlayKeyboardAnswer>(complete ? { played } : null, onAnswerChange);

  function update(next: Pitch[]) {
    playedRef.current = next;
    setPlayed(next);
  }

  function handleNote(p: Pitch) {
    if (off || (committed.current && !hosted)) return;
    if (sequence) {
      // A finished sequence that is still open to change starts again on the next key.
      const base = playedRef.current.length >= payload.targets.length ? [] : playedRef.current;
      const next = [...base, p];
      update(next);
      setAnnounce(
        `${payload.nameNotes === false ? 'Played a key' : `Played ${keyName(p)}`}. ${next.length} of ${payload.targets.length}.`,
      );
      if (next.length === payload.targets.length) {
        committed.current = true;
        onAnswer({ played: next });
      }
      return;
    }
    const midi = pitch.toMidi(p);
    const current = playedRef.current;
    const isOn = current.some((q) => pitch.toMidi(q) === midi);
    const next = isOn
      ? current.filter((q) => pitch.toMidi(q) !== midi)
      : [...current, p].sort((a, b) => pitch.toMidi(a) - pitch.toMidi(b));
    update(next);
    setAnnounce(`${payload.nameNotes === false ? 'Key' : keyName(p)} ${isOn ? 'off' : 'on'}. ${next.length} ${next.length === 1 ? 'key' : 'keys'} chosen.`);
  }

  function clear() {
    if (off || (committed.current && !hosted)) return;
    committed.current = false;
    update([]);
    setAnnounce('Cleared.');
  }

  function check() {
    if (off || (committed.current && !hosted) || playedRef.current.length === 0) return;
    committed.current = true;
    onAnswer({ played: [...playedRef.current] });
  }

  const highlight = useMemo<Highlight[]>(() => {
    if (result !== null) return resultHighlights(payload, played);
    // The keyboard has no "chosen" state, so chosen keys in a chord use its marker.
    return sequence ? [] : played.map((p) => ({ pitch: p, state: 'target' as const }));
  }, [result, payload, played, sequence]);

  const summary =
    played.length === 0
      ? 'No notes yet'
      : payload.nameNotes === false
        ? `${played.length} ${played.length === 1 ? 'key' : 'keys'}`
        : played.map(keyName).join(', ');
  const instruction = playKeyboardInstruction(payload, hideCheck);

  return (
    <div className="flex flex-col gap-4">
      {payload.passage ? (
        <div data-testid="notation">
          {notationRenderer ? (
            notationRenderer(payload.passage)
          ) : (
            <p className="rounded-md border border-border-subtle p-3 text-fg-secondary">Notation</p>
          )}
        </div>
      ) : null}
      <p className="text-sm text-fg-secondary">{instruction}</p>
      <Keyboard
        low={payload.low}
        high={payload.high}
        showLabels={payload.showLabels ?? false}
        highlight={highlight}
        onNote={handleNote}
        disabled={off}
      />
      <p data-testid="played-summary" className="text-lg font-semibold text-fg">
        <span className="text-sm font-bold uppercase tracking-wide text-muted">
          {sequence ? 'Played: ' : 'Chosen: '}
        </span>
        {summary}
      </p>
      {result !== null ? (
        result.correct ? (
          <ResultMark tone="right" className="self-start">
            Correct
          </ResultMark>
        ) : (
          <ResultMark tone="wrong" className="self-start">
            Not quite
          </ResultMark>
        )
      ) : null}
      <div className="flex flex-wrap gap-3">
        {sequence || hideCheck ? null : (
          <Button size="lg" disabled={off || played.length === 0} onClick={check}>
            Check
          </Button>
        )}
        <Button
          size="lg"
          variant="secondary"
          disabled={off || played.length === 0}
          onClick={clear}
        >
          Clear
        </Button>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
    </div>
  );
}
