/**
 * Accidental display rule and reading rule (docs/stave-interaction.md 4.2).
 * Written to move into the engine unchanged (`accidentalSigns`).
 */
import type { Accidental, Bar, Clef, Duration, Key, Letter, NoteEvent, Pitch } from '@/engine/types';
import type { Engines } from '../types';

export type Sign = Accidental | null;

export interface WrittenHead {
  position: number;
  sign: Sign;
}
export interface WrittenEvent {
  kind: 'note' | 'rest';
  duration: Duration;
  tieToNext: boolean;
  heads: WrittenHead[];
}

type InForce = Map<string, Accidental>;

function keyOf(letter: Letter, octave: number): string {
  return `${letter}${octave}`;
}

function signatureMap(e: Engines, key: Key): Map<Letter, Accidental> {
  const out = new Map<Letter, Accidental>();
  for (const pc of e.pitch.signatureAccidentals(e.pitch.keySignature(key))) {
    out.set(pc.letter, pc.accidental);
  }
  return out;
}

function inForceFor(sig: Map<Letter, Accidental>, inForce: InForce, p: { letter: Letter; octave: number }): Accidental {
  return inForce.get(keyOf(p.letter, p.octave)) ?? sig.get(p.letter) ?? 0;
}

function hasIdentical(event: NoteEvent | undefined, p: Pitch): boolean {
  if (!event || event.kind !== 'note') return false;
  return event.pitches.some(
    (q) => q.letter === p.letter && q.octave === p.octave && q.accidental === p.accidental,
  );
}

function flagFor(event: NoteEvent, index: number): boolean | undefined {
  const f = event.showAccidental;
  if (Array.isArray(f)) return f[index];
  return f;
}

/** Display rule: the sign drawn beside each head of each event (null = none). */
export function signsForBar(e: Engines, bar: Bar, key: Key, tieIn?: NoteEvent): (Accidental | null)[][] {
  const sig = signatureMap(e, key);
  const inForce: InForce = new Map();
  const out: (Accidental | null)[][] = [];
  let prev: NoteEvent | undefined = tieIn && tieIn.kind === 'note' && tieIn.tieToNext ? tieIn : undefined;
  bar.events.forEach((ev) => {
    if (ev.kind === 'rest') {
      out.push([]);
      prev = undefined;
      return;
    }
    const signs: (Accidental | null)[] = ev.pitches.map((p, i) => {
      if (prev && prev.tieToNext && hasIdentical(prev, p)) return null;
      const flag = flagFor(ev, i);
      const k = keyOf(p.letter, p.octave);
      if (flag === true) {
        inForce.set(k, p.accidental);
        return p.accidental;
      }
      if (flag === false) return null;
      if (p.accidental !== inForceFor(sig, inForce, p)) {
        inForce.set(k, p.accidental);
        return p.accidental;
      }
      return null;
    });
    out.push(signs);
    prev = ev;
  });
  return out;
}

export function toWritten(e: Engines, bar: Bar, key: Key, clef: Clef, tieIn?: NoteEvent): WrittenEvent[] {
  const signs = signsForBar(e, bar, key, tieIn);
  return bar.events.map((ev, i) => {
    if (ev.kind === 'rest') {
      return { kind: 'rest', duration: ev.duration, tieToNext: false, heads: [] };
    }
    const heads = ev.pitches
      .map((p, j) => ({ position: e.pitch.stavePosition(p, clef), sign: signs[i][j] ?? null }))
      .sort((a, b) => a.position - b.position);
    return { kind: 'note', duration: ev.duration, tieToNext: ev.tieToNext === true, heads };
  });
}

/**
 * Reading rule. Letter and octave from the position; accidental from `sign`,
 * else the tie source, else what is in force. Updates `inForce` when a sign is given.
 */
export function readHead(
  e: Engines,
  position: number,
  sign: Sign,
  clef: Clef,
  sig: Map<Letter, Accidental>,
  inForce: InForce,
  tieSource?: NoteEvent,
): Pitch {
  const base = e.pitch.pitchAtStavePosition(position, clef);
  if (sign !== null) {
    inForce.set(keyOf(base.letter, base.octave), sign);
    return { ...base, accidental: sign };
  }
  if (tieSource && tieSource.tieToNext) {
    const src = tieSource.pitches.find((q) => q.letter === base.letter && q.octave === base.octave);
    if (src) return { ...base, accidental: src.accidental };
  }
  return { ...base, accidental: inForceFor(sig, inForce, base) };
}

/** Convert a written bar back to events. Single notes carry a boolean flag, chords one flag per head. */
export function fromWritten(
  e: Engines,
  written: WrittenEvent[],
  key: Key,
  clef: Clef,
  tieIn?: NoteEvent,
): Bar {
  const sig = signatureMap(e, key);
  const inForce: InForce = new Map();
  const events: Bar['events'] = [];
  let prev: NoteEvent | undefined = tieIn && tieIn.kind === 'note' && tieIn.tieToNext ? tieIn : undefined;
  for (const w of written) {
    if (w.kind === 'rest') {
      events.push({ kind: 'rest', duration: { ...w.duration } });
      prev = undefined;
      continue;
    }
    const pitches = w.heads.map((h) => readHead(e, h.position, h.sign, clef, sig, inForce, prev));
    const flags = w.heads.map((h) => h.sign !== null);
    const ev: NoteEvent = {
      kind: 'note',
      pitches,
      duration: { ...w.duration },
      showAccidental: pitches.length === 1 ? flags[0] : flags,
    };
    if (w.tieToNext) ev.tieToNext = true;
    events.push(ev);
    prev = ev;
  }
  return { events };
}

/** Sign cycles for the keyboard (3.6). `null` result means "remove". */
export function cycleSharp(current: Sign, allowDouble: boolean): Sign {
  if (current === 1) return allowDouble ? 2 : null;
  if (current === 2) return null;
  return 1;
}
export function cycleFlat(current: Sign, allowDouble: boolean): Sign {
  if (current === -1) return allowDouble ? -2 : null;
  if (current === -2) return null;
  return -1;
}
export function toggleNatural(current: Sign): Sign {
  return current === 0 ? null : 0;
}

export function signKeyMap(e: Engines, key: Key) {
  return signatureMap(e, key);
}
