import { describe, expect, it } from 'vitest';
import { normaliseBaseUrl, pianoSampleUrls } from './samples';

describe('pianoSampleUrls', () => {
  const urls = pianoSampleUrls();
  it('has 30 samples every minor third from A0 to C8', () => {
    const keys = Object.keys(urls);
    expect(keys).toHaveLength(30);
    expect(keys[0]).toBe('A0');
    expect(keys[1]).toBe('C1');
    expect(keys[2]).toBe('D#1');
    expect(keys[3]).toBe('F#1');
    expect(keys[keys.length - 1]).toBe('C8');
  });
  it('maps sharps to Fs/Ds file names', () => {
    expect(urls['F#4']).toBe('Fs4.mp3');
    expect(urls['D#1']).toBe('Ds1.mp3');
    expect(urls['C4']).toBe('C4.mp3');
    expect(urls['A0']).toBe('A0.mp3');
  });
  it('honours the extension', () => {
    expect(pianoSampleUrls('ogg')['C4']).toBe('C4.ogg');
  });
});

describe('normaliseBaseUrl', () => {
  it('ensures a single trailing slash', () => {
    expect(normaliseBaseUrl('/a')).toBe('/a/');
    expect(normaliseBaseUrl('/a/')).toBe('/a/');
  });
});
