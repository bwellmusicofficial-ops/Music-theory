import { randomBytes } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, expectNoProblems, seedSettings, test, waitReady, watchProblems } from './helpers/app';
import { expectNoAxeViolations as axe } from './helpers/axe';

/**
 * Axe on an account screen. The site footer is left out: on a phone, a page a little taller than the
 * screen leaves the footer links straddling the sticky tab bar at the top of the page, which axe reports
 * as "partially obscured" although a scroll clears it. The footer is covered by the route checks in
 * a11y-axe.phone.spec.ts, where the pages fit.
 */
const expectNoAxeViolations = (page: Page, where: string) => axe(page, where, { exclude: ['footer'] });

/**
 * P1-02: code-name accounts, against the in-memory backend (ACCOUNTS_FAKE_BACKEND=1, set by the Playwright
 * web server together with NEXT_PUBLIC_ACCOUNTS_ENABLED=1). Real Supabase is tested by the owner on Preview.
 * Every test gets its own code names and its own pretend IP address so rate limits never cross tests.
 */
test.describe.configure({ mode: 'parallel' });

const PASSWORD = 'purple elephants';
const CODE = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

let counter = 0;
function uniqueName(page: Page, stem = 'Quaver') {
  const id = `${stem}${(++counter).toString(36)}${randomBytes(2).toString('hex')}`;
  return id.slice(0, 20);
}
async function ownIp(page: Page) {
  const b = randomBytes(3);
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `10.${b[0]}.${b[1]}.${b[2]}` });
}

const formError = (page: Page) => page.getByTestId('form-error');

/** The header's account area (the page has one on every site page). */
const status = (page: Page) => page.getByTestId('account-status');

async function startSignUp(page: Page, age: 'adult' | 'under_18') {
  await page.goto('/account/sign-up');
  await waitReady(page);
  await expect(page.getByRole('heading', { name: 'Make an account' })).toBeVisible();
  await page.getByRole('radio', { name: age === 'adult' ? /^Yes, I am 18 or over/ : /^No, I'm under 18/ }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Pick a code name' })).toBeFocused();
}

async function fillAndSubmit(page: Page, name: string, password = PASSWORD) {
  await page.getByLabel('Code name').fill(name);
  await expect(page.getByRole('status').filter({ hasText: `${name} is free.` })).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Make my account' }).click();
}

/** Signs up through the UI and returns the recovery code shown. Leaves the browser signed in, on the home page. */
async function signUpViaUi(page: Page, name: string, age: 'adult' | 'under_18' = 'under_18') {
  await startSignUp(page, age);
  await fillAndSubmit(page, name);
  const code = (await page.getByTestId('recovery-code').textContent()) ?? '';
  expect(code).toMatch(CODE);
  await page.getByRole('checkbox', { name: "I've written it down" }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL('/');
  return code;
}

async function signOutViaHeader(page: Page) {
  await status(page).getByRole('button', { name: 'Sign out' }).click();
  await expect(status(page).getByRole('link', { name: 'Sign in' })).toBeVisible();
}

test('signed out: the header offers Sign in and Settings offers the account card', async ({ page }) => {
  await ownIp(page);
  const problems = watchProblems(page);
  await seedSettings(page, { theme: 'dark' });
  await page.goto('/settings');
  await waitReady(page);
  await expect(status(page).getByRole('link', { name: 'Sign in' })).toBeVisible();
  const card = page.getByTestId('account-settings');
  await expect(card.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await expect(card.getByRole('link', { name: 'Make an account' })).toBeVisible();
  await expectNoAxeViolations(page, '/settings signed out');
  expectNoProblems(problems);
});

test('sign up under 18: the whole flow, with the recovery code gate, then header and Settings show the code name', async ({ page, context }) => {
  await ownIp(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
  const problems = watchProblems(page);
  const name = uniqueName(page);

  // Step 1: the one question.
  await page.goto('/account/sign-up');
  await waitReady(page);
  await expectNoAxeViolations(page, 'sign-up: age question');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Pick one to carry on.')).toBeVisible();
  await page.getByRole('radio', { name: /^No, I'm under 18/ }).check();
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 2: code name with ideas and the "real name" line.
  await expect(page.getByText("Don't use your real name.")).toBeVisible();
  const ideas = page.getByRole('list', { name: 'Ideas for you' }).getByRole('button').filter({ hasNotText: 'More ideas' });
  await expect(ideas).toHaveCount(3);
  for (const idea of await ideas.allTextContents()) expect(idea).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d\d$/);
  await expectNoAxeViolations(page, 'sign-up: details');

  // Local rules explain themselves at once; a server check follows for a good format.
  await page.getByLabel('Code name').fill('a b');
  await expect(page.getByText('Use only letters, numbers, _ and -.')).toBeVisible();
  await page.getByLabel('Code name').fill('Admin');
  await expect(page.getByText("That code name isn't available. Try another.")).toBeVisible();
  await expectNoAxeViolations(page, 'sign-up: name problem');
  const first = (await ideas.first().textContent()) ?? '';
  await ideas.first().click();
  await expect(page.getByLabel('Code name')).toHaveValue(first);
  await page.getByRole('button', { name: 'More ideas' }).click();
  await page.getByLabel('Code name').fill(name);
  await expect(page.getByText(`${name} is free.`)).toBeVisible();

  // A weak password is explained, not rejected silently.
  await page.getByLabel('Password', { exact: true }).fill('password');
  await page.getByRole('button', { name: 'Make my account' }).click();
  await expect(page.getByText('That password is too easy to guess. Try a few words together.')).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Show' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Make my account' }).click();

  // Step 3: the recovery code, once, with plain words and a gate.
  await expect(page.getByRole('heading', { name: 'Your account is ready' })).toBeVisible();
  const code = (await page.getByTestId('recovery-code').textContent()) ?? '';
  expect(code).toMatch(CODE);
  await expect(page.getByText(/If you lose your password and this code, your account is gone for good/)).toBeVisible();
  const cont = page.getByRole('button', { name: 'Continue' });
  await expect(cont).toBeDisabled();
  await expectNoAxeViolations(page, 'sign-up: recovery code');
  await page.getByRole('button', { name: 'Copy code' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Copied|Couldn't copy/ })).toBeVisible();
  if (await page.getByText(/^Copied/).count()) expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
  await page.getByRole('checkbox', { name: "I've written it down" }).check();
  await expect(cont).toBeEnabled();
  await cont.click();
  await expect(page).toHaveURL('/');

  // Signed in: header and Settings. Only the code name is shown, no address.
  await expect(status(page)).toContainText(name);
  await expect(status(page).getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.goto('/settings');
  await waitReady(page);
  await expect(page.getByTestId('account-code-name')).toHaveText(name);
  await expect(page.getByTestId('account-settings')).not.toContainText('@');
  await expectNoAxeViolations(page, '/settings signed in');
  const me = await (await page.request.get('/api/account/me', { headers: { 'x-forwarded-for': '10.0.0.1' } })).json();
  expect(me).toEqual({ user: { codeName: name, ageBand: 'under_18' } });
  expect(JSON.stringify(me)).not.toContain('accounts.invalid');
  expectNoProblems(problems);
});

test('sign up as an adult stores the adult age band', async ({ page }) => {
  await ownIp(page);
  const name = uniqueName(page, 'Grown');
  await signUpViaUi(page, name, 'adult');
  const me = await (await page.request.get('/api/account/me')).json();
  expect(me.user).toEqual({ codeName: name, ageBand: 'adult' });
});

test('a taken name (any case) is refused, live and on submit', async ({ page }) => {
  await ownIp(page);
  const name = uniqueName(page, 'Taken');
  await signUpViaUi(page, name);
  await signOutViaHeader(page);
  await startSignUp(page, 'under_18');
  await page.getByLabel('Code name').fill(name.toUpperCase());
  await expect(page.getByText("That code name isn't available. Try another.")).toBeVisible();
  await expectNoAxeViolations(page, 'sign-up: taken name');
});

test('the signed-in state survives a reload; Sign out in the header signs out for good', async ({ page }) => {
  await ownIp(page);
  const name = uniqueName(page);
  await signUpViaUi(page, name);
  await page.reload();
  await expect(status(page)).toContainText(name);
  await signOutViaHeader(page);
  await page.reload();
  await expect(status(page).getByRole('link', { name: 'Sign in' })).toBeVisible();
  expect(await (await page.request.get('/api/account/me')).json()).toEqual({ user: null });
});

test('Sign out in Settings works too', async ({ page }) => {
  await ownIp(page);
  await signUpViaUi(page, uniqueName(page));
  await page.goto('/settings');
  await waitReady(page);
  await page.getByTestId('account-settings').getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByTestId('account-settings').getByRole('link', { name: 'Make an account' })).toBeVisible();
});

test('sign in: wrong password is refused in plain words; the right one signs in', async ({ page }) => {
  await ownIp(page);
  const name = uniqueName(page);
  await signUpViaUi(page, name);
  await signOutViaHeader(page);

  await status(page).getByRole('link', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
  await expectNoAxeViolations(page, 'sign-in');
  await page.getByLabel('Code name').fill(name.toLowerCase());
  await page.getByLabel('Password', { exact: true }).fill('not the password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(formError(page)).toContainText("That code name and password don't match.");
  await expect(status(page).getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expectNoAxeViolations(page, 'sign-in: error shown');

  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(status(page)).toContainText(name);
});

test('sign in: an unknown name gets the same message as a wrong password', async ({ page }) => {
  await ownIp(page);
  await page.goto('/account/sign-in');
  await waitReady(page);
  await page.getByLabel('Code name').fill(uniqueName(page, 'Nobody'));
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(formError(page)).toContainText("That code name and password don't match.");
});

test('five wrong tries, then a wait', async ({ page }) => {
  await ownIp(page);
  const name = uniqueName(page);
  await signUpViaUi(page, name);
  await signOutViaHeader(page);
  await page.goto('/account/sign-in');
  await waitReady(page);
  await page.getByLabel('Code name').fill(name);
  for (let i = 0; i < 5; i++) {
    await page.getByLabel('Password', { exact: true }).fill(`wrong password ${i}`);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(formError(page)).not.toBeEmpty();
  }
  await expect(formError(page)).toContainText(/Too many tries. Please wait \d+ seconds/);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(formError(page)).toContainText('Too many tries');
  await expect(status(page).getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expectNoAxeViolations(page, 'sign-in: too many tries');
});

test('recover with the code: new password and a NEW code; the old password and old code stop working', async ({ page }) => {
  await ownIp(page);
  const name = uniqueName(page, 'Forgot');
  const oldCode = await signUpViaUi(page, name);
  await signOutViaHeader(page);

  await page.goto('/account/sign-in');
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(page.getByRole('heading', { name: 'Get back in' })).toBeVisible();
  await expectNoAxeViolations(page, 'recover');

  // Typed by hand: lower case with spaces.
  const typed = oldCode.toLowerCase().replace(/-/g, ' ');
  await page.getByLabel('Code name').fill(name);
  await page.getByLabel('Recovery code').fill('WRONG-CODE-1234');
  await page.getByLabel('New password').fill('a brand new one');
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(formError(page)).toContainText('Type your code name and your 12-character recovery code.');
  await page.getByLabel('Recovery code').fill('ABCD-EFGH-JKMN');
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(formError(page)).toContainText("That code name and recovery code don't match.");
  await page.getByLabel('Recovery code').fill(typed);
  await page.getByRole('button', { name: 'Set new password' }).click();

  await expect(page.getByRole('heading', { name: 'New password set' })).toBeVisible();
  const newCode = (await page.getByTestId('recovery-code').textContent()) ?? '';
  expect(newCode).toMatch(CODE);
  expect(newCode).not.toBe(oldCode);
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await expectNoAxeViolations(page, 'recover: new code');
  await page.getByRole('checkbox', { name: "I've written it down" }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL('/');
  await expect(status(page)).toContainText(name); // recovering also signs in
  await signOutViaHeader(page);

  // Old password no longer works; the new one does.
  await page.goto('/account/sign-in');
  await page.getByLabel('Code name').fill(name);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(formError(page)).toContainText("don't match");
  await page.getByLabel('Password', { exact: true }).fill('a brand new one');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/');

  // The first code is spent.
  await signOutViaHeader(page);
  await page.goto('/account/recover');
  await page.getByLabel('Code name').fill(name);
  await page.getByLabel('Recovery code').fill(oldCode);
  await page.getByLabel('New password').fill('yet another pass');
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(formError(page)).toContainText("don't match");
});

test('keyboard only: the sign-in form can be completed with Tab and Enter', async ({ page }) => {
  await ownIp(page);
  const name = uniqueName(page, 'Keys');
  await signUpViaUi(page, name);
  await signOutViaHeader(page);
  await page.goto('/account/sign-in');
  await waitReady(page);
  await page.getByLabel('Code name').focus();
  await page.keyboard.type(name);
  await page.keyboard.press('Tab');
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/');
});

for (const theme of ['dark', 'light'] as const) {
  test(`account screens pass axe in the ${theme} theme`, async ({ page }) => {
    await ownIp(page);
    await seedSettings(page, { theme });
    for (const path of ['/account/sign-in', '/account/recover', '/account/sign-up']) {
      await page.goto(path);
      await waitReady(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expectNoAxeViolations(page, `${path} (${theme})`);
    }
  });
}

test('the API refuses cross-site posts and gives only yes or no for availability', async ({ request }) => {
  const evil = await request.post('/api/account/code-name-available', {
    data: { codeName: 'SwiftCello42' },
    headers: { origin: 'https://evil.example', 'x-forwarded-for': '10.9.9.9' },
  });
  expect(evil.status()).toBe(403);
  const ok = await request.post('/api/account/code-name-available', { data: { codeName: 'Zesty-Gong77' }, headers: { 'x-forwarded-for': '10.9.9.9' } });
  expect(await ok.json()).toEqual({ available: true });
});
