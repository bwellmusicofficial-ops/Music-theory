import type { Pitch, PitchClass } from '../types';

/** Independent formatter for test expectations (does not use the code under test). */
const ACC: Record<number, string> = { [-2]: 'bb', [-1]: 'b', 0: '', 1: '#', 2: 'x' };

export function pcStr(p: PitchClass): string {
  return `${p.letter}${ACC[p.accidental]}`;
}

export function pitchStr(p: Pitch): string {
  return `${pcStr(p)}${p.octave}`;
}

export function pcsStr(ps: PitchClass[]): string {
  return ps.map(pcStr).join(' ');
}

export function pitchesStr(ps: Pitch[]): string {
  return ps.map(pitchStr).join(' ');
}
