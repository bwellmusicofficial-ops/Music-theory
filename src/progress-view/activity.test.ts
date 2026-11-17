import { describe, expect, it } from 'vitest';
import { sessionsOf, startOfWeek, streak, weakestSkills, weekSummary } from './activity';
import { attempt, sampleLessons } from './test-fixtures';

// Wednesday 18 November 2026, 12:00 local time. Local constructors keep these independent of the machine's time zone.
const NOW = new Date(2026, 10, 18, 12, 0, 0);
const at = (day: number, h: number, m = 0, s = 0) => new Date(2026, 10, day, h, m, s);

describe('startOfWeek', () => {
  it('is Monday 00:00 local', () => {
    expect(startOfWeek(NOW)).toEqual(new Date(2026, 10, 16));
    expect(startOfWeek(new Date(2026, 10, 16, 0, 0, 1))).toEqual(new Date(2026, 10, 16));
    expect(startOfWeek(new Date(2026, 10, 22, 23, 59))).toEqual(new Date(2026, 10, 16));
    expect(startOfWeek(new Date(2026, 10, 23))).toEqual(new Date(2026, 10, 23));
  });
});

describe('sessionsOf', () => {
  it('splits on gaps of 30 minutes or more, not less', () => {
    const rows = [
      attempt(at(18, 9, 0)),
      attempt(at(18, 9, 29, 59)), // 29:59 later: same session
      attempt(at(18, 10, 0)), // 30:01 after the last: new session
      attempt(at(18, 10, 30)), // exactly 30 min after: new session
    ];
    expect(sessionsOf(rows).map((s) => s.attempts)).toEqual([2, 1, 1]);
  });

  it('orders attempts itself and drops unreadable times', () => {
    const rows = [attempt(at(18, 9, 10)), attempt(at(18, 9, 0)), attempt(at(18, 9, 5), { at: 'nonsense' })];
    const s = sessionsOf(rows);
    expect(s).toHaveLength(1);
    expect(s[0]!.attempts).toBe(2);
    expect(s[0]!.end - s[0]!.start).toBe(10 * 60000);
  });

  it('starts a session when the first answer started, using the time it took', () => {
    const [s] = sessionsOf([attempt(at(18, 9, 0), { msTaken: 20000 }), attempt(at(18, 9, 1), { msTaken: 5000 })]);
    expect(s!.end - s!.start).toBe(80000);
  });

  it('caps one slow answer and tolerates a bad msTaken', () => {
    const [s] = sessionsOf([attempt(at(18, 9, 0), { msTaken: 3_600_000 })]);
    expect(s!.end - s!.start).toBe(5 * 60000);
    const [t] = sessionsOf([attempt(at(18, 9, 0), { msTaken: Number.NaN }), attempt(at(18, 9, 0, 30), { msTaken: -5 })]);
    expect(t!.end - t!.start).toBe(30000);
  });

  it('is empty for no attempts', () => {
    expect(sessionsOf([])).toEqual([]);
  });
});

describe('weekSummary', () => {
  it('counts minutes and sessions since Monday, up to now', () => {
    const rows = [
      attempt(at(15, 20, 0)), // Sunday: last week
      attempt(at(16, 8, 0), { msTaken: 30000 }),
      attempt(at(16, 8, 4)), // session 1: 4.5 minutes
      attempt(at(17, 18, 0), { msTaken: 60000 }),
      attempt(at(17, 18, 9)), // session 2: 10 minutes
      attempt(at(18, 13, 0)), // after now: ignored
    ];
    expect(weekSummary(rows, NOW)).toEqual({ ms: 270000 + 600000, minutes: 15, sessions: 2, attempts: 4 });
  });

  it('is all zeros with nothing this week, and at least a minute for any practice', () => {
    expect(weekSummary([], NOW)).toEqual({ ms: 0, minutes: 0, sessions: 0, attempts: 0 });
    expect(weekSummary([attempt(at(15, 20, 0))], NOW).sessions).toBe(0);
    expect(weekSummary([attempt(at(17, 9, 0), { msTaken: 2000 })], NOW)).toMatchObject({ minutes: 1, sessions: 1 });
  });

  it('includes the first moment of Monday', () => {
    expect(weekSummary([attempt(at(16, 0, 0, 0))], NOW).attempts).toBe(1);
  });
});

describe('streak', () => {
  it('counts consecutive days ending today', () => {
    const rows = [attempt(at(18, 9)), attempt(at(18, 10)), attempt(at(17, 9)), attempt(at(16, 23, 59))];
    expect(streak(rows, NOW)).toEqual({ days: 3, activeToday: true });
  });

  it('keeps yesterday\'s streak alive until today ends', () => {
    expect(streak([attempt(at(17, 9)), attempt(at(16, 9))], NOW)).toEqual({ days: 2, activeToday: false });
  });

  it('is broken by a missed day', () => {
    expect(streak([attempt(at(18, 9)), attempt(at(16, 9))], NOW)).toEqual({ days: 1, activeToday: true });
    expect(streak([attempt(at(16, 9)), attempt(at(15, 9))], NOW)).toEqual({ days: 0, activeToday: false });
  });

  it('crosses a month boundary and ignores the future and bad dates', () => {
    const now = new Date(2026, 11, 1, 9);
    const rows = [attempt(new Date(2026, 10, 30, 9)), attempt(new Date(2026, 10, 29, 9)), attempt(new Date(2026, 11, 2, 9)), attempt(now, { at: 'x' })];
    expect(streak(rows, now)).toEqual({ days: 2, activeToday: false });
  });

  it('is zero with no attempts', () => {
    expect(streak([], NOW)).toEqual({ days: 0, activeToday: false });
  });
});

describe('weakestSkills', () => {
  const lessons = sampleLessons();
  const many = (skill: string, right: number, wrong: number, start = 0) => [
    ...Array.from({ length: right }, (_, i) => attempt(new Date(2026, 10, 10, 9, start + i), { skill, correct: true })),
    ...Array.from({ length: wrong }, (_, i) => attempt(new Date(2026, 10, 10, 11, start + i), { skill, correct: false })),
  ];

  it('ranks by lowest accuracy, with the lessons that teach each skill', () => {
    const rows = [
      ...many('pitch.treble.lines', 2, 3), // 40%
      ...many('rhythm.note-values.quaver', 3, 2), // 60%
      ...many('pitch.treble.spaces', 9, 1), // 90%: not worth another look
    ];
    const weak = weakestSkills(rows, lessons);
    expect(weak.map((w) => w.skill)).toEqual(['pitch.treble.lines', 'rhythm.note-values.quaver']);
    expect(weak[0]).toMatchObject({ accuracy: 0.4, attempts: 5, label: 'Treble clef lines' });
    expect(weak[0]!.lessons.map((l) => l.id)).toEqual(['g3']);
    expect(weak[1]!.lessons.map((l) => l.id)).toEqual(['g1', 'g2']);
  });

  it('needs at least five attempts in the window', () => {
    expect(weakestSkills(many('pitch.treble.lines', 0, 4), lessons)).toEqual([]);
    expect(weakestSkills(many('pitch.treble.lines', 0, 5), lessons)).toHaveLength(1);
  });

  it('looks only at the last 200 attempts', () => {
    const old = many('pitch.treble.lines', 0, 10); // all wrong, but long ago
    const recent = Array.from({ length: 200 }, (_, i) => attempt(new Date(2026, 10, 12, 8, 0, i), { skill: 'rhythm.note-values.quaver', correct: true }));
    expect(weakestSkills([...old, ...recent], lessons)).toEqual([]);
    const withWindow = weakestSkills([...old, ...recent], lessons, { window: 205 });
    expect(withWindow.map((w) => w.skill)).toEqual(['pitch.treble.lines']);
    expect(withWindow[0]!.attempts).toBe(5);
  });

  it('breaks ties by more attempts, then skill id, and respects the limit', () => {
    const rows = [...many('pitch.treble.spaces', 3, 3), ...many('pitch.treble.lines', 2, 2, 20), ...many('rhythm.note-values.quaver', 5, 5, 30)];
    // all 50% apart from treble.lines, which has 4 attempts and is dropped
    expect(weakestSkills(rows, lessons).map((w) => w.skill)).toEqual(['rhythm.note-values.quaver', 'pitch.treble.spaces']);
    expect(weakestSkills(rows, lessons, { limit: 1 })).toHaveLength(1);
    expect(weakestSkills(rows, lessons, { limit: 0 })).toEqual([]);
  });

  it('leaves out skills that no lesson teaches', () => {
    expect(weakestSkills(many('pitch.unknown.thing', 0, 8), lessons)).toEqual([]);
  });

  it('is empty with no attempts', () => {
    expect(weakestSkills([], lessons)).toEqual([]);
  });
});
