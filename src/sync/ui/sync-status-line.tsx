'use client';

import { Button } from '@/components/ui';
import { useEngine, useSyncStatus } from './use-engine';

const Icon = ({ done }: { done: boolean }) => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    {done ? (
      <>
        <circle cx="10" cy="10" r="8" />
        <path d="M6.5 10.5l2.5 2.5 4.5-5" />
      </>
    ) : (
      <>
        <circle cx="10" cy="10" r="8" />
        <path d="M10 5.5V10l3 2" />
      </>
    )}
  </svg>
);

/**
 * Where this device's progress stands, in Settings. Words and an icon, never colour alone, and announced politely
 * when it changes.
 */
export function SyncStatusLine() {
  const engine = useEngine();
  const status = useSyncStatus();

  let state: 'saved' | 'waiting' | 'not-added';
  let text: string;
  if (status.phase !== 'idle') {
    state = 'not-added';
    text = "Your progress on this device isn't in your account yet.";
  } else if (!status.active) {
    // Signed in a moment ago: the engine is still deciding what to do with this device's progress.
    state = 'waiting';
    text = 'Getting ready to save your progress';
  } else if (status.pending > 0 || status.failing) {
    state = 'waiting';
    text = 'Waiting to save, will retry';
  } else {
    state = 'saved';
    text = 'Saved to your account';
  }

  return (
    <div className="flex flex-col gap-2">
      <p role="status" className="flex items-center gap-2 font-semibold" data-testid="sync-status" data-state={state}>
        <Icon done={state === 'saved'} />
        <span>{text}</span>
      </p>
      {status.hasSetAside && status.phase === 'idle' ? (
        <div className="flex flex-col gap-2">
          <p className="text-fg-secondary">Progress from before you signed in is still on this device only.</p>
          <div>
            <Button variant="secondary" onClick={() => void engine.addSetAsideProgress()}>
              Add it to my account
            </Button>
          </div>
          {status.error ? <p role="alert" className="font-semibold">{status.error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
