import { describe, expect, it } from 'vitest';
import { pitch } from '@/engine/pitch';
import { generate } from '@/lesson/generators/keyboard-find/generate';
import { createRng } from '@/engine/rng';
import type { Pitch } from '@/engine/types';
import { playKeyboardInstruction } from './instruction';
import type { PlayKeyboardPayload } from './types';

const ps = (...s: string[]): Pitch[] => s.map((x) => pitch.parsePitch(x));
const text = (mode: 'sequence' | 'together', octave: 'exact' | 'any', targets: Pitch[], hideCheck = false) =>
  playKeyboardInstruction({ mode, octave, targets }, hideCheck);

describe('play-keyboard instruction wording', () => {
  it('find-every style: choose each key, press again to undo, never says chord', () => {
    const t = text('together', 'exact', ps('C4', 'C5', 'C6'));
    expect(t).toBe('Press each key to choose it (press again to undo), then press Check.');
    expect(t).not.toMatch(/chord/i);
  });

  it('a group of black keys', () => {
    expect(text('together', 'exact', ps('C#4', 'D#4'))).toBe(
      'Press each black key to choose it (press again to undo), then press Check.',
    );
    expect(text('together', 'exact', ps('F#4', 'G#4', 'A#4'))).toMatch(/^Press each black key/);
  });

  it('a real chord keeps chord wording, even an all-black one', () => {
    expect(text('together', 'exact', ps('C4', 'E4', 'G4'))).toBe(
      'Press each key of the chord to turn it on or off, then press Check.',
    );
    expect(text('together', 'exact', ps('F#4', 'A#4', 'C#5'))).toMatch(/chord/);
  });

  it('drops "then press Check" when the host has no Check button', () => {
    expect(text('together', 'exact', ps('C4', 'C5'), true)).toBe('Press each key to choose it (press again to undo).');
    expect(text('together', 'exact', ps('C4', 'E4', 'G4'), true)).toBe('Press each key of the chord to turn it on or off.');
  });

  it('sequence: one note reads naturally, several say how many', () => {
    expect(text('sequence', 'exact', ps('E4'))).toBe('Press the key that plays the note.');
    expect(text('sequence', 'exact', ps('C4', 'D4', 'E4'))).toBe('Play the 3 notes one after another.');
  });

  it('any octave says so', () => {
    expect(text('sequence', 'any', ps('E4'))).toBe('Press the key that plays the note. Any octave is fine.');
  });

  it('every keyboard-find ask gets wording that fits (no chord wording except for chords)', () => {
    const asks = ['find-every', 'black-keys', 'next-note', 'previous-note', 'step'] as const;
    const seen = new Set<string>();
    for (const ask of asks) {
      for (let seed = 1; seed <= 12; seed++) {
        const q = generate({ ask }, createRng(seed), 'uk');
        const payload = q.payload as PlayKeyboardPayload;
        const t = playKeyboardInstruction(payload, false);
        seen.add(`${ask}: ${t}`);
        expect(/chord/i.test(t), `${ask}: ${t}`).toBe(false);
        expect(t.length).toBeGreaterThan(10);
      }
    }
    expect([...seen].sort()).toEqual([
      'black-keys: Press each black key to choose it (press again to undo), then press Check.',
      'find-every: Press each key to choose it (press again to undo), then press Check.',
      'next-note: Press the key that plays the note. Any octave is fine.',
      'previous-note: Press the key that plays the note. Any octave is fine.',
      'step: Press the key that plays the note.',
    ]);
  });
});
