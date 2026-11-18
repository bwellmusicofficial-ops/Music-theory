'use client';

import { useState } from 'react';
import { Button, Card } from '@/components/ui';

/** Every key this site writes to browser storage starts with this. */
export const STORAGE_PREFIX = 'mtn:';

/** Removes everything this site has saved in this browser. Returns how many items were removed. */
export function clearDeviceData(storage: Storage = window.localStorage): number {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k?.startsWith(STORAGE_PREFIX)) keys.push(k);
  }
  for (const k of keys) storage.removeItem(k);
  return keys.length;
}

/**
 * "Clear everything on this device": progress, answers, best scores, mock results
 * and settings. Two steps, with no browser dialog: the first press asks, the second confirms.
 */
export function ClearDeviceData() {
  const [stage, setStage] = useState<'idle' | 'confirm' | 'done'>('idle');

  const clear = () => {
    try {
      clearDeviceData();
    } catch {
      // Storage can be unavailable (private mode). Nothing is saved then, so there is nothing to clear.
    }
    setStage('done');
    // Settings live in memory too; a reload makes every page start from nothing.
    window.setTimeout(() => window.location.reload(), 1200);
  };

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 id="clear-data" className="text-xl font-bold">
          Your saved progress
        </h2>
        <p className="text-fg-secondary">
          Your progress, answers, best scores, mock test results and settings are saved only in this browser on this
          device. Clearing them cannot be undone.
        </p>
      </div>
      <div className="flex flex-wrap gap-3" aria-live="polite">
        {stage === 'idle' ? (
          <Button
            variant="secondary"
            onClick={() => setStage('confirm')}
          >
            Clear everything on this device
          </Button>
        ) : null}
        {stage === 'confirm' ? (
          <>
            <p className="w-full font-semibold">Clear all your progress and settings on this device?</p>
            {/* Focus moves here so keyboard and screen reader users land on the question just asked. */}
            <Button autoFocus variant="danger" onClick={clear}>
              Yes, clear everything
            </Button>
            <Button variant="secondary" onClick={() => setStage('idle')}>
              Keep it
            </Button>
          </>
        ) : null}
        {stage === 'done' ? (
          <p role="status" className="font-semibold">
            Cleared. Starting fresh.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
