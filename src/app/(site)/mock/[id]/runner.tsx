'use client';

import { MockRunner, type MockRunnerProps } from '@/mock/components/mock-runner';
import { useSettings } from '@/settings';

/** Waits for the stored settings (untimed, terminology) before the test can start. */
export function MockRunnerPage(props: Omit<MockRunnerProps, 'settings'>) {
  const { settings, loaded } = useSettings();
  if (!loaded) {
    return (
      <div className="flex flex-1 items-center justify-center text-fg-secondary" role="status">
        Loading test
      </div>
    );
  }
  return <MockRunner {...props} settings={settings} />;
}
