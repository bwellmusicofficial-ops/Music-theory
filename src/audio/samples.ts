import { midiToSampleStem, midiToToneName } from './pitch';

/** Default location of the piano samples (served from /public/audio/piano/). */
export const DEFAULT_PIANO_BASE_URL = '/audio/piano/';

const LOWEST_MIDI = 21; // A0
const HIGHEST_MIDI = 108; // C8
const STEP = 3; // minor third

/**
 * Sample map in the Salamander Grand Piano layout: one file every minor third
 * from A0 to C8 (A, C, D#, F# in every octave). Keys are Tone note names
 * ("F#4"); values are file names ("Fs4.mp3"). 30 files.
 */
export function pianoSampleUrls(extension = 'mp3'): Record<string, string> {
  const urls: Record<string, string> = {};
  for (let midi = LOWEST_MIDI; midi <= HIGHEST_MIDI; midi += STEP) {
    urls[midiToToneName(midi)] = `${midiToSampleStem(midi)}.${extension}`;
  }
  return urls;
}

/** Joins a base URL and ensures exactly one trailing slash. */
export function normaliseBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

/** Name of the small file next to the samples that lists which ones exist. */
export const PIANO_MANIFEST_FILE = 'manifest.json';

/**
 * Reads a manifest (`{ "files": ["A0.mp3", ...] }`) and keeps the sample map
 * entries whose files it lists. Anything else gives an empty map.
 */
export function availableSampleUrls(manifest: unknown, urls: Record<string, string> = pianoSampleUrls()): Record<string, string> {
  const files = (manifest as { files?: unknown } | null)?.files;
  if (!Array.isArray(files)) return {};
  const listed = new Set(files.filter((f): f is string => typeof f === 'string'));
  return Object.fromEntries(Object.entries(urls).filter(([, file]) => listed.has(file)));
}
