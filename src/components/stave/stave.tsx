'use client';

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { pitch } from '@/engine/pitch';
import { rhythm } from '@/engine/rhythm';
import type { Passage } from '@/engine/types';
import { describeEvent, describePassage } from './a11y/describe';
import { keyHelp, SURFACE_ROLE_DESCRIPTION } from './a11y/strings';
import { SCALES } from './constants';
import { signsForBar } from './edit/accidentals';
import { buildConstraints } from './edit/constraints';
import { setStaveLayout } from './layout-registry';
import { decorate } from './render/decorate';
import { draw, type DrawOutput } from './render/draw';
import './stave.css';
import { StaveEventButtons } from './stave-event-buttons';
import { StaveLoupe } from './stave-loupe';
import { StaveOverlay, type OverlayHandle } from './stave-overlay';
import { StavePalette } from './stave-palette';
import { createStaveSound } from './stave-sound';
import type { Engines, StaveProps } from './types';
import { hashPassage } from './use-edit-history';
import { useStaveEditor } from './use-stave-editor';
import { useStaveGestures } from './use-stave-gestures';
import { useStaveKeyboard } from './use-stave-keyboard';
import { fontsReady, loadVexFlow, type VexFlowModule } from './vexflow-loader';

const engines: Engines = { pitch, rhythm };
const FALLBACK_WIDTH_PX = 640;

type Callbacks = { onChange?: StaveProps['onChange']; onEventTap?: StaveProps['onEventTap'] };
type InnerProps = Omit<StaveProps, 'onChange' | 'onEventTap'> & {
  callbacks: RefObject<Callbacks>;
  hasTap: boolean;
};

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';
function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(REDUCE_QUERY);
  mq.addEventListener?.('change', onChange);
  return () => mq.removeEventListener?.('change', onChange);
}
function readReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCE_QUERY).matches;
}

const json = (v: unknown) => JSON.stringify(v ?? null);

function shallowEqualMarks(a?: Record<string, string>, b?: Record<string, string>): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

function areEqual(a: InnerProps, b: InnerProps): boolean {
  return (
    (a.passage === b.passage || hashPassage(a.passage) === hashPassage(b.passage)) &&
    a.mode === b.mode &&
    a.ariaLabel === b.ariaLabel &&
    a.size === b.size &&
    a.terminology === b.terminology &&
    a.pitchSpeech === b.pitchSpeech &&
    a.sound === b.sound &&
    a.reducedMotion === b.reducedMotion &&
    a.hasTap === b.hasTap &&
    shallowEqualMarks(a.marks, b.marks) &&
    a.cursor?.bar === b.cursor?.bar &&
    a.cursor?.event === b.cursor?.event &&
    json(a.palette) === json(b.palette) &&
    json(a.edit) === json(b.edit) &&
    json(a.range) === json(b.range) &&
    json(a.show) === json(b.show)
  );
}

/**
 * Interactive stave. Design: docs/stave-interaction.md. The wrapper keeps
 * callbacks in a ref so that a new function identity never redraws anything.
 */
export function Stave(props: StaveProps) {
  const { onChange, onEventTap, ...rest } = props;
  const callbacks = useRef<Callbacks>({ onChange, onEventTap });
  useLayoutEffect(() => {
    callbacks.current = { onChange, onEventTap };
  });
  return <StaveInner {...rest} callbacks={callbacks} hasTap={onEventTap !== undefined} />;
}

const StaveInner = memo(StaveImpl, areEqual);

function StaveImpl(props: InnerProps) {
  const {
    passage,
    mode,
    palette,
    edit: editOpts,
    marks,
    cursor,
    ariaLabel,
    range,
    show,
    callbacks,
    hasTap,
  } = props;
  const terminology = props.terminology ?? 'uk';
  const pitchSpeech = props.pitchSpeech ?? 'names';
  const isEdit = mode === 'edit';
  const size = props.size ?? (isEdit ? 'lg' : 'md');
  const baseScale = SCALES[size];
  const rawId = useId();
  const uid = `mtn${rawId.replace(/[^A-Za-z0-9_-]/g, '')}`;
  const hash = hashPassage(passage);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<OverlayHandle>(null);
  const loupeRef = useRef<SVGSVGElement>(null);
  const layoutRef = useRef<DrawOutput | null>(null);
  const modelRef = useRef<DrawOutput['model'] | null>(null);
  const elementsRef = useRef<DrawOutput['elements'] | null>(null);
  const passageRef = useRef<Passage>(passage);

  const [vf, setVf] = useState<VexFlowModule | null>(null);
  const [availablePx, setAvailablePx] = useState(0);
  const [fontTick, setFontTick] = useState(0);
  const [layout, setLayout] = useState<DrawOutput | null>(null);
  const [outline, setOutline] = useState<{ bar: number; event: number } | null>(null);
  const [loupe, setLoupe] = useState<{ gx: number; gy: number } | null>(null);

  // --- constraints -----------------------------------------------------------
  const constraintsKey = JSON.stringify({ palette, edit: editOpts, range, clef: passage.clef, bars: passage.bars.length });
  const constraints = useMemo(() => {
    const k = JSON.parse(constraintsKey) as { palette?: StaveProps['palette']; edit?: StaveProps['edit']; range?: StaveProps['range'] };
    return buildConstraints(engines, {
      passage: { clef: passage.clef, bars: passage.bars } as Passage,
      palette: k.palette,
      edit: k.edit,
      range: k.range,
    });
    // The key captures every input; the passage only matters through clef and bar count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [constraintsKey]);

  const editableBars = useMemo(() => (isEdit ? constraints.editable.map((e) => e.bar) : []), [isEdit, constraints]);
  const editableKey = editableBars.join(',');
  const lockedBars = useMemo(() => {
    if (!isEdit) return new Set<number>();
    const ed = new Set(editableBars);
    return new Set(passage.bars.map((_, i) => i).filter((i) => !ed.has(i)));
  }, [isEdit, editableBars, passage.bars]);
  const restricted = isEdit && lockedBars.size > 0;

  // --- sound ---------------------------------------------------------------------
  const soundOn = isEdit && props.sound !== false;
  const [staveSound] = useState(() => createStaveSound());
  useLayoutEffect(() => {
    staveSound.setEnabled(soundOn);
  }, [staveSound, soundOn]);
  useEffect(() => () => staveSound.dispose(), [staveSound]);

  // --- reduced motion --------------------------------------------------------------
  const mqReduce = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false);
  const reduced = props.reducedMotion === true || mqReduce;

  // --- editor ----------------------------------------------------------------------
  const describeOpts = useMemo(() => ({ terminology, pitchSpeech }) as const, [terminology, pitchSpeech]);
  const editor = useStaveEditor({
    engines,
    enabled: isEdit,
    passage,
    constraints,
    describe: describeOpts,
    sound: staveSound,
    onChange: (next) => callbacks.current?.onChange?.(next),
    firstValue: palette?.durations?.[0]?.value ?? 'crotchet',
    onReject: () => {
      if (!reduced) overlayRef.current?.shake();
    },
  });

  const getPassage = useCallback(() => passageRef.current, []);
  const gestures = useStaveGestures({
    enabled: isEdit,
    engines,
    editor,
    constraints,
    getPassage,
    modelRef,
    canvasRef,
    elementsRef,
    overlayRef,
    loupeRef,
    setLoupe,
    reducedMotion: reduced,
    sound: staveSound,
  });
  const onKeyDown = useStaveKeyboard({ editor, constraints, abortGesture: gestures.abort });

  // --- loading VexFlow (client only) -------------------------------------------------
  useEffect(() => {
    let alive = true;
    const wasReady = fontsReady();
    void loadVexFlow().then((m) => {
      if (alive) setVf(m);
    });
    const onLoaded = () => {
      if (!wasReady) setFontTick((t) => t + 1);
    };
    document.fonts?.addEventListener?.('loadingdone', onLoaded);
    return () => {
      alive = false;
      document.fonts?.removeEventListener?.('loadingdone', onLoaded);
    };
  }, []);

  // --- width ----------------------------------------------------------------------------
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const w = Math.floor(root.getBoundingClientRect().width);
      setAvailablePx((prev) => {
        const next = w > 0 ? w : FALLBACK_WIDTH_PX;
        return Math.floor(prev / baseScale) === Math.floor(next / baseScale) && prev === next ? prev : next;
      });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    });
    ro.observe(root);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [baseScale]);

  // --- draw (stage 2) -----------------------------------------------------------------
  const availableUnits = Math.floor(availablePx / baseScale);
  const rangeKey = json(range);
  const showKey = json(show);
  useLayoutEffect(() => {
    passageRef.current = passage;
  });
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!vf || !host || availablePx <= 0) return;
    gestures.abort();
    const rp = range
      ? (() => {
          const a = pitch.stavePosition(range.low, passage.clef);
          const b = pitch.stavePosition(range.high, passage.clef);
          return { lowest: Math.min(a, b), highest: Math.max(a, b) };
        })()
      : null;
    const ed = new Set(editableBars);
    const out = draw({
      vf,
      host,
      engines,
      passage,
      uid,
      scale: baseScale,
      availablePx,
      edit: isEdit,
      editableBars: passage.bars.map((_, i) => ed.has(i)),
      range: constraints.range,
      readRange: rp,
      show: {
        clef: show?.clef !== false,
        keySignature: show?.keySignature !== false,
        timeSignature: show?.timeSignature !== false,
        finalBarline: show?.finalBarline !== false,
      },
    });
    layoutRef.current = out;
    modelRef.current = out.model;
    elementsRef.current = out.elements;
    if (canvasRef.current) setStaveLayout(canvasRef.current, out.model);
    setLayout(out);
    // Redraw only when the drawKey inputs change: hash, size, range, show, width, fonts, editable bars.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vf, hash, size, rangeKey, showKey, availableUnits, fontTick, editableKey, isEdit]);

  // --- decorate (stage 3): never calls VexFlow ---------------------------------------
  const marksKey = json(marks);
  const lockedEvents = useMemo(() => {
    const s = new Set<string>();
    if (!isEdit) return s;
    passage.bars.forEach((b, bi) => {
      const entry = constraints.editable.find((e) => e.bar === bi);
      b.events.forEach((_, ei) => {
        if (!entry || ei < entry.lockedPrefix || ei >= b.events.length - entry.lockedSuffix) s.add(`${bi}:${ei}`);
      });
    });
    return s;
  }, [isEdit, passage.bars, constraints]);
  const selection = editor.ui.selection;
  const cursorBar = cursor?.bar;
  const cursorEvent = cursor?.event;
  useLayoutEffect(() => {
    if (!layout) return;
    decorate(layout.elements, {
      marks,
      cursor: cursorBar === undefined || cursorEvent === undefined ? null : { bar: cursorBar, event: cursorEvent },
      selection: isEdit ? selection : null,
      locked: lockedEvents,
    });
    // `marks` is tracked through marksKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, marksKey, cursorBar, cursorEvent, selection, lockedEvents, isEdit]);

  // Keep the edited event in view when the notation scrolls.
  useEffect(() => {
    const sc = scrollRef.current;
    const model = layout?.model;
    if (!sc || !model || typeof sc.scrollTo !== 'function') return;
    const target = isEdit ? selection : cursor ? { bar: cursor.bar, event: cursor.event } : null;
    if (!target) return;
    const ev = model.bars.find((b) => b.bar === target.bar)?.events[target.event];
    if (!ev) return;
    const x = ev.centreX * model.scale;
    if (x < sc.scrollLeft + 8 || x > sc.scrollLeft + sc.clientWidth - 8) {
      sc.scrollTo({ left: Math.max(0, x - sc.clientWidth / 2), behavior: reduced ? 'auto' : 'smooth' });
    }
  }, [layout, selection, cursor, isEdit, reduced]);

  // Position the loupe once it mounts.
  useLayoutEffect(() => {
    if (loupe) gestures.placeLoupe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loupe]);

  // Passage changes during a gesture abandon it.
  useLayoutEffect(() => {
    gestures.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);

  // --- text ---------------------------------------------------------------------------------
  const description = useMemo(
    () =>
      describePassage(
        engines,
        passage,
        { terminology, pitchSpeech, marks, editableBars: restricted ? editableBars : undefined },
        { clef: show?.clef !== false, keySignature: show?.keySignature !== false, timeSignature: show?.timeSignature !== false },
      ),
    // passage via hash, marks via key, show via key
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hash, marksKey, terminology, pitchSpeech, restricted, editableKey, showKey],
  );
  const keys = useMemo(
    () =>
      keyHelp({
        singleNote: constraints.kind === 'single-note',
        durations: constraints.allow.values.length > 1,
        rests: constraints.allow.rests,
        dots: constraints.allow.maxDots > 0,
        signs: constraints.allow.signs.length > 0,
        ties: constraints.allow.ties,
        chords: constraints.maxChordSize > 1,
        terminology,
      }),
    [constraints, terminology],
  );
  const eventLabels = useMemo(
    () =>
      hasTap && !isEdit
        ? passage.bars.map((b, bi) => b.events.map((_, ei) => describeEvent(engines, passage, bi, ei, { terminology, pitchSpeech, marks })))
        : [],
    // passage via hash, marks via key
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hash, marksKey, terminology, pitchSpeech, hasTap, isEdit],
  );

  // --- palette state ---------------------------------------------------------------------------
  const selectedInfo = useMemo(() => {
    if (!selection) return null;
    const ev = passage.bars[selection.bar]?.events[selection.event];
    if (!ev) return null;
    let sign = null;
    if (ev.kind === 'note') {
      const tieIn = passage.bars[selection.bar - 1]?.events.at(-1);
      const signs = signsForBar(engines, passage.bars[selection.bar], passage.key, tieIn && tieIn.kind === 'note' && tieIn.tieToNext ? tieIn : undefined);
      sign = signs[selection.event]?.[selection.pitchIndex] ?? null;
    }
    return {
      isNote: ev.kind === 'note',
      isRest: ev.kind === 'rest',
      tied: ev.kind === 'note' && ev.tieToNext === true,
      sign,
      chordSize: ev.kind === 'note' ? ev.pitches.length : 0,
    };
  }, [selection, passage]);

  const model = layout?.model;
  const placeholderHeight = (isEdit ? 148 : 88) * baseScale;
  const readImg = !isEdit && !hasTap;

  return (
    <div
      ref={rootRef}
      className="mtn-stave"
      dir="ltr"
      data-reduced-motion={reduced ? 'true' : undefined}
      aria-busy={!model}
      role={readImg ? 'img' : undefined}
      aria-label={readImg ? ariaLabel : undefined}
      aria-describedby={readImg ? `${uid}-desc` : undefined}
      style={model ? undefined : { minHeight: placeholderHeight }}
    >
      <p id={`${uid}-desc`} className="mtn-stave__sr">
        {description}
      </p>
      {isEdit ? (
        <p id={`${uid}-keys`} className="mtn-stave__sr">
          {keys}
        </p>
      ) : null}
      <div ref={scrollRef} className="mtn-stave__scroll">
        <div
          ref={canvasRef}
          className="mtn-stave__canvas"
          style={model ? { width: model.width * model.scale, height: model.height * model.scale } : { height: placeholderHeight }}
        >
          <div ref={hostRef} className="mtn-stave__notation" aria-hidden="true" />
          {model ? (
            <StaveOverlay
              uid={uid}
              model={model}
              marks={marks}
              cursor={cursor}
              selection={isEdit ? selection : null}
              caret={isEdit ? editor.ui.caret : null}
              lockedBars={lockedBars}
              editableBars={restricted ? new Set(editableBars) : undefined}
              outline={outline}
              handleRef={overlayRef}
            />
          ) : null}
          {model && isEdit ? (
            <div
              className="mtn-stave__surface"
              role="application"
              aria-roledescription={SURFACE_ROLE_DESCRIPTION}
              aria-label={ariaLabel}
              aria-describedby={`${uid}-desc ${uid}-keys`}
              tabIndex={0}
              data-testid="stave-surface"
              onKeyDown={onKeyDown}
              {...gestures.handlers}
            >
              {model.bars
                .filter((b) => editableBars.includes(b.bar))
                .map((b) => {
                  const sys = model.systems[b.system];
                  const first = sys.bars[0] === b.bar;
                  const left = (first ? b.noteStartX : b.x) * model.scale;
                  return (
                    <div
                      key={b.bar}
                      className="mtn-stave__zone"
                      style={{ left, width: (b.x + b.width) * model.scale - left, top: sys.top * model.scale, height: sys.height * model.scale }}
                    />
                  );
                })}
            </div>
          ) : null}
          {model && !isEdit && hasTap ? (
            <StaveEventButtons
              model={model}
              labels={eventLabels}
              ariaLabel={ariaLabel}
              onTap={(b, e) => callbacks.current?.onEventTap?.(b, e)}
              onOutline={setOutline}
            />
          ) : null}
        </div>
      </div>
      {loupe ? <StaveLoupe uid={uid} gx={loupe.gx} gy={loupe.gy} svgRef={loupeRef} /> : null}
      {isEdit ? (
        <StavePalette
          editor={editor}
          constraints={constraints}
          engines={engines}
          terminology={terminology}
          durations={(palette?.durations ?? []).map((d) => d.value)}
          selected={selectedInfo}
          chordsEnabled={palette?.chords === true}
        />
      ) : null}
      <div className="mtn-stave__sr" aria-live="polite" aria-atomic="true" data-testid="stave-live">
        {editor.live}
      </div>
    </div>
  );
}
