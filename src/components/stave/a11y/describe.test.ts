import { describe, expect, it } from 'vitest';
import { bar, engines, note, passage, rest } from '../fixtures';
import {
  announceDeleted, announceDuration, announceHeadAdded, announceMoved, announcePlaced, announceRejected,
  announceSelection, announceSign, announceTie, describeEvent, describePassage, positionName, spokenPitch,
} from './describe';
import { keyHelp, MESSAGES } from './strings';

const uk = { terminology: 'uk', pitchSpeech: 'names' } as const;
const us = { terminology: 'us', pitchSpeech: 'names' } as const;
const pos = { terminology: 'uk', pitchSpeech: 'positions' } as const;

const fixture = passage(
  [
    bar(note('F#4'), note('G4', 'quaver'), note('A4', 'quaver', { tieToNext: true }), rest()),
    bar(),
    bar(note('A4'), note(['D4', 'F#4', 'A4'], 'minim')),
  ],
  { key: 'D', beats: 3 },
);
const f3 = passage([bar(note('C4'), note('D4'), note('E4'))]);
const ukP = passage([bar(note('C4'), note('F#4', 'crotchet'), note('G4'))]);

describe('spokenPitch and positionName', () => {
  it('words, not glyphs', () => {
    expect(spokenPitch(engines.pitch.parsePitch('F#4'))).toBe('F sharp 4');
    expect(spokenPitch(engines.pitch.parsePitch('Bb3'))).toBe('B flat 3');
    expect(spokenPitch(engines.pitch.parsePitch('Fx4'))).toBe('F double sharp 4');
    expect(spokenPitch(engines.pitch.parsePitch('Ebb2'))).toBe('E double flat 2');
    expect(spokenPitch(engines.pitch.parsePitch('C4'))).toBe('C4');
  });
  it('positions -6 to 14', () => {
    const want: Record<number, string> = {
      [-6]: 'ledger line 3 below', [-5]: 'space below ledger line 2 below', [-4]: 'ledger line 2 below',
      [-3]: 'space below ledger line 1 below', [-2]: 'ledger line 1 below', [-1]: 'space below the stave',
      0: 'line 1', 1: 'space 1', 2: 'line 2', 3: 'space 2', 4: 'line 3', 5: 'space 3', 6: 'line 4', 7: 'space 4', 8: 'line 5',
      9: 'space above the stave', 10: 'ledger line 1 above', 11: 'space above ledger line 1 above',
      12: 'ledger line 2 above', 13: 'space above ledger line 2 above', 14: 'ledger line 3 above',
    };
    for (let p = -6; p <= 14; p++) expect(positionName(p)).toBe(want[p]);
    expect(positionName(-1, 'us')).toBe('space below the staff');
  });
});

describe('announcements (uk and us)', () => {
  const p = passage([bar(note('F#4'), note('G4'), note('A4'))]);
  it('placed', () => {
    expect(announcePlaced(engines, p, 0, 2, uk)).toBe('A4, crotchet. Bar 1, note 3 of 3.');
    expect(announcePlaced(engines, fixture, 0, 0, uk)).toBe('F sharp 4, crotchet. Bar 1, note 1 of 4.');
    expect(announcePlaced(engines, fixture, 0, 3, uk)).toBe('Crotchet rest. Bar 1, note 4 of 4.');
    expect(announcePlaced(engines, fixture, 0, 3, us)).toBe('Quarter rest. Measure 1, note 4 of 4.');
    expect(announcePlaced(engines, p, 0, 0, us)).toBe('F sharp 4, quarter note. Measure 1, note 1 of 3.');
  });
  it('moved is short', () => {
    expect(announceMoved(engines, p, 0, 1, 0, uk)).toBe('G4.');
  });
  it('sign added and removed', () => {
    expect(announceSign(engines, p, 0, 0, 0, 1, uk)).toBe('F sharp 4, sharp sign added.');
    expect(announceSign(engines, passage([bar(note('F4'))]), 0, 0, 0, null, uk)).toBe('F4, sign removed.');
    expect(announceSign(engines, p, 0, 0, 0, -2, uk)).toContain('double flat sign added');
  });
  it('duration and dots', () => {
    const d = passage([bar({ ...note('C4', 'minim'), duration: { value: 'minim', dots: 1 } })]);
    expect(announceDuration(engines, d, 0, 0, uk)).toBe('Dotted minim.');
    expect(announceDuration(engines, d, 0, 0, us)).toBe('Dotted half note.');
  });
  it('chord head added', () => {
    const c = passage([bar(note(['D4', 'F#4', 'A4']))]);
    expect(announceHeadAdded(engines, c, 0, 0, 2, uk)).toBe('A4 added. Chord: D4, F sharp 4, A4.');
  });
  it('tie', () => {
    expect(announceTie(true)).toBe('Tied to next note.');
    expect(announceTie(false)).toBe('Tie removed.');
  });
  it('deleted', () => {
    expect(announceDeleted(passage([bar(note('C4'), note('D4'))]), 0, uk)).toBe('Deleted. Bar 1 has 2 notes.');
    expect(announceDeleted(passage([bar(note('C4'))]), 0, uk)).toBe('Deleted. Bar 1 has 1 note.');
    expect(announceDeleted(passage([bar()]), 0, us)).toBe('Deleted. Measure 1 is empty.');
  });
  it('selection', () => {
    expect(announceSelection(engines, fixture, 0, 2, uk)).toBe('Bar 1, note 3 of 4: A4, quaver, tied.');
    expect(announceSelection(engines, fixture, 1, null, uk)).toBe('Bar 2, end.');
    expect(announceSelection(engines, fixture, 1, null, us)).toBe('Measure 2, end.');
  });
  it('undo and redo text', () => {
    expect(MESSAGES.undone).toBe('Undone.');
    expect(MESSAGES.redone).toBe('Redone.');
  });
  it('rejections', () => {
    expect(announceRejected('locked')).toBe('That note is fixed.');
    expect(announceRejected('bar-full')).toBe('This bar is full.');
    expect(announceRejected('out-of-range', 'high')).toBe('Too high for this stave.');
    expect(announceRejected('out-of-range', 'low')).toBe('Too low for this stave.');
    expect(announceRejected('not-allowed')).toBe('Not available here.');
    expect(announceRejected('no-target')).toBe('Not available here.');
    expect(announceRejected('chord-full')).toBe('Not available here.');
    expect(announceRejected('position-occupied')).toBe('That note is already in the chord.');
  });
  it('positions mode does not speak the letter name', () => {
    const t = announcePlaced(engines, ukP, 0, 1, pos);
    expect(t).toBe('Space 1 with a sharp, crotchet. Bar 1, note 2 of 3.'.replace('Space 1', 'Space 1'));
    expect(t).not.toMatch(/\bF\b/);
    expect(describeEvent(engines, f3, 0, 0, pos)).toBe('Bar 1, note 1 of 3: ledger line 1 below, crotchet');
  });
});

describe('describeEvent', () => {
  it('note, chord, rest, tied, marks, tuplets', () => {
    expect(describeEvent(engines, fixture, 0, 0, uk)).toBe('Bar 1, note 1 of 4: F sharp 4, crotchet');
    expect(describeEvent(engines, fixture, 0, 2, uk)).toBe('Bar 1, note 3 of 4: A4, quaver, tied');
    expect(describeEvent(engines, fixture, 0, 3, uk)).toBe('Bar 1, note 4 of 4: crotchet rest');
    expect(describeEvent(engines, fixture, 2, 1, uk)).toBe('Bar 3, note 2 of 2: chord D4, F sharp 4, A4, minim');
    expect(describeEvent(engines, fixture, 0, 0, { ...uk, marks: { '0:0': 'wrong' } })).toMatch(/, marked wrong$/);
    expect(describeEvent(engines, fixture, 0, 0, { ...uk, marks: { '0:0': 'correct' } })).toMatch(/, marked correct$/);
    expect(describeEvent(engines, fixture, 0, 0, { ...uk, marks: { '0:0': 'highlight' } })).toMatch(/, highlighted$/);
    expect(describeEvent(engines, fixture, 0, 0, { ...uk, marks: { '0:0': 'near' } })).toMatch(/, marked close$/);
    expect(describeEvent(engines, fixture, 0, 0, { ...uk, marks: { '0:0': 'lit' } })).toMatch(/, played$/);
    const tup = (n: number) => ({ kind: 'note' as const, pitches: [engines.pitch.parsePitch('C5')], duration: { value: 'quaver' as const, dots: 0 as const, tuplet: { actual: n, normal: 4 } } });
    expect(describeEvent(engines, passage([bar(tup(3), tup(3), tup(3))]), 0, 0, uk)).toMatch(/, in a triplet$/);
    expect(describeEvent(engines, passage([bar(tup(5))]), 0, 0, uk)).toMatch(/, in a tuplet of 5$/);
  });
  it('a sign is drawn only when needed', () => {
    expect(describeEvent(engines, fixture, 0, 0, pos)).toBe('Bar 1, note 1 of 4: space 1, crotchet');
  });
});

describe('describePassage', () => {
  it('fixture in names mode with a key signature count and editable bars', () => {
    const t = describePassage(engines, fixture, { ...uk, editableBars: [1] });
    expect(t).toBe(
      'Treble clef. Key signature: 2 sharps. Time signature: 3 4. ' +
        'Bar 1: F sharp 4 crotchet; G4 quaver; A4 quaver, tied; crotchet rest. ' +
        'Bar 2: empty. ' +
        'Bar 3: A4 crotchet; chord D4, F sharp 4, A4 minim. ' +
        'Bar 2 can be edited.',
    );
  });
  it('never names the key', () => {
    expect(describePassage(engines, fixture, uk)).not.toMatch(/D major|B minor/);
  });
  it('key signature counts', () => {
    expect(describePassage(engines, passage([bar()]), uk)).toContain('Key signature: none.');
    expect(describePassage(engines, passage([bar()], { key: 'F' }), uk)).toContain('Key signature: 1 flat.');
    expect(describePassage(engines, passage([bar()], { key: 'Eb' }), uk)).toContain('Key signature: 3 flats.');
  });
  it('hidden items are omitted', () => {
    const t = describePassage(engines, fixture, uk, { clef: false, keySignature: false, timeSignature: false });
    expect(t.startsWith('Bar 1:')).toBe(true);
  });
  it('us terminology and ranges', () => {
    const p = passage([bar(), bar(), bar(), bar(), bar()]);
    const t = describePassage(engines, p, { ...us, editableBars: [0, 1, 3] });
    expect(t).toContain('Measure 1: empty.');
    expect(t).toContain('Measures 1 to 2 and 4 can be edited.');
  });
  it('no editable sentence when all bars are editable', () => {
    expect(describePassage(engines, passage([bar()]), { ...uk, editableBars: [0] })).not.toContain('edited');
  });
  it('marks suffixes, including bar marks', () => {
    const t = describePassage(engines, fixture, { ...uk, marks: { '0:0': 'wrong', '1': 'wrong' } });
    expect(t).toContain('F sharp 4 crotchet, marked wrong;');
    expect(t).toContain('Bar 2: empty, marked wrong.');
  });
  it('positions mode gives positions', () => {
    const t = describePassage(engines, f3, pos);
    expect(t).toContain('ledger line 1 below crotchet');
    expect(t).not.toMatch(/\bC 4\b/);
  });
});

describe('keyHelp', () => {
  const base = { singleNote: false, durations: true, rests: true, dots: true, signs: true, ties: true, chords: true, terminology: 'uk' } as const;
  it('mentions only available bindings', () => {
    expect(keyHelp(base)).toContain('R adds a rest');
    expect(keyHelp({ ...base, rests: false })).not.toContain('R adds a rest');
    expect(keyHelp({ ...base, singleNote: true })).not.toContain('Backspace');
    expect(keyHelp({ ...base, signs: false })).not.toContain('Plus');
  });
});
