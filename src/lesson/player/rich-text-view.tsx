'use client';

import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Terminology } from '@/engine/types';
import type { GlossaryEntry } from '../schema';
import {
  displayTerm,
  makeGlossaryLookup,
  parseRichText,
  type GlossarySource,
  type RichNode,
} from './rich-text';

export interface RichTextViewProps {
  text: string;
  terminology: Terminology;
  glossary?: GlossarySource;
  /** When given, a glossary link calls this instead of opening the built-in popover. */
  onTermClick?: (entry: GlossaryEntry) => void;
  className?: string;
  /** Internal: render links as plain (swapped) text, used inside popovers. */
  linksAsText?: boolean;
}

function capitalise(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Renders the RichText inline format as React nodes. Never uses
 * dangerouslySetInnerHTML: every piece of text is a React text child.
 */
export function RichTextView({ text, terminology, glossary, onTermClick, className, linksAsText = false }: RichTextViewProps) {
  const lookup = useMemo(() => makeGlossaryLookup(glossary), [glossary]);
  const nodes = useMemo(() => parseRichText(text), [text]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (openKey === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenKey(null);
    }
    function onPointer(e: MouseEvent | TouchEvent) {
      const root = rootRef.current;
      if (root && e.target instanceof Node && !root.contains(e.target)) setOpenKey(null);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, [openKey]);

  function render(list: RichNode[], path: string): ReactNode {
    return list.map((n, i) => {
      const key = `${path}.${i}`;
      switch (n.kind) {
        case 'text':
          return <Fragment key={key}>{n.text}</Fragment>;
        case 'bold':
          return (
            <strong key={key} className="font-bold text-fg">
              {render(n.children, key)}
            </strong>
          );
        case 'italic':
          return <em key={key}>{render(n.children, key)}</em>;
        case 'term': {
          const entry = lookup(n.id);
          const shown = displayTerm(n.shown, entry, terminology);
          if (!entry || linksAsText) return <Fragment key={key}>{shown}</Fragment>;
          const isOpen = openKey === key;
          return (
            <span key={key} className="relative">
              <button
                type="button"
                data-term-id={entry.id}
                aria-expanded={onTermClick ? undefined : isOpen}
                aria-controls={!onTermClick && isOpen ? popoverId : undefined}
                aria-haspopup={onTermClick ? undefined : 'dialog'}
                onClick={() => {
                  if (onTermClick) onTermClick(entry);
                  else setOpenKey(isOpen ? null : key);
                }}
                className="cursor-pointer rounded-sm font-semibold text-accent underline decoration-dotted decoration-2 underline-offset-4 hover:text-accent-hover"
              >
                {shown}
              </button>
              {isOpen && !onTermClick ? (
                <span
                  id={popoverId}
                  role="dialog"
                  aria-label={`Meaning of ${displayTerm(entry.term, entry, terminology)}`}
                  className="fixed inset-x-3 bottom-3 z-40 mx-auto block max-w-md rounded-lg border border-border bg-surface-raised p-4 text-base font-normal text-fg shadow-lg"
                >
                  <span className="block text-lg font-bold">
                    {capitalise(terminology === 'us' && entry.us ? entry.us : entry.term)}
                  </span>
                  <span className="mt-1 block text-fg-secondary">
                    <RichTextView text={entry.definition} terminology={terminology} glossary={lookup} linksAsText />
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpenKey(null)}
                    className="mt-3 min-h-9 cursor-pointer rounded-md border border-border px-3 text-sm font-semibold hover:bg-surface"
                  >
                    Close
                  </button>
                </span>
              ) : null}
            </span>
          );
        }
      }
    });
  }

  return (
    <span ref={rootRef} className={className}>
      {render(nodes, 'n')}
    </span>
  );
}
