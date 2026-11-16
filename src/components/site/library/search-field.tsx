import { useId } from 'react';
import { IconSearch } from '../icons';

/** A search box with a visible label for screen readers. Filtering is instant: the parent filters on every change. */
export function SearchField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  const id = useId();
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <IconSearch aria-hidden="true" width={20} height={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-secondary" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="search"
        className="min-h-12 w-full rounded-full border border-border bg-surface pl-12 pr-4 text-base text-fg placeholder:text-muted"
      />
    </div>
  );
}
