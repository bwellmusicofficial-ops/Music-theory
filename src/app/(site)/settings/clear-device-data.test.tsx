import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClearDeviceData, clearDeviceData } from './clear-device-data';
import PrivacyPage from '../privacy/page';
import TermsPage from '../terms/page';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('mtn:v1:progress', '{}');
  localStorage.setItem('mtn:v1:settings', '{}');
  localStorage.setItem('mtn:v1:term-blitz-best', '{}');
  localStorage.setItem('someone-else', 'keep');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('clearDeviceData', () => {
  it('removes every key this site wrote and nothing else', () => {
    expect(clearDeviceData(localStorage)).toBe(3);
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem('someone-else')).toBe('keep');
  });
});

describe('ClearDeviceData', () => {
  it('asks before clearing, and can be cancelled', () => {
    render(<ClearDeviceData />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear everything on this device' }));
    expect(screen.getByRole('button', { name: 'Yes, clear everything' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(localStorage.getItem('mtn:v1:progress')).toBe('{}');
    expect(screen.getByRole('button', { name: 'Clear everything on this device' })).toBeInTheDocument();
  });

  it('clears on confirmation and says so', () => {
    vi.useFakeTimers();
    render(<ClearDeviceData />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear everything on this device' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, clear everything' }));
    expect(localStorage.getItem('mtn:v1:progress')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Cleared');
  });
});

describe('privacy and terms pages', () => {
  it('privacy is marked as a draft, points to the clear control and names no tracker', () => {
    render(<PrivacyPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/Draft/);
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings#clear-data');
    expect(document.body.textContent).toMatch(/We do not use cookies/);
  });

  it('terms are marked as a draft and say the site is not approved by an exam board', () => {
    render(<TermsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of use' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/Draft/);
    expect(document.body.textContent).toMatch(/not part\s+of, or approved by, any exam board/);
  });
});
