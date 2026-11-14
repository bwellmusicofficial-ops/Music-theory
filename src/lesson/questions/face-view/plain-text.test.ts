import { describe, expect, it } from 'vitest';
import { plainText } from './plain-text';

describe('plainText', () => {
  it('keeps plain text unchanged', () => {
    expect(plainText('Clap on every beat')).toBe('Clap on every beat');
  });

  it('removes bold and italic markers', () => {
    expect(plainText('This is **bold** and *italic* text')).toBe('This is bold and italic text');
  });

  it('shows only the shown part of a glossary link', () => {
    expect(plainText('Each [[crotchet|crotchet]] lasts [[minim|two beats]]')).toBe(
      'Each crotchet lasts two beats',
    );
  });

  it('handles a link inside bold markers', () => {
    expect(plainText('**[[bar|Bar]]** one')).toBe('Bar one');
  });
});
