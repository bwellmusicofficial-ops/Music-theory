'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui';
import { accountApi } from './api';
import { FormError, PasswordField, TextField } from './fields';
import { errorText } from './messages';
import { accountStore } from './store';

export function SignInForm() {
  const router = useRouter();
  const [codeName, setCodeName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (codeName.trim() === '' || password === '') {
      setError('Type your code name and your password.');
      return;
    }
    setError(null);
    setBusy(true);
    const r = await accountApi.signIn({ codeName: codeName.trim(), password });
    setBusy(false);
    if (!r.ok) {
      setError(errorText(r.error, r.retryAfterSeconds));
      return;
    }
    accountStore.setSignedIn(r.data.user);
    router.push('/');
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Sign in</h1>
      <TextField label="Code name" value={codeName} onChange={setCodeName} autoComplete="username" maxLength={40} />
      <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
      <FormError message={error} />
      <Button type="submit" size="lg" loading={busy}>
        Sign in
      </Button>
      <p className="flex flex-col text-fg-secondary">
        <Link href="/account/recover" className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2">
          Forgot your password?
        </Link>
        <Link href="/account/sign-up" className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2">
          New here? Make an account
        </Link>
      </p>
    </form>
  );
}
