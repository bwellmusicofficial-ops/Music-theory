'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, STRAND_NAMES } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import type { Terminology } from '@/engine/types';
import { RichTextView, makeGlossaryLookup } from '@/lesson/player';
import type { GlossaryEntry } from '@/lesson/schema';
import { glossaryRow, groupGlossary, gradeTitle, languageLabel, type GlossaryItem } from '@/progress-view';
import { strandColour } from '../strand-colour';
import { SearchField } from './search-field';

/**
 * Every glossary entry, A to Z, searchable. Each entry has a stable anchor
 * (`#<id>`). A glossary link in a definition scrolls to that entry and
 * highlights it; the search is cleared first if it would hide the entry.
 */
export function GlossaryPanel({ entries, terminology }: { entries: readonly GlossaryItem[]; terminology: Terminology }) {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => entries.map((e) => glossaryRow(e, terminology)), [entries, terminology]);
  const groups = useMemo(() => groupGlossary(rows, query), [rows, query]);
  const lookup = useMemo(() => makeGlossaryLookup(entries as readonly GlossaryEntry[]), [entries]);
  const count = groups.reduce((n, g) => n + g.rows.length, 0);
  /** The entry to scroll to as soon as it is on the page. */
  const pending = useRef<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const reveal = useCallback(() => {
    const id = pending.current;
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    pending.current = null;
    const reduce = document.documentElement.dataset.reducedMotion === 'true' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
    // The highlight is set on the element itself: it is a moment, not state.
    document.querySelectorAll('[data-flash]').forEach((other) => other.removeAttribute('data-flash'));
    el.setAttribute('data-flash', 'true');
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => el.removeAttribute('data-flash'), 2500);
  }, []);

  // An anchor in the address (`#adagio`) opens that entry on arrival.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    if (id) pending.current = id;
    reveal();
  }, [reveal]);

  // After the list changes (the search was cleared to show the entry), try again.
  useEffect(() => {
    reveal();
  }, [groups, reveal]);

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const goTo = useCallback(
    (entry: GlossaryEntry) => {
      setQuery('');
      pending.current = entry.id;
      try {
        window.history.replaceState(null, '', `?tab=glossary#${entry.id}`);
      } catch {
        // The address is a nicety.
      }
      reveal();
    },
    [reveal],
  );

  const letters = groups.map((g) => g.letter);

  return (
    <div className="flex flex-col gap-4">
      <SearchField label="Search the glossary" placeholder="Search terms and meanings" value={query} onChange={setQuery} />
      {letters.length > 1 ? (
        <nav aria-label="Jump to letter" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1">
          {letters.map((letter) => (
            <a
              key={letter}
              href={`#letter-${letter === '#' ? 'num' : letter}`}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-bold text-fg hover:bg-surface-raised"
            >
              {letter}
            </a>
          ))}
        </nav>
      ) : null}
      <p role="status" className="text-sm font-semibold text-fg-secondary">
        {count === 1 ? '1 entry' : `${count} entries`}
        {query ? ' match' : ''}
      </p>

      {count === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-border-subtle bg-surface p-5">
          <p className="text-fg-secondary">{entries.length === 0 ? 'The glossary is empty for now.' : 'No entries match. Try fewer words.'}</p>
          {entries.length > 0 ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="min-h-11 cursor-pointer rounded-full border border-border bg-surface-raised px-4 text-sm font-semibold hover:bg-border-subtle"
            >
              Clear search
            </button>
          ) : null}
        </div>
      ) : null}

      {groups.map((group) => (
        <section key={group.letter} id={`letter-${group.letter === '#' ? 'num' : group.letter}`} aria-label={`Terms starting with ${group.letter}`} className="flex scroll-mt-20 flex-col gap-3">
          <h2 className="border-b border-border-subtle pb-1 text-2xl font-extrabold text-accent" aria-hidden="true">
            {group.letter}
          </h2>
          <ul className="flex flex-col gap-3">
            {group.rows.map(({ entry, term, alsoCalled }) => {
              const lang = languageLabel(entry);
              return (
                <li
                  key={entry.id}
                  id={entry.id}
                  tabIndex={-1}
                  className={cn(
                    'scroll-mt-24 rounded-2xl border border-border-subtle bg-surface p-4 shadow-md outline-offset-2',
                    'data-[flash=true]:border-accent data-[flash=true]:ring-2 data-[flash=true]:ring-accent',
                  )}
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="text-xl font-extrabold leading-tight">{term}</h3>
                    {lang ? <Badge tone="accent">{lang}</Badge> : null}
                  </div>
                  {alsoCalled ? (
                    <p className="mt-0.5 text-sm text-fg-secondary">
                      also called <em>{alsoCalled}</em>
                      {terminology === 'uk' ? ' in the US' : ' in the UK'}
                    </p>
                  ) : null}
                  <p className="mt-2 text-fg-secondary">
                    <RichTextView text={entry.definition} terminology={terminology} glossary={lookup} onTermClick={goTo} />
                  </p>
                  <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-fg-secondary">
                    <span>{gradeTitle(entry.grade)}</span>
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: strandColour(entry.strand) }} />
                      {STRAND_NAMES[entry.strand]}
                    </span>
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
