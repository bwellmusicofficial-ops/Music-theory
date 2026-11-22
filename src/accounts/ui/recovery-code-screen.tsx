'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';

/**
 * Shows a recovery code once. The code lives only in this component's props: it is not saved
 * anywhere, and leaving the page asks first. Continuing needs the "written it down" tick.
 */
export function RecoveryCodeScreen({
  code, heading, intro, onDone,
}: { code: string; heading: string; intro?: string; onDone: () => void }) {
  const [ticked, setTicked] = useState(false);
  const [copy, setCopy] = useState<'idle' | 'done' | 'failed'>('idle');

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopy('done');
    } catch {
      setCopy('failed');
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="recovery-screen">
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{heading}</h1>
      {intro ? <p className="text-lg text-fg-secondary">{intro}</p> : null}
      <div className="rounded-lg border-2 border-accent bg-surface-raised p-5 text-center">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-fg-secondary">Your recovery code</p>
        {/* Groups never split across lines: each is an inline block, and the text is still XXXX-XXXX-XXXX. */}
        <p data-testid="recovery-code" translate="no" className="font-mono text-2xl font-extrabold tracking-wider text-fg sm:text-3xl">
          {code.split('-').map((group, i, all) => (
            <span key={i} className="inline-block">
              {i < all.length - 1 ? `${group}-` : group}
            </span>
          ))}
        </p>
      </div>
      <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
        <p className="font-bold">Write this down now, on paper.</p>
        <ul className="list-disc space-y-1 pl-5 text-fg-secondary">
          <li>We only show it once. We can&apos;t show it to you again.</li>
          <li>If you forget your password, this code is the only way back in.</li>
          <li>
            <strong className="text-fg">If you lose your password and this code, your account is gone for good.</strong> Nobody can
            get it back for you, not even us.
          </li>
        </ul>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={copyCode}>
          Copy code
        </Button>
        <p role="status" className="font-semibold">
          {copy === 'done' ? 'Copied. Now write it down too.' : copy === 'failed' ? "Couldn't copy. Please write it down." : ''}
        </p>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-lg font-bold">
        <input
          type="checkbox"
          checked={ticked}
          onChange={(e) => setTicked(e.target.checked)}
          className="size-6 shrink-0 accent-[var(--accent)]"
        />
        I&apos;ve written it down
      </label>
      <Button size="lg" disabled={!ticked} onClick={onDone}>
        Continue
      </Button>
    </div>
  );
}
