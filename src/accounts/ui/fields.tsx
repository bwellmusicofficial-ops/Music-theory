'use client';

import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/components/ui/cn';

export const INPUT_CLASS =
  'min-h-12 w-full rounded-md border bg-surface px-4 text-base text-fg placeholder:text-muted';

/** An error line: an icon and words, so it never relies on colour alone. */
export function ErrorLine({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-2 font-semibold text-danger">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-1 size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

export interface TextFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  error?: string | null;
  /** A polite status line under the field (availability), announced as it changes. */
  status?: ReactNode;
  type?: 'text' | 'password';
  autoComplete?: string;
  autoCapitalize?: 'none' | 'characters';
  maxLength?: number;
  inputRef?: React.Ref<HTMLInputElement>;
  mono?: boolean;
  /** Extra control inside the label row, e.g. show/hide password. */
  action?: ReactNode;
}

export function TextField({
  label, value, onChange, hint, error, status, type = 'text', autoComplete, autoCapitalize = 'none', maxLength, inputRef, mono, action,
}: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const statusId = `${id}-status`;
  const described = [hint ? hintId : null, error ? errorId : null, status !== undefined ? statusId : null].filter(Boolean).join(' ');
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-base font-bold">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-fg-secondary">
          {hint}
        </p>
      ) : null}
      <div className="flex items-stretch gap-2">
        <input
          id={id}
          ref={inputRef}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoCapitalize={autoCapitalize}
          autoCorrect="off"
          spellCheck={false}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          aria-describedby={described || undefined}
          className={cn(INPUT_CLASS, error ? 'border-danger border-2' : 'border-border', mono && 'font-mono tracking-wider')}
        />
        {action}
      </div>
      {/* Always in the page, so a screen reader announces an error as it appears. */}
      <div aria-live="polite" className="empty:hidden">
        {error ? <ErrorLine id={errorId}>{error}</ErrorLine> : null}
      </div>
      {status !== undefined ? (
        <p id={statusId} role="status" className="text-fg-secondary">
          {status}
        </p>
      ) : null}
    </div>
  );
}

/** A password box with a Show/Hide button (people mistype on phones and cannot see what they typed). */
export function PasswordField(props: Omit<TextFieldProps, 'type' | 'action'>) {
  const [shown, setShown] = useState(false);
  return (
    <TextField
      {...props}
      type={shown ? 'text' : 'password'}
      action={
        <button
          type="button"
          aria-pressed={shown}
          onClick={() => setShown((s) => !s)}
          className="min-h-12 min-w-16 shrink-0 cursor-pointer rounded-md border border-border bg-surface-raised px-3 font-semibold text-fg"
        >
          {shown ? 'Hide' : 'Show'}
        </button>
      }
    />
  );
}

/** The error summary for a whole form. Always in the page so a screen reader announces it when it fills. */
export function FormError({ message }: { message: string | null }) {
  return (
    <div role="alert" data-testid="form-error" className="empty:hidden">
      {message ? <ErrorLine>{message}</ErrorLine> : null}
    </div>
  );
}
