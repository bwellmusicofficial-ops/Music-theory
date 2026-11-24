import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeFetch } from '../test-support/fake-fetch';
import AccountSettingsInner from './account-settings-inner';
import AccountStatusInner from './account-status-inner';
import { RecoverForm } from './recover-form';
import { RecoveryCodeScreen } from './recovery-code-screen';
import { SignInForm } from './sign-in-form';
import { SignUpFlow } from './sign-up-flow';
import { accountStore } from './store';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/' }));

let fake: ReturnType<typeof createFakeFetch>;
beforeEach(() => {
  process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = '1';
  fake = createFakeFetch();
  vi.stubGlobal('fetch', fake.fetch);
  accountStore.reset();
  push.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
});

const PASSWORD = 'purple elephants';
const CODE = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

async function toDetails(user: ReturnType<typeof userEvent.setup>, band: RegExp) {
  render(<SignUpFlow />);
  await user.click(screen.getByRole('radio', { name: band }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
}

describe('SignUpFlow', () => {
  it('asks one question first, and will not go on without an answer', async () => {
    const user = userEvent.setup();
    render(<SignUpFlow />);
    expect(screen.getByRole('group', { name: /Are you 18 or over/ })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Pick one to carry on.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Code name')).toBeNull();
  });

  it('shows the real-name line and three generated ideas that fill the field', async () => {
    const user = userEvent.setup();
    await toDetails(user, /No, I'm under 18/);
    expect(screen.getByText("Don't use your real name.")).toBeInTheDocument();
    const ideas = within(screen.getByRole('list', { name: 'Ideas for you' })).getAllByRole('button').filter((b) => b.textContent !== 'More ideas');
    expect(ideas).toHaveLength(3);
    for (const b of ideas) expect(b.textContent).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d\d$/);
    await user.click(ideas[0]!);
    expect(screen.getByLabelText('Code name')).toHaveValue(ideas[0]!.textContent);
    const before = ideas.map((b) => b.textContent);
    await user.click(screen.getByRole('button', { name: 'More ideas' }));
    const after = within(screen.getByRole('list', { name: 'Ideas for you' })).getAllByRole('button').filter((b) => b.textContent !== 'More ideas').map((b) => b.textContent);
    expect(after).toHaveLength(3);
    expect(after).not.toEqual(before);
  });

  it('checks the name live: local rules at once, then the server', async () => {
    const user = userEvent.setup();
    await toDetails(user, /No, I'm under 18/);
    const name = screen.getByLabelText('Code name');
    await user.type(name, 'a b');
    expect(screen.getByText('Use only letters, numbers, _ and -.')).toBeInTheDocument();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(fake.calls.filter((c) => c.path.endsWith('available'))).toHaveLength(0);

    await user.clear(name);
    await user.type(name, 'SwiftCello42');
    expect(await screen.findByText('SwiftCello42 is free.')).toBeInTheDocument();
    expect(name).not.toHaveAttribute('aria-invalid');

    await user.clear(name);
    await user.type(name, 'Admin');
    expect(await screen.findByText("That code name isn't available. Try another.")).toBeInTheDocument();
  });

  it('only asks the server once typing pauses (not on every key)', async () => {
    const user = userEvent.setup();
    await toDetails(user, /No/);
    await user.type(screen.getByLabelText('Code name'), 'SwiftCello');
    await screen.findByText('SwiftCello is free.');
    expect(fake.calls.filter((c) => c.path.endsWith('available'))).toHaveLength(1);
  });

  it('explains a common password (the list is on the server, so the server says so)', async () => {
    const user = userEvent.setup();
    await toDetails(user, /No/);
    await user.type(screen.getByLabelText('Code name'), 'SwiftCello42');
    await user.type(screen.getByLabelText('Password'), 'password');
    await user.click(screen.getByRole('button', { name: 'Make my account' }));
    expect(await screen.findByText('That password is too easy to guess. Try a few words together.')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveFocus();
    // No account was made.
    expect(await fake.backend.codeNameAvailable('SwiftCello42')).toBe(true);
  });

  it('shows and hides the password', async () => {
    const user = userEvent.setup();
    await toDetails(user, /No/);
    const pw = screen.getByLabelText('Password');
    expect(pw).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(pw).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('creates the account (under 18), then shows the recovery code once behind the tick', async () => {
    const user = userEvent.setup();
    await toDetails(user, /No, I'm under 18/);
    await user.type(screen.getByLabelText('Code name'), 'SwiftCello42');
    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Make my account' }));

    const code = await screen.findByTestId('recovery-code');
    expect(code.textContent).toMatch(CODE);
    expect(fake.calls.at(-1)).toEqual({ path: '/api/account/sign-up', body: { codeName: 'SwiftCello42', password: PASSWORD, ageBand: 'under_18' } });
    expect(screen.getByText(/gone for good/)).toBeInTheDocument();
    const cont = screen.getByRole('button', { name: 'Continue' });
    expect(cont).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: "I've written it down" }));
    expect(cont).toBeEnabled();
    await user.click(cont);
    expect(push).toHaveBeenCalledWith('/');
    // The store knows who is signed in, with the code name only.
    expect(await screen.findByRole('heading', { name: 'Your account is ready' })).toBeInTheDocument();
  });

  it('sends adult for the adult answer', async () => {
    const user = userEvent.setup();
    await toDetails(user, /Yes, I am 18 or over/);
    await user.type(screen.getByLabelText('Code name'), 'GrownUpHarp1');
    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Make my account' }));
    await screen.findByTestId('recovery-code');
    expect(fake.calls.at(-1)?.body).toMatchObject({ ageBand: 'adult' });
  });

  it('says so when the name was taken in the meantime', async () => {
    const user = userEvent.setup();
    await fake.backend.signUp({ codeName: 'SwiftCello42', password: PASSWORD, ageBand: 'adult' }, fake.jar);
    await toDetails(user, /No/);
    await user.type(screen.getByLabelText('Code name'), 'swiftcello42');
    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Make my account' }));
    expect(await screen.findByText("That code name isn't available. Try another.")).toBeInTheDocument();
    expect(screen.queryByTestId('recovery-code')).toBeNull();
  });

  it('Back returns to the question', async () => {
    const user = userEvent.setup();
    await toDetails(user, /No/);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('radio', { name: /No/ })).toBeChecked();
  });
});

describe('RecoveryCodeScreen', () => {
  it('copies the code, and says when it could not', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<RecoveryCodeScreen code="ABCD-EFGH-JKMN" heading="Your account is ready" onDone={() => undefined} />);
    expect(screen.getByTestId('recovery-code')).toHaveTextContent('ABCD-EFGH-JKMN');
    await user.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(writeText).toHaveBeenCalledWith('ABCD-EFGH-JKMN');
    expect(await screen.findByText(/Copied/)).toBeInTheDocument();

    writeText.mockRejectedValueOnce(new Error('denied'));
    await user.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(await screen.findByText(/Couldn't copy/)).toBeInTheDocument();
  });

  it('warns before the page is left, and stops warning when it goes', () => {
    const { unmount } = render(<RecoveryCodeScreen code="ABCD-EFGH-JKMN" heading="h" onDone={() => undefined} />);
    const e1 = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e1);
    expect(e1.defaultPrevented).toBe(true);
    unmount();
    const e2 = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e2);
    expect(e2.defaultPrevented).toBe(false);
  });

  it('keeps the code out of storage', () => {
    render(<RecoveryCodeScreen code="ABCD-EFGH-JKMN" heading="h" onDone={() => undefined} />);
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('ABCD');
  });
});

describe('SignInForm', () => {
  beforeEach(async () => {
    await fake.backend.signUp({ codeName: 'SwiftCello42', password: PASSWORD, ageBand: 'under_18' }, fake.jar);
    await fake.backend.signOut(fake.jar);
  });

  it('signs in and goes home', async () => {
    const user = userEvent.setup();
    render(<SignInForm />);
    await user.type(screen.getByLabelText('Code name'), 'swiftcello42');
    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
  });

  it('says plainly when the details do not match, in an alert', async () => {
    const user = userEvent.setup();
    render(<SignInForm />);
    await user.type(screen.getByLabelText('Code name'), 'SwiftCello42');
    await user.type(screen.getByLabelText('Password'), 'not the password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("That code name and password don't match.");
    expect(push).not.toHaveBeenCalled();
  });

  it('asks for both fields', async () => {
    const user = userEvent.setup();
    render(<SignInForm />);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Type your code name and your password.');
  });

  it('tells how long to wait when too many tries', async () => {
    const user = userEvent.setup();
    render(<SignInForm />);
    await user.type(screen.getByLabelText('Code name'), 'SwiftCello42');
    for (let i = 0; i < 6; i++) {
      await user.clear(screen.getByLabelText('Password'));
      await user.type(screen.getByLabelText('Password'), `wrong password ${i}`);
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
      await waitFor(() => expect(screen.getByRole('alert')).not.toBeEmpty());
    }
    expect(screen.getByRole('alert')).toHaveTextContent(/Too many tries\. Please wait \d+ seconds, then try again\./);
  });

  it('links to recovery and sign-up', () => {
    render(<SignInForm />);
    expect(screen.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute('href', '/account/recover');
    expect(screen.getByRole('link', { name: /Make an account/ })).toHaveAttribute('href', '/account/sign-up');
  });

  it('says so when the network is down', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
    const user = userEvent.setup();
    render(<SignInForm />);
    await user.type(screen.getByLabelText('Code name'), 'SwiftCello42');
    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the site.");
  });
});

describe('RecoverForm', () => {
  let code: string;
  beforeEach(async () => {
    const r = await fake.backend.signUp({ codeName: 'SwiftCello42', password: PASSWORD, ageBand: 'under_18' }, fake.jar);
    if (!r.ok) throw new Error('setup');
    code = r.recoveryCode;
    await fake.backend.signOut(fake.jar);
  });

  it('sets a new password from a hand-typed code and shows a new code', async () => {
    const user = userEvent.setup();
    render(<RecoverForm />);
    await user.type(screen.getByLabelText('Code name'), 'SwiftCello42');
    await user.type(screen.getByLabelText('Recovery code'), code.toLowerCase().replace(/-/g, ' '));
    await user.type(screen.getByLabelText('New password'), 'a brand new one');
    await user.click(screen.getByRole('button', { name: 'Set new password' }));
    const shown = await screen.findByTestId('recovery-code');
    expect(shown.textContent).toMatch(CODE);
    expect(shown.textContent).not.toBe(code);
    expect(screen.getByText(/old one doesn't work any more/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('refuses a code of the wrong shape without asking the server, and a wrong code in words', async () => {
    const user = userEvent.setup();
    render(<RecoverForm />);
    await user.type(screen.getByLabelText('Code name'), 'SwiftCello42');
    await user.type(screen.getByLabelText('Recovery code'), 'nope');
    await user.type(screen.getByLabelText('New password'), 'a brand new one');
    await user.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Type your code name and your 12-character recovery code.');
    expect(fake.calls.filter((c) => c.path.endsWith('recover'))).toHaveLength(0);

    await user.clear(screen.getByLabelText('Recovery code'));
    await user.type(screen.getByLabelText('Recovery code'), 'ABCD-EFGH-JKMN');
    await user.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(await screen.findByText(/That code name and recovery code don't match/)).toBeInTheDocument();
  });

  it('explains a weak new password', async () => {
    const user = userEvent.setup();
    render(<RecoverForm />);
    await user.type(screen.getByLabelText('Code name'), 'SwiftCello42');
    await user.type(screen.getByLabelText('Recovery code'), code);
    await user.type(screen.getByLabelText('New password'), '12345678');
    await user.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(screen.getByText('That password is too easy to guess. Try a few words together.')).toBeInTheDocument();
  });

  it('is honest that a lost code means a lost account', () => {
    render(<RecoverForm />);
    expect(screen.getByText(/Lost your recovery code too\? Sadly the account can't be got back\./)).toBeInTheDocument();
  });
});

describe('header and settings state', () => {
  it('shows nothing until it knows, then Sign in when signed out', async () => {
    render(<AccountStatusInner />);
    expect(screen.queryByTestId('account-status')).toBeNull();
    const link = await screen.findByRole('link', { name: 'Sign in' });
    expect(link).toHaveAttribute('href', '/account/sign-in');
  });

  it('shows the code name and a working Sign out when signed in', async () => {
    const user = userEvent.setup();
    await fake.backend.signUp({ codeName: 'SwiftCello42', password: PASSWORD, ageBand: 'under_18' }, fake.jar);
    render(<AccountStatusInner />);
    const status = await screen.findByTestId('account-status');
    expect(status).toHaveTextContent('SwiftCello42');
    expect(status).not.toHaveTextContent('@');
    await user.click(within(status).getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(await fake.backend.currentUser(fake.jar)).toBeNull();
  });

  it('Settings shows the same state, and says plainly where progress is kept', async () => {
    const user = userEvent.setup();
    await fake.backend.signUp({ codeName: 'SwiftCello42', password: PASSWORD, ageBand: 'under_18' }, fake.jar);
    render(<AccountSettingsInner />);
    expect(await screen.findByTestId('account-code-name')).toHaveTextContent('SwiftCello42');
    expect(screen.getByTestId('sync-status')).toHaveTextContent(/Getting ready to save|Saved to your account/);
    expect(screen.getByText(/Signing out takes your account's progress off this device/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('link', { name: 'Make an account' })).toHaveAttribute('href', '/account/sign-up');
  });

  it('a failed sign out is reported and keeps the signed-in state', async () => {
    const user = userEvent.setup();
    await fake.backend.signUp({ codeName: 'SwiftCello42', password: PASSWORD, ageBand: 'under_18' }, fake.jar);
    render(<AccountSettingsInner />);
    await screen.findByTestId('account-code-name');
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Sign out' }));
    });
    expect(await screen.findByText("Couldn't sign out. Please try again.")).toBeInTheDocument();
    expect(screen.getByTestId('account-code-name')).toBeInTheDocument();
  });
});

describe('with the switch off nothing is drawn', () => {
  it('the header and Settings gates render nothing', async () => {
    delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED;
    vi.resetModules();
    const { AccountStatus } = await import('./account-status');
    const { AccountSettings } = await import('./account-settings');
    const { container } = render(
      <>
        <AccountStatus />
        <AccountSettings />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(fake.calls).toHaveLength(0);
    fireEvent.focus(container);
  });
});
