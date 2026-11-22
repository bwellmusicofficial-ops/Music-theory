'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import type { AgeBand } from '../backend/types';
import { codeNameProblem, codeNameProblemText, passwordProblem, passwordProblemText } from '../rules';
import { generateSuggestions } from '../suggestions';
import { accountApi } from './api';
import { ErrorLine, FormError, PasswordField, TextField } from './fields';
import { errorText } from './messages';
import { RecoveryCodeScreen } from './recovery-code-screen';
import { accountStore } from './store';

type Availability =
  | { kind: 'idle' }
  | { kind: 'invalid'; text: string }
  | { kind: 'checking' }
  | { kind: 'free'; name: string }
  | { kind: 'taken' }
  | { kind: 'failed'; text: string };

/** Sign-up: one question, a code name, a password, then the recovery code shown once. */
export function SignUpFlow() {
  const router = useRouter();
  const [step, setStep] = useState<'age' | 'details' | 'code'>('age');
  const [ageBand, setAgeBand] = useState<AgeBand | null>(null);
  const [ageError, setAgeError] = useState<string | null>(null);

  const [codeName, setCodeName] = useState('');
  const [password, setPassword] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [remote, setRemote] = useState<{ name: string; result: 'free' | 'taken' | { failed: string } } | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [askedForName, setAskedForName] = useState(false);
  const [result, setResult] = useState<{ code: string; signedIn: boolean } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Live availability: local rules at once (worked out while rendering), the server once typing pauses.
  const name = codeName.trim();
  const localProblem = name === '' ? null : codeNameProblem(name);
  useEffect(() => {
    if (step !== 'details' || name === '' || localProblem) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const r = await accountApi.codeNameAvailable(name, controller.signal);
      if (controller.signal.aborted) return;
      setRemote({ name, result: !r.ok ? { failed: errorText(r.error, r.retryAfterSeconds) } : r.data.available ? 'free' : 'taken' });
    }, 400);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [name, localProblem, step]);

  const availability: Availability =
    name === ''
      ? { kind: 'idle' }
      : localProblem
        ? { kind: 'invalid', text: codeNameProblemText(localProblem) }
        : remote?.name !== name
          ? { kind: 'checking' }
          : remote.result === 'free'
            ? { kind: 'free', name }
            : remote.result === 'taken'
              ? { kind: 'taken' }
              : { kind: 'failed', text: remote.result.failed };

  useEffect(() => {
    if (step !== 'age') headingRef.current?.focus();
  }, [step]);

  const status =
    availability.kind === 'checking'
      ? 'Checking...'
      : availability.kind === 'free'
        ? `${availability.name} is free.`
        : availability.kind === 'taken'
          ? "That code name isn't available. Try another."
          : availability.kind === 'invalid' || availability.kind === 'failed'
            ? availability.text
            : '';
  // "Invalid" and "taken" are problems; show them with an icon and as the field's error, not only as status.
  const nameError =
    availability.kind === 'invalid' || availability.kind === 'taken'
      ? status
      : askedForName && name === ''
        ? 'Pick a code name, or tap one of the ideas.'
        : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !ageBand) return;
    setFormError(null);
    if (localProblem || name === '') {
      setAskedForName(true);
      nameRef.current?.focus();
      return;
    }
    const pw = passwordProblem(password, name);
    if (pw) {
      setPasswordError(passwordProblemText(pw));
      passwordRef.current?.focus();
      return;
    }
    setPasswordError(null);
    setBusy(true);
    const r = await accountApi.signUp({ codeName: name, password, ageBand });
    setBusy(false);
    if (!r.ok) {
      if (r.error === 'code-name-unavailable') {
        setRemote({ name, result: 'taken' });
        nameRef.current?.focus();
      } else if (r.error.startsWith('password-')) {
        setPasswordError(errorText(r.error));
        passwordRef.current?.focus();
      } else {
        setFormError(errorText(r.error, r.retryAfterSeconds));
      }
      return;
    }
    if (r.data.signedIn) accountStore.setSignedIn(r.data.user);
    setPassword('');
    setResult({ code: r.data.recoveryCode, signedIn: r.data.signedIn });
    setStep('code');
  };

  if (step === 'code' && result) {
    return (
      <RecoveryCodeScreen
        code={result.code}
        heading="Your account is ready"
        onDone={() => router.push(result.signedIn ? '/' : '/account/sign-in')}
      />
    );
  }

  if (step === 'age') {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ageBand) {
            setAgeError('Pick one to carry on.');
            return;
          }
          // Random, so made here in the browser and not while the page is built.
          setSuggestions(generateSuggestions(3));
          setStep('details');
        }}
      >
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-extrabold tracking-tight sm:text-3xl outline-none">
          Make an account
        </h1>
        <fieldset className="flex flex-col gap-3" aria-describedby={ageError ? 'age-error' : undefined}>
          <legend className="mb-1 text-xl font-bold">Are you 18 or over?</legend>
          <p className="text-fg-secondary">We only ask yes or no. We don&apos;t keep your birthday.</p>
          {(
            [
              ['adult', 'Yes, I am 18 or over'],
              ['under_18', "No, I'm under 18"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={cn(
                'flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border-2 px-4 text-lg font-semibold',
                'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                ageBand === value ? 'border-accent bg-surface-raised' : 'border-border bg-surface',
              )}
            >
              <input
                type="radio"
                name="age"
                value={value}
                checked={ageBand === value}
                onChange={() => {
                  setAgeBand(value);
                  setAgeError(null);
                }}
                className="size-5 shrink-0 accent-[var(--accent)]"
              />
              {label}
            </label>
          ))}
          {ageError ? <ErrorLine id="age-error">{ageError}</ErrorLine> : null}
        </fieldset>
        <Button type="submit" size="lg">
          Next
        </Button>
        <p className="text-fg-secondary">
          Already have an account?{' '}
          <Link href="/account/sign-in" className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </form>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <button
        type="button"
        onClick={() => setStep('age')}
        className="min-h-11 cursor-pointer self-start font-semibold text-accent underline underline-offset-2"
      >
        Back
      </button>
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-extrabold tracking-tight sm:text-3xl outline-none">
        Pick a code name
      </h1>
      <TextField
        label="Code name"
        hint="Don't use your real name."
        value={codeName}
        onChange={setCodeName}
        inputRef={nameRef}
        autoComplete="username"
        maxLength={40}
        error={nameError}
        status={nameError ? '' : status}
      />
      <div className="flex flex-col gap-2">
        <p className="font-bold" id="ideas-label">
          Ideas for you
        </p>
        <ul aria-labelledby="ideas-label" className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => setCodeName(s)}
                className="min-h-11 cursor-pointer rounded-full border border-border bg-surface-raised px-4 font-semibold text-fg"
              >
                {s}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setSuggestions(generateSuggestions(3))}
              className="min-h-11 cursor-pointer rounded-full px-4 font-semibold text-accent underline underline-offset-2"
            >
              More ideas
            </button>
          </li>
        </ul>
      </div>
      <PasswordField
        label="Password"
        hint="At least 8 characters. A few words together works well."
        value={password}
        onChange={(v) => {
          setPassword(v);
          setPasswordError(null);
        }}
        inputRef={passwordRef}
        autoComplete="new-password"
        error={passwordError}
      />
      <FormError message={formError} />
      <Button type="submit" size="lg" loading={busy}>
        Make my account
      </Button>
    </form>
  );
}
