import { describe, expect, it } from 'vitest';
import { payloadSchema } from './schema';

const B4 = { letter: 'B', accidental: 0, octave: 4 };
const note = (value: string, dots = 0) => ({ kind: 'note', pitches: [B4], duration: { value, dots } });
const bar = (...events: object[]) => ({ events });
const passage = {
  clef: 'treble',
  key: { tonic: { letter: 'C', accidental: 0 }, mode: 'major' },
  time: { beats: 4, beatUnit: 4 },
  bars: [bar(note('minim', 1), note('crotchet')), bar(note('minim'), note('minim'))],
};
const event = { passage, select: 'event', targets: [{ bar: 0, event: 0 }], feature: 'dotted notes' };
const barQ = { passage, select: 'bar', targets: [{ bar: 0 }], feature: 'the bar with a dotted note' };
const messages = (input: unknown) => {
  const result = payloadSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('find-in-passage payloadSchema', () => {
  it('accepts an event question and a bar question', () => {
    expect(payloadSchema.safeParse(event).success).toBe(true);
    expect(payloadSchema.safeParse(barQ).success).toBe(true);
  });

  it('accepts one target and six targets', () => {
    const many = { ...event, passage: { ...passage, bars: [bar(note('quaver'), note('quaver'), note('crotchet'), note('minim')), bar(note('quaver'), note('quaver'), note('quaver'), note('quaver'), note('minim'))] }, targets: [
      { bar: 0, event: 0 }, { bar: 0, event: 1 }, { bar: 0, event: 2 }, { bar: 1, event: 0 }, { bar: 1, event: 1 }, { bar: 1, event: 2 },
    ] };
    expect(payloadSchema.safeParse(many).success).toBe(true);
  });

  it('rejects no targets and more than six', () => {
    expect(messages({ ...event, targets: [] }).join()).toMatch(/targets/);
    const seven = Array.from({ length: 7 }, (_, i) => ({ bar: 0, event: i }));
    expect(payloadSchema.safeParse({ ...event, targets: seven }).success).toBe(false);
  });

  it('rejects a target that does not exist', () => {
    expect(messages({ ...event, targets: [{ bar: 5, event: 0 }] }).join()).toMatch(/targets.0.bar/);
    expect(messages({ ...event, targets: [{ bar: 0, event: 7 }] }).join()).toMatch(/targets.0.event/);
    expect(messages({ ...barQ, targets: [{ bar: 2 }] }).join()).toMatch(/targets.0.bar/);
  });

  it('`event` is present exactly when select is "event"', () => {
    expect(messages({ ...event, targets: [{ bar: 0 }] }).join()).toMatch(/`event` is required/);
    expect(messages({ ...barQ, targets: [{ bar: 0, event: 0 }] }).join()).toMatch(/`event` is not allowed/);
  });

  it('rejects the same place twice', () => {
    expect(messages({ ...event, targets: [{ bar: 0, event: 0 }, { bar: 0, event: 0 }] }).join()).toMatch(/same place/);
    expect(messages({ ...barQ, targets: [{ bar: 0 }, { bar: 0 }] }).join()).toMatch(/same place/);
  });

  it('feature is at most 8 words and not empty', () => {
    expect(payloadSchema.safeParse({ ...event, feature: 'the notes that last longer than one crotchet' }).success).toBe(true);
    expect(messages({ ...event, feature: 'one two three four five six seven eight nine' }).join()).toMatch(/limited to 8 words/);
    expect(payloadSchema.safeParse({ ...event, feature: '' }).success).toBe(false);
  });

  it('rejects a bar that is not full, like every passage', () => {
    const short = { ...event, passage: { ...passage, bars: [bar(note('minim', 1)), bar(note('minim'), note('minim'))] } };
    expect(messages(short).join()).toMatch(/Bar 1 is short/);
  });

  it('rejects unknown keys', () => {
    expect(payloadSchema.safeParse({ ...event, extra: 1 }).success).toBe(false);
    expect(payloadSchema.safeParse({ ...event, targets: [{ bar: 0, event: 0, nope: 1 }] }).success).toBe(false);
  });
});
