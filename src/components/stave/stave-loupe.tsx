'use client';

import type { Ref } from 'react';
import { LOUPE_SIZE_PX, LOUPE_VIEW_UNITS } from './constants';

export interface StaveLoupeProps {
  uid: string;
  /** Centre of the view, in units. */
  gx: number;
  gy: number;
  svgRef?: Ref<SVGSVGElement>;
}

/** Touch magnifier: a 2x view around the ghost. Shows no note name. Positioned imperatively by the gesture hook. */
export function StaveLoupe({ uid, gx, gy, svgRef }: StaveLoupeProps) {
  const half = LOUPE_VIEW_UNITS / 2;
  return (
    <svg
      ref={svgRef}
      className="mtn-stave__loupe"
      aria-hidden="true"
      data-testid="loupe"
      width={LOUPE_SIZE_PX}
      height={LOUPE_SIZE_PX}
      viewBox={`${gx - half} ${gy - half} ${LOUPE_VIEW_UNITS} ${LOUPE_VIEW_UNITS}`}
    >
      <use href={`#${uid}-notation-svg`} />
      <use href={`#${uid}-overlay`} />
    </svg>
  );
}
