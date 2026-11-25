import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasStash } from '../local-cache';
import { attemptEvent, createDevice, createServer, flush, learn, lessonProgress, type Device, type Server } from '../test-support';
import ClearDataNote from './clear-data-note';
import { MergePrompt } from './merge-prompt';
import { SyncStatusLine } from './sync-status-line';
import { SyncEngineProvider } from './use-engine';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }) }));

let server: Server;
let device: Device;
beforeEach(() => {
  process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = '1';
  pathname = '/';
  server = createServer();
  device = createDevice(server);
});
afterEach(() => {
  cleanup();
  delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
});

const done = lessonProgress({ state: 'complete', step: 'recap', questionIndex: 0, bestScore: 0.9 });

function ui(node: React.ReactNode) {
  return render(<SyncEngineProvider engine={device.engine}>{node}</SyncEngineProvider>);
}

/** Guest progress on the device, then sign up: the engine now has a question to ask. */
async function offered() {
  await device.sink.saveLessonProgress(done);
  device.engine.signedIn(await device.signUp());
}

describe('MergePrompt', () => {
  it('asks nothing when there is nothing to ask', async () => {
    device.engine.signedIn(await device.signUp());
    ui(<MergePrompt />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks in plain words, with Add and Not now, as a labelled dialog', async () => {
    await offered();
    ui(<MergePrompt />);
    const dialog = await screen.findByRole('dialog', { name: "Add this device's progress to your account?" });
    expect(within(dialog).getByRole('button', { name: 'Add' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Not now' })).toBeEnabled();
    expect(dialog).toHaveTextContent('before you signed in');
    expect(dialog).toHaveTextContent('Not now keeps it on this device only');
  });

  it('does nothing until a button is pressed: no request, nothing merged', async () => {
    await offered();
    ui(<MergePrompt />);
    await screen.findByRole('dialog');
    await flush();
    expect(server.requests).toEqual([]);
    expect((await (await server.backend.progress(device.jar))!.snapshot()).lessons).toEqual([]);
  });

  it('Add merges it, closes the question and leaves the progress on the device', async () => {
    const user = userEvent.setup();
    await offered();
    ui(<MergePrompt />);
    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await (await server.backend.progress(device.jar))!.snapshot()).lessons).toHaveLength(1);
    expect((await device.sink.loadAllLessonProgress())).toHaveLength(1);
  });

  it('Not now closes the question and merges nothing; the progress is set aside, not lost', async () => {
    const user = userEvent.setup();
    await offered();
    ui(<MergePrompt />);
    await user.click(await screen.findByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await (await server.backend.progress(device.jar))!.snapshot()).lessons).toEqual([]);
    expect(hasStash(device.storage)).toBe(true);
  });

  it('Escape counts as Not now', async () => {
    const user = userEvent.setup();
    await offered();
    ui(<MergePrompt />);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(hasStash(device.storage)).toBe(true);
  });

  it('a failed Add says so, keeps the question open and lets the person try again', async () => {
    const user = userEvent.setup();
    await offered();
    ui(<MergePrompt />);
    await screen.findByRole('dialog');
    server.state.down = true;
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't add it just now");
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    server.state.down = false;
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps out of the way of the sign-up screens, then appears', async () => {
    pathname = '/account/sign-up';
    await offered();
    const view = ui(<MergePrompt />);
    expect(screen.queryByRole('dialog')).toBeNull();
    pathname = '/';
    view.rerender(
      <SyncEngineProvider engine={device.engine}>
        <MergePrompt />
      </SyncEngineProvider>,
    );
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('SyncStatusLine (Settings)', () => {
  const line = () => screen.getByTestId('sync-status');

  it('says "Saved to your account" with an icon when nothing is waiting', async () => {
    device.engine.signedIn(await device.signUp());
    await flush();
    ui(<SyncStatusLine />);
    expect(line()).toHaveTextContent('Saved to your account');
    expect(line()).toHaveAttribute('data-state', 'saved');
    expect(line().querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(line()).toHaveAttribute('role', 'status');
  });

  it('says "Waiting to save, will retry" when changes are waiting, in words and a different icon', async () => {
    device.engine.signedIn(await device.signUp());
    await flush();
    const saved = screen.queryByTestId('sync-status');
    expect(saved).toBeNull();
    ui(<SyncStatusLine />);
    const savedIcon = line().querySelector('svg')!.innerHTML;
    server.state.down = true;
    await act(async () => {
      await learn(device, done, [attemptEvent(1)]);
      await flush();
    });
    expect(line()).toHaveTextContent('Waiting to save, will retry');
    expect(line()).toHaveAttribute('data-state', 'waiting');
    expect(line().querySelector('svg')!.innerHTML).not.toBe(savedIcon);
  });

  it('goes back to "Saved to your account" once the changes have been sent', async () => {
    device.engine.signedIn(await device.signUp());
    server.state.down = true;
    ui(<SyncStatusLine />);
    await act(async () => {
      await learn(device, done);
      await flush();
    });
    expect(line()).toHaveAttribute('data-state', 'waiting');
    server.state.down = false;
    await act(async () => {
      device.engine.online();
      await flush();
    });
    expect(line()).toHaveAttribute('data-state', 'saved');
  });

  it('while the question about this device\'s progress is open it says that progress is not in the account yet', async () => {
    await offered();
    ui(<SyncStatusLine />);
    expect(line()).toHaveTextContent("isn't in your account yet");
    expect(line()).toHaveAttribute('data-state', 'not-added');
  });

  it('offers to add progress that was set aside, and does so', async () => {
    const user = userEvent.setup();
    await offered();
    device.engine.keepSeparate();
    await flush();
    ui(<SyncStatusLine />);
    expect(screen.getByText(/Progress from before you signed in is still on this device only/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add it to my account' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Add it to my account' })).toBeNull());
    expect((await (await server.backend.progress(device.jar))!.snapshot()).lessons).toHaveLength(1);
  });
});

describe('ClearDataNote (under "Your saved progress")', () => {
  it('says nothing for a guest, and says the account keeps it for someone signed in', async () => {
    const view = ui(<ClearDataNote />);
    expect(screen.queryByTestId('clear-data-account-note')).toBeNull();
    device.engine.signedIn(await device.signUp());
    view.rerender(
      <SyncEngineProvider engine={device.engine}>
        <ClearDataNote />
      </SyncEngineProvider>,
    );
    expect(await screen.findByTestId('clear-data-account-note')).toHaveTextContent("Clearing this device doesn't remove it from your account");
  });
});
