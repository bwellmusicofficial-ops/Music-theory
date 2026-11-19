'use client';

import { useState } from 'react';
import { Stave } from '@/components/stave';
import type { StaveGapRef } from '@/components/stave/types';
import { pitch } from '@/engine/pitch';
import type { Clef } from '@/engine/types';
import { useSettings } from '@/settings';
import { GAP_PASSAGE, GAPS_OFFERED, GAPS_ON_AT_START, keySignaturePassage, WRONG_BEAMS } from './fixtures';

type Sign = { sign: 1 | -1; position: number };

const keyOf = (g: StaveGapRef) => `${g.bar}:${g.event}`;

function KeySignatureExample({ clef, start, terminology }: { clef: Clef; start: number; terminology: 'uk' | 'us' }) {
  // Start with the first few signs of a real key signature (from the engine); the learner adds more.
  const [signs, setSigns] = useState<Sign[]>(() => pitch.keySignaturePositions(start, clef).map((position) => ({ sign: start > 0 ? 1 : -1, position })));
  const [armed, setArmed] = useState<1 | -1>(start >= 0 ? 1 : -1);
  const letters = signs.map((s) => `${s.sign === 1 ? '♯' : '♭'}${pitch.pitchAtStavePosition(s.position, clef).letter}`);
  return (
    <section data-testid={`qt2-ks-${clef}`} aria-labelledby={`qt2-ks-${clef}-title`} className="flex flex-col gap-2">
      <h2 id={`qt2-ks-${clef}-title`} className="text-base font-medium">
        Key signature, {clef} clef
      </h2>
      <div className="flex gap-2" role="group" aria-label={`Sign to place, ${clef} clef`}>
        <button type="button" aria-pressed={armed === 1} onClick={() => setArmed(1)} className="min-h-11 rounded border px-3" data-testid={`qt2-ks-${clef}-sharp`}>
          Sharp
        </button>
        <button type="button" aria-pressed={armed === -1} onClick={() => setArmed(-1)} className="min-h-11 rounded border px-3" data-testid={`qt2-ks-${clef}-flat`}>
          Flat
        </button>
        <button type="button" onClick={() => setSigns((s) => s.slice(0, -1))} className="min-h-11 rounded border px-3" data-testid={`qt2-ks-${clef}-undo`}>
          Undo
        </button>
        <button type="button" onClick={() => setSigns([])} className="min-h-11 rounded border px-3" data-testid={`qt2-ks-${clef}-clear`}>
          Clear
        </button>
      </div>
      <Stave
        mode="edit"
        passage={keySignaturePassage(clef)}
        edit={{ kind: 'key-signature' }}
        keySignatureSigns={signs}
        keySignatureArmed={armed}
        onKeySignatureTap={(position) => setSigns((s) => (s.length >= 7 ? s : [...s, { sign: armed, position }]))}
        terminology={terminology}
        sound={false}
        ariaLabel={`Key signature, ${clef} clef. Tap the stave to place a sign.`}
      />
      <p data-testid={`qt2-ks-${clef}-readout`} aria-live="off">
        Signs: {letters.length ? letters.join(' ') : 'none'} ({signs.map((s) => s.position).join(', ') || 'no positions'})
      </p>
    </section>
  );
}

export function QuestionTypes2Harness() {
  const { settings, loaded } = useSettings();
  const [on, setOn] = useState<StaveGapRef[]>(GAPS_ON_AT_START);
  if (!loaded) return <p role="status">Loading</p>;
  const terminology = settings.terminology;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-4 py-6" data-testid="qt2-harness">
      <h1 className="text-xl font-semibold">Stave support for new question types</h1>

      <section data-testid="qt2-beams" aria-labelledby="qt2-beams-title" className="flex flex-col gap-2">
        <h2 id="qt2-beams-title" className="text-base font-medium">
          Beams as written (all quavers joined, no beams, a beam across a beat)
        </h2>
        <Stave mode="read" passage={WRONG_BEAMS} terminology={terminology} ariaLabel="Three bars of quavers with unusual beaming" />
      </section>

      <section data-testid="qt2-gaps" aria-labelledby="qt2-gaps-title" className="flex flex-col gap-2">
        <h2 id="qt2-gaps-title" className="text-base font-medium">
          Gap toggles (bar lines after note 2 and note 4 are on)
        </h2>
        <Stave
          mode="read"
          passage={GAP_PASSAGE}
          terminology={terminology}
          ariaLabel="Eight crotchets. Choose the gaps where a bar line goes."
          gaps={{
            offered: GAPS_OFFERED,
            on,
            onToggle: (at) => setOn((cur) => (cur.some((g) => keyOf(g) === keyOf(at)) ? cur.filter((g) => keyOf(g) !== keyOf(at)) : [...cur, at])),
            label: (at) => `Bar line after note ${at.bar * 4 + at.event + 1}`,
          }}
        />
        <p data-testid="qt2-gaps-readout">Gaps on: {on.length ? on.map((g) => g.bar * 4 + g.event + 1).sort((a, b) => a - b).join(', ') : 'none'}</p>
      </section>

      <KeySignatureExample clef="treble" start={2} terminology={terminology} />
      <KeySignatureExample clef="bass" start={-1} terminology={terminology} />
    </div>
  );
}
