'use client';

import dynamic from 'next/dynamic';
import type { LandingDemoProps } from './landing-demo';

/** Same footprint as the demo (386px on a phone from 390px wide, 406px at 360px, 421px on a desktop), so nothing jumps when it arrives. */
function Skeleton({ open }: { open: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-3xl border border-border-subtle bg-surface shadow-md motion-safe:animate-pulse ${open ? 'min-h-[24.25rem] max-[379px]:min-h-[25.5rem] sm:min-h-[26.25rem]' : 'min-h-[5.5rem]'}`}
    />
  );
}

// The demo pulls in the stave and the audio code, so it loads after the page rather than with it.
const OpenDemo = dynamic(() => import('./landing-demo').then((m) => m.LandingDemo), {
  ssr: false,
  loading: () => <Skeleton open />,
});
const ClosedDemo = dynamic(() => import('./landing-demo').then((m) => m.LandingDemo), {
  ssr: false,
  loading: () => <Skeleton open={false} />,
});

/** The landing demo, loaded on demand. */
export function LazyLandingDemo(props: LandingDemoProps) {
  return props.defaultOpen ? <OpenDemo {...props} /> : <ClosedDemo {...props} />;
}
