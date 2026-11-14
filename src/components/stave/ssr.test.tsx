// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { bar, note, passage } from './fixtures';
import { Stave } from './stave';

describe('server rendering', () => {
  it('renders the root, description and placeholder without touching document or VexFlow', () => {
    expect(typeof document).toBe('undefined');
    const html = renderToString(<Stave mode="read" passage={passage([bar(note('F#4'))], { key: 'D' })} ariaLabel="One note" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="One note"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('F sharp 4 crotchet');
    expect(html).not.toContain('<svg');
    expect(html).toContain('dir="ltr"');
  });
  it('renders edit mode with palette and live region on the server', () => {
    const html = renderToString(
      <Stave mode="edit" passage={passage([bar()])} ariaLabel="Write" palette={{ durations: [{ value: 'crotchet', dots: 0 }] }} />,
    );
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('role="application"'); // the surface needs a layout, drawn on the client
  });
});
