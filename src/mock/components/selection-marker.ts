/**
 * The lesson question components were built for instant feedback: they keep
 * the learner's choice in private state and only show it once `result` is set.
 * In a test the answer stays editable and no result is shown, so some
 * components would show nothing at all after a tap. This marks the chosen
 * control from outside (a data attribute and aria-pressed, styled by
 * `SELECTION_CSS`) for the two types that need it. The proper fix is an
 * `answer`/`initialAnswer` prop on QuestionProps; see the P1-12 report.
 */

import type { QuestionTypeId } from '@/lesson/schema';

export const SELECTION_ATTR = 'data-mock-selected';

export const SELECTION_CSS = `
.mock-question [${SELECTION_ATTR}="tag"] { border-color: var(--accent) !important; box-shadow: inset 0 0 0 2px var(--accent); }
.mock-question [${SELECTION_ATTR}="tag"]::after { content: "Your choice"; margin-left: auto; font-size: 0.75rem; font-weight: 700; color: var(--accent); white-space: nowrap; }
.mock-question [${SELECTION_ATTR}="tick"] { border-color: var(--accent) !important; box-shadow: inset 0 0 0 2px var(--accent); }
.mock-question [${SELECTION_ATTR}="tick"]::before { content: "\\2713\\00a0"; color: var(--accent); }
`;

function clear(root: HTMLElement) {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(`[${SELECTION_ATTR}]`))) {
    el.removeAttribute(SELECTION_ATTR);
    el.removeAttribute('aria-pressed');
  }
}

function mark(el: Element | null | undefined, kind: 'tag' | 'tick') {
  if (!el) return;
  el.setAttribute(SELECTION_ATTR, kind);
  el.setAttribute('aria-pressed', 'true');
}

/** Marks the control matching `answer`, or just clears the old mark when `answer` is undefined. */
export function markSelection(root: HTMLElement, type: QuestionTypeId, payload: unknown, answer: unknown): void {
  clear(root);
  if (answer === undefined || typeof answer !== 'object' || answer === null) return;
  const a = answer as Record<string, unknown>;
  const p = (payload ?? {}) as Record<string, unknown>;

  if (type === 'multiple-choice') {
    const options = Array.isArray(p.options) ? (p.options as { id?: unknown }[]) : [];
    const index = options.findIndex((o) => o.id === a.optionId);
    if (index < 0) return;
    const items = root.querySelectorAll('ul[aria-label="Answer options"] > li');
    mark(items[index]?.querySelector('button'), 'tag');
    return;
  }

  if (type === 'note-on-stave' && p.mode === 'identify') {
    const name = a.name as { letter?: unknown } | undefined;
    if (!name || typeof name.letter !== 'string') return;
    for (const button of Array.from(root.querySelectorAll('[role="group"][aria-label="Note name"] button'))) {
      if (button.textContent?.replace(/^✓\s*/, '').trim() === name.letter) mark(button, 'tick');
    }
  }
}
