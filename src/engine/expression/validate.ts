import type { EventRef, Passage } from '../types';
import { exprOf, layoutOf, place, resolve } from './util';
import { tempoSpans } from './tempo';

const BPM_MIN = 20;
const BPM_MAX = 240;
const WORDS_MAX = 24;

const KIND_NAME = {
  cresc: 'crescendo',
  dim: 'diminuendo',
  accel: 'accelerando',
  rit: 'ritardando',
  rall: 'rallentando',
} as const;

const MARKER_NAME = {
  segno: 'segno',
  fine: 'Fine',
  dc: 'D.C.',
  'dc-al-fine': 'D.C. al Fine',
  ds: 'D.S.',
  'ds-al-fine': 'D.S. al Fine',
} as const;

const bpmOk = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= BPM_MIN && v <= BPM_MAX;

/**
 * Checks every rule of docs/expression.md section 2. Returns plain-English
 * messages (empty when the markings are valid), each naming the bar and event
 * ("Bar 2, note 3: ..."). Events are counted from 1 and rests are counted.
 * Never throws on a badly shaped passage; shape is the schemas' job.
 *
 * Beyond the written rules it also reports tempo changes that overlap each
 * other (the tempo map cannot follow two at once), the way hairpins may not.
 */
export function validateExpression(passage: Passage): string[] {
  const problems: string[] = [];
  const layout = layoutOf(passage);
  const x = exprOf(passage);
  const nBars = passage.bars.length;

  /** Rule 1: the reference must point at an event. */
  const at = (ref: EventRef, what: string): number | undefined => {
    const i = resolve(layout, ref);
    if (i !== undefined) return i;
    const bar = Number.isInteger(ref?.bar) ? ref.bar : -1;
    const where = `Bar ${bar + 1}, event ${Number.isInteger(ref?.event) ? ref.event + 1 : '?'}`;
    if (bar < 0 || bar >= nBars) {
      problems.push(`${where}: ${what} points at a bar that does not exist (the passage has ${nBars})`);
    } else {
      const count = passage.bars[bar]!.events.length;
      problems.push(`${where}: ${what} points at an event that does not exist (bar ${bar + 1} has ${count})`);
    }
    return undefined;
  };
  const span = (from: EventRef, to: EventRef, what: string): [number, number] | undefined => {
    const a = at(from, what);
    const b = at(to, what);
    if (a === undefined || b === undefined) return undefined;
    if (b < a) {
      problems.push(`${place(passage, to)}: ${what} ends before it starts (it starts at ${place(passage, from).toLowerCase()})`);
      return undefined;
    }
    return [a, b];
  };

  // Rule 3: dynamics.
  const dynAt = new Map<number, string>();
  for (const d of x.dynamics) {
    const i = at(d.at, 'this dynamic');
    if (i === undefined) continue;
    if (dynAt.has(i)) {
      problems.push(`${place(passage, d.at)}: there is more than one dynamic on this event`);
      continue;
    }
    dynAt.set(i, d.level);
  }
  let previous: string | undefined;
  for (const i of [...dynAt.keys()].sort((a, b) => a - b)) {
    const level = dynAt.get(i)!;
    if (level === previous) {
      const f = layout.flat[i]!;
      problems.push(
        `${place(passage, { bar: f.bar, event: f.event })}: the dynamic ${level} is the same as the one before it; two dynamics in a row must be different`,
      );
    }
    previous = level;
  }

  // Slurs (rule 2).
  for (const s of x.slurs) {
    const a = at(s.from, 'this slur');
    const b = at(s.to, 'this slur');
    if (a === undefined || b === undefined) continue;
    if (layout.flat[a]!.ev.kind !== 'note') problems.push(`${place(passage, s.from)}: a slur must start on a note`);
    if (layout.flat[b]!.ev.kind !== 'note') problems.push(`${place(passage, s.to)}: a slur must end on a note`);
    if (b < a) {
      problems.push(`${place(passage, s.to)}: a slur ends before it starts (it starts at ${place(passage, s.from).toLowerCase()})`);
    } else if (a === b) {
      problems.push(`${place(passage, s.from)}: a slur must join two or more different notes, but this one starts and ends on the same note`);
    }
  }

  // Hairpins (rules 2 and 4).
  const hairpins: { from: EventRef; to: EventRef; range: [number, number]; kind: 'cresc' | 'dim' }[] = [];
  for (const h of x.hairpins) {
    const range = span(h.from, h.to, `this ${KIND_NAME[h.kind]} hairpin`);
    if (range) hairpins.push({ from: h.from, to: h.to, range, kind: h.kind });
  }
  hairpins.forEach((h, k) => {
    const earlier = hairpins.slice(0, k).find((o) => h.range[0] <= o.range[1] && o.range[0] <= h.range[1]);
    if (earlier) {
      problems.push(
        `${place(passage, h.from)}: this ${KIND_NAME[h.kind]} hairpin overlaps the ${KIND_NAME[earlier.kind]} hairpin that starts at ${place(passage, earlier.from).toLowerCase()}`,
      );
    }
  });

  // Tempo (rule 5).
  if (x.tempo?.bpm !== undefined && !bpmOk(x.tempo.bpm)) {
    problems.push(`Bar 1, event 1: the metronome mark must be ${BPM_MIN} to ${BPM_MAX} beats a minute (got ${String(x.tempo.bpm)})`);
  }
  const changeRanges: { range: [number, number]; from: EventRef; kind: 'accel' | 'rit' | 'rall' }[] = [];
  for (const c of x.tempoChanges) {
    if (c.kind === 'a-tempo') continue;
    const range = span(c.from, c.to, `this ${KIND_NAME[c.kind]}`);
    if (c.toBpm !== undefined && !bpmOk(c.toBpm)) {
      problems.push(
        `${place(passage, c.from)}: the target tempo of this ${KIND_NAME[c.kind]} must be ${BPM_MIN} to ${BPM_MAX} beats a minute (got ${String(c.toBpm)})`,
      );
    }
    if (range) changeRanges.push({ range, from: c.from, kind: c.kind });
  }
  changeRanges.forEach((c, k) => {
    const earlier = changeRanges.slice(0, k).find((o) => c.range[0] <= o.range[1] && o.range[0] <= c.range[1]);
    if (earlier) {
      problems.push(
        `${place(passage, c.from)}: this ${KIND_NAME[c.kind]} overlaps the ${KIND_NAME[earlier.kind]} that starts at ${place(passage, earlier.from).toLowerCase()}`,
      );
    }
  });
  const ended = tempoSpans(passage, layout);
  for (const c of x.tempoChanges) {
    if (c.kind !== 'a-tempo') continue;
    const i = at(c.at, 'this a tempo');
    if (i === undefined) continue;
    if (!ended.some((s) => s.i1 < i)) {
      problems.push(`${place(passage, c.at)}: a tempo must come after an accelerando, ritardando or rallentando that has ended`);
    }
  }

  // Rule 6: words.
  for (const w of x.words) {
    if (at(w.at, 'this word marking') === undefined) continue;
    const len = typeof w.text === 'string' ? w.text.length : 0;
    if (len < 1 || len > WORDS_MAX) {
      problems.push(`${place(passage, w.at)}: words must be 1 to ${WORDS_MAX} characters (got ${len})`);
    }
  }

  // Rule 7: repeats and navigation (bar-level).
  const anyStart = passage.bars.some((b) => b.repeatStart);
  let open: number | null = null;
  let closedOne = false;
  passage.bars.forEach((bar, b) => {
    if (bar.repeatStart) {
      if (open !== null) problems.push(`Bar ${b + 1}: this start repeat comes before the repeat started in bar ${open + 1} has been closed`);
      open = b;
    }
    if (bar.endBarline === 'repeat-end') {
      if (open !== null) {
        open = null;
      } else if (!anyStart && !closedOne) {
        // No start sign anywhere: the repeat goes back to the beginning.
      } else {
        problems.push(`Bar ${b + 1}: this repeat end has no start repeat sign before it`);
      }
      closedOne = true;
    }
  });
  if (open !== null) problems.push(`Bar ${(open as number) + 1}: this start repeat has no repeat end after it`);

  const segnos = passage.bars.flatMap((bar, b) => (bar.marker === 'segno' ? [b] : []));
  segnos.slice(1).forEach((b) => {
    problems.push(`Bar ${b + 1}: only one segno is allowed (the first is in bar ${segnos[0]! + 1})`);
  });
  const hasFine = passage.bars.some((bar) => bar.marker === 'fine');
  passage.bars.forEach((bar, b) => {
    const m = bar.marker;
    if ((m === 'ds' || m === 'ds-al-fine') && segnos.length === 0) {
      problems.push(`Bar ${b + 1}: ${MARKER_NAME[m]} needs a segno marked in the passage`);
    }
    if ((m === 'dc-al-fine' || m === 'ds-al-fine') && !hasFine) {
      problems.push(`Bar ${b + 1}: ${MARKER_NAME[m]} needs a Fine marked in the passage`);
    }
  });

  // Rule 8: a tied continuation carries no articulation or pause.
  layout.flat.forEach((f, i) => {
    if (!layout.continuation[i] || f.ev.kind !== 'note') return;
    if ((f.ev.articulations ?? []).length > 0 || f.ev.fermata) {
      problems.push(
        `${place(passage, { bar: f.bar, event: f.event })}: this note continues a tie, so it cannot have its own articulation or pause; put it on the first note of the tie`,
      );
    }
  });

  return problems;
}
