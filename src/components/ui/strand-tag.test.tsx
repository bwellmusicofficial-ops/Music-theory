import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { STRAND_IDS, STRAND_NAMES } from './strand';
import { StrandTag } from './strand-tag';

describe('StrandTag', () => {
  it.each(STRAND_IDS)('shows the %s name as text with its colour', (strand) => {
    render(<StrandTag strand={strand} />);
    const tag = screen.getByText(STRAND_NAMES[strand]);
    expect(tag).toHaveAttribute('data-strand', strand);
    expect(tag.className).toContain(`border-strand-${strand}`);
  });

  it('hides the colour dot from assistive tech and allows a label override', () => {
    render(<StrandTag strand="pitch" label="Pitch and notes" />);
    const tag = screen.getByText('Pitch and notes');
    expect(tag.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
