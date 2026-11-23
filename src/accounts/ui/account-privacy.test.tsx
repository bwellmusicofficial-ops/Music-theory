import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeFetch } from '../test-support/fake-fetch';
import AccountSettingsInner from './account-settings-inner';
import { accountStore } from './store';

const saveFile = vi.fn();
vi.mock('./save-file', () => ({ saveFile: (...a: unknown[]) => saveFile(...a) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/' }));

let fake: ReturnType<typeof createFakeFetch>;
const PASSWORD = 'purple elephants';
const NAME = 'SwiftCello42';

beforeEach(async () => {
  process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = '1';
  fake = createFakeFetch();
  vi.stubGlobal('fetch', fake.fetch);
  accountStore.reset();
  saveFile.mockReset();
  localStorage.clear();
  await fake.backend.signUp({ codeName: NAME, password: PASSWORD, ageBand: 'under_18' }, fake.jar);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
});

async function settings() {
  const user = userEvent.setup();
  render(<AccountSettingsInner />);
  await screen.findByTestId('account-code-name');
  return user;
}
const deleteSection = () => screen.getByTestId('delete-account');

async function toStepTwo(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(deleteSection()).getByRole('button', { name: 'Delete my account' }));
  await user.click(screen.getByRole('button', { name: 'Carry on' }));
}

describe('Download my data', () => {
  it('says what is in the file and that device settings are not', async () => {
    await settings();
    const section = screen.getByTestId('your-data');
    expect(within(section).getByRole('heading', { name: 'Your data' })).toBeInTheDocument();
    expect(section).toHaveTextContent(/progress, your answers and your scores/);
    expect(section).toHaveTextContent(/Settings on this device, like the theme and sound, belong to the device, not your account/);
  });

  it('downloads a file named by the day, and announces it', async () => {
    const user = await settings();
    const store = (await fake.backend.progress(fake.jar))!;
    await store.saveLessons([{ lessonId: 'g1-rhythm-01', state: 'complete', step: 'recap', questionIndex: 0, bestScore: 1 }]);
    await user.click(screen.getByRole('button', { name: 'Download my data' }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    const [blob, filename] = saveFile.mock.calls[0] as [Blob, string];
    expect(filename).toMatch(/^music-theory-now-data-\d{4}-\d{2}-\d{2}\.json$/);
    const file = JSON.parse(await blob.text());
    expect(file.README).toBeDefined();
    expect(file.profile.code_name).toBe(NAME);
    expect(file.lesson_progress[0].lesson_id).toBe('g1-rhythm-01');
    expect(await screen.findByTestId('download-done')).toHaveTextContent(filename);
    expect(screen.getByTestId('download-done').closest('[role="status"]')).not.toBeNull();
  });

  it('says plainly when it is asked for too often', async () => {
    const user = await settings();
    for (let i = 0; i < 5; i++) {
      await user.click(screen.getByRole('button', { name: 'Download my data' }));
      await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(i + 1));
    }
    await user.click(screen.getByRole('button', { name: 'Download my data' }));
    const alert = await screen.findByText(/You've already downloaded your data a few times\. Please wait 30 seconds, then try again\./);
    expect(alert.closest('[role="alert"]')).not.toBeNull();
    expect(saveFile).toHaveBeenCalledTimes(5);
  });

  it('says plainly when the site cannot be reached', async () => {
    const user = await settings();
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
    await user.click(screen.getByRole('button', { name: 'Download my data' }));
    expect(await screen.findByText("Couldn't reach the site. Check your internet and try again.")).toBeInTheDocument();
    expect(saveFile).not.toHaveBeenCalled();
  });
});

describe('Delete my account: two steps', () => {
  it('starts closed, with a distinct but not default-looking button, and nothing is deleted by opening it', async () => {
    await settings();
    const entry = within(deleteSection()).getByRole('button', { name: 'Delete my account' });
    expect(entry).toHaveClass('border-danger');
    expect(screen.queryByRole('button', { name: 'Delete everything' })).toBeNull();
    expect(fake.calls.filter((c) => c.path.endsWith('/delete'))).toHaveLength(0);
  });

  it('step 1 lists what goes, warns it cannot be undone, and puts focus on the safe choice', async () => {
    const user = await settings();
    await user.click(within(deleteSection()).getByRole('button', { name: 'Delete my account' }));
    const step = screen.getByRole('group', { name: /Step 1 of 2/ });
    expect(step).toHaveTextContent(/your code name and password/);
    expect(step).toHaveTextContent(/all your lesson progress, answers and scores/);
    expect(step).toHaveTextContent(/This can't be undone/);
    expect(screen.getByRole('button', { name: 'No, keep my account' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Delete everything' })).toBeNull();
  });

  it('"No, keep my account" closes it and puts focus back on the button that opened it', async () => {
    const user = await settings();
    await user.click(within(deleteSection()).getByRole('button', { name: 'Delete my account' }));
    await user.click(screen.getByRole('button', { name: 'No, keep my account' }));
    expect(screen.queryByRole('group', { name: /Step 1 of 2/ })).toBeNull();
    expect(within(deleteSection()).getByRole('button', { name: 'Delete my account' })).toHaveFocus();
  });

  it('step 2 asks for the code name; the destructive button is off until it matches and never has focus on arrival', async () => {
    const user = await settings();
    await toStepTwo(user);
    const input = screen.getByLabelText('Type your code name to confirm');
    expect(input).toHaveFocus();
    const destroy = screen.getByRole('button', { name: 'Delete everything' });
    expect(destroy).not.toHaveFocus();
    expect(destroy).toBeDisabled();
    expect(deleteSection()).toHaveTextContent(`Your code name is ${NAME}.`);
    expect(deleteSection()).toHaveTextContent('The Delete everything button switches on when the name matches.');
    await user.type(input, 'SwiftCello4');
    expect(destroy).toBeDisabled();
    await user.type(input, '3');
    expect(destroy).toBeDisabled();
    await user.clear(input);
    await user.type(input, 'swift-cello42');
    expect(destroy).toBeEnabled();
    expect(fake.calls.filter((c) => c.path.endsWith('/delete'))).toHaveLength(0);
  });

  it('deleting signs out, shows the confirmation, cleans the device and removes the account', async () => {
    const user = await settings();
    localStorage.setItem('mtn:v1:sync-owner', 'swiftcello42');
    localStorage.setItem('mtn:v1:progress', '{"x":1}');
    localStorage.setItem('mtn:v1:outbox', '[{"k":"lesson"}]');
    localStorage.setItem('mtn:v1:settings', '{"theme":"dark"}');
    await toStepTwo(user);
    await user.type(screen.getByLabelText('Type your code name to confirm'), NAME);
    await user.click(screen.getByRole('button', { name: 'Delete everything' }));

    const done = await screen.findByTestId('account-deleted');
    expect(done).toHaveTextContent('Your account and everything in it has been deleted.');
    expect(within(done).getByRole('heading', { name: 'Account deleted' })).toHaveFocus();
    expect(within(done).getByRole('status')).toHaveTextContent('has been deleted');
    expect(within(done).getByRole('link', { name: 'Back to the lessons' })).toHaveAttribute('href', '/learn');
    expect(within(done).getByRole('link', { name: 'Make a new account' })).toHaveAttribute('href', '/account/sign-up');
    expect(screen.queryByRole('button', { name: 'Delete my account' })).toBeNull();

    expect(fake.calls.find((c) => c.path.endsWith('/delete'))?.body).toEqual({ confirmCodeName: NAME });
    expect(await fake.backend.currentUser(fake.jar)).toBeNull();
    expect(await fake.backend.codeNameAvailable(NAME)).toBe(true);
    // The device is cleaned as a sign-out cleans it, and the settings stay.
    expect(localStorage.getItem('mtn:v1:sync-owner')).toBeNull();
    expect(localStorage.getItem('mtn:v1:progress')).toBeNull();
    expect(localStorage.getItem('mtn:v1:outbox')).toBeNull();
    expect(localStorage.getItem('mtn:v1:settings')).toBe('{"theme":"dark"}');
  });

  it('Enter in the box deletes only when the name matches', async () => {
    const user = await settings();
    await toStepTwo(user);
    const input = screen.getByLabelText('Type your code name to confirm');
    await user.type(input, 'wrong{Enter}');
    expect(fake.calls.filter((c) => c.path.endsWith('/delete'))).toHaveLength(0);
    await user.clear(input);
    await user.type(input, `${NAME}{Enter}`);
    expect(await screen.findByTestId('account-deleted')).toBeInTheDocument();
  });

  it('a failure is announced, nothing is cleaned from the device, and the learner stays signed in and can try again', async () => {
    const user = await settings();
    localStorage.setItem('mtn:v1:sync-owner', 'swiftcello42');
    await toStepTwo(user);
    await user.type(screen.getByLabelText('Type your code name to confirm'), NAME);
    const real = fake.fetch;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith('/delete') ? Promise.resolve(new Response(JSON.stringify({ error: 'server-error' }), { status: 500 })) : real(input, init));
    await user.click(screen.getByRole('button', { name: 'Delete everything' }));
    const alert = await screen.findByText(/your account was not fully deleted\. Please try again in a minute\./);
    expect(alert.closest('[role="alert"]')).not.toBeNull();
    expect(screen.queryByTestId('account-deleted')).toBeNull();
    expect(screen.getByTestId('account-code-name')).toHaveTextContent(NAME);
    expect(localStorage.getItem('mtn:v1:sync-owner')).toBe('swiftcello42');
    expect(await fake.backend.currentUser(fake.jar)).not.toBeNull();
    // Trying again works once the fault has gone.
    vi.stubGlobal('fetch', real);
    await user.click(screen.getByRole('button', { name: 'Delete everything' }));
    expect(await screen.findByTestId('account-deleted')).toBeInTheDocument();
  });

  it('a network failure says nothing was deleted', async () => {
    const user = await settings();
    await toStepTwo(user);
    await user.type(screen.getByLabelText('Type your code name to confirm'), NAME);
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Delete everything' }));
    });
    expect(await screen.findByText(/Nothing was deleted\. Check your internet/)).toBeInTheDocument();
  });

  it('typing again clears the error', async () => {
    const user = await settings();
    await toStepTwo(user);
    const input = screen.getByLabelText('Type your code name to confirm');
    await user.type(input, NAME);
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify({ error: 'confirm-mismatch' }), { status: 400 })));
    await user.click(screen.getByRole('button', { name: 'Delete everything' }));
    expect(await screen.findByText("That isn't your code name. Check it and try again.")).toBeInTheDocument();
    await user.type(input, 'x');
    expect(screen.queryByText("That isn't your code name. Check it and try again.")).toBeNull();
  });
});
