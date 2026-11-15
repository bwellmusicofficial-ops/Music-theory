/** Small formatting helpers for the mock test screens. */

/** "rhythm.note-values.dotted" -> "Rhythm: note values: dotted". */
export function skillLabel(skill: string): string {
  const words = skill.split('.').map((part) => part.replace(/-/g, ' '));
  const text = words.join(': ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** 0.6667 -> "67%". */
export function percent(fraction: number): string {
  return `${Math.round((Number.isFinite(fraction) ? fraction : 0) * 100)}%`;
}

/** Marks to at most one decimal place: 24 -> "24", 23.5 -> "23.5". */
export function marks(points: number): string {
  return String(Math.round(points * 10) / 10);
}

/** 125000 ms -> "2 min 5 s". */
export function duration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s} s`;
  return s === 0 ? `${m} min` : `${m} min ${s} s`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "2026-11-15T10:00:00.000Z" -> "15 Nov 2026"; the raw text when it is not a date. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
