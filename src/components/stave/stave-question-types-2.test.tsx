// @vitest-environment jsdom
/** Stave support for the new question types (docs/question-types-2.md section 1): written beams, gaps, key-signature edit. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Bar, Passage } from '@/engine/types';
import { pitch } from '@/engine/pitch';
import { bar, constraints, deepFreeze, engines, note, passage, rest } from './fixtures';
import { createReducer } from './edit/reducer';
import { getStaveLayout } from './layout-registry';
import { beamIndexGroups } from './notation/to-vexflow';
import { Stave } from './stave';
import { gapPlaces } from './stave-gap-buttons';
import { installStaveStubs } from './test-utils';
import type { KeySignatureSign, StaveGapRef, StaveProps } from './types';

vi.mock('@/audio', () => ({ getAudioEngine: () => ({ noteOn() {}, noteOff() {}, isUnlocked: () => true, unlock: async () => {} }) }));

beforeAll(() => installStaveStubs());
afterEach(cleanup);

const quavers = (n: number) => Array.from({ length: n }, (_, i) => note(['C5', 'D5', 'E5', 'F5'][i % 4], 'quaver'));
const withBeams = (beams?: number[][]): Bar => ({ events: [...quavers(4), note('G4', 'minim')], ...(beams ? { beams } : {}) });
const time = { beats: 4, beatUnit: 4 as const };

async function drawn(container: HTMLElement) {
  await waitFor(() => expect(container.querySelector('.vf-stave')).toBeTruthy());
}

// --- 1.1 written beams --------------------------------------------------------------------

describe('written beams: beamIndexGroups', () => {
  it('without bar.beams it is the standard grouping (four quavers in 4/4 are one group: beats 1 and 2)', () => {
    expect(beamIndexGroups(engines, withBeams(), time)).toEqual([[0, 1, 2, 3]]);
  });
  it('bar.beams replaces the standard grouping', () => {
    expect(beamIndexGroups(engines, withBeams([[0, 1], [2, 3]]), time)).toEqual([[0, 1], [2, 3]]);
    expect(beamIndexGroups(engines, withBeams([[1, 2]]), time)).toEqual([[1, 2]]);
  });
  it('[] means no beams, not the standard ones', () => {
    expect(beamIndexGroups(engines, withBeams([]), time)).toEqual([]);
  });
  it('still drops rests, long notes and groups left with fewer than two notes', () => {
    const b: Bar = { events: [note('C5', 'quaver'), rest('quaver'), note('E5', 'quaver'), note('F5', 'quaver'), note('G4', 'minim')], beams: [[0, 1], [2, 3], [3, 4]] };
    expect(beamIndexGroups(engines, b, time)).toEqual([[2, 3]]);
  });
});

describe('written beams: drawing', () => {
  async function beamCount(bars: Bar[]) {
    const { container } = render(<Stave mode="read" passage={passage(bars)} ariaLabel="x" />);
    await drawn(container);
    await waitFor(() => expect(container.querySelectorAll('.vf-stavenote').length).toBeGreaterThan(0));
    return container.querySelectorAll('.vf-beam').length;
  }
  it('standard beaming draws one beam for four quavers in 4/4; the written beams override it', async () => {
    expect(await beamCount([withBeams()])).toBe(1);
    cleanup();
    expect(await beamCount([withBeams([[0, 1], [2, 3]])])).toBe(2);
    cleanup();
    expect(await beamCount([withBeams([])])).toBe(0);
    cleanup();
    expect(await beamCount([withBeams([[1, 2]])])).toBe(1);
  });
  it('a bar without beams next to a bar with them: only the written bar changes', async () => {
    expect(await beamCount([withBeams([]), withBeams()])).toBe(1);
  });
  it('flags are drawn where there is no beam', async () => {
    const { container } = render(<Stave mode="read" passage={passage([withBeams([])])} ariaLabel="x" />);
    await drawn(container);
    await waitFor(() => expect(container.querySelectorAll('.vf-flag').length).toBe(4));
  });
  it('the passage description and drawing do not change for passages without beams', async () => {
    const a = render(<Stave mode="read" passage={passage([withBeams()])} ariaLabel="x" />);
    await drawn(a.container);
    const svgA = a.container.querySelector('.mtn-stave__notation')!.innerHTML.replace(/ ?id="[^"]*"/g, '');
    cleanup();
    const b = render(<Stave mode="read" passage={passage([withBeams([[0, 1, 2, 3]])])} ariaLabel="x" />);
    await drawn(b.container);
    const svgB = b.container.querySelector('.mtn-stave__notation')!.innerHTML.replace(/ ?id="[^"]*"/g, '');
    // Written beams equal to the standard ones draw exactly the standard bar.
    expect(svgB).toBe(svgA);
  });
});

describe('written beams: editors drop them from a bar they change', () => {
  const reduce = createReducer(engines);
  const base = (): Passage => passage([withBeams([[0, 1], [2, 3]]), withBeams([[0, 1]])]);
  it('every action on bar 0 removes its beams and leaves bar 1 alone', () => {
    const r = reduce(deepFreeze(base()), { type: 'set-value', bar: 0, event: 4, value: 'minim' }, constraints({ bars: 2 }));
    if (!r.ok) throw new Error(r.reason);
    expect(r.passage.bars[0].beams).toBeUndefined();
    expect(r.passage.bars[1].beams).toEqual([[0, 1]]);
  });
  it('inserting, moving and deleting drop them too', () => {
    const p = deepFreeze(passage([{ events: [...quavers(4), note('G4', 'quaver'), note('A4', 'quaver'), note('B4', 'quaver'), note('C5', 'quaver')], beams: [[0, 1, 2, 3, 4, 5, 6, 7]] }]));
    for (const a of [
      { type: 'move-head', bar: 0, event: 0, pitchIndex: 0, position: 5 },
      { type: 'delete-event', bar: 0, event: 7 },
      { type: 'to-rest', bar: 0, event: 3 },
    ] as const) {
      const r = reduce(p, a, constraints({ bars: 1 }));
      if (!r.ok) throw new Error(`${a.type}: ${r.reason}`);
      expect(r.passage.bars[0].beams, a.type).toBeUndefined();
    }
  });
  it('with expression on the passage the beams are dropped as well', () => {
    const p = deepFreeze({ ...base(), expression: { dynamics: [{ at: { bar: 0, event: 0 }, level: 'mf' as const }] } });
    const r = reduce(p, { type: 'move-head', bar: 0, event: 1, pitchIndex: 0, position: 3 }, constraints({ bars: 2 }));
    if (!r.ok) throw new Error(r.reason);
    expect(r.passage.bars[0].beams).toBeUndefined();
    expect(r.passage.bars[1].beams).toEqual([[0, 1]]);
  });
  it('a rejected action changes nothing, beams included', () => {
    const p = deepFreeze(base());
    const r = reduce(p, { type: 'set-value', bar: 0, event: 4, value: 'semibreve' }, constraints({ bars: 2, allow: { values: ['crotchet'], rests: true, signs: [], maxDots: 0, ties: false } }));
    expect(r.ok).toBe(false);
  });
});

// --- 1.3 gaps -----------------------------------------------------------------------------

const twoBars = () => passage([bar(note('C5'), note('D5'), note('E5'), note('F5')), bar(note('G5'), note('F5'), note('E5'), note('D5'))]);
const allGaps = (p: Passage): StaveGapRef[] => p.bars.flatMap((b, bi) => b.events.map((_, ei) => ({ bar: bi, event: ei }))).slice(0, -1);

function Gaps(props: { quiet?: boolean; on?: StaveGapRef[]; onToggle?: (a: StaveGapRef) => void; offered?: StaveGapRef[]; extra?: Partial<StaveProps> }) {
  const p = twoBars();
  return (
    <Stave
      mode="read"
      passage={p}
      ariaLabel="Place the bar lines"
      gaps={{
        offered: props.offered ?? allGaps(p),
        on: props.on ?? [{ bar: 0, event: 1 }],
        onToggle: props.onToggle ?? (() => {}),
        label: (at) => `Bar line after note ${at.bar * 4 + at.event + 1}`,
        quiet: props.quiet,
      }}
      {...props.extra}
    />
  );
}

describe('gaps (read mode)', () => {
  it('renders one toggle button per offered gap, named by the label, with aria-pressed for on and off', async () => {
    const { container } = render(<Gaps />);
    await drawn(container);
    const buttons = await screen.findAllByRole('button');
    expect(buttons).toHaveLength(7);
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([1, 2, 3, 4, 5, 6, 7].map((n) => `Bar line after note ${n}`));
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false', 'false', 'false', 'false']);
    expect(screen.getByRole('group', { name: 'Place the bar lines' })).toBeInTheDocument();
  });
  it('the root is not role=img (it holds buttons)', async () => {
    const { container } = render(<Gaps />);
    await drawn(container);
    await screen.findAllByRole('button');
    expect(screen.queryByRole('img')).toBeNull();
  });
  it('an on gap draws a visible marker line, an off gap draws nothing until hovered or focused', async () => {
    const { container } = render(<Gaps />);
    await drawn(container);
    await screen.findAllByRole('button');
    expect(container.querySelectorAll('[data-testid="gap-marker"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="gap-guide"]')).toHaveLength(0);
    const buttons = screen.getAllByRole('button');
    fireEvent.pointerEnter(buttons[3]);
    await waitFor(() => expect(container.querySelectorAll('[data-testid="gap-guide"]')).toHaveLength(1));
    fireEvent.pointerLeave(buttons[3]);
    await waitFor(() => expect(container.querySelectorAll('[data-testid="gap-guide"]')).toHaveLength(0));
  });
  it('quiet: an on gap draws no marker at rest, a thin solid line on hover or focus, and aria-pressed still says on', async () => {
    const { container } = render(<Gaps quiet on={[{ bar: 0, event: 1 }]} />);
    await drawn(container);
    const buttons = await screen.findAllByRole('button');
    expect(container.querySelectorAll('[data-testid="gap-marker"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-testid="gap-guide"]')).toHaveLength(0);
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.pointerEnter(buttons[1]);
    await waitFor(() => expect(container.querySelectorAll('[data-testid="gap-guide"][data-on="true"]')).toHaveLength(1));
    // The hover line of an on gap is solid; an off gap's is dashed.
    expect(container.querySelector('[data-testid="gap-guide"]')).not.toHaveAttribute('stroke-dasharray');
    fireEvent.pointerLeave(buttons[1]);
    await waitFor(() => expect(container.querySelectorAll('[data-testid="gap-guide"]')).toHaveLength(0));
    fireEvent.pointerEnter(buttons[3]);
    await waitFor(() => expect(container.querySelector('[data-testid="gap-guide"]')).toHaveAttribute('stroke-dasharray'));
  });
  it('not quiet (default): an on gap keeps its line and diamond marker', async () => {
    const { container } = render(<Gaps on={[{ bar: 0, event: 1 }]} />);
    await drawn(container);
    await screen.findAllByRole('button');
    const m = container.querySelector('[data-testid="gap-marker"]')!;
    expect(m.querySelector('line')).not.toBeNull();
    expect(m.querySelector('path')).not.toBeNull();
  });
  it('clicking a gap calls onToggle with the gap', async () => {
    const onToggle = vi.fn();
    const { container } = render(<Gaps onToggle={onToggle} />);
    await drawn(container);
    const buttons = await screen.findAllByRole('button');
    fireEvent.click(buttons[2]);
    expect(onToggle).toHaveBeenCalledWith({ bar: 0, event: 2 });
    fireEvent.click(buttons[3]);
    expect(onToggle).toHaveBeenLastCalledWith({ bar: 0, event: 3 });
  });
  it('one tab stop: roving tabindex; arrows, Home and End move focus; Space and Enter toggle', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { container } = render(<Gaps onToggle={onToggle} />);
    await drawn(container);
    const buttons = await screen.findAllByRole('button');
    expect(buttons.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    expect(buttons[0].tabIndex).toBe(0);
    await user.tab();
    expect(buttons[0]).toHaveFocus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(buttons[2]).toHaveFocus();
    expect(buttons.filter((b) => b.tabIndex === 0)).toEqual([buttons[2]]);
    await user.keyboard('{Enter}');
    expect(onToggle).toHaveBeenLastCalledWith({ bar: 0, event: 2 });
    await user.keyboard('{ArrowLeft}{ }');
    expect(onToggle).toHaveBeenLastCalledWith({ bar: 0, event: 1 });
    await user.keyboard('{End}');
    expect(buttons[6]).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(buttons[6]).toHaveFocus();
    await user.keyboard('{Home}');
    expect(buttons[0]).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(buttons[0]).toHaveFocus();
    await user.tab();
    expect(buttons.some((b) => b === document.activeElement)).toBe(false);
  });
  it('focus shows the guide line for an off gap and the focus ring class is on the button', async () => {
    const user = userEvent.setup();
    const { container } = render(<Gaps />);
    await drawn(container);
    const buttons = await screen.findAllByRole('button');
    expect(buttons[0]).toHaveClass('mtn-stave__gap-button');
    await user.tab();
    await waitFor(() => expect(container.querySelectorAll('[data-testid="gap-guide"]')).toHaveLength(1));
    await user.tab();
    await waitFor(() => expect(container.querySelectorAll('[data-testid="gap-guide"]')).toHaveLength(0));
  });
  it('only offered gaps get buttons; gaps naming no event are left out', async () => {
    const { container } = render(<Gaps offered={[{ bar: 0, event: 0 }, { bar: 1, event: 2 }, { bar: 5, event: 0 }, { bar: 0, event: 9 }]} on={[]} />);
    await drawn(container);
    const buttons = await screen.findAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /after note 4/ })).toBeNull();
  });
  it('is ignored with onEventTap, and in edit mode', async () => {
    const p = twoBars();
    const gaps = { offered: allGaps(p), on: [], onToggle: () => {}, label: () => 'gap' };
    const tap = render(<Stave mode="read" passage={p} ariaLabel="x" gaps={gaps} onEventTap={() => {}} />);
    await drawn(tap.container);
    await screen.findAllByRole('button');
    expect(tap.container.querySelectorAll('.mtn-stave__gap-button')).toHaveLength(0);
    expect(tap.container.querySelectorAll('.mtn-stave__event-button')).toHaveLength(8);
    cleanup();
    const ed = render(<Stave mode="edit" passage={p} ariaLabel="x" gaps={gaps} palette={{ durations: [{ value: 'crotchet', dots: 0 }] }} />);
    await drawn(ed.container);
    expect(ed.container.querySelectorAll('.mtn-stave__gap-button')).toHaveLength(0);
  });
  it('a stave without gaps is unchanged: role=img, no buttons', async () => {
    const { container } = render(<Stave mode="read" passage={twoBars()} ariaLabel="plain" />);
    await drawn(container);
    expect(screen.getByRole('img', { name: 'plain' })).toBeInTheDocument();
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
  it('re-renders with new on/off state without redrawing the notation', async () => {
    const p = twoBars();
    const gaps = (on: StaveGapRef[]) => ({ offered: allGaps(p), on, onToggle: () => {}, label: (at: StaveGapRef) => `g${at.bar}${at.event}` });
    const { container, rerender } = render(<Stave mode="read" passage={p} ariaLabel="x" gaps={gaps([])} />);
    await drawn(container);
    await screen.findAllByRole('button');
    const svg = container.querySelector('.mtn-stave__notation svg');
    rerender(<Stave mode="read" passage={p} ariaLabel="x" gaps={gaps([{ bar: 1, event: 0 }])} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'g10' })).toHaveAttribute('aria-pressed', 'true'));
    expect(container.querySelector('.mtn-stave__notation svg')).toBe(svg);
  });
});

describe('gaps: geometry', () => {
  async function model(p: Passage) {
    const { container } = render(<Stave mode="read" passage={p} ariaLabel="x" gaps={{ offered: allGaps(p), on: [], onToggle() {}, label: () => 'g' }} />);
    await drawn(container);
    await screen.findAllByRole('button');
    return getStaveLayout(container.querySelector('.mtn-stave__canvas')!)!;
  }
  it('each gap is centred halfway between the centres of the two events, or on the bar line at the end of a bar', async () => {
    const m = await model(twoBars());
    const places = gapPlaces(m, [{ bar: 0, event: 0 }, { bar: 0, event: 3 }]);
    const e = m.bars[0].events;
    expect(places[0].x).toBeCloseTo((e[0].centreX + e[1].centreX) / 2, 5);
    // The last event of a bar with another bar after it on the same line: on the bar line, the right edge of the bar.
    if (m.bars[1].system === m.bars[0].system) expect(places[1].x).toBeCloseTo(m.bars[0].x + m.bars[0].width, 5);
    else expect(places[1].x).toBeCloseTo((e[3].centreX + (m.bars[0].x + m.bars[0].width)) / 2, 5);
  });
  it('button widths are 44 px where the gap allows and never under 24 px', async () => {
    const m = await model(twoBars());
    const wide = gapPlaces(m, [{ bar: 0, event: 0 }]);
    expect(wide[0].widthPx).toBe(44);
    for (const w of gapPlaces(m, allGaps(twoBars())).map((g) => g.widthPx)) {
      expect(w).toBeGreaterThanOrEqual(24);
      expect(w).toBeLessThanOrEqual(44);
    }
    // Squeezed neighbours: shrink to the distance between them, down to 24.
    const tight = { ...m, scale: 1 };
    const evs = tight.bars[0].events;
    const squeezed = gapPlaces({ ...tight, bars: [{ ...tight.bars[0], events: evs.map((e, i) => ({ ...e, centreX: 100 + i * 10 })) }, tight.bars[1]] }, [{ bar: 0, event: 0 }, { bar: 0, event: 1 }, { bar: 0, event: 2 }]);
    expect(squeezed.map((s) => s.widthPx)).toEqual([24, 24, 24]);
    const mid = gapPlaces({ ...tight, bars: [{ ...tight.bars[0], events: evs.map((e, i) => ({ ...e, centreX: 100 + i * 34 })) }, tight.bars[1]] }, [{ bar: 0, event: 0 }, { bar: 0, event: 1 }]);
    expect(mid.map((s) => s.widthPx)).toEqual([34, 34]);
  });
  it('the buttons span the full stave height and do not overlap each other', async () => {
    const { container } = render(<Gaps />);
    await drawn(container);
    const buttons = (await screen.findAllByRole('button')) as HTMLButtonElement[];
    const m = getStaveLayout(container.querySelector('.mtn-stave__canvas')!)!;
    const boxes = buttons.map((b) => ({ left: parseFloat(b.style.left), width: parseFloat(b.style.width), height: parseFloat(b.style.height) }));
    expect(boxes[0].height).toBeCloseTo(m.systems[0].height * m.scale, 3);
    boxes.sort((a, b) => a.left - b.left);
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].left).toBeGreaterThanOrEqual(boxes[i - 1].left + boxes[i - 1].width - 0.01);
  });
});

// --- 1.4 key-signature edit ---------------------------------------------------------------

function KeySig(props: Partial<StaveProps> & { onTap?: (p: number) => void; signs?: KeySignatureSign[]; clef?: 'treble' | 'bass' | 'alto' | 'tenor' }) {
  const { onTap, signs, clef, ...rest } = props;
  return (
    <Stave
      mode="edit"
      passage={passage([bar(rest_())], { clef: clef ?? 'treble' })}
      edit={{ kind: 'key-signature' }}
      keySignatureSigns={signs ?? []}
      onKeySignatureTap={onTap}
      ariaLabel="Write the key signature"
      sound={false}
      {...rest}
    />
  );
}
const rest_ = () => rest('semibreve');

async function ksSetup(props: Parameters<typeof KeySig>[0] = {}) {
  const utils = render(<KeySig {...props} />);
  await waitFor(() => expect(utils.container.querySelector('.vf-stave')).toBeTruthy());
  await waitFor(() => expect(utils.container.querySelector('[data-testid="stave-surface"]')).toBeTruthy());
  const canvas = () => utils.container.querySelector('.mtn-stave__canvas') as HTMLElement;
  const model = () => getStaveLayout(canvas())!;
  const surface = () => screen.getByTestId('stave-surface');
  /** A client point on the stave at `position`, `x` units from the left of the drawing. */
  const at = (position: number, x = 90) => {
    const m = model();
    return { clientX: x * m.scale, clientY: (m.systems[0].bottomLineY - position * 5) * m.scale };
  };
  const tapAt = (position: number, x?: number, type = 'mouse') => {
    fireEvent.pointerDown(surface(), { pointerId: 1, pointerType: type, button: 0, ...at(position, x) });
    fireEvent.pointerUp(surface(), { pointerId: 1, pointerType: type, button: 0, ...at(position, x) });
  };
  const live = () => screen.getByTestId('stave-live').textContent?.replace(/​/g, '');
  return { ...utils, canvas, model, surface, at, tapAt, live };
}

describe('key-signature edit: drawing', () => {
  it('draws a clef and an empty stave with no notes and no key-signature signs, wide enough for seven', async () => {
    const { container, model } = await ksSetup();
    expect(container.querySelectorAll('.vf-stavenote')).toHaveLength(0);
    expect(container.querySelectorAll('.vf-keysignature text')).toHaveLength(0);
    expect(container.querySelectorAll('.vf-clef')).toHaveLength(1);
    expect(container.querySelectorAll('.vf-timesignature')).toHaveLength(0);
    // Room: a standard 7-sharp key signature after the same clef fits before the end of the stave.
    const m = model();
    expect(m.bars[0].noteStartX - 1).toBeGreaterThan(7 * 8);
    expect(m.bars[0].noteEndX).toBeGreaterThan(m.bars[0].noteStartX);
  });
  it('draws the given signs on the given positions, left to right, as VexFlow draws a key signature', async () => {
    const signs: KeySignatureSign[] = [{ sign: 1, position: 8 }, { sign: 1, position: 5 }, { sign: -1, position: 2 }];
    const { container, model } = await ksSetup({ signs });
    const texts = Array.from(container.querySelectorAll('.vf-keysignature text'));
    expect(texts).toHaveLength(3);
    const bottom = model().systems[0].bottomLineY;
    expect(texts.map((t) => (bottom - Number(t.getAttribute('y'))) / 5)).toEqual([8, 5, 2]);
    const xs = texts.map((t) => Number(t.getAttribute('x')));
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(new Set(xs).size).toBe(3);
    expect(texts.map((t) => t.textContent?.codePointAt(0))).toEqual([0xe262, 0xe262, 0xe260]);
  });
  it('the signs of a real key signature match the engine and are drawn exactly as VexFlow draws that key', async () => {
    const want = pitch.keySignaturePositions(3, 'bass');
    const signs = want.map((position) => ({ sign: 1 as const, position }));
    const { container, model } = await ksSetup({ signs, clef: 'bass' });
    const bottom = model().systems[0].bottomLineY;
    const drawnPositions = Array.from(container.querySelectorAll('.vf-keysignature text')).map((t) => (bottom - Number(t.getAttribute('y'))) / 5);
    expect(drawnPositions).toEqual(want);
  });
  it('seven signs fit inside the stave', async () => {
    const signs = pitch.keySignaturePositions(7, 'treble').map((position) => ({ sign: 1 as const, position }));
    const { container, model } = await ksSetup({ signs });
    const xs = Array.from(container.querySelectorAll('.vf-keysignature text')).map((t) => Number(t.getAttribute('x')));
    expect(xs).toHaveLength(7);
    expect(Math.max(...xs)).toBeLessThan(model().bars[0].noteStartX);
  });
  it('the system leaves room for positions -1 to 9', async () => {
    const { model } = await ksSetup();
    const m = model();
    const sys = m.systems[0];
    expect(sys.bottomLineY + 5).toBeLessThan(sys.top + sys.height);
    expect(sys.bottomLineY - 9 * 5).toBeGreaterThan(sys.top);
  });
  it('redraws when signs change', async () => {
    const { container, rerender } = await ksSetup({ signs: [] });
    rerender(<KeySig signs={[{ sign: 1, position: 8 }]} />);
    await waitFor(() => expect(container.querySelectorAll('.vf-keysignature text')).toHaveLength(1));
  });
});

describe('key-signature edit: tap maps to the nearest stave position', () => {
  it('every position -1 to 9 is reported when its own height is tapped', async () => {
    const onTap = vi.fn();
    const { tapAt } = await ksSetup({ onTap });
    for (let p = -1; p <= 9; p++) {
      onTap.mockClear();
      tapAt(p);
      expect(onTap, `position ${p}`).toHaveBeenCalledTimes(1);
      expect(onTap).toHaveBeenCalledWith(p);
    }
  });
  it('a tap between two positions goes to the nearer one; above and below the range clamp to 9 and -1', async () => {
    const onTap = vi.fn();
    const { model, surface } = await ksSetup({ onTap });
    const m = model();
    const press = (pos: number) =>
      fireEvent.pointerUp(
        (fireEvent.pointerDown(surface(), { pointerId: 2, pointerType: 'mouse', button: 0, clientX: 80 * m.scale, clientY: (m.systems[0].bottomLineY - pos * 5) * m.scale }), surface()),
        { pointerId: 2, pointerType: 'mouse', button: 0, clientX: 80 * m.scale, clientY: (m.systems[0].bottomLineY - pos * 5) * m.scale },
      );
    press(4.3);
    expect(onTap).toHaveBeenLastCalledWith(4);
    press(4.7);
    expect(onTap).toHaveBeenLastCalledWith(5);
    press(12);
    expect(onTap).toHaveBeenLastCalledWith(9);
    press(-6);
    expect(onTap).toHaveBeenLastCalledWith(-1);
  });
  it('a tap anywhere along the stave counts, over the clef too', async () => {
    const onTap = vi.fn();
    const { tapAt, model } = await ksSetup({ onTap });
    tapAt(6, 10);
    tapAt(6, model().bars[0].noteEndX - 2);
    expect(onTap).toHaveBeenCalledTimes(2);
    expect(onTap).toHaveBeenNthCalledWith(1, 6);
    expect(onTap).toHaveBeenNthCalledWith(2, 6);
  });
  it('press, drag, release reports the position where the finger is lifted (touch), with the loupe and ghost sign', async () => {
    const onTap = vi.fn();
    const { container, surface, at } = await ksSetup({ onTap, keySignatureArmed: -1 });
    fireEvent.pointerDown(surface(), { pointerId: 3, pointerType: 'touch', ...at(2) });
    expect(container.querySelector('.mtn-ghost')).toHaveAttribute('visibility', 'visible');
    fireEvent.pointerMove(surface(), { pointerId: 3, pointerType: 'touch', ...at(3, 95), clientX: at(3).clientX + 30 });
    await waitFor(() => expect(screen.getByTestId('loupe')).toBeInTheDocument());
    fireEvent.pointerMove(surface(), { pointerId: 3, pointerType: 'touch', clientX: at(6).clientX + 30, clientY: at(6).clientY });
    const ghost = container.querySelector('.mtn-ghost text')!;
    expect(ghost.textContent?.codePointAt(0)).toBe(0xe260);
    fireEvent.pointerUp(surface(), { pointerId: 3, pointerType: 'touch', clientX: at(6).clientX + 30, clientY: at(6).clientY });
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onTap).toHaveBeenCalledWith(6);
    expect(screen.queryByTestId('loupe')).toBeNull();
    expect(container.querySelector('.mtn-ghost')).toHaveAttribute('visibility', 'hidden');
  });
  it('a cancelled gesture reports nothing', async () => {
    const onTap = vi.fn();
    const { surface, at } = await ksSetup({ onTap });
    fireEvent.pointerDown(surface(), { pointerId: 4, pointerType: 'touch', ...at(4) });
    fireEvent.pointerCancel(surface(), { pointerId: 4, pointerType: 'touch' });
    fireEvent.pointerUp(surface(), { pointerId: 4, pointerType: 'touch', ...at(4) });
    expect(onTap).not.toHaveBeenCalled();
  });
  it('mouse hover shows the ghost; leaving hides it', async () => {
    const { container, surface, at } = await ksSetup({ onTap: () => {} });
    fireEvent.pointerMove(surface(), { pointerId: 1, pointerType: 'mouse', buttons: 0, ...at(6) });
    expect(container.querySelector('.mtn-ghost')).toHaveAttribute('visibility', 'visible');
    fireEvent.pointerLeave(surface());
    expect(container.querySelector('.mtn-ghost')).toHaveAttribute('visibility', 'hidden');
  });
  it('the ghost sits where the next sign would be drawn, on the tapped line', async () => {
    const { container, surface, at, model } = await ksSetup({ signs: [{ sign: 1, position: 8 }], onTap: () => {} });
    fireEvent.pointerMove(surface(), { pointerId: 1, pointerType: 'mouse', buttons: 0, ...at(5) });
    const text = container.querySelector('.mtn-ghost text')!;
    const m = model();
    expect((m.systems[0].bottomLineY - Number(text.getAttribute('y'))) / 5).toBe(5);
    const placed = Number(container.querySelector('.vf-keysignature text')!.getAttribute('x'));
    expect(Number(text.getAttribute('x'))).toBeGreaterThan(placed);
  });
  it('with seven signs a tap reports nothing and says the area is full', async () => {
    const onTap = vi.fn();
    const signs = pitch.keySignaturePositions(7, 'treble').map((position) => ({ sign: 1 as const, position }));
    const { tapAt, live } = await ksSetup({ onTap, signs });
    tapAt(4);
    expect(onTap).not.toHaveBeenCalled();
    expect(live()).toMatch(/full/);
  });
});

describe('key-signature edit: keyboard, buttons and announcements', () => {
  it('Up and Down move a ghost through positions and announce the position in words and the letter; Enter places it', async () => {
    const user = userEvent.setup();
    const onTap = vi.fn();
    const { surface, live, container } = await ksSetup({ onTap });
    surface().focus();
    await user.keyboard('{ArrowUp}');
    expect(live()).toBe('Third space, C.'); // from the middle line (4) up one: position 5
    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(live()).toBe('Top line, F.'); // position 8, treble
    expect(container.querySelector('.mtn-ghost')).toHaveAttribute('visibility', 'visible');
    await user.keyboard('{Enter}');
    expect(onTap).toHaveBeenCalledWith(8);
    expect(live()).toBe('Sharp placed on top line, F.');
    await user.keyboard('{ArrowDown}');
    expect(live()).toBe('Top space, E.');
  });
  it('the keyboard position starts on the middle line, stops at -1 and 9, and says so', async () => {
    const user = userEvent.setup();
    const onTap = vi.fn();
    const { surface, live } = await ksSetup({ onTap });
    surface().focus();
    await user.keyboard('{Enter}');
    expect(onTap).toHaveBeenLastCalledWith(4);
    for (let i = 0; i < 8; i++) await user.keyboard('{ArrowUp}');
    expect(live()).toBe('Too high for this stave.');
    await user.keyboard('{Enter}');
    expect(onTap).toHaveBeenLastCalledWith(9);
    for (let i = 0; i < 12; i++) await user.keyboard('{ArrowDown}');
    expect(live()).toBe('Too low for this stave.');
    await user.keyboard('{Enter}');
    expect(onTap).toHaveBeenLastCalledWith(-1);
    expect(live()).toBe('Sharp placed on space below the stave, D.');
  });
  it('letters follow the clef: the same position names a different letter in bass, alto and tenor', async () => {
    const user = userEvent.setup();
    const expected = { treble: 'F', bass: 'A', alto: 'G', tenor: 'E' } as const;
    for (const clef of ['treble', 'bass', 'alto', 'tenor'] as const) {
      const { surface, live } = await ksSetup({ clef, onTap: () => {} });
      surface().focus();
      for (let i = 0; i < 4; i++) await user.keyboard('{ArrowUp}');
      expect(live(), clef).toBe(`Top line, ${expected[clef]}.`);
      cleanup();
    }
  });
  it('announces the armed sign', async () => {
    const user = userEvent.setup();
    const { surface, live } = await ksSetup({ onTap: () => {}, keySignatureArmed: -1 });
    surface().focus();
    await user.keyboard('{Enter}');
    expect(live()).toBe('Flat placed on middle line, B.');
  });
  it('the surface is an application stop with a label and help; the description lists the signs placed', async () => {
    const { surface } = await ksSetup({ signs: [{ sign: 1, position: 8 }, { sign: 1, position: 5 }], onTap: () => {} });
    expect(surface()).toHaveAttribute('role', 'application');
    expect(surface()).toHaveAttribute('aria-label', 'Write the key signature');
    expect(surface().tabIndex).toBe(0);
    const ids = surface().getAttribute('aria-describedby')!.split(' ');
    const text = ids.map((id) => document.getElementById(id)?.textContent).join(' ');
    expect(text).toContain('Treble clef. Key signature area. 2 signs placed, left to right: sharp on top line, F; sharp on third space, C.');
    expect(text).toContain('Up and Down arrows');
  });
  it('the button toolbar does everything a gesture does: move up, move down, place', async () => {
    const user = userEvent.setup();
    const onTap = vi.fn();
    const { live } = await ksSetup({ onTap });
    await user.click(screen.getByRole('button', { name: 'Move sign up' }));
    expect(live()).toBe('Third space, C.');
    await user.click(screen.getByRole('button', { name: 'Move sign down' }));
    await user.click(screen.getByRole('button', { name: 'Move sign down' }));
    expect(live()).toBe('Second space, A.');
    await user.click(screen.getByRole('button', { name: 'Place sign here' }));
    expect(onTap).toHaveBeenCalledWith(3);
    expect(screen.getByRole('toolbar', { name: 'Key signature tools' })).toBeInTheDocument();
    const buttons = screen.getAllByRole('button');
    expect(buttons.filter((b) => b.tabIndex === 0)).toHaveLength(1);
  });
  it('the toolbar uses roving tabindex with Left and Right', async () => {
    const user = userEvent.setup();
    await ksSetup({ onTap: () => {} });
    const up = screen.getByRole('button', { name: 'Move sign up' });
    up.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Move sign down' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('button', { name: 'Place sign here' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(up).toHaveFocus();
  });
});

describe('key-signature edit: existing behaviour is untouched', () => {
  it('the notation stave still uses the normal editor for edit.kind free and single-note', async () => {
    const { container } = render(<Stave mode="edit" passage={passage([bar(note('C4'))])} ariaLabel="x" palette={{ durations: [{ value: 'crotchet', dots: 0 }] }} />);
    await drawn(container);
    expect(container.querySelector('[data-stave-kind]')).toBeNull();
    expect(screen.getByRole('toolbar', { name: 'Note tools' })).toBeInTheDocument();
  });
});
