'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui';
import { normaliseRecoveryCode, passwordProblem, passwordProblemText } from '../rules';
import { accountApi } from './api';
import { FormError, PasswordField, TextField } from './fields';
import { errorText } from './messages';
import { RecoveryCodeScreen } from './recovery-code-screen';
import { accountStore } from './store';

/** Code name + recovery code sets a new password, then shows a NEW recovery code. */
export function RecoverForm() {
  const router = useRouter();
  const [codeName, setCodeName] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ code: string; signedIn: boolean } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setPasswordError(null);
    if (codeName.trim() === '' || normaliseRecoveryCode(code) === null) {
      setError('Type your code name and your 12-character recovery code.');
      return;
    }
    const pw = passwordProblem(password, codeName);
    if (pw) {
      setPasswordError(passwordProblemText(pw));
      return;
    }
    setBusy(true);
    const r = await accountApi.recover({ codeName: codeName.trim(), recoveryCode: code, newPassword: password });
    setBusy(false);
    if (!r.ok) {
      if (r.error.startsWith('password-')) setPasswordError(errorText(r.error));
      else setError(errorText(r.error, r.retryAfterSeconds));
      return;
    }
    if (r.data.signedIn) accountStore.setSignedIn(r.data.user);
    setPassword('');
    setResult({ code: r.data.recoveryCode, signedIn: r.data.signedIn });
  };

  if (result) {
    return (
      <RecoveryCodeScreen
        code={result.code}
        heading="New password set"
        intro="Here is a new recovery code. The old one doesn't work any more."
        onDone={() => router.push(result.signedIn ? '/' : '/account/sign-in')}
      />
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Get back in</h1>
      <p className="text-lg text-fg-secondary">Forgot your password? Use the recovery code you wrote down to set a new one.</p>
      <TextField label="Code name" value={codeName} onChange={setCodeName} autoComplete="username" maxLength={40} />
      <TextField
        label="Recovery code"
        hint="12 letters and numbers, like ABCD-EFGH-JKMN."
        value={code}
        onChange={setCode}
        autoComplete="off"
        autoCapitalize="characters"
        maxLength={30}
        mono
      />
      <PasswordField
        label="New password"
        hint="At least 8 characters."
        value={password}
        onChange={(v) => {
          setPassword(v);
          setPasswordError(null);
        }}
        autoComplete="new-password"
        error={passwordError}
      />
      <FormError message={error} />
      <Button type="submit" size="lg" loading={busy}>
        Set new password
      </Button>
      <p className="text-fg-secondary">
        Lost your recovery code too? Sadly the account can&apos;t be got back.{' '}
        <Link href="/account/sign-up" className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-2">
          Make a new account
        </Link>
      </p>
    </form>
  );
}
