import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import {
  activeCount,
  createScheduler,
  nextEntry,
  recordOutcome,
  retire,
  RETRY_GAP_MAX,
  RETRY_GAP_MIN,
  WRONG_GAP_MAX,
  WRONG_GAP_MIN,
  WEIGHT_EVER_WRONG,
  WEIGHT_FAST_RIGHT,
  WEIGHT_SLOW_RIGHT,
  type SchedState,
} from './scheduler';
import type { Rng } from '@/engine/types';

const IDS = Array.from({ length: 12 }, (_, i) => `e${i}`);
const RIGHT_FAST = { correct: true, fast: true };
const RIGHT_SLOW = { correct: true, fast: false };
const WRONG = { correct: false, fast: false };

/** Shows the next card and answers it with `outcome(id, indexOfCard)`. Returns the id. */
function play(
  s: SchedState,
  rng: Rng,
  outcome: (id: string, n: number) => typeof WRONG,
): { id: string; state: SchedState } {
  const n = s.shown;
  const next = nextEntry(s, rng)!;
  return { id: next.id, state: recordOutcome(next.state, next.id, outcome(next.id, n), rng) };
}

describe('first pass', () => {
  it('shows every entry once, in a shuffled order, before any repeats', () => {
    const rng = createRng(1);
    let s = createScheduler(IDS, rng);
    const seen: string[] = [];
    for (let i = 0; i < IDS.length; i++) {
      const r = play(s, rng, () => RIGHT_FAST);
      seen.push(r.id);
      s = r.state;
    }
    expect([...seen].sort()).toEqual([...IDS].sort());
    expect(seen).not.toEqual(IDS); // shuffled (for this seed)
  });
  it('ignores duplicate ids and reports how many entries are in circulation', () => {
    const s = createScheduler(['a', 'b', 'a', 'c'], createRng(1));
    expect(activeCount(s)).toBe(3);
  });
});

describe('a wrong answer', () => {
  it('comes back after 3 to 5 other cards, whatever the seed', () => {
    const gaps = new Set<number>();
    for (let seed = 0; seed < 300; seed++) {
      const rng = createRng(seed);
      let s = createScheduler(IDS, rng);
      const first = play(s, rng, () => WRONG);
      s = first.state;
      const target = first.id;
      let others = 0;
      for (let guard = 0; guard < 30; guard++) {
        const r = play(s, rng, () => RIGHT_FAST);
        s = r.state;
        if (r.id === target) break;
        others++;
      }
      expect(others).toBeGreaterThanOrEqual(WRONG_GAP_MIN);
      expect(others).toBeLessThanOrEqual(WRONG_GAP_MAX);
      gaps.add(others);
    }
    expect([...gaps].sort()).toEqual([3, 4, 5]);
  });

  it('needs two right answers: after the first it returns once more, after 6 to 9 other cards', () => {
    for (let seed = 0; seed < 200; seed++) {
      const rng = createRng(seed);
      let s = createScheduler(IDS, rng);
      const target = nextEntry(s, createRng(seed))!.id; // same shuffle as the first card
      let wrongOnce = false;
      let sawSecond = false;
      let sawThird = false;
      let others = 0;
      let phase: 'first' | 'afterWrong' | 'afterRight' = 'first';
      for (let i = 0; i < 60 && !sawThird; i++) {
        const r = play(s, rng, (id) => {
          if (id !== target) return RIGHT_FAST;
          if (!wrongOnce) {
            wrongOnce = true;
            return WRONG;
          }
          return RIGHT_SLOW;
        });
        s = r.state;
        if (r.id === target) {
          if (phase === 'first') {
            phase = 'afterWrong';
            others = 0;
          } else if (phase === 'afterWrong') {
            expect(others).toBeGreaterThanOrEqual(WRONG_GAP_MIN);
            expect(others).toBeLessThanOrEqual(WRONG_GAP_MAX);
            sawSecond = true;
            phase = 'afterRight';
            others = 0;
          } else {
            expect(others).toBeGreaterThanOrEqual(RETRY_GAP_MIN);
            expect(others).toBeLessThanOrEqual(RETRY_GAP_MAX);
            sawThird = true;
          }
        } else {
          others++;
        }
      }
      expect(sawSecond, `seed ${seed}`).toBe(true);
      expect(sawThird, `seed ${seed}`).toBe(true);
    }
  });

  it('is done after two right answers: the entry is then no longer due', () => {
    const rng = createRng(5);
    let s = createScheduler(IDS, rng);
    const a = nextEntry(s, rng)!;
    s = recordOutcome(a.state, a.id, WRONG, rng);
    expect(s.entries[a.id]).toMatchObject({ needRight: 2, wrong: 1 });
    const gap = s.entries[a.id].dueAt! - 1 - s.entries[a.id].shownAt;
    expect(gap).toBeGreaterThanOrEqual(WRONG_GAP_MIN);
    expect(gap).toBeLessThanOrEqual(WRONG_GAP_MAX);
    s = recordOutcome(s, a.id, RIGHT_SLOW, rng);
    expect(s.entries[a.id]).toMatchObject({ needRight: 1 });
    expect(s.entries[a.id].dueAt).not.toBeNull();
    s = recordOutcome(s, a.id, RIGHT_SLOW, rng);
    expect(s.entries[a.id]).toMatchObject({ needRight: 0, dueAt: null });
  });

  it('starts again at 3 to 5 if it is wrong a second time', () => {
    const rng = createRng(8);
    let s = createScheduler(IDS, rng);
    const a = nextEntry(s, rng)!;
    s = recordOutcome(a.state, a.id, WRONG, rng);
    s = recordOutcome(s, a.id, RIGHT_FAST, rng);
    expect(s.entries[a.id].needRight).toBe(1);
    s = recordOutcome(s, a.id, WRONG, rng);
    expect(s.entries[a.id].needRight).toBe(2);
    const gap = s.entries[a.id].dueAt! - 1 - s.entries[a.id].shownAt;
    expect(gap).toBeGreaterThanOrEqual(WRONG_GAP_MIN);
    expect(gap).toBeLessThanOrEqual(WRONG_GAP_MAX);
  });

  it('goes before a fresh card once due, longest overdue first', () => {
    const rng = createRng(3);
    let s = createScheduler(IDS, rng);
    const a = nextEntry(s, rng)!;
    s = recordOutcome(a.state, a.id, WRONG, rng);
    const b = nextEntry(s, rng)!;
    s = recordOutcome(b.state, b.id, WRONG, rng);
    // Skip ahead without answering: jump the turn counter far past both due times.
    s = { ...s, shown: 50 };
    const first = nextEntry(s, rng)!;
    const second = nextEntry(recordOutcome(first.state, first.id, RIGHT_FAST, rng), rng)!;
    expect([first.id, second.id].sort()).toEqual([a.id, b.id].sort());
    const dueA = s.entries[a.id].dueAt!;
    const dueB = s.entries[b.id].dueAt!;
    expect(first.id).toBe(dueA <= dueB ? a.id : b.id);
  });

  it('counts a timeout like any wrong answer (the game records it as wrong)', () => {
    const rng = createRng(2);
    const s0 = createScheduler(IDS, rng);
    const a = nextEntry(s0, rng)!;
    const s = recordOutcome(a.state, a.id, { correct: false, fast: false }, rng);
    expect(s.entries[a.id].wrong).toBe(1);
  });
});

describe('after the first pass', () => {
  /** Plays a full first pass, answering by the rule, and returns the state. */
  function afterFirstPass(rule: (id: string) => typeof WRONG, seed = 1) {
    const rng = createRng(seed);
    let s = createScheduler(IDS, rng);
    for (let i = 0; i < IDS.length; i++) s = play(s, rng, (id) => rule(id)).state;
    return { s, rng };
  }
  /** Draws many cards without recording outcomes (so the weights stay as they are). */
  function draw(s: SchedState, rng: Rng, n: number): Record<string, number> {
    const counts: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const next = nextEntry(s, rng)!;
      counts[next.id] = (counts[next.id] ?? 0) + 1;
      // Keep the state's history but reset the "last" and due bookkeeping so draws stay independent.
      s = { ...next.state, last: null };
    }
    return counts;
  }

  it('brings a card answered right quickly back rarely, and one answered slowly or wrong more often', () => {
    // e0 fast, e1 wrong then right twice slowly (ever wrong), the rest slow.
    const { s: base, rng } = afterFirstPass((id) => (id === 'e0' ? RIGHT_FAST : RIGHT_SLOW));
    let s = base;
    // Make e1 an ever-wrong entry that is finished.
    s = recordOutcome(s, 'e1', WRONG, rng);
    s = recordOutcome(s, 'e1', RIGHT_SLOW, rng);
    s = recordOutcome(s, 'e1', RIGHT_SLOW, rng);
    s = { ...s, entries: { ...s.entries, e1: { ...s.entries.e1, dueAt: null } } };
    const counts = draw(s, createRng(77), 6000);
    const total = WEIGHT_FAST_RIGHT + WEIGHT_EVER_WRONG + 10 * WEIGHT_SLOW_RIGHT;
    const expected = (w: number) => (6000 * w) / total;
    expect(counts.e0).toBeGreaterThan(expected(WEIGHT_FAST_RIGHT) * 0.7);
    expect(counts.e0).toBeLessThan(expected(WEIGHT_FAST_RIGHT) * 1.3);
    expect(counts.e1).toBeGreaterThan(expected(WEIGHT_EVER_WRONG) * 0.9);
    expect(counts.e1).toBeLessThan(expected(WEIGHT_EVER_WRONG) * 1.1);
    expect(counts.e2).toBeGreaterThan(expected(WEIGHT_SLOW_RIGHT) * 0.85);
    expect(counts.e2).toBeLessThan(expected(WEIGHT_SLOW_RIGHT) * 1.15);
    // So a quick card appears at about a quarter of the rate of a slow one, and an eighth of a troublesome one.
    expect(counts.e0).toBeLessThan(counts.e2 / 3);
    expect(counts.e0).toBeLessThan(counts.e1 / 6);
  });

  it('never shows the card it just showed, unless it is the only one', () => {
    const { s: start, rng } = afterFirstPass(() => RIGHT_SLOW, 4);
    let s = start;
    let last: string | null = null;
    for (let i = 0; i < 200; i++) {
      const r = play(s, rng, () => RIGHT_SLOW);
      expect(r.id).not.toBe(last);
      last = r.id;
      s = r.state;
    }
    const solo = createScheduler(['only'], createRng(1));
    const a = nextEntry(solo, createRng(1))!;
    const b = nextEntry(recordOutcome(a.state, 'only', RIGHT_SLOW, createRng(1)), createRng(1))!;
    expect(b.id).toBe('only');
  });
});

describe('retiring and purity', () => {
  it('takes a retired entry out of the queue and the draws, and returns null when none are left', () => {
    const rng = createRng(1);
    let s = createScheduler(['a', 'b'], rng);
    s = retire(s, 'a');
    expect(s.queue).toEqual(['b']);
    expect(activeCount(s)).toBe(1);
    const r = nextEntry(s, rng)!;
    expect(r.id).toBe('b');
    expect(nextEntry(retire(r.state, 'b'), rng)).toBeNull();
    expect(retire(s, 'zzz')).toBe(s);
  });
  it('does not change the state it is given', () => {
    const rng = createRng(1);
    const s = createScheduler(IDS, rng);
    const snapshot = JSON.stringify(s);
    const r = nextEntry(s, rng)!;
    recordOutcome(r.state, r.id, WRONG, rng);
    retire(s, 'e0');
    expect(JSON.stringify(s)).toBe(snapshot);
  });
  it('is repeatable from a seed', () => {
    const run = () => {
      const rng = createRng(21);
      let s = createScheduler(IDS, rng);
      const out: string[] = [];
      for (let i = 0; i < 40; i++) {
        const r = play(s, rng, (_id, n) => (n % 3 === 0 ? WRONG : RIGHT_FAST));
        out.push(r.id);
        s = r.state;
      }
      return out;
    };
    expect(run()).toEqual(run());
  });
});
