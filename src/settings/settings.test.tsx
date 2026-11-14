import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/lesson/contracts';
import { NO_FLASH_SCRIPT, SETTINGS_KEY, SettingsProvider, parseSettings, useSettings } from './index';
import { resetSettingsStoreForTests } from './store';

const audio = vi.hoisted(() => ({ setMuted: vi.fn() }));
vi.mock('@/audio', () => ({ getAudioEngine: () => audio }));

function Probe() {
  const { settings, update, loaded } = useSettings();
  return (
    <div>
      <p data-testid="state">{`${loaded}|${settings.theme}|${settings.soundOn}|${settings.reducedMotion}|${settings.latencyOffsetMs}`}</p>
      <button onClick={() => update({ theme: 'light', soundOn: false, latencyOffsetMs: 40 })}>change</button>
    </div>
  );
}

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches, media: query, addEventListener() {}, removeEventListener() {} }));
}

beforeEach(() => {
  localStorage.clear();
  audio.setMuted.mockClear();
  mockMatchMedia(false);
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.reducedMotion;
  resetSettingsStoreForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseSettings', () => {
  it('gives the defaults for nothing, corrupt JSON and non-objects', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('42')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[1]')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid fields and replaces invalid ones one by one', () => {
    const parsed = parseSettings(
      JSON.stringify({ theme: 'light', terminology: 'martian', soundOn: 'yes', untimed: true, latencyOffsetMs: 9999 }),
    );
    expect(parsed).toEqual({ ...DEFAULT_SETTINGS, theme: 'light', untimed: true, latencyOffsetMs: 300 });
  });

  it('takes reducedMotion from the device when it is not stored, and from storage when it is', () => {
    expect(parseSettings(null, true).reducedMotion).toBe(true);
    expect(parseSettings('{}', true).reducedMotion).toBe(true);
    expect(parseSettings('{"reducedMotion":false}', true).reducedMotion).toBe(false);
  });
});

describe('SettingsProvider', () => {
  it('starts from the device motion preference when nothing is stored', () => {
    mockMatchMedia(true);
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    expect(screen.getByTestId('state')).toHaveTextContent('true|dark|true|true|0');
    expect(document.documentElement.dataset.reducedMotion).toBe('true');
  });

  it('reads stored settings, persists changes, sets <html> and mutes the audio engine', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'light' }));
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(audio.setMuted).toHaveBeenLastCalledWith(false);
    act(() => screen.getByRole('button', { name: 'change' }).click());
    expect(screen.getByTestId('state')).toHaveTextContent('true|light|false|false|40');
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')).toMatchObject({ theme: 'light', soundOn: false, latencyOffsetMs: 40 });
    expect(audio.setMuted).toHaveBeenLastCalledWith(true);
  });

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    act(() => screen.getByRole('button', { name: 'change' }).click());
    expect(screen.getByTestId('state')).toHaveTextContent('true|light|false|false|40');
    vi.restoreAllMocks();
  });

  it('useSettings outside a provider says what is missing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/SettingsProvider/);
    spy.mockRestore();
  });
});

describe('no-flash script', () => {
  it('sets the theme and motion attributes from storage before React runs', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'light', reducedMotion: true }));
    new Function(NO_FLASH_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.reducedMotion).toBe('true');
  });

  it('defaults to dark and the device motion preference, and ignores corrupt storage', () => {
    localStorage.setItem(SETTINGS_KEY, '{oops');
    mockMatchMedia(true);
    new Function(NO_FLASH_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.reducedMotion).toBe('true');
  });
});
