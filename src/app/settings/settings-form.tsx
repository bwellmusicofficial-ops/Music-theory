'use client';

import { LatencyCalibration } from '@/components/rhythm-pad';
import { Button, Card } from '@/components/ui';
import { useSettings } from '@/settings';
import { Choice } from './choice';

const onOff = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
] as const;

export function SettingsForm() {
  const { settings, update, loaded } = useSettings();
  // Until the stored settings are read, the controls would show the defaults.
  if (!loaded) {
    return (
      <p role="status" className="text-fg-secondary">
        Loading settings
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-6">
        <Choice
          legend="Theme"
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
          value={settings.theme}
          onChange={(theme) => update({ theme })}
        />
        <Choice
          legend="Sound"
          options={[...onOff]}
          value={settings.soundOn ? 'on' : 'off'}
          onChange={(v) => update({ soundOn: v === 'on' })}
        />
        <Choice
          legend="Terminology"
          description="UK names are crotchet and minim; US names are quarter note and half note."
          options={[
            { value: 'uk', label: 'UK' },
            { value: 'us', label: 'US' },
          ]}
          value={settings.terminology}
          onChange={(terminology) => update({ terminology })}
        />
        <Choice
          legend="Reduced motion"
          description="Turns animation down. It starts from your device setting."
          options={[...onOff]}
          value={settings.reducedMotion ? 'on' : 'off'}
          onChange={(v) => update({ reducedMotion: v === 'on' })}
        />
        <Choice
          legend="Untimed challenges"
          description="Challenges and games run without a clock."
          options={[...onOff]}
          value={settings.untimed ? 'on' : 'off'}
          onChange={(v) => update({ untimed: v === 'on' })}
        />
      </Card>

      <Card as="section" aria-labelledby="latency-heading" className="flex flex-col gap-4">
        <div>
          <h2 id="latency-heading" className="text-lg font-bold">
            Tap timing
          </h2>
          <p className="text-fg-secondary">
            Some devices register taps a little late. Tap along with the clicks and the app will correct for it in
            rhythm questions.
          </p>
        </div>
        <p className="text-lg font-semibold" data-testid="latency-current">
          {`Current offset: ${settings.latencyOffsetMs} ms`}
        </p>
        {settings.soundOn ? (
          <LatencyCalibration onCalibrated={(latencyOffsetMs) => update({ latencyOffsetMs })} />
        ) : (
          <p className="text-fg-secondary">Turn sound on to calibrate: you need to hear the clicks.</p>
        )}
        <div>
          <Button
            variant="secondary"
            disabled={settings.latencyOffsetMs === 0}
            onClick={() => update({ latencyOffsetMs: 0 })}
          >
            Reset offset
          </Button>
        </div>
      </Card>
    </div>
  );
}
