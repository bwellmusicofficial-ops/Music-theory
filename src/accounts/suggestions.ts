/**
 * Generated code-name suggestions: adjective + musical noun + two digits, for example
 * SwiftCello42. Friendly, non-identifying words only (no names, places, colours of
 * skin, ages). A test checks every combination against the starter blocked list and
 * the format rules, so a suggestion can never be refused.
 */
export const ADJECTIVES: readonly string[] = [
  'Swift', 'Bright', 'Calm', 'Cheery', 'Clever', 'Cosmic', 'Daring', 'Gentle', 'Golden', 'Happy',
  'Jolly', 'Lively', 'Lucky', 'Mellow', 'Merry', 'Misty', 'Nimble', 'Plucky', 'Quick', 'Quiet',
  'Rapid', 'Silver', 'Sleepy', 'Snowy', 'Sunny', 'Tidy', 'Twinkly', 'Vivid', 'Warm', 'Wavy',
  'Witty', 'Zesty', 'Breezy', 'Bouncy', 'Cozy', 'Dreamy', 'Fuzzy', 'Glowing', 'Humble', 'Kind',
];

export const NOUNS: readonly string[] = [
  'Cello', 'Piano', 'Flute', 'Violin', 'Drum', 'Harp', 'Tuba', 'Oboe', 'Banjo', 'Fiddle',
  'Bugle', 'Gong', 'Lute', 'Organ', 'Piccolo', 'Trumpet', 'Trombone', 'Clarinet', 'Marimba', 'Ukulele',
  'Tambourine', 'Triangle', 'Cymbal', 'Bassoon', 'Chime', 'Bell', 'Maraca', 'Kazoo', 'Whistle', 'Melody',
  'Chorus', 'Rhythm', 'Tempo', 'Sonata', 'Harmony', 'Lullaby', 'Echo', 'Encore', 'Crotchet', 'Quaver',
];

/** A random integer in [0, n) from the given source of numbers in [0, 1). */
type Random = () => number;

function secureRandom(): number {
  const b = new Uint32Array(1);
  globalThis.crypto.getRandomValues(b);
  return b[0]! / 2 ** 32;
}

function pick<T>(list: readonly T[], rnd: Random): T {
  return list[Math.floor(rnd() * list.length)]!;
}

export function generateSuggestion(rnd: Random = secureRandom): string {
  const digits = String(Math.floor(rnd() * 100)).padStart(2, '0');
  return `${pick(ADJECTIVES, rnd)}${pick(NOUNS, rnd)}${digits}`;
}

/** `count` different suggestions. */
export function generateSuggestions(count = 3, rnd: Random = secureRandom): string[] {
  const out = new Set<string>();
  while (out.size < count) out.add(generateSuggestion(rnd));
  return [...out];
}
