'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { accountApi } from './api';
import { ErrorLine, TextField } from './fields';
import { deleteErrorText, exportErrorText } from './messages';
import { saveFile } from './save-file';
import { deleteAccountNow } from './store';

/** Same rule as the server's `normaliseCodeName` (inlined: the rules file carries the common-password list). */
const same = (a: string, b: string) => a.replace(/[^A-Za-z0-9]/g, '').toLowerCase() === b.replace(/[^A-Za-z0-9]/g, '').toLowerCase();

/**
 * "Your data" and "Delete my account" in the Settings account card (P1-16). Deleting is two steps, in the page
 * (no pop-up): first what will go, then typing the code name. The destructive button is never the one that has
 * focus when a step opens, and it stays off until the typed name matches.
 */
export function AccountPrivacy({ codeName, onDeleted }: { codeName: string; onDeleted: () => void }) {
  const [download, setDownload] = useState<{ kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; filename: string } | { kind: 'error'; text: string }>({ kind: 'idle' });
  const [step, setStep] = useState<'closed' | 'explain' | 'confirm'>('closed');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openButton = useRef<HTMLButtonElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const wasOpen = useRef(false);

  // Move focus to the safe choice when a step opens, and back to the opening button when it closes.
  useEffect(() => {
    if (step === 'explain') keepButton.current?.focus();
    else if (step === 'confirm') nameInput.current?.focus();
    else if (wasOpen.current) openButton.current?.focus();
    wasOpen.current = step !== 'closed';
  }, [step]);

  async function downloadMyData() {
    setDownload({ kind: 'busy' });
    const r = await accountApi.exportData();
    if (!r.ok) return setDownload({ kind: 'error', text: exportErrorText(r.error, r.retryAfterSeconds) });
    saveFile(r.blob, r.filename);
    setDownload({ kind: 'done', filename: r.filename });
  }

  function close() {
    setStep('closed');
    setTyped('');
    setError(null);
  }

  async function deleteEverything() {
    setBusy(true);
    setError(null);
    const r = await deleteAccountNow(typed);
    if (r.ok) {
      setTyped('');
      return onDeleted();
    }
    setBusy(false);
    setError(deleteErrorText(r.error, r.retryAfterSeconds));
  }

  const matches = same(typed, codeName) && typed.trim() !== '';

  return (
    <>
      <section aria-labelledby="your-data-heading" className="flex flex-col gap-3 border-t border-border pt-4" data-testid="your-data">
        <h3 id="your-data-heading" className="text-lg font-bold">
          Your data
        </h3>
        <p>
          Download a file with everything your account holds: your progress, your answers and your scores. You can keep it or
          show it to a grown-up.
        </p>
        <p className="text-fg-secondary">
          Settings on this device, like the theme and sound, belong to the device, not your account, so they aren&apos;t in the
          file.
        </p>
        <div>
          <Button variant="secondary" loading={download.kind === 'busy'} onClick={() => void downloadMyData()}>
            Download my data
          </Button>
        </div>
        <div role="status" className="empty:hidden">
          {download.kind === 'done' ? (
            <p className="font-semibold" data-testid="download-done">
              Your file is ready. It is called {download.filename}. Look in your downloads.
            </p>
          ) : null}
        </div>
        <div role="alert" className="empty:hidden">
          {download.kind === 'error' ? <ErrorLine>{download.text}</ErrorLine> : null}
        </div>
      </section>

      <section aria-labelledby="delete-heading" className="flex flex-col gap-3 border-t border-border pt-4" data-testid="delete-account">
        <h3 id="delete-heading" className="text-lg font-bold">
          Delete my account
        </h3>
        {step === 'closed' ? (
          <>
            <p>This deletes your account and everything in it. You can&apos;t undo it.</p>
            <div>
              <Button
                ref={openButton}
                variant="secondary"
                className="border-2 border-danger text-danger"
                onClick={() => setStep('explain')}
              >
                Delete my account
              </Button>
            </div>
          </>
        ) : null}

        {step === 'explain' ? (
          <div className="flex flex-col gap-3 rounded-md border-2 border-danger p-4" role="group" aria-labelledby="delete-step-1">
            <p id="delete-step-1" className="text-base font-bold">
              Step 1 of 2: what will be deleted
            </p>
            <p>If you carry on, we will delete:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>your code name and password</li>
              <li>all your lesson progress, answers and scores</li>
              <li>your game scores and practice test results</li>
            </ul>
            <p className="font-bold">
              This can&apos;t be undone. We can&apos;t get any of it back, not even if you ask us. To use the site with an account
              again you would make a new one.
            </p>
            <p className="text-fg-secondary">Want a copy first? Use Download my data above, then come back.</p>
            <div className="flex flex-wrap gap-3">
              <Button ref={keepButton} onClick={close}>
                No, keep my account
              </Button>
              <Button variant="secondary" onClick={() => setStep('confirm')}>
                Carry on
              </Button>
            </div>
          </div>
        ) : null}

        {step === 'confirm' ? (
          <form
            className="flex flex-col gap-3 rounded-md border-2 border-danger p-4"
            aria-labelledby="delete-step-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (matches && !busy) void deleteEverything();
            }}
          >
            <p id="delete-step-2" className="text-base font-bold">
              Step 2 of 2: type your code name
            </p>
            <TextField
              label="Type your code name to confirm"
              hint={
                <>
                  Your code name is <strong translate="no">{codeName}</strong>.
                </>
              }
              value={typed}
              onChange={(v) => {
                setTyped(v);
                setError(null);
              }}
              inputRef={nameInput}
              autoComplete="off"
              maxLength={40}
            />
            <p className="text-fg-secondary">The Delete everything button switches on when the name matches.</p>
            <div role="alert" className="empty:hidden" data-testid="delete-error">
              {error ? <ErrorLine>{error}</ErrorLine> : null}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={close} disabled={busy}>
                No, keep my account
              </Button>
              <Button type="submit" variant="danger" disabled={!matches} loading={busy}>
                Delete everything
              </Button>
            </div>
            <p role="status" className="sr-only">
              {busy ? 'Deleting your account.' : ''}
            </p>
          </form>
        ) : null}
      </section>
    </>
  );
}
