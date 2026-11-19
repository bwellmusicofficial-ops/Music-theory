'use client';

import dynamic from 'next/dynamic';
import type { LandingDemoProps } from './landing-demo';

/** Same footprint as the demo, so nothing jumps when it arrives. */
function Skeleton({ open }: { open: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-3xl border border-border-subtle bg-surface shadow-md motion-safe:animate-pulse ${open ? 'min-h-[26rem]' : 'min-h-[5.5rem]'}`}
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
