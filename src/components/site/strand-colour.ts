import type { Strand } from '@/lesson/schema';

/** The CSS colour of a strand, switching with the theme. */
export function strandColour(strand: Strand): string {
  return `var(--strand-${strand})`;
}

/** A surface washed with a strand colour: `percent` of the colour mixed into the card surface. */
export function strandWash(strand: Strand, percent = 22): string {
  return `color-mix(in srgb, ${strandColour(strand)} ${percent}%, var(--surface))`;
}
