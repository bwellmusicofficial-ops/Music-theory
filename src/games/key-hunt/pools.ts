/**
 * Key Hunt: the keys each grade asks about, as data.
 *
 * A pool entry is a signature (positive sharps, negative flats) and a mode; the key itself
 * always comes from the pitch engine (`pitch.keyFromSignature`), so no key name or
 * signature is ever written out by hand here. Later grades are listed so the start screen
 * can show them, but only `available` pools can be chosen.
 */
import { pitch } from '@/engine/pitch';
import type { Key, Mode } from '@/engine/types';

export type GradeId = 'grade-1' | 'grade-2' | 'grade-3';

export interface PoolEntry {
  signature: number;
  mode: Mode;
}

export interface GradePool {
  id: GradeId;
  label: string;
  /** For the start screen, e.g. "C, G, D, F major". Built from the pool, see `describePool`. */
  entries: readonly PoolEntry[];
  available: boolean;
  /** Shown instead of the key list while the pool is locked. */
  lockedNote?: string;
}

const major = (signature: number): PoolEntry => ({ signature, mode: 'major' });
const minor = (signature: number): PoolEntry => ({ signature, mode: 'minor' });

/** C, G, D and F major: no sharps or flats, one sharp, two sharps, one flat. */
const GRADE_1: readonly PoolEntry[] = [major(0), major(1), major(2), major(-1)];
/** Grade 1 plus A, B flat and E flat major, and A, E and D minor. */
const GRADE_2: readonly PoolEntry[] = [...GRADE_1, major(3), major(-2), major(-3), minor(0), minor(1), minor(-1)];
/** Every major and relative minor up to four sharps or flats. */
const GRADE_3: readonly PoolEntry[] = [-4, -3, -2, -1, 0, 1, 2, 3, 4].flatMap((signature) => [major(signature), minor(signature)]);

export const GRADE_POOLS: readonly GradePool[] = [
  { id: 'grade-1', label: 'Grade 1', entries: GRADE_1, available: true },
  { id: 'grade-2', label: 'Grade 2', entries: GRADE_2, available: false, lockedNote: 'Coming with Grade 2 lessons' },
  { id: 'grade-3', label: 'Grade 3', entries: GRADE_3, available: false, lockedNote: 'Coming with Grade 3 lessons' },
];

export const DEFAULT_GRADE: GradeId = 'grade-1';

export function gradePool(id: GradeId): GradePool {
  return GRADE_POOLS.find((p) => p.id === id) ?? (GRADE_POOLS[0] as GradePool);
}

/** The keys of a pool, from the engine. */
export function poolKeys(pool: GradePool): Key[] {
  return pool.entries.map((e) => pitch.keyFromSignature(e.signature, e.mode));
}

/** "C, G, D and F major" for a pool of majors; minors are named in full after the majors. */
export function describePool(pool: GradePool): string {
  const keys = poolKeys(pool);
  const names = (mode: Mode) => keys.filter((k) => k.mode === mode).map((k) => pitch.displayPitchClass(k.tonic));
  const join = (list: string[]) => (list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);
  const majors = names('major');
  const minors = names('minor');
  if (minors.length === 0) return `${join(majors)} major`;
  return `${join(majors)} major; ${join(minors)} minor`;
}
