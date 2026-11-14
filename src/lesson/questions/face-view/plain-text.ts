import type { RichText } from '@/lesson/questions/shared';

/**
 * Plain text from the inline text format: keeps only the shown part of
 * [[term-id|shown text]] links and removes the ** and * markers.
 * Temporary until the rich text renderer is wired in.
 */
export function plainText(text: RichText): string {
  return text.replace(/\[\[[^|\]]*\|([^\]]*)\]\]/g, '$1').replace(/\*\*|\*/g, '');
}
