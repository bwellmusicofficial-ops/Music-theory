import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PrivacyPage from './page';

afterEach(cleanup);

describe('privacy page', () => {
  it('keeps the draft banner', () => {
    render(<PrivacyPage />);
    expect(screen.getByRole('note')).toHaveTextContent(/Draft: this page is waiting for a legal check/);
  });

  it('is honest about cookies: none for tracking, one sign-in cookie that ends with the browser', () => {
    const { container } = render(<PrivacyPage />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/We do not use cookies\./);
    expect(text).toMatch(/We don.t use cookies for tracking or adverts/);
    expect(text).toMatch(/If you sign in, one small cookie keeps you signed in until you close your browser/);
    expect(screen.getByRole('heading', { level: 2, name: 'Cookies' })).toBeInTheDocument();
  });
});
