import { describe, expect, it } from 'vitest';
import type { Pitch } from '@/engine/types';
import { midiToFrequency, midiToSampleStem, midiToToneName, pitchToFrequency, pitchToMidi } from './pitch';

const p = (letter: Pitch['letter'], accidental: Pitch['accidental'], octave: number): Pitch => ({
  letter,
  accidental,
  octave,
});

describe('pitchToMidi', () => {
  it.each([
    [p('C', 0, 4), 60],
    [p('A', 0, 4), 69],
    [p('A', 0, 0), 21],
    [p('C', 0, 8), 108],
    [p('C', 1, 4), 61],
    [p('D', -1, 4), 61],
    [p('B', 0, 3), 59],
    [p('C', -1, 4), 59],
    [p('B', 1, 3), 60],
    [p('F', 2, 4), 67],
    [p('E', -2, 2), 38],
    [p('C', 0, -1), 0],
  ])('%j -> %i', (pitch, midi) => {
    expect(pitchToMidi(pitch)).toBe(midi);
  });
});

describe('frequency', () => {
  it('A4 is 440 Hz and C4 is middle C', () => {
    expect(midiToFrequency(69)).toBe(440);
    expect(midiToFrequency(60)).toBeCloseTo(261.6256, 3);
    expect(pitchToFrequency(p('A', 0, 5))).toBeCloseTo(880, 9);
    expect(pitchToFrequency(p('A', 0, 0))).toBeCloseTo(27.5, 9);
  });
  it('enharmonic spellings sound the same', () => {
    expect(pitchToFrequency(p('F', 1, 4))).toBe(pitchToFrequency(p('G', -1, 4)));
  });
});

describe('sample names', () => {
  it('uses Salamander stems', () => {
    expect(midiToSampleStem(61)).toBe('Cs4');
    expect(midiToSampleStem(66)).toBe('Fs4');
    expect(midiToSampleStem(21)).toBe('A0');
    expect(midiToToneName(66)).toBe('F#4');
    expect(midiToToneName(108)).toBe('C8');
  });
});
